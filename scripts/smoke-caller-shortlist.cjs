/**
 * smoke-caller-shortlist.cjs — O/D Caller shortlist rules
 *
 *   node scripts/smoke-caller-shortlist.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const S = require(path.join(__dirname, "..", "OFFGRD-caller-shortlist.js"));
const ROOT = path.resolve(__dirname, "..");
const HOME = fs.readFileSync(path.join(ROOT, "OFFGRD.html"), "utf8");
const DC = fs.readFileSync(path.join(ROOT, "OFFGRD-dcaller.js"), "utf8");

let n = 0;
function ok(cond, msg) {
  n++;
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const cfg = S.defaults();
ok(cfg.SHORTLIST_MAX === 5 && cfg.SUCCESS_FLOOR === 0.6 && cfg.MIN_SNAPS === 4, "defaults");

function E(play, sr, snaps, kind, extra) {
  return Object.assign({ play: play, empSr: sr, sr: sr, n: snaps, kind: kind }, extra || {});
}

const eight = [
  E("A", 0.9, 10, "Pass"),
  E("B", 0.85, 8, "Pass"),
  E("C", 0.8, 8, "Pass"),
  E("D", 0.75, 8, "Pass"),
  E("E", 0.72, 8, "Pass"),
  E("F", 0.7, 8, "Pass"),
  E("G", 0.68, 8, "Pass"),
  E("RUN1", 0.65, 8, "Run")
];
const sl8 = S.shortlist(eight, cfg);
ok(sl8.length === 5, "8 with snaps → exactly 5");
ok(sl8.some(function (e) { return S.lane(e) === "run"; }), "run guarantee holds a slot");
ok(sl8.some(function (e) { return S.lane(e) === "pass"; }), "pass still present");
ok(!sl8.some(function (e) { return e.play === "F" || e.play === "G"; }), "lowest extra passes displaced/capped");

const two = [E("HOUSTON", 0.7, 6, "Pass"), E("ISO", 0.66, 5, "Run"), E("WEAK", 0.4, 20, "Pass", { basis: "on_paper" })];
const sl2 = S.shortlist(two, cfg);
ok(sl2.length === 3 && sl2.some(function (e) { return e.play === "WEAK"; }), "sub-60% with snaps still surfaces");

const onlyPass = [E("SMASH", 0.8, 8, "Pass"), E("MESH", 0.7, 8, "Pass"), E("THINRUN", 0.9, 2, "Run")];
const slP = S.shortlist(onlyPass, cfg);
ok(slP.length === 3 && slP.some(function (e) { return e.play === "THINRUN"; }), "thin run with snaps holds a slot");

const gator = E("GATOR", 1, 1, "Run", { basis: "empirical" });
ok(S.hasRecord(gator), "1-snap play has a record");
ok(!S.isHistoryEligible(gator, cfg), "1-snap 100% is not strong enough to wear a %");
ok(!S.showPct(gator, cfg), "thin sample does not display a percentage");
ok(/1 snap · not enough to rank/.test(S.markText(gator, cfg)), "thin sample uses snap count, no %");

const sit58 = [
  E("HOUSTON", 0.45, 12, "Pass", { basis: "empirical", ev: 0.41 }),
  E("GATOR", 0.37, 8, "Run", { basis: "empirical", ev: 0.39 }),
  E("MEMPHIS", 0.5, 3, "Pass", { basis: "empirical", ev: 0.55 }),
  E("SMASH", 0, 0, "Pass", { basis: "on_paper", basisLabel: "SCHEME MATCH", ev: 0.72 }),
  E("MESH", 0, 0, "Pass", { basis: "on_paper", basisLabel: "SCHEME MATCH", ev: 0.70 }),
  E("FLOOD", 0, 0, "Pass", { basis: "on_paper", basisLabel: "SCHEME MATCH", ev: 0.68 })
];
const panSit = S.buildPanel(sit58, cfg, { coverage: "Cover 4" });
ok(panSit.history.length === 3, "situation snaps surface before concept match");
ok(panSit.history.every(function (e) { return e.play !== "SMASH" && e.play !== "MESH"; }), "scheme does not replace a record");
ok(panSit.shown[0].play === "HOUSTON" || panSit.shown[0].play === "GATOR", "enough-snap history ranks first");
ok(/45% · 12 snaps/.test(S.markText(sit58[0], cfg)), "n≥MIN_SNAPS shows actual %, good or bad");
ok(/3 snaps · not enough to rank/.test(S.markText(sit58[2], cfg)), "under MIN_SNAPS keeps snap count");
ok(panSit.scheme.length === 2 && panSit.scheme.every(function (e) { return e.n === 0; }), "concept match fills remaining slots only");
ok(/not enough to rank/.test(panSit.label) || /best calls/i.test(panSit.label), "history present does not use the scheme-only label");

const zeroHist = [
  E("SMASH", 0, 0, "Pass", { basis: "on_paper", basisLabel: "SCHEME MATCH" }),
  E("MESH", 0, 0, "Pass", { basis: "on_paper", basisLabel: "SCHEME MATCH" }),
  E("FLOOD", 0, 0, "Pass", { basis: "on_paper", basisLabel: "SCHEME MATCH" })
];
const pan0 = S.buildPanel(zeroHist, cfg, { coverage: "Cover 4" });
ok(pan0.mode === "scheme" && /No strong history here/.test(pan0.label) && /Cover 4/.test(pan0.label), "zero records → honest scheme label");
ok(S.markText(pan0.shown[0], cfg, true) === "concept match", "scheme rows labeled concept match");

const empty = S.buildPanel([], cfg);
ok(empty.mode === "empty" && /No read yet/.test(empty.label), "neither history nor scheme → open playbook");

const oneHist = [E("SOUTH BEND", 0.7, 8, "Pass"), E("SMASH", 0, 0, "Pass", { basis: "on_paper", basisLabel: "SCHEME MATCH" })];
const pan1 = S.buildPanel(oneHist, cfg);
ok(pan1.mode === "mixed" && pan1.history.length === 1 && pan1.scheme.length >= 1, "1 with snaps fills remaining slots with scheme");

ok(/sitStats/.test(HOME) && /empSr/.test(HOME), "O Caller overlays situation snap records onto the panel");
ok(/OFFGRD-caller-shortlist\.js/.test(HOME), "O Caller loads shortlist");
ok(/OFFGRD-caller-shortlist/.test(DC) || /OFFGRD_CALLER_SHORTLIST/.test(DC), "D Caller uses shortlist");
ok(/Show all plays/.test(HOME), "O Caller has Show all plays");

console.log("ok", n, "caller-shortlist checks");
