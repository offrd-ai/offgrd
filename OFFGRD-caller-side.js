/* OFFGRD caller side integrity — the contract, in code.
 *
 *   O Caller records OUR OFFENSE against THEIR DEFENSE.
 *   D Caller records OUR DEFENSE against THEIR OFFENSE.
 *
 * Event.side is required at the top level: "offense" | "defense".
 * An event that cannot name its side is not written. Do not bury side
 * on payload — two locations is how sync sent null and 400'd the batch.
 *
 * Season corpus (do not add a fourth bucket):
 *   ours = our offense
 *   off  = their offense
 *   def  = their defense
 *
 * Named mapper (the only place event-side becomes corpus-side):
 *   offense → ours
 *   defense → off   (a D Caller snap IS an opponent offensive snap
 *                    annotated with our front / coverage / blitz)
 */
(function (global) {
  "use strict";

  var EVENT_OFFENSE = "offense";
  var EVENT_DEFENSE = "defense";
  var SEASON_OURS = "ours";
  var SEASON_OFF = "off";
  var SEASON_DEF = "def";
  var O_STORE_KEY = "offgrd_caller_events_v2";
  var D_STORE_KEY = "offgrd_dcaller_events_v2";
  var SEASON_KEY = "offgrd_season_v2";
  var SYNCED_KEY = "offgrd_caller_synced_ids_v1";
  var LEGACY_KEY = "offgrd_caller_v1";
  var LIVE_GAME_ID = "9831eb33-587e-46e4-a9c8-b872722421b2";

  function CallerSideError(message) {
    var err = new Error(message);
    err.name = "CallerSideError";
    return err;
  }

  function isEventSide(side) {
    return side === EVENT_OFFENSE || side === EVENT_DEFENSE;
  }

  /** Throws unless side is exactly "offense" or "defense". No default. No coerce. */
  function requireEventSide(side) {
    if (isEventSide(side)) return side;
    throw CallerSideError(
      "caller event side required: expected \"offense\" or \"defense\", got " + JSON.stringify(side)
    );
  }

  /** The one mapper. Event side → season corpus side. */
  function eventSideToSeasonSide(side) {
    return requireEventSide(side) === EVENT_DEFENSE ? SEASON_OFF : SEASON_OURS;
  }

  function eventSide(ev) {
    if (!ev) return null;
    return isEventSide(ev.side) ? ev.side : null;
  }

  /**
   * Lift legacy payload.side onto the event (once). After this, eventSide
   * and the sync mapper read top-level only. Does not invent a side.
   */
  function normalizeEventSide(ev) {
    if (!ev) return ev;
    if (isEventSide(ev.side)) return ev;
    var p = ev.payload;
    if (p && isEventSide(p.side)) ev.side = p.side;
    return ev;
  }

  /**
   * Stamp side on the event (top-level). Never writes payload.side.
   * Bare play-field objects are returned unchanged — side belongs on the event.
   */
  function stampPayload(obj, side) {
    var s = requireEventSide(side);
    var out = Object.assign({}, obj || {});
    var isEvent = !!(out.eventId || (out.payload && typeof out.payload === "object" &&
      (out.type === "call" || out.type === "outcome" || out.type === "observation" ||
        out.type === "correction" || out.type === "undo" || out.type === "resolve_collision")));
    if (!isEvent) {
      if (Object.prototype.hasOwnProperty.call(out, "side")) delete out.side;
      return out;
    }
    out.side = s;
    if (out.payload && Object.prototype.hasOwnProperty.call(out.payload, "side")) {
      var p = Object.assign({}, out.payload);
      delete p.side;
      out.payload = p;
    }
    return out;
  }

  /** Cloud caller_events insert row. Null if the event has no side — never send null. */
  function eventToSyncRow(e, teamId) {
    if (!e || !e.eventId) return null;
    normalizeEventSide(e);
    var side = eventSide(e);
    if (!isEventSide(side)) return null;
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

  function playbookNameSet(playbookNames) {
    var book = Object.create(null);
    (playbookNames || []).forEach(function (n) {
      var t = String(n || "").trim();
      if (t) book[t] = 1;
    });
    return book;
  }

  function assertEventAllowed(payload, side, playbookNames) {
    var s = requireEventSide(side);
    var p = payload || {};
    var play = String(p.play || "").trim();
    var book = playbookNameSet(playbookNames);
    if (s === EVENT_DEFENSE && play && book[play]) {
      throw CallerSideError("defense event cannot carry playbook play: " + play);
    }
    if (s === EVENT_OFFENSE && p.theirPlayType) {
      throw CallerSideError("offense event cannot carry theirPlayType");
    }
    if (s === EVENT_OFFENSE && p.theirDirection) {
      throw CallerSideError("offense event cannot carry theirDirection");
    }
    return true;
  }

  function filterEventsBySide(events, want) {
    var s = requireEventSide(want);
    return (events || []).filter(function (e) {
      normalizeEventSide(e);
      return eventSide(e) === s;
    });
  }

  function filterLogBySide(log, want) {
    var s = requireEventSide(want);
    return (log || []).filter(function (l) {
      return eventSide(l) === s;
    });
  }

  function theirOffenseFromEntry(entry) {
    var play = String((entry && entry.play) || "").trim();
    var pt = (entry && (entry.theirPlayType || entry.playType)) || null;
    var dir = (entry && entry.theirDirection) || null;
    if (!pt && /^(Pass|Run M|Run)(\s|$)/.test(play)) {
      pt = /^Run M\b/.test(play) ? "Run M" : play.split(/\s+/)[0];
    }
    if (!dir && play) {
      var parts = play.split(/\s+/);
      if (parts.length >= 2 && parts[0] === "Run" && parts[1] === "M") dir = parts[2] || null;
      else if (parts.length >= 2 && (parts[0] === "Pass" || parts[0] === "Run")) dir = parts.slice(1).join(" ") || null;
    }
    return { playType: pt, direction: dir };
  }

  /**
   * Stamp a season snap row.
   * offense → ours (our play; no theirPlayType)
   * defense → off  (their run/pass/direction + our front/coverage/blitz)
   */
  function stampRow(row, side, entry, playbookNames) {
    var s = requireEventSide(side);
    assertEventAllowed(entry || row || {}, s, playbookNames);
    var dest = eventSideToSeasonSide(s);
    var out = Object.assign({}, row || {});
    out.source = out.source || "live_call";
    out.side = dest;
    if (s === EVENT_DEFENSE) {
      var their = theirOffenseFromEntry(entry || row || {});
      out.theirPlayType = their.playType;
      out.theirDirection = their.direction;
      out.play = their.playType || "";
    } else {
      if (Object.prototype.hasOwnProperty.call(out, "theirPlayType")) delete out.theirPlayType;
      if (Object.prototype.hasOwnProperty.call(out, "theirDirection")) delete out.theirDirection;
    }
    var gate = assertRowAllowed(out, playbookNames);
    if (!gate.ok) throw CallerSideError("row refused: " + gate.reason);
    return out;
  }

  function eventToRow(entry, side, playbookNames) {
    var row = stampRow(
      {
        play: entry && entry.play,
        playType: entry && entry.playType,
        front: entry && entry.front,
        coverage: entry && entry.coverage,
        pressure: entry && entry.pressure,
        source: "live_call",
      },
      side,
      entry,
      playbookNames
    );
    return { ok: true, row: row, dest: row.side };
  }

  function promoteEntries(entries, side, playbookNames) {
    var dest = eventSideToSeasonSide(side);
    var rows = (entries || []).map(function (e) {
      return eventToRow(e, side, playbookNames).row;
    });
    rows.forEach(function (r) {
      if (r.side !== dest) {
        throw CallerSideError("promotion dest mismatch: " + r.side + " !== " + dest);
      }
    });
    return { dest: dest, rows: rows };
  }

  function assertRowAllowed(row, playbookNames) {
    if (!row || (row.side !== SEASON_OURS && row.side !== SEASON_OFF && row.side !== SEASON_DEF)) {
      return { ok: false, reason: "unset-row-side" };
    }
    if (row.side === SEASON_OURS && row.theirPlayType) {
      return { ok: false, reason: "ours-has-theirPlayType" };
    }
    if (row.side === SEASON_OURS && row.theirDirection) {
      return { ok: false, reason: "ours-has-theirDirection" };
    }
    if (row.side === SEASON_OFF) {
      var play = String(row.play || "").trim();
      var book = playbookNameSet(playbookNames);
      if (play && book[play]) return { ok: false, reason: "off-has-playbook-play" };
    }
    return { ok: true };
  }

  function isLiveCallRow(r) {
    return !!(r && r.source === "live_call");
  }

  function isLiveCallGame(g) {
    if (!g) return false;
    if (g.source === "live_call") return true;
    var week = String(g.week || "");
    if (/^live\b/i.test(week)) return true;
    return false;
  }

  /** Describe live_call purge. Never touches scout_import / empty-source film. */
  function planLiveCallPurge(seasonGames, eventsState, opts) {
    opts = opts || {};
    var gameId = opts.gameId || LIVE_GAME_ID;
    var games = Array.isArray(seasonGames) ? seasonGames : [];
    var events = (eventsState && eventsState.events) || [];
    var dropGames = [];
    var stripGames = [];
    var surviving = [];
    games.forEach(function (g) {
      if (!g) return;
      var rows = Array.isArray(g.rows) ? g.rows : [];
      var liveN = 0;
      var keepN = 0;
      var keep = [];
      rows.forEach(function (r) {
        if (isLiveCallRow(r)) liveN += 1;
        else {
          keepN += 1;
          keep.push(r);
        }
      });
      var wholeLive = isLiveCallGame(g) && keepN === 0;
      if (wholeLive && (liveN > 0 || !rows.length)) {
        dropGames.push({
          opponent: g.opponent,
          week: g.week,
          side: g.side,
          source: g.source,
          rows: rows.length,
          live_call: liveN,
        });
        return;
      }
      if (liveN > 0) {
        stripGames.push({
          opponent: g.opponent,
          week: g.week,
          side: g.side,
          source: g.source,
          strip: liveN,
          keep: keepN,
        });
        surviving.push(Object.assign({}, g, { rows: keep }));
        return;
      }
      surviving.push(g);
    });
    var eventMatch = events.filter(function (e) {
      return e && (e.gameId === gameId || String(e.gameId || "").indexOf("9831eb33") === 0);
    });
    var surviveRows = 0;
    var surviveBySrc = { scout_import: 0, none: 0, live_call: 0, other: 0 };
    surviving.forEach(function (g) {
      (g.rows || []).forEach(function (r) {
        surviveRows += 1;
        var src = r.source || "none";
        if (src === "live_call") surviveBySrc.live_call += 1;
        else if (src === "scout_import") surviveBySrc.scout_import += 1;
        else if (src === "none" || src === "") surviveBySrc.none += 1;
        else surviveBySrc.other += 1;
      });
    });
    return {
      gameId: gameId,
      dropEventCount: eventMatch.length || events.length,
      dropWholeGames: dropGames,
      stripLiveCallFrom: stripGames,
      survivingGames: surviving.length,
      survivingRows: surviveRows,
      survivingBySource: surviveBySrc,
      localKeys: [O_STORE_KEY, D_STORE_KEY, LEGACY_KEY, SYNCED_KEY],
    };
  }

  /**
   * One-shot test-corpus plan: archive caller_games, delete their events.
   * After the first real game this becomes archive-only — do not delete events.
   * Tombstone only blocks the purged natural key. A new session is a new key.
   */
  function planCallerEventsPurge(callerGames, callerEvents, opts) {
    opts = opts || {};
    var games = Array.isArray(callerGames) ? callerGames : [];
    var events = Array.isArray(callerEvents) ? callerEvents : [];
    var filter = opts.gameIds && opts.gameIds.length ? opts.gameIds.map(String) : null;
    var archiveIds = [];
    var seen = Object.create(null);
    games.forEach(function (g) {
      var id = g && (g.id || g.gameId);
      if (!id) return;
      id = String(id);
      if (filter && filter.indexOf(id) < 0) return;
      if (seen[id]) return;
      seen[id] = 1;
      archiveIds.push(id);
    });
    if (filter) {
      filter.forEach(function (id) {
        if (!seen[id]) {
          seen[id] = 1;
          archiveIds.push(id);
        }
      });
    }
    if (!filter && !archiveIds.length) {
      events.forEach(function (e) {
        var id = e && (e.gameId || e.game_id);
        if (!id) return;
        id = String(id);
        if (seen[id]) return;
        seen[id] = 1;
        archiveIds.push(id);
      });
    }
    var eventsByGame = Object.create(null);
    archiveIds.forEach(function (id) {
      eventsByGame[id] = 0;
    });
    var deleteEventCount = 0;
    events.forEach(function (e) {
      var id = e && (e.gameId || e.game_id);
      if (!id || !seen[String(id)]) return;
      eventsByGame[String(id)] += 1;
      deleteEventCount += 1;
    });
    return {
      archiveGameIds: archiveIds,
      eventsByGame: eventsByGame,
      deleteEventCount: deleteEventCount,
      localKeys: [O_STORE_KEY, D_STORE_KEY, LEGACY_KEY, SYNCED_KEY],
      policy: "delete-once-test-corpus",
      afterFirstRealGame: "archive-only — do not delete caller_events",
    };
  }

  function applySeasonPurge(seasonGames, plan) {
    if (!plan) return seasonGames;
    var drop = Object.create(null);
    (plan.dropWholeGames || []).forEach(function (g) {
      drop[String(g.opponent || "").toLowerCase() + "|" + String(g.week || "").toLowerCase() + "|" + g.side] = 1;
    });
    return (seasonGames || [])
      .filter(function (g) {
        var k = String(g.opponent || "").toLowerCase() + "|" + String(g.week || "").toLowerCase() + "|" + g.side;
        return !drop[k];
      })
      .map(function (g) {
        var rows = (g.rows || []).filter(function (r) {
          return !isLiveCallRow(r);
        });
        return Object.assign({}, g, { rows: rows });
      });
  }

  global.OFFGRD_CALLER_SIDE = {
    EVENT_OFFENSE: EVENT_OFFENSE,
    EVENT_DEFENSE: EVENT_DEFENSE,
    SEASON_OURS: SEASON_OURS,
    SEASON_OFF: SEASON_OFF,
    SEASON_DEF: SEASON_DEF,
    O_STORE_KEY: O_STORE_KEY,
    D_STORE_KEY: D_STORE_KEY,
    SEASON_KEY: SEASON_KEY,
    LIVE_GAME_ID: LIVE_GAME_ID,
    CallerSideError: CallerSideError,
    isEventSide: isEventSide,
    requireEventSide: requireEventSide,
    eventSideToSeasonSide: eventSideToSeasonSide,
    eventSide: eventSide,
    normalizeEventSide: normalizeEventSide,
    stampPayload: stampPayload,
    eventToSyncRow: eventToSyncRow,
    assertEventAllowed: assertEventAllowed,
    filterEventsBySide: filterEventsBySide,
    filterLogBySide: filterLogBySide,
    stampRow: stampRow,
    eventToRow: eventToRow,
    promoteEntries: promoteEntries,
    assertRowAllowed: assertRowAllowed,
    planLiveCallPurge: planLiveCallPurge,
    planCallerEventsPurge: planCallerEventsPurge,
    applySeasonPurge: applySeasonPurge,
    theirOffenseFromEntry: theirOffenseFromEntry,
  };
})(typeof window !== "undefined" ? window : globalThis);
