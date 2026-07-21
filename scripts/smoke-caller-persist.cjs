/**
 * Slice 1 smoke — live call row shape + bestCallsFor loop close.
 *   node scripts/smoke-caller-persist.cjs
 */
"use strict";

function distBucket(n) {
  if (n == null || n === "") return null;
  n = +n;
  if (!isFinite(n)) return null;
  if (n <= 3) return "1-3";
  if (n <= 6) return "4-6";
  if (n <= 9) return "7-9";
  return "10+";
}
/** Mirror of OFFGRD.html CALLER_DB_BUCKETS / dbToNum — never invent 10+. */
const CALLER_DB_BUCKETS = ["1-3", "4-6", "7-9", "10+"];
function dbToNum(db) {
  if (db === "1-3") return 2;
  if (db === "4-6") return 5;
  if (db === "7-9") return 8;
  if (db === "10+") return 12;
  return null;
}
function uniq(a) {
  return [...new Set(a)];
}

/** Mirror of callerEntryToRow (must stay in sync with OFFGRD.html). */
function callerEntryToRow(l) {
  const down = +l.dn || 1;
  const distance = dbToNum(l.db);
  const success = l.result === "hit" ? 1 : l.result === "miss" ? 0 : null;
  const front = l.front != null && l.front !== "" ? l.front : null;
  const pressure = l.pressure != null && l.pressure !== "" ? l.pressure : null;
  return {
    date: l.date || "2026-07-24",
    opponent: l.opponent || "Parkway North",
    down,
    distance,
    fieldZone: l.zone && l.zone !== "ANY" ? l.zone : "",
    hash: l.hash && l.hash !== "ANY" ? l.hash : "",
    coverage: l.coverage || "",
    front,
    pressure,
    frontCarried: !!(front && l.frontCarried),
    pressureCarried: !!(pressure && l.pressureCarried),
    formation: null,
    motion: null,
    personnel: null,
    direction: null,
    blitz: null,
    play: l.play,
    playType: l.playType || "Run",
    gain: null,
    success,
    source: "live_call",
    signal: l.signal != null ? l.signal : null,
    callId: l.id || null,
    gameWeek: l.gameWeek || null,
  };
}

const SCOUT_OURS_KEYS = [
  "date",
  "opponent",
  "down",
  "distance",
  "fieldZone",
  "coverage",
  "front",
  "play",
  "playType",
  "gain",
  "success",
].sort();

function bestCallsFor(ours, target, dn, db, kind) {
  let plays = uniq(ours.map((r) => r.play));
  if (kind) plays = plays.filter((pl) => {
    let run = 0, pass = 0;
    ours.forEach((r) => {
      if (r.play === pl) {
        if (/run/i.test(r.playType)) run++;
        else pass++;
      }
    });
    return (run > pass ? "Run" : "Pass") === kind;
  });
  const res = [];
  const mD = (r) => dn === "ANY" || r.down === +dn;
  const mB = (r) => db === "ANY" || distBucket(r.distance) === db;
  plays.forEach((pl) => {
    if (!pl) return;
    let pool = ours.filter(
      (r) => r.play === pl && r.coverage === target && mD(r) && mB(r) && r.success != null
    );
    if (pool.length < 2)
      pool = ours.filter((r) => r.play === pl && r.coverage === target && r.success != null);
    if (pool.length >= 2) {
      const sr = pool.reduce((a, b) => a + b.success, 0) / pool.length;
      res.push({ play: pl, sr, n: pool.length });
    }
  });
  res.sort((a, b) => b.sr - a.sr || b.n - a.n);
  return res;
}

// --- shape check ---
const entry = {
  id: "c_test1",
  dn: 1,
  db: "10+",
  hash: "M",
  zone: "OWN",
  coverage: "Cover 3",
  play: "KARATE COMBO",
  playType: "Run",
  result: "hit",
  opponent: "Parkway North",
  date: "2026-07-24",
  signal: 12,
};
const liveRow = callerEntryToRow(entry);
const liveKeys = Object.keys(liveRow)
  .filter((k) => SCOUT_OURS_KEYS.includes(k))
  .sort();
if (liveKeys.join(",") !== SCOUT_OURS_KEYS.join(",")) {
  throw new Error("Row shape mismatch.\n expected " + SCOUT_OURS_KEYS + "\n got " + liveKeys);
}
if (liveRow.source !== "live_call") throw new Error("source must be live_call");
console.log("OK row shape matches scout ours (+ source/signal/callId)");

// --- every caller UI db maps to a real bucket; junk → null (not silent 10+) ---
CALLER_DB_BUCKETS.forEach((db) => {
  const n = dbToNum(db);
  if (n == null) throw new Error("caller UI db must map: " + db);
  if (distBucket(n) !== db) {
    throw new Error("caller UI db round-trip failed: " + db + " → " + n + " → " + distBucket(n));
  }
});
["short", "long", "", undefined, null, "ANY", "11+", "3"].forEach((bad) => {
  if (dbToNum(bad) != null) throw new Error("dbToNum must be null for " + JSON.stringify(bad));
});
const unbucketed = callerEntryToRow(Object.assign({}, entry, { db: "short", id: "c_bad" }));
if (unbucketed.distance != null) throw new Error("unrecognised db must leave distance null");
const mB = (r, db) => db === "ANY" || (r.distance != null && distBucket(r.distance) === db);
if (mB(unbucketed, "10+") || mB(unbucketed, "1-3")) {
  throw new Error("null distance must be excluded from distance-specific bestCallsFor match");
}
console.log("OK caller UI db buckets round-trip; unrecognised → distance null (excluded from dist match)");

// --- loop close: suggestion moves without film import ---
const scout = [
  {
    date: "2025-09-06",
    opponent: "Parkway North",
    down: 1,
    distance: 10,
    fieldZone: "",
    coverage: "Cover 3",
    front: "",
    play: "KARATE COMBO",
    playType: "Run",
    gain: 6,
    success: 1,
    source: "scout_import",
  },
  {
    date: "2025-09-13",
    opponent: "Parkway North",
    down: 1,
    distance: 10,
    fieldZone: "",
    coverage: "Cover 3",
    front: "",
    play: "KARATE COMBO",
    playType: "Run",
    gain: 2,
    success: 0,
    source: "scout_import",
  },
];
const before = bestCallsFor(scout, "Cover 3", 1, "10+", "Run");
const b = before.find((x) => x.play === "KARATE COMBO");
if (!b || b.n !== 2 || Math.round(b.sr * 100) !== 50) {
  throw new Error("before expected 50% on 2, got " + JSON.stringify(b));
}
const afterPool = scout.concat([liveRow]);
const after = bestCallsFor(afterPool, "Cover 3", 1, "10+", "Run");
const a = after.find((x) => x.play === "KARATE COMBO");
if (!a || a.n !== 3 || Math.round(a.sr * 100) !== 67) {
  throw new Error("after expected ~67% on 3, got " + JSON.stringify(a));
}
console.log(
  "OK loop closed: KARATE COMBO Cover 3 1st&10+  " +
    Math.round(b.sr * 100) +
    "% on " +
    b.n +
    "  →  " +
    Math.round(a.sr * 100) +
    "% on " +
    a.n +
    "  (live hit, no film import)"
);

// ungraded must not move the math
const pending = callerEntryToRow(Object.assign({}, entry, { result: null, id: "c_pend" }));
const withPending = scout.concat([pending]);
const mid = bestCallsFor(withPending, "Cover 3", 1, "10+", "Run").find(
  (x) => x.play === "KARATE COMBO"
);
if (mid.n !== 2 || Math.round(mid.sr * 100) !== 50) {
  throw new Error("ungraded call must not change suggestion, got " + JSON.stringify(mid));
}
console.log("OK ungraded success:null excluded from bestCallsFor");

// Slice 2: untouched front/pressure → null; bestCallsFor unchanged when obs fields present
const bare = callerEntryToRow(Object.assign({}, entry, { front: null, pressure: null, id: "c_bare" }));
if (bare.front != null || bare.pressure != null) throw new Error("untouched must be null");
const decorated = afterPool.map((r) =>
  Object.assign({}, r, { front: "Nickel", pressure: "mike-a", frontCarried: true, pressureCarried: false })
);
const aObs = bestCallsFor(decorated, "Cover 3", 1, "10+", "Run").find((x) => x.play === "KARATE COMBO");
if (!aObs || aObs.n !== a.n || Math.round(aObs.sr * 100) !== Math.round(a.sr * 100)) {
  throw new Error(
    "bestCallsFor must ignore front/pressure; before " +
      JSON.stringify(a) +
      " after " +
      JSON.stringify(aObs)
  );
}
console.log(
  "OK Slice 2: null front/pressure clean; bestCallsFor unchanged " +
    Math.round(a.sr * 100) +
    "% on " +
    a.n +
    " with obs fields present"
);

/* Slice 3: undo / de-dup change bestCallsFor only for the affected call — scout math otherwise identical */
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const sandbox = { localStorage: { _m: {}, getItem(k){return this._m[k]||null;}, setItem(k,v){this._m[k]=String(v);} } };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../OFFGRD-caller-log.js"), "utf8"), sandbox);
const C = sandbox.OFFGRD_CALLER;
function cev(p) {
  return Object.assign(
    {
      eventId: C.uuid(),
      gameId: "g1",
      playIndex: 0,
      type: "call",
      payload: { play: "HOUSTON", dn: 1, db: "10+", coverage: "Cover 3", playType: "Run" },
      deviceId: "devA",
      actorId: null,
      clientTs: 1000,
      seq: 1,
      superseded: false,
    },
    p
  );
}
/* Two graded HOUSTON hits so bestCallsFor includes the play (needs n>=2). */
const graded = [
  cev({
    eventId: "s3a",
    playIndex: 0,
    payload: { play: "HOUSTON", dn: 1, db: "10+", coverage: "Cover 3", playType: "Run" },
    clientTs: 1000,
    seq: 1,
  }),
  cev({
    eventId: "s3b",
    type: "outcome",
    playIndex: 0,
    payload: { result: "hit" },
    clientTs: 1100,
    seq: 2,
  }),
  cev({
    eventId: "s3c",
    playIndex: 1,
    payload: { play: "HOUSTON", dn: 1, db: "10+", coverage: "Cover 3", playType: "Run" },
    clientTs: 5000,
    seq: 3,
  }),
  cev({
    eventId: "s3d",
    type: "outcome",
    playIndex: 1,
    payload: { result: "hit" },
    clientTs: 5100,
    seq: 4,
  }),
];
const foldOk = C.foldCallerEvents(graded);
if (foldOk.log.length !== 2) throw new Error("expected 2 HOUSTON calls in fold");
const rowsBefore = foldOk.log.map((l) => callerEntryToRow(l));
const oursBefore = scout.concat(rowsBefore);
const bcBefore = bestCallsFor(oursBefore, "Cover 3", 1, "10+", "Run");
const hBefore = bcBefore.find((x) => x.play === "HOUSTON");
if (!hBefore || hBefore.n !== 2) throw new Error("Slice3 before HOUSTON missing " + JSON.stringify(hBefore));

const foldUndo = C.foldCallerEvents(
  graded.concat([cev({ eventId: "s3u", type: "undo", playIndex: 1, payload: {}, clientTs: 5200, seq: 5 })])
);
if (foldUndo.log.length !== 1 || foldUndo.log[0].playIndex !== 0) {
  throw new Error("undo last HOUSTON should leave one: " + JSON.stringify(foldUndo.log));
}
const rowsAfterUndo = foldUndo.log.map((l) => callerEntryToRow(l));
const oursAfterUndo = scout.concat(rowsAfterUndo);
const bcAfterUndo = bestCallsFor(oursAfterUndo, "Cover 3", 1, "10+", "Run");
/* n=1 left → drops below bestCallsFor threshold; HOUSTON gone from suggestions */
if (bcAfterUndo.find((x) => x.play === "HOUSTON")) {
  throw new Error("after undoing one of two, HOUSTON should drop from bestCallsFor (n<2)");
}
const kBefore = bcBefore.find((x) => x.play === "KARATE COMBO");
const kAfter = bcAfterUndo.find((x) => x.play === "KARATE COMBO");
if (!kBefore || !kAfter || kBefore.n !== kAfter.n || Math.round(kBefore.sr * 100) !== Math.round(kAfter.sr * 100)) {
  throw new Error("undo must not change unrelated bestCallsFor: " + JSON.stringify({ kBefore, kAfter }));
}
console.log(
  "OK Slice 3 bestCallsFor: before HOUSTON n=" +
    hBefore.n +
    "; after undo last → HOUSTON out; KARATE COMBO still " +
    Math.round(kAfter.sr * 100) +
    "% on " +
    kAfter.n
);

console.log("ALL PASS");
