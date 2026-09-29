/**
 * Sequence tendencies: order, set-aside, negative yardage, drive refusal, reconcile.
 *   node scripts/smoke-tendencies.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

function load(name, sandbox) {
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, name), "utf8"), sandbox, { filename: name });
  return sandbox;
}

const box = {
  console: console,
  localStorage: { getItem: function () { return null; }, setItem: function () {} },
};
load("OFFGRD-caller-outcome.js", box);
load("OFFGRD-tendencies.js", box);
const T = box.OFFGRD_TENDENCIES;
if (typeof T.computeSequences !== "function") throw new Error("computeSequences missing");

const mixed = [
  { date: "g1", qtr: "2", play_index: 1, playType: "Run", gain: 1, play: "B", result: "Rush" },
  { date: "g1", qtr: "1", play_index: 2, playType: "Pass", gain: 3, play: "A", result: "Complete" },
  { date: "g1", qtr: "1", play_index: 1, playType: "Run", gain: -2, play: "C", result: "Rush" },
  { date: "g1", qtr: "1", play: "MISSING", playType: "Run", gain: -9, result: "Rush" },
];
const rep = T.computeSequences(mixed);
if (rep.setAside !== 1) throw new Error("missing play_index must be tallied, got " + rep.setAside);
const neg = rep.slices.AFTER_NEGATIVE;
if (neg.n !== 1) throw new Error("AFTER_NEGATIVE should be the play after GN/LS<0 only, got " + neg.n);
if (!neg.topCalls.length || neg.topCalls[0].name !== "A") {
  throw new Error("play after the negative gain should be A, got " + JSON.stringify(neg.topCalls));
}
const zeroPrev = T.computeSequences([
  { date: "g1", qtr: 1, play_index: 1, playType: "Run", gain: 0, play: "Z", result: "Rush" },
  { date: "g1", qtr: 1, play_index: 2, playType: "Pass", gain: 4, play: "Y", result: "Complete" },
]);
if (zeroPrev.slices.AFTER_NEGATIVE.n !== 0) {
  throw new Error("gain 0 must not open AFTER_NEGATIVE");
}
if (rep.slices.FIRST_OF_DRIVE.refused !== true || rep.slices.FIRST_OF_DRIVE.n != null) {
  throw new Error("drive slices must refuse when no boundary tokens, got " + JSON.stringify(rep.slices.FIRST_OF_DRIVE));
}
if (rep.slices.SUDDEN_CHANGE.refused !== true || rep.slices.SUDDEN_CHANGE.needsResult !== true) {
  throw new Error("sudden change must refuse, not omit");
}
["AFTER_EXPLOSIVE", "AFTER_NEGATIVE"].forEach(function (id) {
  const sl = rep.slices[id];
  if (sl.n + sl.excluded + sl.setAside !== sl.corpus) {
    throw new Error(id + " does not reconcile " + JSON.stringify(sl));
  }
});

const bounded = T.computeSequences([
  { date: "g1", qtr: 1, play_index: 2, playType: "Pass", gain: 0, play: "PICK", result: "Interception" },
  { date: "g1", qtr: 1, play_index: 1, playType: "Run", gain: 12, play: "BOOM", result: "Rush" },
  { date: "g1", qtr: 1, play_index: 3, playType: "Run", gain: 2, play: "NEXT", result: "Rush" },
]);
if (bounded.slices.FIRST_OF_DRIVE.refused) throw new Error("boundaries present — must not refuse");
const exp = bounded.slices.AFTER_EXPLOSIVE;
if (exp.n !== 1 || exp.topCalls[0].name !== "PICK") {
  throw new Error("12-yard run should put the next play in AFTER_EXPLOSIVE, got " + JSON.stringify(exp));
}
if (bounded.slices.SUDDEN_CHANGE.n !== 1 || bounded.slices.SUDDEN_CHANGE.topCalls[0].name !== "NEXT") {
  throw new Error("play after interception should be sudden change");
}
if (!bounded.slices.FIRST_OF_DRIVE.reconciles) throw new Error("first-of-drive reconcile");

const unorderedHtml = T.sequenceHtml(T.computeSequences([
  { play: "X", gain: 20, playType: "Run", result: "Rush" },
]));
if (/too few/.test(unorderedHtml)) throw new Error("unordered snaps must not say too few");
if (unorderedHtml.indexOf("quarter") < 0) throw new Error("unordered snaps should name the missing quarter");
if (/THIN/.test(unorderedHtml)) throw new Error("unordered snaps must not wear a THIN badge");

const richRows = [];
for (let i = 0; i < 6; i++) {
  richRows.push({ date: "g1", qtr: 1, play_index: i * 2 + 1, playType: "Run", gain: 12, play: "BOOM", result: "Rush" });
  richRows.push({ date: "g1", qtr: 1, play_index: i * 2 + 2, playType: "Pass", gain: 3, play: "VERTS", result: "Complete" });
}
const rich = T.sequenceHtml(T.computeSequences(richRows));
if (rich.indexOf("Pass leaning") < 0) throw new Error("six passes after explosives should read Pass leaning");
if (rich.indexOf("VERTS") < 0 || rich.indexOf("%") < 0) throw new Error("top call should show a share");

const src = fs.readFileSync(path.join(ROOT, "OFFGRD-tendencies.js"), "utf8");
if (/fetch\s*\(/.test(src)) throw new Error("tendencies must not fetch");
const leaked = src.split(/\n/).filter(function (line) {
  return /0\.5\s*\*\s*d\b|0\.7\s*\*\s*d\b|50\s*\/\s*70/.test(line);
});
if (leaked.length) throw new Error("second success rule:\n" + leaked.join("\n"));

console.log("ok  sequence order, set-aside, negative, drive refusal, reconcile");
