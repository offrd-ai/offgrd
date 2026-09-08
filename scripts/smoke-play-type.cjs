/**
 * smoke-play-type.cjs — stored run / pass / rpo; never a silent pass
 *
 *   node scripts/smoke-play-type.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const T = require(path.join(__dirname, "..", "OFFGRD-play-type.js"));
const S = require(path.join(__dirname, "..", "OFFGRD-play-stubs.js"));
const SL = require(path.join(__dirname, "..", "OFFGRD-caller-shortlist.js"));
const A = require(path.join(__dirname, "..", "OFFGRD-caller-analysis.js"));
const ROOT = path.resolve(__dirname, "..");
const HOME = fs.readFileSync(path.join(ROOT, "OFFGRD.html"), "utf8");
const PB = fs.readFileSync(path.join(ROOT, "OFFGRD-Playbook.html"), "utf8");
const SW = fs.readFileSync(path.join(ROOT, "offgrd-sw.js"), "utf8");

let n = 0;
function ok(cond, msg) {
  n++;
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

function snaps(name, types) {
  return types.map(function (t) {
    return { play: name, playType: t };
  });
}

ok(T.parseTypeSuffix("HAMMER (R)").name === "HAMMER" && T.parseTypeSuffix("HAMMER (R)").type === "run", "suffix (R)");
ok(T.parseTypeSuffix("HOUSTON (P)").type === "pass", "suffix (P)");
ok(T.parseTypeSuffix("FARGO SWITCH (RPO)").type === "rpo" && T.parseTypeSuffix("FARGO SWITCH (RPO)").name === "FARGO SWITCH", "suffix (RPO)");
ok(T.parseTypeSuffix("KARATE").type === "" && T.parseTypeSuffix("KARATE").name === "KARATE", "no suffix leaves name");

ok(T.nameGuess("Inside Zone Rt") === "run", "name-guess zone");
ok(T.nameGuess("KARATE") === "", "house name is not a guess");
ok(T.nameGuess("HAMMER") === "", "HAMMER is not a guess");
ok(T.familyToType("Inside Run") === "run", "family inside run");
ok(T.familyToType("Quick Game") === "pass", "family quick game");
ok(T.familyToType("RPO") === "rpo", "family rpo");
ok(T.familyToType("HAMMER") === "", "house name is not a family");

const karate = { name: "KARATE", type: "pass" };
ok(T.typeOf(karate) === "", "legacy type:pass with no source is unknown");
ok(T.typeOf(karate, { snaps: snaps("KARATE", ["Run", "Run", "Run", "Run", "Run", "Run", "Run", "Run", "Run", "Run", "Run"]) }) === "run", "KARATE 11/11 charted run");

const mixed = { name: "TEXAS" };
ok(T.typeOf(mixed, { snaps: snaps("TEXAS", ["Run", "Run", "Run", "Pass", "Pass", "Pass"]) }) === "rpo", "6 snaps 50/50 → rpo");
ok(T.typeOf({ name: "THIN" }, { snaps: snaps("THIN", ["Run", "Run"]) }) === "", "under 3 snaps stays unknown");

const gap = { name: "GAP" };
ok(T.typeOf(gap, { snaps: snaps("GAP", ["Run", "Run", "Run", "Pass"]) }) === "", "75% with 4 snaps falls through (not ≥80%)");

const ov = { name: "KARATE", typeOverride: "pass" };
ok(T.typeOf(ov, { snaps: snaps("KARATE", ["Run", "Run", "Run", "Run", "Run", "Run"]) }) === "pass", "override beats charted");
T.setOverride(ov, "run");
ok(ov.type === "run" && ov.typeSource === "override" && ov.typeOverride === "run", "setOverride writes sticky fields");
T.setOverride(ov, "");
ok(!ov.typeOverride && T.typeOf(ov, { snaps: snaps("KARATE", ["Run", "Run", "Run", "Run", "Run", "Run"]) }) === "run", "cleared override re-derives");

const book = [
  { name: "KARATE", type: "pass" },
  { name: "DINO", type: "pass" },
  { name: "HAWK", type: "pass" },
  { name: "SMASH", family: "Smash" },
  { name: "POWER LT" },
  { name: "HOUSTON", typeOverride: "pass", type: "pass", typeSource: "override" },
];
const allSnaps = []
  .concat(snaps("KARATE", ["Run", "Run", "Run", "Run", "Run", "Run"]))
  .concat(snaps("DINO", ["Run", "Run", "Run", "Run"]))
  .concat(snaps("HAWK", ["Run", "Run", "Run", "Run", "Run"]));
T.rederiveBook(book, allSnaps);
ok(book[0].type === "run" && book[0].typeSource === "charted", "rederive KARATE run");
ok(book[1].type === "run" && book[1].typeSource === "charted", "rederive DINO run");
ok(book[2].type === "run" && book[2].typeSource === "charted", "rederive HAWK run");
ok(book[3].type === "pass" && book[3].typeSource === "family", "Smash family → pass");
ok(book[4].type === "run" && book[4].typeSource === "name-guess", "POWER LT name-guess");
ok(book[5].type === "pass" && book[5].typeSource === "override", "override survives rederive");

const stub = S.makeStub("HAMMER", "offense");
ok(stub.type === "" && stub.typeSource === "", "offense stub is untyped");
const stubR = S.makeStub("HAMMER (R)", "offense");
ok(stubR.name === "HAMMER" && stubR.type === "run" && stubR.typeOverride === "run", "paste suffix becomes override");
const parsed = S.parseCallSheetText("HOUSTON (P)\nFARGO SWITCH (RPO)\nKARATE\n");
ok(parsed.rows[0].name === "HOUSTON" && parsed.rows[0].type === "pass", "parse strips (P)");
ok(parsed.rows[1].name === "FARGO SWITCH" && parsed.rows[1].type === "rpo", "parse strips (RPO)");
ok(parsed.rows[2].name === "KARATE" && !parsed.rows[2].type, "plain house name stays untyped");

ok(SL.lane({ play: "HAMMER" }) === "", "shortlist house name is not pass");
ok(SL.lane({ play: "KARATE", playObj: { name: "KARATE", type: "run", typeSource: "charted" } }) === "run", "shortlist reads stored type");
ok(SL.matchesLane({ kind: "RPO" }, "run") && SL.matchesLane({ kind: "RPO" }, "pass"), "RPO satisfies both lanes");

const housePass = [
  { play: "A", empSr: 0.9, n: 10, playObj: { name: "A", type: "pass", typeSource: "charted" } },
  { play: "B", empSr: 0.85, n: 8, playObj: { name: "B", type: "pass", typeSource: "charted" } },
  { play: "C", empSr: 0.8, n: 8, playObj: { name: "C", type: "pass", typeSource: "charted" } },
  { play: "D", empSr: 0.75, n: 8, playObj: { name: "D", type: "pass", typeSource: "charted" } },
  { play: "E", empSr: 0.72, n: 8, playObj: { name: "E", type: "pass", typeSource: "charted" } },
  { play: "KARATE", empSr: 0.65, n: 8, playObj: { name: "KARATE", type: "run", typeSource: "charted" } }
];
const sl = SL.shortlist(housePass, SL.defaults());
ok(sl.some(function (e) { return e.play === "KARATE"; }), "guarantee holds a real run, not a house-name pass");

const untypedBook = [
  { play: "HAMMER", empSr: 0.9, n: 10, playObj: { name: "HAMMER" } },
  { play: "HOUSTON", empSr: 0.8, n: 8, playObj: { name: "HOUSTON" } },
  { play: "MEMPHIS", empSr: 0.7, n: 8, playObj: { name: "MEMPHIS" } }
];
const slU = SL.shortlist(untypedBook, SL.defaults());
ok(slU.length === 3 && slU.every(function (e) { return SL.lane(e) === ""; }), "untyped never counted as pass");

const oLog = [
  { playType: "Run", concept: "KARATE", success: 1, gain: 6, result: "gain" },
  { playType: "Run", concept: "KARATE", success: 1, gain: 4, result: "gain" },
  { playType: "Pass", concept: "HOUSTON", success: 0, gain: 0, result: "incomplete" },
  { playType: "RPO", concept: "FARGO", success: 1, gain: 8, result: "gain" }
].map(function (e, i) { e.playIndex = i; e.dn = 1; e.db = 10; return e; });
const working = A.boothChipAnswer("working", { side: "offense", offenseLog: oLog, defenseLog: [], shifts: [] });
ok(working.lines.some(function (l) { return /Run vs pass/.test(l) && /RPO in both/.test(l); }), "Ask Booth run vs pass split: " + working.lines[0]);

ok(/OFFGRD-play-type\.js\?v=/.test(HOME) && /OFFGRD-play-type\.js\?v=/.test(PB), "play-type pinned on gameday + playbook");
ok(/OFFGRD-play-type\.js\?v=/.test(SW), "SW precaches play-type");
ok(/id="m-type-chips"/.test(PB) && /id="typeUntypedBanner"/.test(PB), "Playbook type chips + untyped banner");
ok(/untyped/.test(PB) && /typeUntypedBtn/.test(PB), "untyped count copy");
ok(/HAMMER \(R\)/.test(PB) && /HOUSTON \(P\)/.test(PB), "paste suffix documented");
ok(/rederiveBook/.test(HOME) && /callerPlayType/.test(HOME), "import re-derives; live snap reads type");

console.log("ok", n, "play-type checks");
