/**
 * Snap identity is the call, not the outcome.
 *   node scripts/smoke-caller-snap-advance.cjs
 *
 * Pre-fix (2026-08-28): D Caller undo-before-relog + undone slot stick
 * collapsed 20 ungraded calls onto playIndex 0 and the Friday export
 * folded to 3 snaps. This file is the permanent lock.
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
const root = path.join(__dirname, "..");
vm.runInNewContext(fs.readFileSync(path.join(root, "OFFGRD-caller-side.js"), "utf8"), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(root, "OFFGRD-caller-outcome.js"), "utf8"), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(root, "OFFGRD-caller-log.js"), "utf8"), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(root, "OFFGRD-caller-sync.js"), "utf8"), sandbox);

const C = sandbox.OFFGRD_CALLER;
const S = sandbox.OFFGRD_CALLER_SIDE;
const Sync = sandbox.OFFGRD_CALLER_SYNC_ENGINE;
if (!C || !S || !Sync) throw new Error("caller engines missing");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

function ev(partial) {
  return C.buildEvent(
    Object.assign(
      {
        gameId: "g1",
        playIndex: 0,
        type: "call",
        payload: { play: "Run", playType: "Run" },
        deviceId: "devA",
        clientTs: 1000,
        seq: 1,
        side: "defense",
      },
      partial
    )
  );
}

function simulateCalls(n, opts) {
  opts = opts || {};
  const events = [];
  let seq = 0;
  const gameId = "g1";
  const deviceId = "devA";
  const foldOpts = { side: "defense", gameId };
  function append(type, playIndex, payload, ts) {
    seq += 1;
    events.push(
      ev({
        type: type,
        playIndex: playIndex,
        payload: payload || { play: "Run", playType: "Run" },
        clientTs: ts != null ? ts : 1000 + seq * 4000,
        seq: seq,
        deviceId: deviceId,
        gameId: gameId,
      })
    );
  }
  for (let i = 0; i < n; i++) {
    const opened = C.openSnap(events, Object.assign({ deviceId: deviceId }, foldOpts));
    if (opts.outcomes && i > 0 && i % 2 === 0) {
      const last = events.filter((e) => e.type === "call").pop();
      append("outcome", last.playIndex, { result: "short" }, 1000 + seq * 4000 + 50);
    }
    append("call", opened.playIndex, { play: "Run " + i, playType: "Run" });
  }
  return events;
}

/* 1) 20 consecutive calls, zero outcomes → 20 distinct playIndex values.
 *    Pre-fix D Caller writer (undo ungraded + stuck undone slot) produced
 *    distinct=1, snapCount=0. Verified against current code 2026-08-28 before patch. */
const twenty = simulateCalls(20);
const twentyIdx = twenty.filter((e) => e.type === "call").map((e) => e.playIndex);
const twentyDistinct = new Set(twentyIdx);
const twentyFold = C.foldCallerEvents(twenty, { side: "defense", gameId: "g1" });
if (twentyDistinct.size !== 20) fail("smoke1 distinct playIndex " + twentyDistinct.size + " idxs=" + twentyIdx);
if (twentyFold.log.length !== 20) fail("smoke1 fold snaps " + twentyFold.log.length);
console.log("ok  1 snap advancement: 20 calls / 0 outcomes → 20 snaps");

/* 2) Outcome is not load-bearing — snap count always equals call count. */
const mixed = [];
let seq2 = 0;
function add(type, pi, payload, ts) {
  seq2 += 1;
  mixed.push(
    ev({
      type: type,
      playIndex: pi,
      payload: payload || { play: "Run", playType: "Run" },
      clientTs: ts,
      seq: seq2,
    })
  );
}
const pattern = [0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0]; /* 1 = also write outcome */
let callN = 0;
pattern.forEach(function (hasOut, i) {
  const pi = C.allocatePlayIndex(mixed, { side: "defense", gameId: "g1" });
  add("call", pi, { play: "P" + i }, 20000 + i * 5000);
  callN += 1;
  if (hasOut) add("outcome", pi, { result: i % 2 ? "short" : "solid" }, 20000 + i * 5000 + 80);
});
const mixedFold = C.foldCallerEvents(mixed, { side: "defense", gameId: "g1" });
if (mixedFold.log.length !== callN) {
  fail("smoke2 snap count " + mixedFold.log.length + " !== call count " + callN);
}
console.log("ok  2 outcome is not load-bearing: " + callN + " calls → " + mixedFold.log.length + " snaps");

/* 3) Undo removes exactly one event; next call opens a new snap. */
const undoEv = [];
undoEv.push(ev({ eventId: "u0", playIndex: 0, clientTs: 1, seq: 1, payload: { play: "A" } }));
undoEv.push(ev({ eventId: "u1", playIndex: 1, clientTs: 2, seq: 2, payload: { play: "B" } }));
const beforeUndo = C.foldCallerEvents(undoEv, { side: "defense", gameId: "g1" });
if (beforeUndo.log.length !== 2) fail("smoke3 setup");
undoEv.push(ev({ eventId: "uUndo", type: "undo", playIndex: 1, clientTs: 3, seq: 3, payload: {} }));
const afterUndo = C.foldCallerEvents(undoEv, { side: "defense", gameId: "g1" });
if (afterUndo.log.length !== 1 || afterUndo.log[0].play !== "A") {
  fail("smoke3 undo must drop exactly the last call: " + JSON.stringify(afterUndo.log));
}
const nextPi = C.allocatePlayIndex(undoEv, { side: "defense", gameId: "g1" });
if (nextPi === 1 && afterUndo.log.some((l) => l.playIndex === 1 && l.play === "B")) {
  fail("smoke3 next call would overwrite undone snap");
}
undoEv.push(ev({ eventId: "u2", playIndex: nextPi, clientTs: 4, seq: 4, payload: { play: "C" } }));
const afterNext = C.foldCallerEvents(undoEv, { side: "defense", gameId: "g1" });
if (afterNext.log.length !== 2) fail("smoke3 next call must open a new snap, got " + afterNext.log.length);
if (afterNext.log.filter((l) => l.play === "B").length) fail("smoke3 overwritten B survived");
if (!afterNext.log.some((l) => l.play === "C")) fail("smoke3 new call missing");
console.log("ok  3 undo drops one snap; next call opens a new snap (playIndex " + nextPi + ")");

/* 4) Session identity — local midnight does not re-key an in-progress game. */
const kickoff = new Date("2026-08-27T23:13:00-05:00");
const afterMidnight = new Date("2026-08-28T00:10:00-05:00");
const sess = {
  gameId: "211ccbe3-2566-4a65-9a3a-3cf6548ec385",
  week: S.liveWeekLabel(kickoff),
  game_date: S.liveDateISO(kickoff),
  opp: "Parkway North",
};
const liveEvents = [
  ev({
    eventId: "mid0",
    gameId: sess.gameId,
    playIndex: 0,
    clientTs: kickoff.getTime(),
    payload: { play: "Run", date: "2026-08-27" },
  }),
];
if (S.isStaleLiveIdentity(sess, afterMidnight, liveEvents)) {
  fail("smoke4 in-progress session flagged stale at midnight");
}
const restamp = S.restampStaleSession(sess, liveEvents, afterMidnight, "new-game-id");
if (restamp.restamped || restamp.session.gameId !== sess.gameId) {
  fail("smoke4 restamp re-keyed in-progress game to " + (restamp.session && restamp.session.gameId));
}
const evGameIds = new Set(restamp.events.map((e) => e.gameId));
if (evGameIds.size !== 1 || !evGameIds.has(sess.gameId)) {
  fail("smoke4 events carry a gameId differing from the session");
}
const emptyStale = S.isStaleLiveIdentity(
  { week: "Live 2026-08-27", game_date: "2026-08-27", gameId: "empty" },
  afterMidnight,
  []
);
if (!emptyStale) fail("smoke4 empty leftover session must still roll");
console.log("ok  4 session identity: midnight does not re-key an in-flight game");

/* 5) Friday 2026-08-27 Parkway North export — 39 calls must fold to 39 snaps, not 5. */
const fixturePath = path.join(__dirname, "fixtures", "offgrd-dcaller-parkway-north-2026-08-27.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
if (fixture.kind !== "offgrd_dcaller_export") fail("smoke5 fixture kind");
if (fixture.exportedAt !== "2026-08-28T20:07:29.898Z") fail("smoke5 unexpected export " + fixture.exportedAt);
const calls = (fixture.events || []).filter((e) => e.type === "call");
const outcomes = (fixture.events || []).filter((e) => e.type === "outcome");
const undos = (fixture.events || []).filter((e) => e.type === "undo");
if (calls.length !== 39 || outcomes.length !== 4 || undos.length !== 2) {
  fail("smoke5 census " + calls.length + "/" + outcomes.length + "/" + undos.length);
}
const fixtureGid = C.foldGameId(fixture.session, fixture.events);
const fixtureFold = C.foldCallerEvents(fixture.events, { side: "defense", gameId: fixtureGid });
if (fixtureFold.log.length === 3 || fixtureFold.log.length === 5) {
  fail("smoke5 collapsed to " + fixtureFold.log.length + " snaps — the Friday bug is back");
}
if (fixtureFold.log.length !== 39) {
  fail("smoke5 expected 39 snaps, got " + fixtureFold.log.length);
}
console.log("ok  5 Friday fixture: 45 events → 39 snaps (not 5)");

/* 6) Offense replay — 110 events in aa12f347 fold to 37 snaps.
 *    Passes on today's fold; pins O so a shared engine cannot regress it. */
const oPath = path.join(__dirname, "fixtures", "offgrd-ocaller-parkway-north-2026-08-27.json");
const oFix = JSON.parse(fs.readFileSync(oPath, "utf8"));
if (oFix.kind !== "offgrd_ocaller_cloud") fail("smoke6 fixture kind");
if (oFix.gameId !== "aa12f347-02a0-40af-b2e4-16f982c00f38") fail("smoke6 gameId");
const oCalls = (oFix.events || []).filter((e) => e.type === "call");
const oOut = (oFix.events || []).filter((e) => e.type === "outcome");
const oObs = (oFix.events || []).filter((e) => e.type === "observation");
const oCorr = (oFix.events || []).filter((e) => e.type === "correction");
if (oFix.events.length !== 110 || oCalls.length !== 37 || oOut.length !== 31 || oObs.length !== 41 || oCorr.length !== 1) {
  fail(
    "smoke6 census " +
      oFix.events.length +
      "/" +
      oCalls.length +
      "/" +
      oOut.length +
      "/" +
      oObs.length +
      "/" +
      oCorr.length
  );
}
const oFold = C.foldCallerEvents(oFix.events, { side: "offense", gameId: oFix.gameId });
if (oFold.log.length !== 37) fail("smoke6 expected 37 snaps, got " + oFold.log.length);
const oIdx = oCalls.map((e) => e.playIndex);
if (new Set(oIdx).size !== 37) fail("smoke6 call indexes collapsed to " + new Set(oIdx).size);
console.log("ok  6 offense fixture: 110 events → 37 snaps");

/* 7) Cross-caller parity — same sequence through both writers' openSnap + fold.
 *    This is the analogue of the ROLES-vs-SQL-rank smoke. */
function writeSequence(side, steps) {
  const events = [];
  let seq = 0;
  const gameId = "parity";
  const deviceId = "devP";
  const foldOpts = { side: side, gameId: gameId };
  function append(type, playIndex, payload, ts) {
    seq += 1;
    events.push(
      ev({
        type: type,
        playIndex: playIndex,
        payload: payload,
        clientTs: ts != null ? ts : 50000 + seq * 4000,
        seq: seq,
        deviceId: deviceId,
        gameId: gameId,
        side: side,
        eventId: side + "-" + seq,
      })
    );
  }
  steps.forEach(function (step, i) {
    if (step === "call") {
      const opened = C.openSnap(events, Object.assign({ deviceId: deviceId }, foldOpts));
      append("call", opened.playIndex, { play: "SNAP " + i, playType: "Run" });
    } else if (step === "outcome") {
      const last = events.filter((e) => e.type === "call").pop();
      if (!last) fail("smoke7 outcome with no call");
      append("outcome", last.playIndex, { result: "short" });
    } else if (step === "undo") {
      const last = events.filter((e) => e.type === "call").pop();
      if (!last) fail("smoke7 undo with no call");
      append("undo", last.playIndex, {});
    } else if (step === "correction") {
      const last = events.filter((e) => e.type === "call").pop();
      if (!last) fail("smoke7 correction with no call");
      append("correction", last.playIndex, { play: "SNAP " + i + " EDIT" });
    }
  });
  return events;
}
const paritySteps = [
  "call",
  "call",
  "outcome",
  "call",
  "call",
  "call",
  "undo",
  "call",
  "correction",
  "call",
  "outcome",
  "call",
];
const oSeq = writeSequence("offense", paritySteps);
const dSeq = writeSequence("defense", paritySteps);
const oPi = oSeq.filter((e) => e.type === "call").map((e) => e.playIndex);
const dPi = dSeq.filter((e) => e.type === "call").map((e) => e.playIndex);
if (oPi.join(",") !== dPi.join(",")) {
  fail("smoke7 playIndex sequences diverged O=" + oPi.join(",") + " D=" + dPi.join(","));
}
const oParityFold = C.foldCallerEvents(oSeq, { side: "offense", gameId: "parity" });
const dParityFold = C.foldCallerEvents(dSeq, { side: "defense", gameId: "parity" });
if (oParityFold.log.length !== dParityFold.log.length) {
  fail("smoke7 snap counts diverged O=" + oParityFold.log.length + " D=" + dParityFold.log.length);
}
const callCount = paritySteps.filter((s) => s === "call").length;
const undoCount = paritySteps.filter((s) => s === "undo").length;
if (oParityFold.log.length !== callCount - undoCount) {
  fail("smoke7 expected " + (callCount - undoCount) + " snaps, got " + oParityFold.log.length);
}
console.log(
  "ok  7 cross-caller parity: indexes [" +
    oPi.join(",") +
    "] snaps " +
    oParityFold.log.length
);

/* Honest sync header: unsynced local events never read as All synced. */
const pendingEvents = twenty.slice(0, 3);
const st = Sync.getSyncHeaderState("defense", pendingEvents, false, { gameId: "g1" });
if (st.label === "All synced") fail("smoke8 header lied: All synced with unsynced local events");
if (!st.pending && !st.held) fail("smoke8 header must show pending or held");
console.log("ok  8 sync header does not say All synced for a local queue");

console.log("smoke-caller-snap-advance: all ok");
