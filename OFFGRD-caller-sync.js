/* OFFGRD caller auto-sync — Daily Check pattern for O/D Caller events.
   Triggers: online, app open, post-snap (when connected).
   Idempotent by eventId (server PK upsert ignoreDuplicates).
   Single-flight + bounded exponential backoff — no storms.
   Header copy matches Daily Check: "N pending · will sync" / "All synced."
   Requires offgrd.caller_* side column + is_staff_coach RLS (apply-caller-side-staff-rls.sql). */
(function (global) {
  var SYNCED_KEY = "offgrd_caller_synced_ids_v1";
  var MAX_BACKOFF = 30000;
  var SNAP_DEBOUNCE_MS = 700;
  var OPEN_DELAY_MS = 1400;

  var _flight = null;
  var _syncing = false;
  var _backoffN = 0;
  var _backoffT = null;
  var _snapT = null;
  var _listeners = [];
  var _bound = Object.create(null);

  function notify() {
    for (var i = 0; i < _listeners.length; i++) {
      try {
        _listeners[i]();
      } catch (e) {}
    }
  }

  function subscribe(fn) {
    _listeners.push(fn);
    return function () {
      _listeners = _listeners.filter(function (f) {
        return f !== fn;
      });
    };
  }

  function isOnline() {
    return typeof navigator === "undefined" || navigator.onLine !== false;
  }

  function bridge() {
    return global.OFFGRD_CALLER_BRIDGE || null;
  }

  function loadSyncedMap() {
    try {
      return JSON.parse(localStorage.getItem(SYNCED_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function saveSyncedMap(map) {
    try {
      localStorage.setItem(SYNCED_KEY, JSON.stringify(map));
    } catch (e) {}
  }

  function markSynced(side, eventIds) {
    if (!side || !eventIds || !eventIds.length) return;
    var map = loadSyncedMap();
    if (!map[side]) map[side] = {};
    for (var i = 0; i < eventIds.length; i++) {
      if (eventIds[i]) map[side][eventIds[i]] = 1;
    }
    saveSyncedMap(map);
  }

  /** After Clear — drop pending/synced markers so the next game doesn't inherit them. */
  function clearSyncedSide(side) {
    if (!side) return;
    var map = loadSyncedMap();
    delete map[side];
    saveSyncedMap(map);
    notify();
  }

  /**
   * Clear product meaning: wipe local log AND archive the active cloud game for
   * this side so the one-active-per-side slot frees for the next session.
   * Events stay on the archived game (audit); they are not deleted.
   */
  async function clearAndArchiveGame(opts) {
    opts = opts || {};
    var side = opts.side || "offense";
    var gameId = opts.gameId || null;
    var b = bridge();
    clearSyncedSide(side);
    if (!b || !b.cloud || !b.getTeamId) return { archived: false, reason: "no-bridge" };
    if (b.canSync && !b.canSync()) return { archived: false, reason: "not-staff" };
    var teamId = b.getTeamId();
    if (!teamId) return { archived: false, reason: "no-team" };
    try {
      if (gameId && b.cloud.archiveCallerGame) {
        await b.cloud.archiveCallerGame(gameId);
        return { archived: true, gameId: gameId };
      }
      if (b.cloud.archiveActiveCallerGame) {
        var g = await b.cloud.archiveActiveCallerGame(teamId, side);
        return { archived: !!g, gameId: g && g.id };
      }
    } catch (e) {
      try {
        console.warn("[caller-sync] archive on clear", e && e.message);
      } catch (e2) {}
      return { archived: false, error: e };
    }
    return { archived: false };
  }

  function pendingEvents(side, events) {
    var map = loadSyncedMap();
    var done = map[side] || {};
    var out = [];
    (events || []).forEach(function (e) {
      if (e && e.eventId && !done[e.eventId]) out.push(e);
    });
    return out;
  }

  function pendingCount(side, events) {
    return pendingEvents(side, events).length;
  }

  /** Same language as Daily Check getSyncHeaderState. */
  function getSyncHeaderState(side, events, syncing) {
    var online = isOnline();
    var pending = pendingCount(side, events);
    var sync = syncing != null ? !!syncing : _syncing;
    if (sync) {
      return {
        online: online,
        pending: pending,
        syncing: true,
        label: pending ? pending + " pending · syncing…" : "Syncing…",
      };
    }
    if (!online && pending > 0) {
      return {
        online: online,
        pending: pending,
        syncing: false,
        label: "Offline · " + pending + " pending",
      };
    }
    if (pending > 0) {
      return {
        online: online,
        pending: pending,
        syncing: false,
        label: pending + " pending · will sync",
      };
    }
    return { online: online, pending: 0, syncing: false, label: "All synced" };
  }

  function clearBackoff() {
    if (_backoffT) {
      clearTimeout(_backoffT);
      _backoffT = null;
    }
  }

  function scheduleBackoff(fn) {
    if (_backoffT) return;
    if (_backoffN >= 8) {
      try {
        console.warn("[caller-sync] backoff gave up");
      } catch (e) {}
      return;
    }
    var delay = Math.min(MAX_BACKOFF, 500 * Math.pow(2, _backoffN));
    _backoffN++;
    _backoffT = setTimeout(function () {
      _backoffT = null;
      fn();
    }, delay);
  }

  /**
   * opts: {
   *   side: 'offense'|'defense',
   *   getState: () => ({ session, events }),
   *   applyRemote: (mergedEvents, remoteGame) => void,
   *   onDone: () => void
   * }
   */
  function flush(opts) {
    opts = opts || {};
    var side = opts.side || "offense";
    if (_flight) return _flight;
    _flight = doFlush(opts)
      .catch(function (e) {
        try {
          console.warn("[caller-sync]", side, e && e.message);
        } catch (e2) {}
        scheduleBackoff(function () {
          flush(opts);
        });
        return { ok: false, error: e };
      })
      .finally(function () {
        _flight = null;
        _syncing = false;
        notify();
        try {
          if (opts.onDone) opts.onDone();
        } catch (e3) {}
      });
    return _flight;
  }

  async function doFlush(opts) {
    var side = opts.side || "offense";
    if (!isOnline()) {
      notify();
      return { ok: false, offline: true, pending: pendingCount(side, (opts.getState() || {}).events) };
    }
    var b = bridge();
    if (!b || !b.getTeamId || !b.cloud) return { ok: false, reason: "no-bridge" };
    var teamId = b.getTeamId();
    if (!teamId) return { ok: false, reason: "no-team" };
    if (b.canSync && !b.canSync()) return { ok: false, reason: "not-staff" };

    var st = opts.getState ? opts.getState() : null;
    if (!st) return { ok: false, reason: "no-state" };
    var sess = st.session || {};
    var events = Array.isArray(st.events) ? st.events : [];

    _syncing = true;
    notify();
    clearBackoff();

    var cloud = b.cloud;
    var game = null;
    if (cloud.ensureCallerGame) {
      game = await cloud.ensureCallerGame(teamId, {
        id: sess.gameId || null,
        opponent: sess.opp || null,
        week: sess.week || null,
        game_date: sess.game_date || null,
        created_by: (b.getActorId && b.getActorId()) || null,
        side: side,
      });
    }

    if (game && game.id && sess.gameId && game.id !== sess.gameId) {
      var old = sess.gameId;
      events.forEach(function (e) {
        if (e && e.gameId === old) e.gameId = game.id;
      });
      sess.gameId = game.id;
    } else if (game && game.id) {
      sess.gameId = game.id;
    }
    if (game) {
      if (game.opponent) sess.opp = game.opponent;
      if (game.week) sess.week = game.week;
    }

    var gameId = sess.gameId;
    if (!gameId) return { ok: false, reason: "no-game" };

    var remote = [];
    if (cloud.listCallerEvents) {
      remote = await cloud.listCallerEvents(teamId, gameId);
    }
    var eng = global.OFFGRD_CALLER;
    var merged = events;
    if (eng && eng.mergeEvents) {
      merged = eng.mergeEvents(events, remote);
    }

    if (opts.applyRemote) {
      opts.applyRemote(merged, game, sess);
    }

    var pending = pendingEvents(side, merged);
    /* Also push any already-synced that gained superseded flag — full list is safe (idempotent). */
    var toPush = merged.length ? merged : pending;
    if (toPush.length && cloud.appendCallerEvents) {
      await cloud.appendCallerEvents(teamId, toPush);
      markSynced(
        side,
        toPush.map(function (e) {
          return e.eventId;
        })
      );
    }

    if (eng && eng.foldCallerEvents && cloud.markCallerEventSuperseded) {
      var folded = eng.foldCallerEvents(merged);
      var ids = Object.keys(folded.supersededIds || {}).filter(function (id) {
        return folded.supersededIds[id];
      });
      for (var i = 0; i < ids.length; i++) {
        try {
          await cloud.markCallerEventSuperseded(ids[i], true);
        } catch (e2) {}
      }
    }

    /* Monday Focus sidecar — proposals only; never start_tracked_focus here */
    var mondayWritten = false;
    if (cloud.upsertCallerGameMondayFocus && typeof opts.getMondayFocus === "function") {
      try {
        var monday = opts.getMondayFocus();
        if (monday && monday.candidates && monday.candidates.length) {
          if (cloud.getCallerGameMondayFocus) {
            var remoteMf = await cloud.getCallerGameMondayFocus(gameId);
            var An = global.OFFGRD_CALLER_ANALYSIS;
            if (remoteMf && An && An.mergeMondayFocusPayload) {
              monday = An.mergeMondayFocusPayload(remoteMf, monday);
            }
          }
          if (opts.applyMondayFocus) opts.applyMondayFocus(monday);
          await cloud.upsertCallerGameMondayFocus(gameId, monday);
          mondayWritten = true;
        }
      } catch (eMf) {
        console.warn("[caller-sync] monday_focus", eMf && eMf.message);
      }
    }

    _backoffN = 0;
    return {
      ok: true,
      pending: pendingCount(side, merged),
      pushed: toPush.length,
      remote: remote.length,
      mondayFocus: mondayWritten,
    };
  }

  function scheduleAfterSnap(opts) {
    notify();
    if (!isOnline()) return;
    clearTimeout(_snapT);
    _snapT = setTimeout(function () {
      _snapT = null;
      flush(opts);
    }, SNAP_DEBOUNCE_MS);
  }

  function bindTriggers(opts) {
    var side = (opts && opts.side) || "offense";
    if (_bound[side]) return;
    _bound[side] = true;

    function kick() {
      flush(opts);
    }

    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && isOnline()) kick();
    });
    window.addEventListener("focus", function () {
      if (isOnline()) kick();
    });
    setTimeout(kick, OPEN_DELAY_MS);
  }

  function isSyncing() {
    return _syncing;
  }

  global.OFFGRD_CALLER_SYNC_ENGINE = {
    flush: flush,
    scheduleAfterSnap: scheduleAfterSnap,
    bindTriggers: bindTriggers,
    getSyncHeaderState: getSyncHeaderState,
    pendingCount: pendingCount,
    subscribe: subscribe,
    isSyncing: isSyncing,
    markSynced: markSynced,
    clearSyncedSide: clearSyncedSide,
    clearAndArchiveGame: clearAndArchiveGame,
  };
})(typeof window !== "undefined" ? window : globalThis);
