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
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "OFFGRD-caller-side.js"), "utf8"), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "OFFGRD-caller-outcome.js"), "utf8"), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "OFFGRD-caller-log.js"), "utf8"), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "OFFGRD-caller-sync.js"), "utf8"), sandbox);

const S = sandbox.OFFGRD_CALLER_SIDE;
const C = sandbox.OFFGRD_CALLER;
const Sync = sandbox.OFFGRD_CALLER_SYNC_ENGINE;
if (!S) throw new Error("OFFGRD_CALLER_SIDE missing");
if (!C) throw new Error("OFFGRD_CALLER missing");
if (!Sync || !Sync.eventToSyncRow) throw new Error("OFFGRD_CALLER_SYNC_ENGINE.eventToSyncRow missing");

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
  check("header names held rows", hdr.label === "2 synced · 1 held" && hdr.held === 1 && hdr.pending === 0);

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
    Sync.getSyncHeaderState("offense", many, false).label === "1,148 synced · 2 held"
  );
  Sync.clearSyncedSide("offense");

  check(
    "400 constraint is a row fault",
    Sync.isRowFault({ code: "23502", message: 'null value in column "side" violates not-null constraint' })
  );
  check("network error is not a row fault", !Sync.isRowFault({ message: "Failed to fetch" }));

  function topLevelEventIds() {
    const raw = JSON.parse(sandbox.localStorage.getItem(Sync.SYNCED_KEY) || "{}");
    return Object.keys(raw).filter(function (k) {
      return k !== "offense" && k !== "defense";
    });
  }

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
  const beforeN = topLevelEventIds().length;
  const first = await Sync.flush(flushOpts);
  const afterIds = topLevelEventIds();
  check("flush records every accepted id on the ledger", !!(first && first.ok) && afterIds.indexOf("n1") >= 0 && afterIds.indexOf("n2") >= 0 && afterIds.indexOf("n3") >= 0);
  check("ledger grows by the number of rows accepted", afterIds.length === beforeN + 3 && pushedRows === 3);
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

  if (fails) {
    console.error(fails + " failed");
    process.exit(1);
  }
  console.log("smoke-caller-side-integrity: all ok");
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
