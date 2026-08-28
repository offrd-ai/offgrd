/**
 * Caller side integrity — the contract, enforced.
 *   node scripts/smoke-caller-side-integrity.cjs
 *
 * O Caller records OUR OFFENSE against THEIR DEFENSE.
 * D Caller records OUR DEFENSE against THEIR OFFENSE.
 * offense → ours · defense → off · unstamped writes throw.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sandbox = {
  console,
  localStorage: {
    _m: {},
    getItem(k) {
      return this._m[k] || null;
    },
    setItem(k, v) {
      this._m[k] = String(v);
    },
    removeItem(k) {
      delete this._m[k];
    },
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "OFFGRD-caller-side.js"), "utf8"), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "OFFGRD-caller-outcome.js"), "utf8"), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "OFFGRD-caller-log.js"), "utf8"), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "OFFGRD-caller-sync.js"), "utf8"), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "OFFGRD-play-map.js"), "utf8"), sandbox);

const S = sandbox.OFFGRD_CALLER_SIDE;
const C = sandbox.OFFGRD_CALLER;
const Sync = sandbox.OFFGRD_CALLER_SYNC_ENGINE;
const M = sandbox.OFFGRD_PLAY_MAP;
if (!S) throw new Error("OFFGRD_CALLER_SIDE missing");
if (!C) throw new Error("OFFGRD_CALLER missing");
if (!Sync || !Sync.eventToSyncRow) throw new Error("OFFGRD_CALLER_SYNC_ENGINE.eventToSyncRow missing");
if (!M) throw new Error("OFFGRD_PLAY_MAP missing");

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

const PLAYBOOK = ["Slam West", "SOUTH BEND", "2x2 Smash", "Florida West", "KARATE COMBO"];

function throws(fn) {
  try {
    fn();
    return false;
  } catch (e) {
    return true;
  }
}

/* 1 + 2 — unstamped / bad value throws */
["call", "outcome", "observation", "correction"].forEach(function (type) {
  check(
    "unstamped " + type + " throws",
    throws(function () {
      C.buildEvent({ type: type, playIndex: 0, payload: { play: "SOUTH BEND" }, gameId: "g", deviceId: "d", seq: 1 });
    })
  );
});
["off", "", null, undefined].forEach(function (bad) {
  check(
    "bad side " + JSON.stringify(bad) + " throws",
    throws(function () {
      C.buildEvent({
        type: "call",
        playIndex: 0,
        payload: { play: "Pass" },
        side: bad,
        gameId: "g",
        deviceId: "d",
        seq: 1,
      });
    })
  );
});
check(
  "offense / defense pass",
  !!C.buildEvent({ type: "call", playIndex: 0, payload: { play: "SOUTH BEND" }, side: "offense", gameId: "g", deviceId: "d", seq: 1 }) &&
    !!C.buildEvent({ type: "call", playIndex: 0, payload: { play: "Pass" }, side: "defense", gameId: "g", deviceId: "d", seq: 2 })
);

/* 3 — no offensive play name on a defense event */
check(
  "defense + Slam West throws",
  throws(function () {
    S.assertEventAllowed({ play: "Slam West" }, "defense", PLAYBOOK);
  })
);
check(
  "defense + Pass is allowed",
  S.assertEventAllowed({ play: "Pass", playType: "Pass" }, "defense", PLAYBOOK) === true
);

/* 4 — no theirPlayType on offense; no playbook play on opponent-side row */
check(
  "offense + theirPlayType throws",
  throws(function () {
    S.assertEventAllowed({ play: "SOUTH BEND", theirPlayType: "Pass" }, "offense", PLAYBOOK);
  })
);
const dPromo = S.eventToRow(
  { play: "Pass", playType: "Pass", theirDirection: "L", front: "Nickel", coverage: "Cover 1", side: "defense" },
  "defense",
  PLAYBOOK
);
check("defense promotes to off", dPromo.ok && dPromo.dest === "off" && dPromo.row.side === "off");
check(
  "promoted off row has no playbook play",
  S.assertRowAllowed(dPromo.row, PLAYBOOK).ok && !PLAYBOOK.some(function (n) { return dPromo.row.play === n; })
);

/* 5 — log isolation */
const mixed = [];
for (let i = 0; i < 5; i++) {
  mixed.push({ play: PLAYBOOK[i % PLAYBOOK.length], side: "offense", playIndex: i });
  mixed.push({ play: i % 2 ? "Run" : "Pass", side: "defense", playIndex: i });
}
const oLog = S.filterLogBySide(mixed, "offense");
const dLog = S.filterLogBySide(mixed, "defense");
check("O log is exactly 5 offense rows", oLog.length === 5 && oLog.every(function (r) { return r.side === "offense"; }));
check("D log is exactly 5 defense rows", dLog.length === 5 && dLog.every(function (r) { return r.side === "defense"; }));
check("D log has zero offense plays", !dLog.some(function (r) { return PLAYBOOK.indexOf(r.play) >= 0; }));

/* 6 — promotion routing */
const oEntries = oLog.map(function (r) { return { play: r.play, side: "offense" }; });
const dEntries = dLog.map(function (r) { return { play: r.play, playType: r.play, side: "defense" }; });
const oProm = S.promoteEntries(oEntries, "offense", PLAYBOOK);
const dProm = S.promoteEntries(dEntries, "defense", PLAYBOOK);
check("5 offense events promote to ours", oProm.dest === "ours" && oProm.rows.length === 5 && oProm.rows.every(function (r) { return r.side === "ours"; }));
check("5 defense events promote to off", dProm.dest === "off" && dProm.rows.length === 5 && dProm.rows.every(function (r) { return r.side === "off"; }));
check(
  "zero cross-contamination",
  !oProm.rows.some(function (r) { return r.side === "off"; }) &&
    !dProm.rows.some(function (r) { return r.side === "ours"; })
);

/* 7 — reconciliation */
const allPromoted = oProm.rows.concat(dProm.rows);
const seen = Object.create(null);
let both = 0;
allPromoted.forEach(function (r, i) {
  const k = r.side + ":" + r.play + ":" + i;
  if (seen[k]) both += 1;
  seen[k] = 1;
});
check(
  "offense + defense === total, no overlap, no orphan",
  oProm.rows.length + dProm.rows.length === 10 &&
    allPromoted.length === 10 &&
    both === 0
);
check("mapper offense→ours", S.eventSideToSeasonSide("offense") === "ours");
check("mapper defense→off", S.eventSideToSeasonSide("defense") === "off");
check("mapper never returns def", S.eventSideToSeasonSide("defense") !== "def");

/* Fresh Live session stamps today — never a recycled July label. */
const boothNow = new Date("2026-08-21T17:00:00Z");
const todayIso = S.liveDateISO(boothNow);
check("liveDateISO is the calendar day", todayIso === "2026-08-21");
const stamped = S.stampFreshLiveSession(
  { opp: "Parkway North", week: "Live 2026-07-24", game_date: "2026-07-24", gameId: "july" },
  boothNow,
  "aug-id"
);
check("fresh session week is today, not inherited", stamped.week === "Live 2026-08-21");
check("fresh session date is today, not inherited", stamped.game_date === "2026-08-21");
check("stale July Live identity", S.isStaleLiveIdentity({ week: "Live 2026-07-24", game_date: "2026-07-24" }, boothNow));
check("today Live identity is current", !S.isStaleLiveIdentity({ week: "Live 2026-08-21", game_date: "2026-08-21" }, boothNow));
const midnightNow = new Date("2026-08-28T05:10:00Z");
const inProgress = { week: "Live 2026-08-27", game_date: "2026-08-27", gameId: "g-live" };
const inFlightEv = [{ eventId: "e1", gameId: "g-live", type: "call", playIndex: 0, clientTs: 1 }];
check(
  "in-progress Live session is immune at local midnight",
  !S.isStaleLiveIdentity(inProgress, midnightNow, inFlightEv)
);
const stampedImmune = S.restampStaleSession(inProgress, inFlightEv, midnightNow, "new-id");
check("restamp does not re-key an in-flight session", stampedImmune.restamped === false && stampedImmune.immune === true && stampedImmune.session.gameId === "g-live");
check(
  "empty leftover Live session still rolls",
  S.isStaleLiveIdentity({ week: "Live 2026-08-27", game_date: "2026-08-27" }, midnightNow, [])
);
check(
  "flushed in-progress session is immune at midnight",
  !S.isStaleLiveIdentity(
    { week: "Live 2026-08-27", game_date: "2026-08-27", gameId: "g-live", inProgress: true },
    midnightNow,
    []
  )
);
check(
  "active caller_games row from July is recycled",
  S.callerGameIsRecycled(
    { week: "Live 2026-07-24", game_date: "2026-07-24" },
    { week: "Live 2026-08-21", game_date: "2026-08-21" }
  )
);

const tombs = { "parkway north|live 2026-07-24|ours": 1 };
function isTomb(opp, week, side) {
  return !!tombs[String(opp).toLowerCase() + "|" + String(week).toLowerCase() + "|" + side];
}
const refused = S.refuseTombstonedKey(
  isTomb,
  { opp: "Parkway North", week: "Live 2026-07-24" },
  "ours",
  function (o, w, s) {
    return String(o).trim().toLowerCase() + "|" + String(w).trim().toLowerCase() + "|" + s;
  }
);
check(
  "tombstoned promote is a loud refusal",
  refused.ok === false &&
    refused.reason === "tombstoned" &&
    /previously deleted/.test(refused.message) &&
    !!refused.key
);
const allowed = S.refuseTombstonedKey(
  isTomb,
  { opp: "Parkway North", week: "Live 2026-08-21" },
  "ours",
  function (o, w, s) {
    return String(o).trim().toLowerCase() + "|" + String(w).trim().toLowerCase() + "|" + s;
  }
);
check("fresh key is not tombstoned", allowed.ok === true);
check(
  "bare promote opts do not throw",
  !throws(function () {
    S.normalizePromoteOpts();
  }) && S.normalizePromoteOpts().side === "offense" && Array.isArray(S.normalizePromoteOpts().log)
);
check("normalizePromoteOpts() log is []", S.normalizePromoteOpts().log.length === 0);

/* fold must not merge two gameIds — 5 in, 5 out, or a loud failure.
 * Same playIndex on both games would collide if fold merged. */
function evGame(id, gameId, playIndex, play, side, ts) {
  return C.buildEvent({
    eventId: id,
    type: "call",
    playIndex: playIndex,
    payload: { play: play },
    side: side,
    gameId: gameId,
    deviceId: "d",
    seq: playIndex + 1,
    clientTs: ts,
  });
}
const GAME_A = "532950a1-north";
const GAME_B = "b16fbedc-live";
const mixedGames = [
  evGame("a0", GAME_A, 0, "Slam West", "offense", 1000),
  evGame("a1", GAME_A, 1, "SOUTH BEND", "offense", 1100),
  evGame("b0", GAME_B, 0, "Pass", "defense", 1200),
  evGame("a2", GAME_A, 2, "2x2 Smash", "offense", 1300),
  evGame("b1", GAME_B, 1, "Run", "defense", 1400),
];
check(
  "mixed gameIds without scope throw",
  throws(function () {
    C.foldCallerEvents(mixedGames);
  })
);
const foldA = C.foldCallerEvents(mixedGames, { gameId: GAME_A, side: "offense" });
const foldB = C.foldCallerEvents(mixedGames, { gameId: GAME_B, side: "defense" });
check("game A fold is 3 snaps", foldA.log.length === 3 && foldA.log.every(function (l) { return l.play !== "Pass" && l.play !== "Run"; }));
check("game B fold is 2 snaps", foldB.log.length === 2 && foldB.log.every(function (l) { return l.play === "Pass" || l.play === "Run"; }));
check("5 in, 5 out", foldA.log.length + foldB.log.length === 5);
const accounted = Object.create(null);
foldA.log.concat(foldB.log).forEach(function (l) {
  accounted[l.eventId || l.id] = "log";
});
Object.keys(foldA.supersededIds || {}).concat(Object.keys(foldB.supersededIds || {})).forEach(function (id) {
  if ((foldA.supersededIds && foldA.supersededIds[id]) || (foldB.supersededIds && foldB.supersededIds[id])) {
    accounted[id] = "superseded";
  }
});
(foldA.collisions || []).concat(foldB.collisions || []).forEach(function (c) {
  if (c.keep) accounted[c.keep.eventId] = accounted[c.keep.eventId] || "collision-keep";
  if (c.drop) accounted[c.drop.eventId] = "collision-drop";
});
check(
  "nothing dropped without collisions or supersededIds",
  mixedGames.every(function (e) { return !!accounted[e.eventId]; }) &&
    !foldA.log.some(function (l) { return l.eventId === "b0" || l.eventId === "b1"; }) &&
    !foldB.log.some(function (l) { return l.eventId === "a0" || l.eventId === "a1" || l.eventId === "a2"; })
);
const parts = C.foldEachGame(mixedGames);
check(
  "partition keeps both games independently",
  parts.byGameId[GAME_A].log.length === 3 &&
    parts.byGameId[GAME_B].log.length === 2 &&
    Object.keys(parts.supersededIds || {}).filter(function (id) { return parts.supersededIds[id]; }).length === 0
);

/* A — theirDirection is defense-only */
check(
  "offense + theirDirection throws",
  throws(function () {
    S.assertEventAllowed({ play: "SOUTH BEND", theirDirection: "L" }, "offense", PLAYBOOK);
  })
);
check(
  "ours row with theirDirection is refused",
  S.assertRowAllowed({ side: "ours", play: "SOUTH BEND", theirDirection: "L" }, PLAYBOOK).reason === "ours-has-theirDirection"
);

const FILM_BARE = ["Pass", "Run", "Run L", "Run M", "Run R", "2-pt", "Extra Point"];
const LIVE_ILLEGAL_OURS = ["Pass", "Run", "Run L", "Run M", "Run R"];
FILM_BARE.forEach(function (play) {
  check(
    "ours scout_import " + play + " is legal",
    S.assertRowAllowed({ side: "ours", play: play, source: "scout_import" }, PLAYBOOK).ok === true
  );
  check(
    "ours (none) " + play + " is legal",
    S.assertRowAllowed({ side: "ours", play: play, source: "none" }, PLAYBOOK).ok === true &&
      S.assertRowAllowed({ side: "ours", play: play }, PLAYBOOK).ok === true
  );
});
LIVE_ILLEGAL_OURS.forEach(function (play) {
  const live = S.assertRowAllowed({ side: "ours", play: play, source: "live_call" }, PLAYBOOK);
  check(
    "ours live_call " + play + " is ours-live-bare-playtype",
    live.ok === false && live.reason === "ours-live-bare-playtype"
  );
});
["2-pt", "Extra Point"].forEach(function (play) {
  check(
    "ours live_call " + play + " is legal",
    S.assertRowAllowed({ side: "ours", play: play, source: "live_call" }, PLAYBOOK).ok === true
  );
});
check(
  "ours live_call SOUTH BEND is still legal",
  S.assertRowAllowed({ side: "ours", play: "SOUTH BEND", source: "live_call" }, PLAYBOOK).ok === true
);

const xpPromo = S.eventToRow({ play: "Extra Point", side: "offense" }, "offense", PLAYBOOK);
check(
  "live Extra Point promotes to ours",
  !!(xpPromo && xpPromo.ok && xpPromo.dest === "ours" && xpPromo.row.side === "ours" &&
    xpPromo.row.play === "Extra Point" && xpPromo.row.source === "live_call")
);
const xpInv = M.inventoryCalls([xpPromo.row], [], PLAYBOOK);
const xpRoll = M.rollup([xpPromo.row], { playbook: PLAYBOOK, maps: [], axis: "family" });
check(
  "live Extra Point lands in the set-aside count",
  xpInv.junkSnaps === 1 && xpRoll.junkN === 1 && xpRoll.total === 0
);
check(
  "live Run M is refused with ours-live-bare-playtype",
  throws(function () {
    S.eventToRow({ play: "Run M", side: "offense" }, "offense", PLAYBOOK);
  }) && S.assertRowAllowed({ side: "ours", play: "Run M", source: "live_call" }, PLAYBOOK).reason === "ours-live-bare-playtype"
);

/* B — assertRowAllowed / stampRow is the write gate, not a smoke-only helper */
check(
  "stampRow refuses offense+theirDirection",
  throws(function () {
    S.eventToRow({ play: "SOUTH BEND", theirDirection: "L", side: "offense" }, "offense", PLAYBOOK);
  })
);

const purgePlan = S.planCallerEventsPurge(
  [{ id: GAME_A }, { id: GAME_B }],
  mixedGames
);
check(
  "caller-events purge plans archive + delete",
  purgePlan.archiveGameIds.length === 2 &&
    purgePlan.deleteEventCount === 5 &&
    purgePlan.localKeys.indexOf("offgrd_caller_events_v2") >= 0
);

/* 8 — sync row reads the same field buildEvent writes (top-level side) */
const builtO = C.buildEvent({
  type: "call",
  playIndex: 0,
  payload: { play: "SOUTH BEND" },
  side: "offense",
  gameId: "g",
  deviceId: "d",
  seq: 1,
});
const builtD = C.buildEvent({
  type: "call",
  playIndex: 0,
  payload: { play: "Pass" },
  side: "defense",
  gameId: "g",
  deviceId: "d",
  seq: 2,
});
const syncO = Sync.eventToSyncRow(builtO, "team-1");
const syncD = Sync.eventToSyncRow(builtD, "team-1");
check(
  "sync row side matches buildEvent (offense)",
  !!(syncO && syncO.side === "offense" && syncO.side === builtO.side)
);
check(
  "sync row side matches buildEvent (defense)",
  !!(syncD && syncD.side === "defense" && syncD.side === builtD.side)
);
check("buildEvent does not bury side on payload", builtO.payload.side == null && builtD.payload.side == null);
check(
  "payload.side alone does not write an event",
  throws(function () {
    C.buildEvent({
      type: "call",
      playIndex: 0,
      payload: { play: "SOUTH BEND", side: "offense" },
      gameId: "g",
      deviceId: "d",
      seq: 3,
    });
  })
);
check("eventSide reads top-level only", S.eventSide({ side: "offense", payload: { side: "defense" } }) === "offense");
check("eventSide ignores buried payload.side", S.eventSide({ payload: { side: "defense" } }) === null);
const lifted = S.normalizeEventSide({ eventId: "legacy", payload: { side: "defense" } });
check("legacy payload.side lifts to top-level", lifted.side === "defense");
const liftedRow = Sync.eventToSyncRow(lifted, "team-1");
check("legacy lift reaches the sync row", !!(liftedRow && liftedRow.side === "defense"));
check(
  "unsided event is not a sync row",
  Sync.eventToSyncRow({ eventId: "orphan", payload: { play: "Pass" } }, "team-1") === null
);

function rejectBad(batch) {
  if ((batch || []).some(function (e) { return e && e.eventId === "bad-row"; })) {
    const err = new Error('null value in column "side" violates not-null constraint');
    err.code = "23502";
    err.status = 400;
    return Promise.reject(err);
  }
  return Promise.resolve((batch || []).map(function (e) { return { event_id: e.eventId }; }));
}

function evAt(id, seq) {
  return C.buildEvent({
    type: "call",
    playIndex: 0,
    payload: { play: "SOUTH BEND" },
    side: "offense",
    gameId: "g",
    deviceId: "d",
    seq: seq,
    eventId: id,
  });
}

(async function () {
  const batch = [evAt("ok-1", 10), evAt("bad-row", 11), evAt("ok-2", 12)];
  const isolated = await Sync.appendIsolated(batch, rejectBad, { chunkSize: 2 });
  check(
    "isolated upsert syncs every valid row",
    isolated.synced.indexOf("ok-1") >= 0 && isolated.synced.indexOf("ok-2") >= 0 && isolated.synced.length === 2
  );
  check(
    "isolated upsert quarantines only the bad row",
    isolated.held.length === 1 && isolated.held[0].eventId === "bad-row" && isolated.unresolved.length === 0
  );

  Sync.clearSyncedSide("offense");
  Sync.markSynced("offense", isolated.synced);
  isolated.held.forEach(function (h) {
    Sync.markHeld("offense", h.eventId, h.reason);
  });
  const hdr = Sync.getSyncHeaderState("offense", batch, false);
  check(
    "header names held rows",
    hdr.held === 1 &&
      hdr.label !== "All synced" &&
      /waiting|held|pending/i.test(hdr.label)
  );

  const many = [];
  for (let i = 0; i < 1148; i++) many.push({ eventId: "s" + i, side: "offense", type: "call", payload: { play: "SOUTH BEND" } });
  many.push({ eventId: "h1", side: "offense", type: "call", payload: { play: "SOUTH BEND" } });
  many.push({ eventId: "h2", side: "offense", type: "call", payload: { play: "SOUTH BEND" } });
  Sync.clearSyncedSide("offense");
  Sync.markSynced(
    "offense",
    many.slice(0, 1148).map(function (e) {
      return e.eventId;
    })
  );
  Sync.markHeld("offense", "h1", "400");
  Sync.markHeld("offense", "h2", "400");
  check(
    "header uses synced · held copy",
    (function () {
      const h = Sync.getSyncHeaderState("offense", many, false);
      return h.held === 2 && h.label !== "All synced" && /waiting|held|pending/i.test(h.label);
    })()
  );
  Sync.clearSyncedSide("offense");

  check(
    "400 constraint is a row fault",
    Sync.isRowFault({ code: "23502", message: 'null value in column "side" violates not-null constraint' })
  );
  check("network error is not a row fault", !Sync.isRowFault({ message: "Failed to fetch" }));

  function ledgerRaw() {
    return JSON.parse(sandbox.localStorage.getItem(Sync.SYNCED_KEY) || "{}");
  }
  function topLevelEventIds() {
    return Object.keys(ledgerRaw());
  }
  function noSideKeys(raw) {
    raw = raw || ledgerRaw();
    return Object.keys(raw).indexOf("offense") < 0 && Object.keys(raw).indexOf("defense") < 0;
  }

  sandbox.localStorage.removeItem("offgrd_caller_events_v2");
  sandbox.localStorage.removeItem("offgrd_dcaller_events_v2");
  sandbox.localStorage.setItem(Sync.SYNCED_KEY, JSON.stringify({ "legacy-a": 1, "legacy-b": 1 }));
  const fixture = [evAt("n1", 21), evAt("n2", 22), evAt("n3", 23)];
  let pushedRows = 0;
  sandbox.OFFGRD_CALLER_BRIDGE = {
    getTeamId: function () {
      return "team-1";
    },
    canSync: function () {
      return true;
    },
    getActorId: function () {
      return "actor";
    },
    cloud: {
      ensureCallerGame: async function () {
        return { id: "g" };
      },
      listCallerEvents: async function () {
        return [];
      },
      appendCallerEvents: async function (_tid, chunk) {
        pushedRows += (chunk || []).length;
        return (chunk || []).map(function (e) {
          return { event_id: e.eventId };
        });
      },
    },
  };
  const flushOpts = {
    side: "offense",
    getState: function () {
      return { session: { gameId: "g" }, events: fixture };
    },
  };
  const first = await Sync.flush(flushOpts);
  const afterIds = topLevelEventIds();
  check("flush records every accepted id on the ledger", !!(first && first.ok) && afterIds.indexOf("n1") >= 0 && afterIds.indexOf("n2") >= 0 && afterIds.indexOf("n3") >= 0);
  check(
    "ledger grows by the number of rows accepted",
    afterIds.length === 3 &&
      afterIds.indexOf("legacy-a") < 0 &&
      afterIds.indexOf("n1") >= 0 &&
      pushedRows === 3
  );
  check("no top-level key is a side name", noSideKeys());
  const pushedAfterFirst = pushedRows;
  const second = await Sync.flush(flushOpts);
  check(
    "second sync of the same batch is a no-op",
    !!(second && second.ok) && pushedRows === pushedAfterFirst && Sync.pendingCount("offense", fixture) === 0
  );

  sandbox.localStorage.setItem(Sync.SYNCED_KEY, "{}");
  pushedRows = 0;
  sandbox.OFFGRD_CALLER_BRIDGE.cloud.listCallerEvents = async function () {
    return fixture;
  };
  await Sync.flush(flushOpts);
  check(
    "already-on-cloud rows advance the ledger without a re-push",
    topLevelEventIds().length === 3 && pushedRows === 0
  );
  check("cloud stamp leaves no side-name keys", noSideKeys());

  sandbox.localStorage.setItem(
    Sync.SYNCED_KEY,
    JSON.stringify({ leftover: 1, offense: { "bucket-o": 1 }, defense: { "bucket-d": 1 } })
  );
  Sync.isSynced("offense", "leftover");
  const lifted = ledgerRaw();
  check(
    "nested side buckets migrate to top-level ids",
    !!(lifted.leftover && lifted["bucket-o"] && lifted["bucket-d"]) && noSideKeys(lifted)
  );

  function evDef(id, seq) {
    return C.buildEvent({
      type: "call",
      playIndex: 0,
      payload: { play: "Pass" },
      side: "defense",
      gameId: "g-d",
      deviceId: "d",
      seq: seq,
      eventId: id,
    });
  }
  const dStore = [evDef("d1", 31), evDef("d2", 32), evDef("d3", 33)];
  sandbox.localStorage.setItem("offgrd_dcaller_events_v2", JSON.stringify({ events: dStore }));
  sandbox.localStorage.setItem("offgrd_caller_events_v2", JSON.stringify({ events: [] }));
  sandbox.localStorage.setItem(Sync.SYNCED_KEY, "{}");
  pushedRows = 0;
  const listedGames = [];
  sandbox.OFFGRD_CALLER_BRIDGE.cloud.ensureCallerGame = async function () {
    return { id: "g-o" };
  };
  sandbox.OFFGRD_CALLER_BRIDGE.cloud.listCallerEvents = async function (_tid, gid) {
    listedGames.push(gid);
    if (gid === "g-d") return dStore;
    return [];
  };
  await Sync.flush({
    side: "offense",
    getState: function () {
      return { session: { gameId: "g-o" }, events: [] };
    },
  });
  check("offense flush lists the D-store game", listedGames.indexOf("g-d") >= 0);
  check(
    "offense flush stamps D-store ids already in cloud",
    Sync.listSyncedIds().indexOf("d1") >= 0 &&
      Sync.listSyncedIds().indexOf("d2") >= 0 &&
      Sync.listSyncedIds().indexOf("d3") >= 0 &&
      pushedRows === 0
  );
  check("D-store stamp leaves no side-name keys", noSideKeys());

  const shared = evDef("same-id", 51);
  sandbox.localStorage.setItem(
    "offgrd_caller_events_v2",
    JSON.stringify({ events: [shared, evAt("only-o", 52)] })
  );
  sandbox.localStorage.setItem(
    "offgrd_dcaller_events_v2",
    JSON.stringify({ events: [shared, evDef("only-d", 53)] })
  );
  const union = Sync.allLocalCallerEvents();
  const unionIds = union.map(function (e) {
    return e.eventId;
  });
  check(
    "union counts a mirrored eventId once",
    union.length === 3 &&
      unionIds.filter(function (id) { return id === "same-id"; }).length === 1 &&
      unionIds.indexOf("only-o") >= 0 &&
      unionIds.indexOf("only-d") >= 0
  );

  const remoteSideless = { eventId: "sideless-remote", type: "call", payload: { play: "Pass" } };
  const localOnlySideless = { eventId: "sideless-straggler", type: "call", payload: { play: "Pass" } };
  const remoteWithSide = {
    eventId: "sideless-remote",
    gameId: "g-cloud",
    type: "call",
    side: "offense",
    payload: { play: "Pass" },
  };
  sandbox.localStorage.setItem(
    "offgrd_caller_events_v2",
    JSON.stringify({ events: [remoteSideless, localOnlySideless] })
  );
  sandbox.localStorage.setItem("offgrd_dcaller_events_v2", JSON.stringify({ events: [] }));
  sandbox.localStorage.setItem(Sync.SYNCED_KEY, JSON.stringify({ "orphan-ledger": 1 }));
  sandbox.OFFGRD_CALLER_BRIDGE.cloud.ensureCallerGame = async function () {
    return { id: "g-o" };
  };
  sandbox.OFFGRD_CALLER_BRIDGE.cloud.listCallerEvents = async function () {
    return [];
  };
  sandbox.OFFGRD_CALLER_BRIDGE.cloud.listCallerEventsByIds = async function (_tid, ids) {
    if ((ids || []).indexOf("sideless-remote") >= 0) return [remoteWithSide];
    return [];
  };
  await Sync.flush({
    side: "offense",
    getState: function () {
      return { session: { gameId: "g-o" }, events: [] };
    },
  });
  const liftedStore = JSON.parse(sandbox.localStorage.getItem("offgrd_caller_events_v2") || "{}");
  const liftedEv = (liftedStore.events || []).filter(function (e) {
    return e.eventId === "sideless-remote";
  })[0];
  check(
    "sideless confirmed remote is stamped from remote side",
    Sync.isSynced("offense", "sideless-remote") &&
      !Sync.isHeld("offense", "sideless-remote") &&
      liftedEv &&
      liftedEv.side === "offense"
  );
  check("sideless local-only straggler is held", Sync.isHeld("offense", "sideless-straggler") && !Sync.isSynced("offense", "sideless-straggler"));
  check("ledger orphans with no local event are pruned", topLevelEventIds().indexOf("orphan-ledger") < 0);

  sandbox.localStorage.setItem(Sync.SYNCED_KEY, "{}");
  sandbox.localStorage.removeItem("offgrd_caller_events_v2");
  sandbox.localStorage.removeItem("offgrd_dcaller_events_v2");
  pushedRows = 0;
  sandbox.OFFGRD_CALLER_BRIDGE.cloud.ensureCallerGame = async function () {
    return { id: "g-d" };
  };
  sandbox.OFFGRD_CALLER_BRIDGE.cloud.listCallerEvents = async function () {
    return [];
  };
  const dFlush = [evDef("dx", 41), evDef("dy", 42), evDef("dz", 43)];
  const dFirst = await Sync.flush({
    side: "defense",
    getState: function () {
      return { session: { gameId: "g-d" }, events: dFlush };
    },
  });
  check(
    "defense flush advances the ledger",
    !!(dFirst && dFirst.ok) &&
      pushedRows === 3 &&
      Sync.listSyncedIds().indexOf("dx") >= 0 &&
      Sync.listSyncedIds().indexOf("dy") >= 0 &&
      Sync.listSyncedIds().indexOf("dz") >= 0
  );
  const pushedD = pushedRows;
  await Sync.flush({
    side: "defense",
    getState: function () {
      return { session: { gameId: "g-d" }, events: dFlush };
    },
  });
  check("second defense flush is a no-op", pushedRows === pushedD && Sync.pendingCount("defense", dFlush) === 0);
  check("defense ledger has no side-name keys", noSideKeys());

  if (fails) {
    console.error(fails + " failed");
    process.exit(1);
  }
  console.log("smoke-caller-side-integrity: all ok");
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
