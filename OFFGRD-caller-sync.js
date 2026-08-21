/* OFFGRD caller auto-sync — Daily Check pattern for O/D Caller events.
   Triggers: online, app open, post-snap (when connected).
   Idempotent by eventId (server PK upsert ignoreDuplicates).
   Single-flight + bounded exponential backoff — no storms.
   Header copy matches Daily Check: "N pending · will sync" / "All synced."
   Held rows surface as "1,148 synced · 2 held" — they do not fail the batch.
   Ledger policy: stamp local ∩ remote (~1,085 on Parkway), not every
   remote id (1,349 includes 264 cloud-only rows). D-store is a partial
   mirror of the O-store — census and stamp always dedupe by eventId.
   Sideless locals confirmed remote are stamped from the remote row's
   side (lookup by event_id if the local gameId is missing/stale).
   Only a local-only straggler is held. Ledger ids with no local event
   are pruned — the contract is local ∩ remote, not a cloud souvenir.
   Requires offgrd.caller_* side column + is_staff_coach RLS (apply-caller-side-staff-rls.sql). */
(function (global) {
  var SYNCED_KEY = "offgrd_caller_synced_ids_v1";
  var HELD_KEY = "offgrd_caller_held_ids_v1";
  var UPSERT_CHUNK = 150;
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
    var map;
    try {
      map = JSON.parse(localStorage.getItem(SYNCED_KEY) || "{}") || {};
    } catch (e) {
      map = {};
    }
    if (flattenSideBuckets(map)) saveSyncedMap(map);
    return map;
  }

  function saveSyncedMap(map) {
    try {
      localStorage.setItem(SYNCED_KEY, JSON.stringify(map));
    } catch (e) {}
  }

  /** Lift v312 nested offense/defense buckets to top-level ids, then delete the buckets. */
  function flattenSideBuckets(map) {
    if (!map) return false;
    var lifted = false;
    ["offense", "defense"].forEach(function (side) {
      var nest = map[side];
      if (!nest || typeof nest !== "object" || Array.isArray(nest)) return;
      Object.keys(nest).forEach(function (id) {
        if (id) map[id] = 1;
      });
      delete map[side];
      lifted = true;
    });
    return lifted;
  }

  function storeKey(which) {
    var Side = global.OFFGRD_CALLER_SIDE;
    var C = global.OFFGRD_CALLER;
    if (which === "defense") {
      return (Side && Side.D_STORE_KEY) || (C && C.DCALLER_STORE_KEY) || "offgrd_dcaller_events_v2";
    }
    return (Side && Side.O_STORE_KEY) || (C && C.STORE_KEY) || "offgrd_caller_events_v2";
  }

  function readStoreEvents(key) {
    try {
      var st = JSON.parse(localStorage.getItem(key) || "null");
      return st && Array.isArray(st.events) ? st.events : [];
    } catch (e) {
      return [];
    }
  }

  /** Union of O-store, D-store, and the in-memory events this flush was given. */
  function allLocalCallerEvents(optsEvents) {
    var map = Object.create(null);
    function add(list) {
      (list || []).forEach(function (e) {
        if (e && e.eventId) map[e.eventId] = e;
      });
    }
    add(readStoreEvents(storeKey("offense")));
    add(readStoreEvents(storeKey("defense")));
    add(optsEvents);
    return Object.keys(map).map(function (k) {
      return map[k];
    });
  }

  function uniqueLocalIds(optsEvents) {
    return allLocalCallerEvents(optsEvents).map(function (e) {
      return e.eventId;
    });
  }

  function remoteEventSide(r) {
    if (!r) return null;
    if (r.side === "offense" || r.side === "defense") return r.side;
    var p = r.payload;
    if (p && (p.side === "offense" || p.side === "defense")) return p.side;
    return null;
  }

  function liftSideFromRemote(ev, remoteById) {
    if (!ev || !ev.eventId || !remoteById) return false;
    var rs = remoteEventSide(remoteById[ev.eventId]);
    if (!rs || ev.side === rs) return false;
    ev.side = rs;
    return true;
  }

  function persistLiftedSides(remoteById) {
    ["offense", "defense"].forEach(function (which) {
      var key = storeKey(which);
      var evs = readStoreEvents(key);
      var changed = false;
      evs.forEach(function (e) {
        if (liftSideFromRemote(e, remoteById)) changed = true;
      });
      if (!changed) return;
      try {
        var st = JSON.parse(localStorage.getItem(key) || "{}") || {};
        st.events = evs;
        localStorage.setItem(key, JSON.stringify(st));
      } catch (eW) {}
    });
  }

  /** Drop ledger ids that are not in the local union (local ∩ remote contract). */
  function pruneLedgerToLocal(localIds) {
    var keep = Object.create(null);
    (localIds || []).forEach(function (id) {
      if (id && !isSideBucket(id)) keep[id] = 1;
    });
    var map = loadSyncedMap();
    var changed = false;
    Object.keys(map).forEach(function (k) {
      if (isSideBucket(k) || keep[k]) return;
      delete map[k];
      changed = true;
    });
    if (changed) saveSyncedMap(map);
  }

  function loadHeldMap() {
    try {
      return JSON.parse(localStorage.getItem(HELD_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function saveHeldMap(map) {
    try {
      localStorage.setItem(HELD_KEY, JSON.stringify(map));
    } catch (e) {}
  }

  function isSideBucket(k) {
    return k === "offense" || k === "defense";
  }

  /** Every accepted event id lives at the top level so a census of the key moves. */
  function allSyncedIds(map) {
    var ids = Object.create(null);
    var raw = map || loadSyncedMap();
    Object.keys(raw).forEach(function (k) {
      if (isSideBucket(k)) {
        var nest = raw[k];
        if (nest && typeof nest === "object") {
          Object.keys(nest).forEach(function (id) {
            if (id) ids[id] = 1;
          });
        }
        return;
      }
      if (k) ids[k] = 1;
    });
    return ids;
  }

  function listSyncedIds() {
    return Object.keys(allSyncedIds());
  }

  function markSynced(side, eventIds) {
    if (!eventIds || !eventIds.length) return;
    var map = loadSyncedMap();
    var held = loadHeldMap();
    for (var j = 0; j < eventIds.length; j++) {
      var id = eventIds[j];
      if (!id || isSideBucket(id)) continue;
      map[id] = 1;
      if (held.offense && held.offense[id]) delete held.offense[id];
      if (held.defense && held.defense[id]) delete held.defense[id];
    }
    saveHeldMap(held);
    saveSyncedMap(map);
  }

  function markHeld(side, eventId, reason) {
    if (!side || !eventId) return;
    var held = loadHeldMap();
    if (!held[side]) held[side] = {};
    held[side][eventId] = { reason: reason || "upsert-failed", at: Date.now() };
    saveHeldMap(held);
    var synced = loadSyncedMap();
    if (synced[eventId]) {
      delete synced[eventId];
      saveSyncedMap(synced);
    }
  }

  function isHeld(side, eventId) {
    if (!side || !eventId) return false;
    var held = loadHeldMap();
    return !!(held[side] && held[side][eventId]);
  }

  function isSynced(side, eventId) {
    if (!eventId || isSideBucket(eventId)) return false;
    var map = loadSyncedMap();
    return !!map[eventId];
  }

  function heldCount(side, events) {
    var n = 0;
    var seen = Object.create(null);
    var held = (loadHeldMap()[side] || {});
    Object.keys(held).forEach(function (id) {
      if (id) {
        seen[id] = 1;
        n += 1;
      }
    });
    (events || []).forEach(function (e) {
      if (!e || !e.eventId || seen[e.eventId]) return;
      if (isSynced(side, e.eventId)) return;
      if (!eventToSyncRow(e, null)) {
        seen[e.eventId] = 1;
        n += 1;
      }
    });
    return n;
  }

  function syncedCount(side, events) {
    var n = 0;
    (events || []).forEach(function (e) {
      if (e && e.eventId && isSynced(side, e.eventId)) n += 1;
    });
    return n;
  }

  function formatN(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  /** Constraint / 400 = this row is bad. Network / 5xx = leave pending and retry. */
  function isRowFault(err) {
    if (!err) return false;
    var code = String(err.code || err.status || err.statusCode || "");
    if (code === "23502" || code === "23514" || code === "22P02" || code === "23503") return true;
    if (code === "400" || err.status === 400 || err.statusCode === 400) return true;
    var msg = String(err.message || err.details || err.hint || "");
    return /not-null|not null|null value|violates|invalid input|check constraint|22P02|23502|400\b/i.test(msg);
  }

  /**
   * Upsert in chunks. On chunk failure, retry row-by-row so one bad row
   * quarantines itself instead of blocking the rest of the chunk.
   */
  async function appendIsolated(events, upsertFn, opts) {
    opts = opts || {};
    var chunkSize = opts.chunkSize > 0 ? opts.chunkSize : UPSERT_CHUNK;
    var list = Array.isArray(events) ? events : [];
    var synced = [];
    var held = [];
    var unresolved = [];
    var i, j, chunk, one;
    for (i = 0; i < list.length; i += chunkSize) {
      chunk = list.slice(i, i + chunkSize);
      try {
        await upsertFn(chunk);
        for (j = 0; j < chunk.length; j++) {
          if (chunk[j] && chunk[j].eventId) synced.push(chunk[j].eventId);
        }
      } catch (chunkErr) {
        for (j = 0; j < chunk.length; j++) {
          one = chunk[j];
          try {
            await upsertFn([one]);
            if (one && one.eventId) synced.push(one.eventId);
          } catch (rowErr) {
            if (isRowFault(rowErr) || isRowFault(chunkErr)) {
              held.push({
                eventId: one && one.eventId,
                reason: (rowErr && rowErr.message) || (chunkErr && chunkErr.message) || "upsert-failed",
              });
            } else if (one && one.eventId) {
              unresolved.push(one.eventId);
            }
          }
        }
      }
    }
    return { synced: synced, held: held, unresolved: unresolved };
  }

  /** After Clear — drop pending/synced/held markers so the next game doesn't inherit them. */
  function clearSyncedSide(side) {
    if (!side) return;
    var map = loadSyncedMap();
    var Side = global.OFFGRD_CALLER_SIDE;
    allLocalCallerEvents([]).forEach(function (e) {
      if (!e || !e.eventId) return;
      var got = Side && Side.eventSide ? Side.eventSide(e) : e.side;
      if (got === side) delete map[e.eventId];
    });
    delete map[side];
    saveSyncedMap(map);
    var held = loadHeldMap();
    delete held[side];
    saveHeldMap(held);
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

  function eventToSyncRow(e, teamId) {
    var Side = global.OFFGRD_CALLER_SIDE;
    if (Side && Side.eventToSyncRow) return Side.eventToSyncRow(e, teamId);
    if (!e || !e.eventId) return null;
    if (Side && Side.normalizeEventSide) Side.normalizeEventSide(e);
    var side = e.side === "defense" || e.side === "offense" ? e.side : null;
    if (!side) return null;
    return {
      event_id: e.eventId,
      team_id: teamId,
      game_id: e.gameId,
      play_index: e.playIndex,
      type: e.type,
      payload: e.payload || {},
      device_id: e.deviceId,
      actor_id: e.actorId || null,
      client_ts: e.clientTs,
      seq: e.seq,
      superseded: !!e.superseded,
      side: side,
    };
  }

  function pendingEvents(side, events) {
    var out = [];
    (events || []).forEach(function (e) {
      if (e && e.eventId && !isSynced(side, e.eventId) && !isHeld(side, e.eventId) && eventToSyncRow(e, null)) {
        out.push(e);
      }
    });
    return out;
  }

  function pendingCount(side, events) {
    return pendingEvents(side, events).length;
  }

  /** Same language as Daily Check getSyncHeaderState. Held rows never look like "All synced". */
  function getSyncHeaderState(side, events, syncing) {
    var online = isOnline();
    var pending = pendingCount(side, events);
    var held = heldCount(side, events);
    var syncedN = syncedCount(side, events);
    var sync = syncing != null ? !!syncing : _syncing;
    var heldLabel = held > 0 ? formatN(syncedN) + " synced · " + formatN(held) + " held" : null;
    if (sync) {
      return {
        online: online,
        pending: pending,
        held: held,
        synced: syncedN,
        syncing: true,
        label: pending ? pending + " pending · syncing…" : heldLabel || "Syncing…",
      };
    }
    if (!online && pending > 0) {
      return {
        online: online,
        pending: pending,
        held: held,
        synced: syncedN,
        syncing: false,
        label: held
          ? "Offline · " + pending + " pending · " + formatN(held) + " held"
          : "Offline · " + pending + " pending",
      };
    }
    if (pending > 0) {
      return {
        online: online,
        pending: pending,
        held: held,
        synced: syncedN,
        syncing: false,
        label: held
          ? pending + " pending · " + formatN(held) + " held"
          : pending + " pending · will sync",
      };
    }
    if (held > 0) {
      return {
        online: online,
        pending: 0,
        held: held,
        synced: syncedN,
        syncing: false,
        label: heldLabel,
      };
    }
    return { online: online, pending: 0, held: 0, synced: syncedN, syncing: false, label: "All synced" };
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
    var Side = global.OFFGRD_CALLER_SIDE;
    var side = null;
    try {
      side = Side && Side.requireEventSide ? Side.requireEventSide(opts.side) : (opts.side === "offense" || opts.side === "defense" ? opts.side : null);
    } catch (eSide) {
      try {
        console.warn("[caller-sync] refuse unset side", eSide && eSide.message);
      } catch (e0) {}
      return Promise.resolve({ ok: false, reason: "unset-side" });
    }
    if (!side) {
      try {
        console.warn("[caller-sync] refuse unset side");
      } catch (e0) {}
      return Promise.resolve({ ok: false, reason: "unset-side" });
    }
    opts.side = side;
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
    var Side = global.OFFGRD_CALLER_SIDE;
    var side = null;
    try {
      side = Side && Side.requireEventSide ? Side.requireEventSide(opts.side) : (opts.side === "offense" || opts.side === "defense" ? opts.side : null);
    } catch (eSide) {
      return { ok: false, reason: "unset-side" };
    }
    if (!side) return { ok: false, reason: "unset-side" };
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
      var SideStamp = global.OFFGRD_CALLER_SIDE;
      var recycled = SideStamp && SideStamp.callerGameIsRecycled
        ? SideStamp.callerGameIsRecycled(game, { week: sess.week, game_date: sess.game_date })
        : false;
      if (!recycled) {
        if (game.opponent) sess.opp = game.opponent;
        if (game.week) sess.week = game.week;
        if (game.game_date) sess.game_date = game.game_date;
      }
    }

    var gameId = sess.gameId;
    if (!gameId) return { ok: false, reason: "no-game" };

    var localAll = allLocalCallerEvents(events);
    var gameIds = Object.create(null);
    if (gameId) gameIds[gameId] = 1;
    localAll.forEach(function (e) {
      if (e && e.gameId) gameIds[e.gameId] = 1;
    });
    if (cloud.activeCallerGame) {
      try {
        var og = await cloud.activeCallerGame(teamId, "offense");
        var dg = await cloud.activeCallerGame(teamId, "defense");
        if (og && og.id) gameIds[og.id] = 1;
        if (dg && dg.id) gameIds[dg.id] = 1;
      } catch (eGames) {}
    }
    var remoteAll = [];
    if (cloud.listCallerEvents) {
      var gids = Object.keys(gameIds);
      for (var gi = 0; gi < gids.length; gi++) {
        var listed = await cloud.listCallerEvents(teamId, gids[gi]);
        if (listed && listed.length) remoteAll = remoteAll.concat(listed);
      }
    }
    var remote = remoteAll;
    if (Side && Side.filterEventsBySide) remote = Side.filterEventsBySide(remoteAll, side);
    var eng = global.OFFGRD_CALLER;
    var merged = events;
    if (eng && eng.mergeEvents) {
      merged = eng.mergeEvents(events, remote);
    }

    var remoteById = Object.create(null);
    remoteAll.forEach(function (e) {
      if (e && e.eventId) remoteById[e.eventId] = e;
    });
    var localUnion = allLocalCallerEvents(merged);
    var missingIds = [];
    localUnion.forEach(function (e) {
      if (e && e.eventId && !remoteById[e.eventId]) missingIds.push(e.eventId);
    });
    if (missingIds.length && cloud.listCallerEventsByIds) {
      var found = await cloud.listCallerEventsByIds(teamId, missingIds);
      (found || []).forEach(function (e) {
        if (!e || !e.eventId) return;
        remoteAll.push(e);
        remoteById[e.eventId] = e;
      });
    }
    events.forEach(function (e) {
      liftSideFromRemote(e, remoteById);
    });
    merged.forEach(function (e) {
      liftSideFromRemote(e, remoteById);
    });
    persistLiftedSides(remoteById);
    if (opts.applyRemote) {
      opts.applyRemote(merged, game, sess);
    }
    var remoteIds = Object.create(null);
    Object.keys(remoteById).forEach(function (id) {
      remoteIds[id] = 1;
    });
    var confirmed = [];
    localUnion.forEach(function (e) {
      if (e && e.eventId && remoteIds[e.eventId]) {
        liftSideFromRemote(e, remoteById);
        confirmed.push(e.eventId);
      }
    });
    if (confirmed.length) markSynced(side, confirmed);
    pruneLedgerToLocal(uniqueLocalIds(merged));
    var heldStragglers = 0;
    localUnion.forEach(function (e) {
      if (!e || !e.eventId || remoteIds[e.eventId]) return;
      if (eventToSyncRow(e, teamId)) return;
      markHeld("offense", e.eventId, "no-side");
      markHeld("defense", e.eventId, "no-side");
      heldStragglers += 1;
    });
    if (heldStragglers) {
      try {
        console.warn("[caller-sync] held", heldStragglers, "local-only sideless straggler(s)");
      } catch (eSkip) {}
    }
    var pending = pendingEvents(side, merged);
    var toPush = pending;
    var syncable = [];
    (toPush || []).forEach(function (e) {
      if (eventToSyncRow(e, teamId)) syncable.push(e);
    });
    var pushed = 0;
    var heldN = heldStragglers;
    if (syncable.length && cloud.appendCallerEvents) {
      var isolated = await appendIsolated(
        syncable,
        function (chunk) {
          return cloud.appendCallerEvents(teamId, chunk);
        },
        { chunkSize: UPSERT_CHUNK }
      );
      markSynced(side, isolated.synced);
      (isolated.held || []).forEach(function (h) {
        markHeld(side, h.eventId, h.reason);
      });
      pushed = isolated.synced.length;
      heldN = (isolated.held || []).length + heldStragglers;
      if (isolated.unresolved && isolated.unresolved.length) {
        throw new Error("caller-sync: " + isolated.unresolved.length + " rows unresolved");
      }
    }

    if (eng && cloud.markCallerEventSuperseded) {
      var folded = eng.foldEachGame
        ? eng.foldEachGame(merged, { side: side })
        : eng.foldCallerEvents(merged, { side: side, gameId: gameId });
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
      pushed: pushed,
      held: heldN,
      stamped: confirmed.length,
      uniqueLocal: localUnion.length,
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
    var Side = global.OFFGRD_CALLER_SIDE;
    var side = null;
    try {
      side = Side && Side.requireEventSide ? Side.requireEventSide(opts && opts.side) : ((opts && opts.side) === "defense" ? "defense" : ((opts && opts.side) === "offense" ? "offense" : null));
    } catch (eBindSide) {
      side = null;
    }
    if (!side) {
      try {
        console.warn("[caller-sync] bindTriggers refuse unset side");
      } catch (eBind) {}
      return;
    }
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
    listSyncedIds: listSyncedIds,
    flattenSideBuckets: flattenSideBuckets,
    allLocalCallerEvents: allLocalCallerEvents,
    uniqueLocalIds: uniqueLocalIds,
    isSynced: isSynced,
    SYNCED_KEY: SYNCED_KEY,
    markHeld: markHeld,
    isHeld: isHeld,
    heldCount: heldCount,
    clearSyncedSide: clearSyncedSide,
    clearAndArchiveGame: clearAndArchiveGame,
    eventToSyncRow: eventToSyncRow,
    appendIsolated: appendIsolated,
    isRowFault: isRowFault,
    UPSERT_CHUNK: UPSERT_CHUNK,
    HELD_KEY: HELD_KEY,
  };
})(typeof window !== "undefined" ? window : globalThis);
