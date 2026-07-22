/**
 * Multi-device caller event log — fold determinism, idempotency, collisions.
 *   node scripts/smoke-caller-events.cjs
 */
"use strict";

// Load outcome model then fold engine (browser IIFE → attach to sandbox)
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const sandbox = {
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
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../OFFGRD-caller-outcome.js"), "utf8"), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../OFFGRD-caller-log.js"), "utf8"), sandbox);
const C = sandbox.OFFGRD_CALLER;
if (!C) throw new Error("OFFGRD_CALLER missing");
const O = sandbox.OFFGRD_CALLER_OUTCOME;
if (!O) throw new Error("OFFGRD_CALLER_OUTCOME missing");

function ev(partial) {
  return Object.assign(
    {
      eventId: C.uuid(),
      gameId: "game-1",
      playIndex: 0,
      type: "call",
      payload: { play: "HOUSTON", dn: 1, db: "10+", hash: "ANY", zone: "ANY" },
      deviceId: "devA",
      actorId: "userA",
      clientTs: 1000,
      seq: 1,
      superseded: false,
    },
    partial
  );
}

// 1) Deterministic fold
const base = [
  ev({ eventId: "e1", playIndex: 0, payload: { play: "HOUSTON", dn: 1, db: "10+" }, deviceId: "devA", clientTs: 1000, seq: 1 }),
  ev({ eventId: "e2", type: "outcome", playIndex: 0, payload: { result: "hit" }, deviceId: "devA", clientTs: 1100, seq: 2 }),
  ev({ eventId: "e3", playIndex: 1, payload: { play: "SOUTH BEND", dn: 2, db: "4-6" }, deviceId: "devB", clientTs: 2000, seq: 1 }),
];
const f1 = C.foldCallerEvents(base);
const f2 = C.foldCallerEvents(base.slice().reverse());
if (JSON.stringify(f1.log.map((x) => x.play)) !== JSON.stringify(f2.log.map((x) => x.play))) {
  throw new Error("fold not deterministic on reorder");
}
if (f1.log.length !== 2 || f1.log[0].result !== "hit") throw new Error("fold log wrong " + JSON.stringify(f1.log));
console.log("OK deterministic fold →", f1.log.map((x) => x.play + (x.result ? "/" + x.result : "")).join(", "));

// 2) Idempotent merge (retried sync)
const merged = C.mergeEvents(base, base.concat([base[0]]));
if (merged.length !== 3) throw new Error("idempotent merge failed: " + merged.length);
console.log("OK mergeEvents idempotent (retried sync → 3 unique)");

// 3) Collision: two devices same playIndex — earlier keeps, later superseded, prompt
const collide = [
  ev({ eventId: "cA", playIndex: 4, payload: { play: "HOUSTON" }, deviceId: "devA", clientTs: 5000, seq: 1 }),
  ev({ eventId: "cB", playIndex: 4, payload: { play: "SOUTH BEND" }, deviceId: "devB", clientTs: 5100, seq: 1 }),
];
const fc = C.foldCallerEvents(collide);
if (fc.log.length !== 1 || fc.log[0].play !== "HOUSTON") {
  throw new Error("collision should keep earlier HOUSTON, got " + JSON.stringify(fc.log));
}
if (!fc.supersededIds["cB"]) throw new Error("later call must be superseded");
if (!fc.collisions.length) throw new Error("collision must surface for prompt");
console.log("OK collision: keep HOUSTON, supersede SOUTH BEND, prompt n=" + fc.collisions.length);

// 4) resolve_collision clears prompt; superseded still excluded
const resolved = collide.concat([
  ev({
    eventId: "cR",
    type: "resolve_collision",
    playIndex: 4,
    payload: { keepEventId: "cA", dropEventId: "cB" },
    deviceId: "devA",
    clientTs: 5200,
    seq: 2,
  }),
]);
const fr = C.foldCallerEvents(resolved);
if (fr.collisions.length) throw new Error("resolved collision should clear prompt");
if (fr.log.length !== 1 || fr.log[0].play !== "HOUSTON") throw new Error("resolved fold wrong");
console.log("OK resolve_collision clears prompt; gamesRows fold still 1 call");

// 5) Dual devices converge after merge
const aOnly = [ev({ eventId: "a1", playIndex: 0, payload: { play: "DINO" }, deviceId: "iPad", clientTs: 1, seq: 1 })];
const bOnly = [ev({ eventId: "b1", playIndex: 1, payload: { play: "MEMPHIS" }, deviceId: "phone", clientTs: 2, seq: 1 })];
const both = C.mergeEvents(aOnly, bOnly);
const fb = C.foldCallerEvents(both);
if (fb.log.length !== 2) throw new Error("two devices should both persist");
console.log("OK two-device merge converges →", fb.log.map((x) => x.play).join(", "));

// 6) Slice 2 observations — explicit then carried; late obs; reorder-safe
const obsFlow = [
  ev({ eventId: "o1", playIndex: 0, payload: { play: "HOUSTON", dn: 1, db: "10+" }, clientTs: 100, seq: 1 }),
  ev({
    eventId: "o2",
    type: "observation",
    playIndex: 0,
    payload: { front: "Nickel", frontCarried: false, pressure: "none", pressureCarried: false },
    clientTs: 110,
    seq: 2,
  }),
  ev({ eventId: "o3", playIndex: 1, payload: { play: "DINO", dn: 2, db: "4-6" }, clientTs: 200, seq: 3 }),
  ev({
    eventId: "o4",
    type: "observation",
    playIndex: 1,
    payload: { front: "Nickel", frontCarried: true },
    clientTs: 210,
    seq: 4,
  }),
  /* late pressure on play 0 after play 1 */
  ev({
    eventId: "o5",
    type: "observation",
    playIndex: 0,
    payload: { pressure: "mike-a", pressureCarried: false },
    clientTs: 300,
    seq: 5,
  }),
];
const fo = C.foldCallerEvents(obsFlow);
const foR = C.foldCallerEvents(obsFlow.slice().reverse());
if (fo.log[0].front !== "Nickel" || fo.log[0].frontCarried !== false) {
  throw new Error("explicit front fold failed " + JSON.stringify(fo.log[0]));
}
if (fo.log[0].pressure !== "mike-a" || fo.log[0].pressureCarried !== false) {
  throw new Error("late pressure fold failed " + JSON.stringify(fo.log[0]));
}
if (fo.log[1].front !== "Nickel" || fo.log[1].frontCarried !== true) {
  throw new Error("carried front fold failed " + JSON.stringify(fo.log[1]));
}
if (fo.log[1].pressure != null) throw new Error("play 1 pressure should stay null");
if (JSON.stringify(fo.log.map((x) => [x.front, x.frontCarried, x.pressure])) !==
    JSON.stringify(foR.log.map((x) => [x.front, x.frontCarried, x.pressure]))) {
  throw new Error("observation fold not deterministic on reorder");
}
const untouched = C.foldCallerEvents([
  ev({ eventId: "u1", playIndex: 0, payload: { play: "X" }, clientTs: 1, seq: 1 }),
]);
if (untouched.log[0].front != null || untouched.log[0].pressure != null) {
  throw new Error("no observation → front/pressure null");
}
console.log("OK observation fold: explicit/carried/late + null when untouched");

// 7) Explicit beats carried regardless of timestamp (offline sticky must not clobber amend)
const precedence = [
  ev({ eventId: "p0", playIndex: 21, payload: { play: "HOUSTON" }, clientTs: 8000, seq: 1 }),
  ev({
    eventId: "p1",
    type: "observation",
    playIndex: 21,
    payload: { front: "Bear (46)", frontCarried: false },
    deviceId: "coord",
    clientTs: 8030,
    seq: 2,
  }),
  /* assistant offline sticky sync — later ts, but carried */
  ev({
    eventId: "p2",
    type: "observation",
    playIndex: 21,
    payload: { front: "4-3", frontCarried: true },
    deviceId: "asst",
    clientTs: 8050,
    seq: 1,
  }),
];
const fp = C.foldCallerEvents(precedence);
if (fp.log[0].front !== "Bear (46)" || fp.log[0].frontCarried !== false) {
  throw new Error("explicit must beat later carried: " + JSON.stringify(fp.log[0]));
}
/* reverse arrival order — same result */
const fpR = C.foldCallerEvents(precedence.slice().reverse());
if (fpR.log[0].front !== "Bear (46)") {
  throw new Error("explicit still wins when carried processed first: " + JSON.stringify(fpR.log[0]));
}
/* among equals, later wins */
const lww = C.foldCallerEvents([
  ev({ eventId: "l0", playIndex: 0, payload: { play: "X" }, clientTs: 1, seq: 1 }),
  ev({
    eventId: "l1",
    type: "observation",
    playIndex: 0,
    payload: { front: "Nickel", frontCarried: false },
    clientTs: 10,
    seq: 2,
  }),
  ev({
    eventId: "l2",
    type: "observation",
    playIndex: 0,
    payload: { front: "3-4", frontCarried: false },
    clientTs: 20,
    seq: 3,
  }),
]);
if (lww.log[0].front !== "3-4") throw new Error("LWW among explicit failed: " + lww.log[0].front);
console.log("OK obs precedence: explicit > carried; LWW among equals");

// 8) Slice 3 — undo excludes from log, retains event; gamesRows fold empty for that play
const withUndo = base.concat([
  ev({ eventId: "uUndo", type: "undo", playIndex: 0, payload: {}, deviceId: "devB", clientTs: 3000, seq: 2 }),
]);
const fu = C.foldCallerEvents(withUndo);
if (fu.log.some((x) => x.playIndex === 0)) throw new Error("undone playIndex 0 must leave fold log");
if (fu.log.length !== 1 || fu.log[0].play !== "SOUTH BEND") {
  throw new Error("undo fold wrong: " + JSON.stringify(fu.log));
}
if (!fu.supersededIds["e1"]) throw new Error("undo should supersede original call eventId");
if (withUndo.length !== 4) throw new Error("undo must append — event log retains all events");
const fuR = C.foldCallerEvents(withUndo.slice().reverse());
if (JSON.stringify(fu.log.map((x) => x.play)) !== JSON.stringify(fuR.log.map((x) => x.play))) {
  throw new Error("undo fold not deterministic on reorder");
}
console.log("OK undo: excluded from log, retained in events, deterministic");

// 9) Slice 3 — same play within DEDUP_MS logs once (cross playIndex); outside window repeats OK
const dedupMs = C.DEDUP_MS || 3000;
const fatFinger = [
  ev({ eventId: "d1", playIndex: 0, payload: { play: "HOUSTON" }, deviceId: "devA", clientTs: 10000, seq: 1 }),
  ev({ eventId: "d2", playIndex: 1, payload: { play: "HOUSTON" }, deviceId: "devA", clientTs: 10000 + dedupMs - 50, seq: 2 }),
];
const fd = C.foldCallerEvents(fatFinger);
if (fd.log.length !== 1 || fd.log[0].play !== "HOUSTON" || fd.log[0].eventId !== "d1") {
  throw new Error("de-dup should keep earlier HOUSTON once: " + JSON.stringify(fd.log));
}
if (!fd.supersededIds["d2"]) throw new Error("later fat-finger must be superseded");
const genuine = fatFinger.concat([
  ev({
    eventId: "d3",
    playIndex: 2,
    payload: { play: "HOUSTON" },
    deviceId: "devA",
    clientTs: 10000 + dedupMs + 500,
    seq: 3,
  }),
]);
const fg = C.foldCallerEvents(genuine);
if (fg.log.length !== 2 || fg.log.filter((x) => x.play === "HOUSTON").length !== 2) {
  throw new Error("genuine later repeat must log: " + JSON.stringify(fg.log));
}
const fdR = C.foldCallerEvents(fatFinger.slice().reverse());
if (fdR.log.length !== 1 || fdR.log[0].eventId !== "d1") {
  throw new Error("de-dup not deterministic on reorder");
}
console.log("OK de-dup: same play <", dedupMs, "ms → once; later repeat OK");

// 10) onCallFromLog / wouldDedupCall helpers
const oc = C.onCallFromLog(fg.log);
if (!oc || oc.play !== "HOUSTON") throw new Error("onCallFromLog failed");
const hit = C.wouldDedupCall(fg.log, "HOUSTON", fg.log[fg.log.length - 1].ts + 100);
if (!hit) throw new Error("wouldDedupCall should hit within window of last HOUSTON");
const miss = C.wouldDedupCall(fg.log, "HOUSTON", fg.log[fg.log.length - 1].ts + dedupMs + 10);
if (miss) throw new Error("wouldDedupCall should miss outside window");
console.log("OK onCallFromLog + wouldDedupCall");

// 11) Correction patches situation into gamesRows distance bucket (append-only; reorder-safe)
const corrBase = [
  ev({
    eventId: "corrC",
    playIndex: 9,
    payload: { play: "HOUSTON", dn: 3, db: "1-3", hash: "L", zone: "ANY", situationInferred: false },
    deviceId: "devA",
    clientTs: 9000,
    seq: 1,
  }),
  ev({
    eventId: "corrO",
    type: "outcome",
    playIndex: 9,
    payload: { result: "short" },
    deviceId: "devA",
    clientTs: 9100,
    seq: 2,
  }),
  ev({
    eventId: "corrX",
    type: "correction",
    playIndex: 9,
    payload: {
      dn: 3,
      db: "7-9",
      hash: "L",
      zone: "ANY",
      sitTxt: "3rd & 7-9 L",
      situationInferred: false,
      play: "HOUSTON",
    },
    deviceId: "devB",
    clientTs: 9200,
    seq: 1,
  }),
];
const fCorr = C.foldCallerEvents(corrBase);
const fCorrR = C.foldCallerEvents(corrBase.slice().reverse());
if (fCorr.log.length !== 1 || fCorr.log[0].db !== "7-9" || +fCorr.log[0].dn !== 3) {
  throw new Error("correction should move to 3rd&7-9: " + JSON.stringify(fCorr.log[0]));
}
if (fCorr.log[0].play !== "HOUSTON" || fCorr.log[0].result !== "short") {
  throw new Error("correction must keep play/result: " + JSON.stringify(fCorr.log[0]));
}
if (fCorr.log[0].db !== fCorrR.log[0].db || fCorr.log[0].result !== fCorrR.log[0].result) {
  throw new Error("correction fold not deterministic on reorder");
}
/* original call event still present */
if (!corrBase.find((e) => e.eventId === "corrC" && e.type === "call" && e.payload.db === "1-3")) {
  throw new Error("original call event must remain in the event set");
}
console.log("OK correction: sit patch → 7-9 bucket; original event retained; reorder-safe");

// 12) Special teams — fg/punt call+outcome fold; playType carried; offense filter intact
const stEvents = [
  ev({ eventId: "s1", playIndex: 0, payload: { play: "SLANT", dn: 1, db: "10+", playType: "Pass" }, clientTs: 100, seq: 1 }),
  ev({ eventId: "s1o", type: "outcome", playIndex: 0, payload: { result: "solid" }, clientTs: 110, seq: 2 }),
  ev({ eventId: "s2", playIndex: 1, payload: { play: "Field Goal", dn: 4, db: "1-3", playType: "fg" }, clientTs: 200, seq: 3 }),
  ev({ eventId: "s2o", type: "outcome", playIndex: 1, payload: { result: "fg_good" }, clientTs: 210, seq: 4 }),
  ev({ eventId: "s3", playIndex: 2, payload: { play: "Punt", dn: 4, db: "10+", playType: "punt" }, clientTs: 300, seq: 5 }),
  ev({ eventId: "s3o", type: "outcome", playIndex: 2, payload: { result: "punt_i20" }, clientTs: 310, seq: 6 }),
];
const fst = C.foldCallerEvents(stEvents);
const fstR = C.foldCallerEvents(stEvents.slice().reverse());
if (fst.log.length !== 3) throw new Error("ST fold length " + fst.log.length);
const fgRow = fst.log.find((x) => x.play === "Field Goal");
const puntRow = fst.log.find((x) => x.play === "Punt");
if (!fgRow || fgRow.playType !== "fg" || fgRow.result !== "fg_good") throw new Error("fg fold " + JSON.stringify(fgRow));
if (!puntRow || puntRow.playType !== "punt" || puntRow.result !== "punt_i20") throw new Error("punt fold " + JSON.stringify(puntRow));
if (JSON.stringify(fst.log.map((x) => [x.play, x.playType, x.result])) !==
    JSON.stringify(fstR.log.map((x) => [x.play, x.playType, x.result]))) {
  throw new Error("ST fold not deterministic on reorder");
}
if (C.mergeEvents(stEvents, stEvents).length !== stEvents.length) throw new Error("ST merge not idempotent");
/* ST never feeds offensive learning */
if (O.learningSuccess(fgRow) !== null || O.learningSuccess(puntRow) !== null) throw new Error("ST learningSuccess must be null");
/* Offense-only filter (mirrors callerSyncToGames) leaves offensive rows intact */
const offense = fst.log.filter((l) => !O.isSpecialEntry(l));
if (offense.length !== 1 || offense[0].play !== "SLANT") throw new Error("offense filter " + JSON.stringify(offense));
if (O.learningSuccess(offense[0]) !== 1) throw new Error("offense SLANT solid should still learn 1");
console.log("OK special teams: fg/punt fold + playType carried + offense filter intact");

console.log("ALL PASS");
