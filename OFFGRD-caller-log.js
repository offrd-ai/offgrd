/* ============================================================
   OFFGRD Caller — append-only event log + deterministic fold
   Multi-device, no hand-off. Persist events; derive CALLER_LOG / gamesRows.
   ============================================================ */
(function (global) {
  "use strict";

  var COLLISION_MS = 20000;
  /** Same play name within this window → one call (fat-finger / unregistered tap). Fold-enforced. */
  var DEDUP_MS = 3000;
  var STORE_KEY = "offgrd_caller_events_v2";
  var DEVICE_KEY = "offgrd_device_id";

  function uuid() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === "function")
        return global.crypto.randomUUID();
    } catch (e) {}
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function deviceId() {
    try {
      var d = localStorage.getItem(DEVICE_KEY);
      if (d) return d;
      d = "dev_" + uuid().slice(0, 12);
      localStorage.setItem(DEVICE_KEY, d);
      return d;
    } catch (e) {
      return "dev_anon";
    }
  }

  function sortEvents(events) {
    return (events || []).slice().sort(function (a, b) {
      if (a.clientTs !== b.clientTs) return a.clientTs - b.clientTs;
      if (a.deviceId < b.deviceId) return -1;
      if (a.deviceId > b.deviceId) return 1;
      return (a.seq || 0) - (b.seq || 0);
    });
  }

  /**
   * Deterministic fold. Ordered by clientTs, ties (deviceId, seq).
   * Dual calls at same playIndex from different devices → keep earlier,
   * mark later superseded, surface collision until resolve_collision.
   */
  function foldCallerEvents(events) {
    var sorted = sortEvents(events);
    var byPlay = Object.create(null);
    var superseded = Object.create(null);
    var collisions = [];
    var resolved = Object.create(null);
    var i, e, slot, other, keep, drop, c;

    for (i = 0; i < sorted.length; i++) {
      e = sorted[i];
      if (!e || !e.eventId) continue;
      if (e.type === "resolve_collision") {
        keep = e.payload && e.payload.keepEventId;
        drop = e.payload && e.payload.dropEventId;
        if (drop) superseded[drop] = true;
        if (keep && drop) resolved[String(e.playIndex) + "|" + keep + "|" + drop] = true;
        if (keep && drop) resolved[String(e.playIndex) + "|" + drop + "|" + keep] = true;
        continue;
      }
      if (e.type === "call") {
        /* Cross-index de-dup: same play name within DEDUP_MS of an active call
         * (double-tap / unregistered first tap). Keep earlier; supersede later.
         * Outside the window, genuine repeats log normally. */
        var playName = e.payload && e.payload.play != null ? String(e.payload.play) : "";
        if (playName) {
          var dedupEarlier = null;
          var piKeys = Object.keys(byPlay);
          var di;
          for (di = 0; di < piKeys.length; di++) {
            var ds = byPlay[piKeys[di]];
            if (!ds || !ds.call || ds.undone) continue;
            if (superseded[ds.call.eventId]) continue;
            if (ds.call.eventId === e.eventId) continue;
            var dPlay = ds.call.payload && ds.call.payload.play != null ? String(ds.call.payload.play) : "";
            if (dPlay !== playName) continue;
            if (Math.abs((e.clientTs || 0) - (ds.call.clientTs || 0)) > DEDUP_MS) continue;
            if (!dedupEarlier || (ds.call.clientTs || 0) < (dedupEarlier.clientTs || 0)) {
              dedupEarlier = ds.call;
            }
          }
          if (dedupEarlier) {
            if ((e.clientTs || 0) >= (dedupEarlier.clientTs || 0)) {
              superseded[e.eventId] = true;
              continue;
            }
            /* reorder: e is earlier — supersede the one already in a slot */
            superseded[dedupEarlier.eventId] = true;
            var earlierPi = null;
            for (di = 0; di < piKeys.length; di++) {
              if (byPlay[piKeys[di]] && byPlay[piKeys[di]].call && byPlay[piKeys[di]].call.eventId === dedupEarlier.eventId) {
                earlierPi = piKeys[di];
                break;
              }
            }
            if (earlierPi != null) {
              byPlay[earlierPi].call = e;
              byPlay[earlierPi].undone = false;
              continue;
            }
          }
        }

        slot = byPlay[e.playIndex];
        if (!slot || !slot.call) {
          byPlay[e.playIndex] = {
            call: e,
            outcome: slot && slot.outcome ? slot.outcome : null,
            obs: slot && slot.obs ? slot.obs : null,
            undone: false,
          };
          continue;
        }
        if (slot.call.eventId === e.eventId) continue;
        other = slot.call;
        if (other.deviceId === e.deviceId) {
          /* same device re-call at same playIndex: later wins */
          superseded[other.eventId] = true;
          slot.call = e;
          continue;
        }
        /* different devices — keep earlier (already in slot), supersede later */
        superseded[e.eventId] = true;
        c = {
          playIndex: e.playIndex,
          keep: other,
          drop: e,
          resolved: !!(
            resolved[String(e.playIndex) + "|" + other.eventId + "|" + e.eventId] ||
            resolved[String(e.playIndex) + "|" + e.eventId + "|" + other.eventId]
          ),
        };
        if (!c.resolved) collisions.push(c);
        continue;
      }
      if (e.type === "outcome") {
        slot = byPlay[e.playIndex] || { call: null, outcome: null, obs: null, undone: false };
        slot.outcome = e; /* LWW */
        byPlay[e.playIndex] = slot;
        continue;
      }
      /* observation = front/pressure about the snap; correction may also carry those fields.
       * Precedence: explicit beats carried regardless of timestamp; LWW only among equals.
       * Protects a human amend from a later offline sticky-carry sync. */
      if (e.type === "observation" || e.type === "correction") {
        slot = byPlay[e.playIndex] || { call: null, outcome: null, obs: null, undone: false };
        if (e.type === "correction" && e.payload && e.payload.result !== undefined) {
          slot.outcome = e; /* outcome-style correction still LWW-grades */
        }
        var pl = e.payload || {};
        if (pl.front !== undefined || pl.pressure !== undefined) {
          slot.obs = slot.obs || {
            front: null,
            pressure: null,
            frontCarried: false,
            pressureCarried: false,
            frontSet: false,
            pressureSet: false,
          };
          if (pl.front !== undefined) {
            var frontInCarried = !!pl.frontCarried;
            /* carried never overwrites explicit; equals → LWW (sorted order) */
            if (!slot.obs.frontSet || !(frontInCarried && !slot.obs.frontCarried)) {
              slot.obs.front = pl.front; /* null clears when explicit */
              slot.obs.frontCarried = frontInCarried;
              slot.obs.frontSet = true;
            }
          }
          if (pl.pressure !== undefined) {
            var pressInCarried = !!pl.pressureCarried;
            if (!slot.obs.pressureSet || !(pressInCarried && !slot.obs.pressureCarried)) {
              slot.obs.pressure = pl.pressure;
              slot.obs.pressureCarried = pressInCarried;
              slot.obs.pressureSet = true;
            }
          }
        }
        byPlay[e.playIndex] = slot;
        continue;
      }
      if (e.type === "undo") {
        slot = byPlay[e.playIndex];
        if (slot) {
          slot.undone = true;
          if (slot.call) superseded[slot.call.eventId] = true;
        }
      }
    }

    /* apply resolve_collision supersedes that arrived before the drop call in rare reorder */
    for (i = 0; i < sorted.length; i++) {
      e = sorted[i];
      if (e && e.type === "resolve_collision" && e.payload && e.payload.dropEventId) {
        superseded[e.payload.dropEventId] = true;
      }
    }

    var indexes = Object.keys(byPlay)
      .map(Number)
      .filter(function (n) {
        return !isNaN(n);
      })
      .sort(function (a, b) {
        return a - b;
      });

    var log = [];
    var rows = [];
    var activity = [];

    indexes.forEach(function (pi) {
      slot = byPlay[pi];
      if (!slot || !slot.call || slot.undone) return;
      if (superseded[slot.call.eventId]) return;
      var p = slot.call.payload || {};
      var result = null;
      if (slot.outcome && slot.outcome.payload) {
        result = slot.outcome.payload.result || null;
      }
      var obs = slot.obs || null;
      var front = obs && obs.front != null && obs.front !== "" ? obs.front : null;
      var pressure = obs && obs.pressure != null && obs.pressure !== "" ? obs.pressure : null;
      var entry = {
        id: slot.call.eventId,
        playIndex: pi,
        sitTxt: p.sitTxt || "",
        play: p.play,
        result: result,
        dn: p.dn,
        db: p.db,
        hash: p.hash,
        zone: p.zone,
        coverage: p.coverage,
        playType: p.playType,
        opponent: p.opponent,
        date: p.date,
        signal: p.signal,
        front: front,
        pressure: pressure,
        frontCarried: !!(front && obs && obs.frontCarried),
        pressureCarried: !!(pressure && obs && obs.pressureCarried),
        deviceId: slot.call.deviceId,
        actorId: slot.call.actorId,
        actorLabel: p.actorLabel || null,
        ts: slot.call.clientTs,
        eventId: slot.call.eventId,
      };
      log.push(entry);
      activity.push({
        playIndex: pi,
        play: p.play,
        deviceId: slot.call.deviceId,
        actorId: slot.call.actorId,
        actorLabel: p.actorLabel || "teammate",
        clientTs: slot.call.clientTs,
      });
    });

    /* Surface until resolve_collision; earlier call already counts in gamesRows. */
    collisions = collisions.filter(function (c) {
      if (!c.keep || !c.drop || superseded[c.keep.eventId]) return false;
      var k1 = String(c.playIndex) + "|" + c.keep.eventId + "|" + c.drop.eventId;
      var k2 = String(c.playIndex) + "|" + c.drop.eventId + "|" + c.keep.eventId;
      if (resolved[k1] || resolved[k2]) return false;
      return true;
    });

    return {
      log: log,
      rowsMeta: log,
      collisions: collisions,
      supersededIds: superseded,
      activity: activity,
      nextPlayIndex: indexes.length ? Math.max.apply(null, indexes) + 1 : 0,
      sorted: sorted,
    };
  }

  function entryToGamesRow(entry, toRowFn) {
    if (typeof toRowFn === "function") return toRowFn(entry);
    return null;
  }

  function mergeEvents(local, remote) {
    var map = Object.create(null);
    (local || []).concat(remote || []).forEach(function (e) {
      if (!e || !e.eventId) return;
      map[e.eventId] = e;
    });
    return Object.keys(map).map(function (k) {
      return map[k];
    });
  }

  function loadStore() {
    try {
      var x = localStorage.getItem(STORE_KEY);
      if (!x) return null;
      return JSON.parse(x);
    } catch (e) {
      return null;
    }
  }

  function saveStore(state) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  /** Migrate v1 CALLER_LOG snapshot → events (once). */
  function migrateV1Log(log, session, device, actorId) {
    if (!log || !log.length) return [];
    var events = [];
    var seq = 0;
    var gameId = (session && session.gameId) || uuid();
    log.forEach(function (l, idx) {
      seq += 1;
      var callId = l.id && String(l.id).length >= 30 ? l.id : uuid();
      events.push({
        eventId: callId,
        gameId: gameId,
        playIndex: typeof l.playIndex === "number" ? l.playIndex : idx,
        type: "call",
        payload: {
          sitTxt: l.sitTxt,
          play: l.play,
          dn: l.dn,
          db: l.db,
          hash: l.hash,
          zone: l.zone,
          coverage: l.coverage,
          playType: l.playType,
          opponent: l.opponent,
          date: l.date,
          signal: l.signal,
          front: l.front || "",
          actorLabel: l.actorLabel || null,
        },
        deviceId: device,
        actorId: actorId || null,
        clientTs: l.ts || Date.now() - (log.length - idx) * 1000,
        seq: seq,
        superseded: false,
      });
      if (l.result) {
        seq += 1;
        events.push({
          eventId: uuid(),
          gameId: gameId,
          playIndex: typeof l.playIndex === "number" ? l.playIndex : idx,
          type: "outcome",
          payload: { result: l.result },
          deviceId: device,
          actorId: actorId || null,
          clientTs: (l.ts || Date.now()) + 1,
          seq: seq,
          superseded: false,
        });
      }
    });
    return { gameId: gameId, events: events };
  }

  /** Last active (non-undone) call from a fold log — selection / ON CALL source of truth. */
  function onCallFromLog(log) {
    if (!log || !log.length) return null;
    return log[log.length - 1] || null;
  }

  /**
   * Would a new call for `play` at clientTs be de-duped against folded log?
   * Client may short-circuit; fold remains authority across devices.
   */
  function wouldDedupCall(log, play, clientTs) {
    if (!play || !log || !log.length) return null;
    var ts = clientTs != null ? clientTs : Date.now();
    var i, e;
    for (i = log.length - 1; i >= 0; i--) {
      e = log[i];
      if (!e) continue;
      if (Math.abs(ts - (e.ts || 0)) > DEDUP_MS) break;
      if (e.play === play) return e;
    }
    return null;
  }

  global.OFFGRD_CALLER = {
    COLLISION_MS: COLLISION_MS,
    DEDUP_MS: DEDUP_MS,
    STORE_KEY: STORE_KEY,
    uuid: uuid,
    deviceId: deviceId,
    sortEvents: sortEvents,
    foldCallerEvents: foldCallerEvents,
    mergeEvents: mergeEvents,
    loadStore: loadStore,
    saveStore: saveStore,
    migrateV1Log: migrateV1Log,
    entryToGamesRow: entryToGamesRow,
    onCallFromLog: onCallFromLog,
    wouldDedupCall: wouldDedupCall,
  };
})(typeof window !== "undefined" ? window : globalThis);
