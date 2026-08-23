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
  var DCALLER_STORE_KEY = "offgrd_dcaller_events_v2";
  var DEVICE_KEY = "offgrd_device_id";

  function eventSideOf(e) {
    var S = global.OFFGRD_CALLER_SIDE;
    if (S && S.normalizeEventSide) S.normalizeEventSide(e);
    if (S && S.eventSide) return S.eventSide(e);
    if (e && (e.side === "offense" || e.side === "defense")) return e.side;
    return null;
  }

  function slotKey(e, foldSide) {
    var side = eventSideOf(e) || foldSide || "_";
    var dev = (e && e.deviceId) || "_";
    return side + ":" + dev + ":" + e.playIndex;
  }

  /**
   * Calls are device-scoped (append-only union). Looks / grades attach to
   * that device's snap; if this playIndex has exactly one live call, attach
   * there so a booth can grade a sideline snap.
   */
  function findSlotKey(e, foldSide, byPlay) {
    var exact = slotKey(e, foldSide);
    if (byPlay[exact]) return exact;
    var side = eventSideOf(e) || foldSide || "_";
    var suffix = ":" + e.playIndex;
    var matches = [];
    var keys = Object.keys(byPlay);
    var i, k, slot;
    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      if (k.indexOf(side + ":") !== 0) continue;
      if (k.slice(k.length - suffix.length) !== suffix) continue;
      slot = byPlay[k];
      if (slot && slot.call && !slot.undone) matches.push(k);
    }
    if (matches.length === 1) return matches[0];
    return exact;
  }

  function eventGameId(e) {
    if (!e || e.gameId == null || e.gameId === "") return null;
    return String(e.gameId);
  }

  /** Distinct gameIds present on events. Missing/empty gameId is not a game. */
  function distinctGameIds(events) {
    var seen = Object.create(null);
    var out = [];
    (events || []).forEach(function (e) {
      var id = eventGameId(e);
      if (!id || seen[id]) return;
      seen[id] = 1;
      out.push(id);
    });
    return out;
  }

  /**
   * A fold is one game. Two gameIds never merge.
   * gameId set → keep only that game (ignore everything else).
   * gameId unset + two or more gameIds → throw (loud; do not collide playIndexes).
   * gameId unset + one gameId → keep that game.
   * gameId unset + none → pass through (legacy fixtures without gameId).
   */
  function scopeEventsToGame(events, gameId) {
    var list = events || [];
    var want = gameId != null && gameId !== "" ? String(gameId) : null;
    if (want) {
      return list.filter(function (e) {
        return eventGameId(e) === want;
      });
    }
    var ids = distinctGameIds(list);
    if (ids.length > 1) {
      throw new Error(
        "foldCallerEvents: mixed gameIds without gameId scope (" + ids.join(", ") + ")"
      );
    }
    if (ids.length === 1) {
      return list.filter(function (e) {
        return eventGameId(e) === ids[0];
      });
    }
    return list;
  }

  /**
   * Partition by gameId and fold each independently.
   * Snaps from both games survive; nothing is dropped unless it lands
   * in that game's collisions or supersededIds.
   */
  function foldEachGame(events, opts) {
    opts = opts || {};
    var groups = Object.create(null);
    var orphan = [];
    (events || []).forEach(function (e) {
      var id = eventGameId(e);
      if (!id) {
        orphan.push(e);
        return;
      }
      (groups[id] = groups[id] || []).push(e);
    });
    var byGameId = Object.create(null);
    var supersededIds = Object.create(null);
    var collisions = [];
    Object.keys(groups).forEach(function (gid) {
      var r = foldCallerEvents(groups[gid], Object.assign({}, opts, { gameId: gid }));
      byGameId[gid] = r;
      Object.keys(r.supersededIds || {}).forEach(function (id) {
        if (r.supersededIds[id]) supersededIds[id] = true;
      });
      (r.collisions || []).forEach(function (c) {
        collisions.push(c);
      });
    });
    if (orphan.length) {
      byGameId[""] = foldCallerEvents(orphan, Object.assign({}, opts, { gameId: null }));
    }
    return { byGameId: byGameId, supersededIds: supersededIds, collisions: collisions };
  }

  /**
   * Required side on every event. Unset / bad side throws — do not default.
   */
  function buildEvent(opts) {
    opts = opts || {};
    var S = global.OFFGRD_CALLER_SIDE;
    var payload = Object.assign({}, opts.payload || {});
    if (Object.prototype.hasOwnProperty.call(payload, "side")) delete payload.side;
    var raw = opts.side;
    var side;
    if (S && S.requireEventSide) {
      side = S.requireEventSide(raw);
    } else if (raw === "offense" || raw === "defense") {
      side = raw;
    } else {
      throw new Error(
        "caller event side required: expected \"offense\" or \"defense\", got " + JSON.stringify(raw)
      );
    }
    var ev = {
      eventId: opts.eventId || uuid(),
      gameId: opts.gameId,
      playIndex: opts.playIndex,
      type: opts.type,
      payload: payload,
      deviceId: opts.deviceId,
      actorId: opts.actorId,
      clientTs: opts.clientTs != null ? opts.clientTs : Date.now(),
      seq: opts.seq,
      superseded: !!opts.superseded,
      side: side,
    };
    return S && S.stampPayload ? S.stampPayload(ev, side) : ev;
  }

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

  function hasOwn(obj, key) {
    return !!(obj && Object.prototype.hasOwnProperty.call(obj, key));
  }

  /**
   * Outcome field LWW. A present key is a write — [] and null clear.
   * A missing key is not an update. flags:[] also clears flag unless
   * flag is set on the same payload; flag:null clears flags the same way.
   */
  function mergeOutcomeFields(prev, next) {
    prev = prev || {};
    next = next || {};
    var out = Object.assign({}, prev);
    ["result", "gain", "conceptOverride", "movedChains", "signal"].forEach(function (k) {
      if (hasOwn(next, k)) out[k] = next[k];
    });
    var hasFlags = hasOwn(next, "flags");
    var hasFlag = hasOwn(next, "flag");
    if (hasFlags) {
      out.flags = Array.isArray(next.flags) ? next.flags.slice() : [];
      if (!out.flags.length && !hasFlag) out.flag = null;
    }
    if (hasFlag) {
      out.flag = next.flag == null || next.flag === "" ? null : next.flag;
      if (out.flag == null && !hasFlags) out.flags = [];
    }
    return out;
  }

  function applyOutcomeSignal(slot, payload) {
    if (!hasOwn(payload, "signal")) return;
    slot.sitPatch = slot.sitPatch || {};
    slot.sitPatch.signal = payload.signal;
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
   * Deterministic fold. One game at a time — opts.gameId or a single
   * gameId in the input. Two gameIds without a scope throw (never merge).
   * Ordered by clientTs, ties (deviceId, seq).
   * Two devices at the same playIndex are two snaps (each device counts
   * 0,1,2… locally). Union by eventId — never prompt. Same-device re-call
   * still replaces. Honor existing resolve_collision drops.
   */
  function foldCallerEvents(events, opts) {
    opts = opts || {};
    var want = opts.side || null;
    var S = global.OFFGRD_CALLER_SIDE;
    events = scopeEventsToGame(events, opts.gameId);
    events = (events || []).map(function (e) {
      return S && S.normalizeEventSide ? S.normalizeEventSide(e) || e : e;
    });
    if (want) {
      if (S && S.requireEventSide) want = S.requireEventSide(want);
      else if (want !== "offense" && want !== "defense") {
        throw new Error("foldCallerEvents: side must be \"offense\" or \"defense\"");
      }
      events = (events || []).filter(function (e) {
        var got = eventSideOf(e);
        if (got) return got === want;
        return e && e.type && e.type !== "call";
      });
    }
    var sorted = sortEvents(events);
    var byPlay = Object.create(null);
    var superseded = Object.create(null);
    var collisions = [];
    var resolved = Object.create(null);
    var i, e, slot, other, keep, drop, skey;

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
            if ((ds.call.deviceId || "_") !== (e.deviceId || "_")) continue;
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

        skey = slotKey(e, want);
        slot = byPlay[skey];
        if (!slot || !slot.call) {
          byPlay[skey] = {
            call: e,
            outcome: slot && slot.outcome ? slot.outcome : null,
            obs: slot && slot.obs ? slot.obs : null,
            undone: false,
          };
          continue;
        }
        if (slot.call.eventId === e.eventId) continue;
        other = slot.call;
        /* same device + same slot: later re-call wins. Different devices
         * never share a slot (keyed by deviceId), so they cannot land here. */
        superseded[other.eventId] = true;
        slot.call = e;
        continue;
      }
      if (e.type === "outcome") {
        skey = findSlotKey(e, want, byPlay);
        slot = byPlay[skey] || { call: null, outcome: null, obs: null, sitPatch: null, undone: false };
        var prevPay = (slot.outcome && slot.outcome.payload) || {};
        var nextPay = mergeOutcomeFields(prevPay, e.payload || {});
        slot.outcome = Object.assign({}, e, { type: "outcome", payload: nextPay });
        applyOutcomeSignal(slot, e.payload || {});
        byPlay[skey] = slot;
        continue;
      }
      /* observation = front/pressure about the snap; correction may also carry those fields.
       * Precedence: explicit beats carried regardless of timestamp; LWW only among equals.
       * Protects a human amend from a later offline sticky-carry sync.
       * correction also LWW-patches call situation/play (dn/db/hash/zone/play) — never mutates events. */
      if (e.type === "observation" || e.type === "correction") {
        skey = findSlotKey(e, want, byPlay);
        slot = byPlay[skey] || { call: null, outcome: null, obs: null, sitPatch: null, undone: false };
        var pl = e.payload || {};
        if (e.type === "correction") {
          var sitKeys = ["dn", "db", "estYards", "hash", "zone", "play", "sitTxt", "situationInferred", "coverage", "playType", "theirDirection", "signal"];
          var hasSit = false;
          var sk;
          for (sk = 0; sk < sitKeys.length; sk++) {
            if (pl[sitKeys[sk]] !== undefined) {
              hasSit = true;
              break;
            }
          }
          if (hasSit) {
            slot.sitPatch = slot.sitPatch || {};
            for (sk = 0; sk < sitKeys.length; sk++) {
              if (pl[sitKeys[sk]] !== undefined) slot.sitPatch[sitKeys[sk]] = pl[sitKeys[sk]];
            }
          }
          if (
            pl.result !== undefined ||
            pl.flag !== undefined ||
            pl.flags !== undefined ||
            pl.conceptOverride !== undefined ||
            pl.signal !== undefined
          ) {
            var prevOut = (slot.outcome && slot.outcome.payload) || {};
            slot.outcome = {
              eventId: e.eventId,
              playIndex: e.playIndex,
              type: "outcome",
              payload: mergeOutcomeFields(prevOut, pl),
              deviceId: e.deviceId,
              actorId: e.actorId,
              clientTs: e.clientTs,
              seq: e.seq,
            };
            applyOutcomeSignal(slot, pl);
          }
        }
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
        byPlay[skey] = slot;
        continue;
      }
      if (e.type === "undo") {
        slot = byPlay[findSlotKey(e, want, byPlay)];
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

    var slotKeys = Object.keys(byPlay).sort(function (a, b) {
      var ca = byPlay[a] && byPlay[a].call;
      var cb = byPlay[b] && byPlay[b].call;
      var ta = ca ? ca.clientTs || 0 : 0;
      var tb = cb ? cb.clientTs || 0 : 0;
      if (ta !== tb) return ta - tb;
      var pa = ca ? ca.playIndex : Number(String(a).split(":").pop());
      var pb = cb ? cb.playIndex : Number(String(b).split(":").pop());
      if (pa !== pb) return (pa || 0) - (pb || 0);
      return a < b ? -1 : a > b ? 1 : 0;
    });

    var log = [];
    var rows = [];
    var activity = [];
    var indexNums = [];

    slotKeys.forEach(function (key) {
      slot = byPlay[key];
      if (!slot || !slot.call || slot.undone) return;
      if (superseded[slot.call.eventId]) return;
      var pi = slot.call.playIndex;
      var base = slot.call.payload || {};
      var patch = slot.sitPatch || {};
      var p = Object.assign({}, base, patch);
      if (patch.sitTxt === undefined && (patch.dn !== undefined || patch.db !== undefined || patch.hash !== undefined)) {
        var dnL = p.dn != null ? p.dn : base.dn;
        var dbL = p.db != null ? p.db : base.db;
        var hashL = p.hash != null ? p.hash : base.hash;
        var ord = ["", "1st", "2nd", "3rd", "4th"][+dnL] || String(dnL || "");
        p.sitTxt = ord + " & " + (dbL || "") + (hashL && hashL !== "ANY" ? " " + hashL : "");
      }
      var obs = slot.obs || null;
      var front = obs && obs.front != null && obs.front !== "" ? obs.front : null;
      var pressure = obs && obs.pressure != null && obs.pressure !== "" ? obs.pressure : null;
      var Out = global.OFFGRD_CALLER_OUTCOME;
      var fin = { result: null, gain: null, flag: null, flags: [], negated: false, success: null, concept: null, conceptOverride: null };
      var movedChains = false;
      if (slot.outcome && slot.outcome.payload) {
        movedChains = !!slot.outcome.payload.movedChains;
        if (Out && Out.finalizeOutcome) {
          fin = Out.finalizeOutcome(slot.outcome.payload, {
            dn: p.dn,
            db: p.db,
            estYards: p.estYards,
          });
        } else {
          fin.result = slot.outcome.payload.result != null && slot.outcome.payload.result !== ""
            ? slot.outcome.payload.result
            : null;
          var rawTags = Out && Out.outcomeFlags
            ? Out.outcomeFlags(slot.outcome.payload)
            : { flag: slot.outcome.payload.flag || null, flags: slot.outcome.payload.flags || [] };
          fin.flag = rawTags.flag;
          fin.flags = rawTags.flags;
          fin.conceptOverride = slot.outcome.payload.conceptOverride || null;
          if (fin.result === "hit") fin.success = 1;
          else if (fin.result === "miss") fin.success = 0;
        }
      }
      var sitInf =
        p.situationInferred === true || p.situationInferred === false
          ? !!p.situationInferred
          : false;
      var entrySide = eventSideOf(slot.call) || want || null;
      var entry = {
        id: slot.call.eventId,
        playIndex: pi,
        side: entrySide,
        sitTxt: p.sitTxt || "",
        play: p.play,
        result: fin.result,
        gain: fin.gain,
        flag: fin.flag,
        flags: Array.isArray(fin.flags) ? fin.flags : fin.flag ? [fin.flag] : [],
        negated: !!fin.negated,
        success: fin.success,
        concept: fin.concept,
        conceptOverride: fin.conceptOverride,
        movedChains: movedChains,
        dn: p.dn,
        db: p.db,
        estYards: p.estYards != null && !isNaN(+p.estYards) ? +p.estYards : null,
        hash: p.hash,
        zone: p.zone,
        situationInferred: sitInf,
        coverage: p.coverage,
        playType: p.playType,
        theirDirection: p.theirDirection != null && p.theirDirection !== "" ? p.theirDirection : null,
        opponent: p.opponent,
        date: p.date,
        signal: hasOwn(p, "signal") ? (p.signal == null || p.signal === "" ? null : p.signal) : p.signal,
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
      if (typeof pi === "number" && !isNaN(pi)) indexNums.push(pi);
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
      nextPlayIndex: indexNums.length ? Math.max.apply(null, indexNums) + 1 : 0,
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
    var S = global.OFFGRD_CALLER_SIDE;
    return Object.keys(map).map(function (k) {
      var e = map[k];
      return S && S.normalizeEventSide ? S.normalizeEventSide(e) || e : e;
    });
  }

  function loadStore(key) {
    try {
      var x = localStorage.getItem(key || STORE_KEY);
      if (!x) return null;
      var st = JSON.parse(x);
      var S = global.OFFGRD_CALLER_SIDE;
      if (st && Array.isArray(st.events) && S && S.normalizeEventSide) {
        st.events.forEach(function (e) {
          S.normalizeEventSide(e);
        });
      }
      return st;
    } catch (e) {
      return null;
    }
  }

  function saveStore(state, key) {
    try {
      localStorage.setItem(key || STORE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  /** Migrate v1 CALLER_LOG snapshot → events (once). */
  function migrateV1Log(log, session, device, actorId) {
    if (!log || !log.length) return [];
    var events = [];
    var seq = 0;
    var gameId = (session && session.gameId) || uuid();
    var migSide = session && session.side === "defense" ? "defense" : "offense";
    log.forEach(function (l, idx) {
      seq += 1;
      var callId = l.id && String(l.id).length >= 30 ? l.id : uuid();
      events.push({
        eventId: callId,
        gameId: gameId,
        playIndex: typeof l.playIndex === "number" ? l.playIndex : idx,
        type: "call",
        side: migSide,
        payload: {
          sitTxt: l.sitTxt,
          play: l.play,
          dn: l.dn,
          db: l.db,
          estYards: l.estYards,
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
          side: migSide,
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
    DCALLER_STORE_KEY: DCALLER_STORE_KEY,
    uuid: uuid,
    deviceId: deviceId,
    sortEvents: sortEvents,
    foldCallerEvents: foldCallerEvents,
    foldEachGame: foldEachGame,
    distinctGameIds: distinctGameIds,
    scopeEventsToGame: scopeEventsToGame,
    buildEvent: buildEvent,
    mergeEvents: mergeEvents,
    loadStore: loadStore,
    saveStore: saveStore,
    migrateV1Log: migrateV1Log,
    entryToGamesRow: entryToGamesRow,
    onCallFromLog: onCallFromLog,
    wouldDedupCall: wouldDedupCall,
  };
})(typeof window !== "undefined" ? window : globalThis);
