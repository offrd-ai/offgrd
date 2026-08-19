/**
 * Canon success rule: 50% / 70% / 100% (isSuccessVal).
 * One definition, 10+ distance = 10 yards, parseOffense keeps qtr + yard-line zone.
 *   node scripts/smoke-success-canon.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

function load(name, sandbox) {
  sandbox = sandbox || {
    localStorage: { getItem: function () { return null; }, setItem: function () {} },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.console = console;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, name), "utf8"), sandbox);
  return sandbox;
}

const box = load("OFFGRD-caller-outcome.js");
const O = box.OFFGRD_CALLER_OUTCOME;
if (!O || typeof O.isSuccessVal !== "function") throw new Error("SSoT missing");

const FIXTURES = [
  [1, 10, 5, 1],
  [1, 10, 4, 0],
  [2, 10, 7, 1],
  [2, 10, 6, 0],
  [3, 8, 8, 1],
  [3, 8, 7, 0],
  [4, 2, 2, 1],
  [4, 2, 1, 0],
  [1, 0, 5, null],
  [1, 10, NaN, null],
];

FIXTURES.forEach(function (row) {
  const got = O.isSuccessVal(row[0], row[1], row[2]);
  if (got !== row[3]) {
    throw new Error(
      "fixture (" + row[0] + "," + row[1] + "," + row[2] + ") expected " + row[3] + " got " + got
    );
  }
});

if (O.dbToNum("10+") !== 10) throw new Error("dbToNum(10+) must be 10, got " + O.dbToNum("10+"));
if (O.estYardsForBucket("10+") !== 10) throw new Error("estYards(10+) must be 10");
if (O.dbToNum("10+") !== O.estYardsForBucket("10+")) throw new Error("10+ bucketization split");

load("OFFGRD-tendencies.js", box);
const T = box.OFFGRD_TENDENCIES;
const tile = T.summaryTile([], [
  { down: 1, distance: 10, gain: 4, playType: "Run" },
  { down: 1, distance: 10, gain: 5, playType: "Run" },
]);
if (tile.successPct !== 0.5) {
  throw new Error("Tendencies must use 50/70/100 — 1st&10 gain 4 fails, 5 hits; got " + tile.successPct);
}

const PROD = [
  "OFFGRD.html",
  "OFFGRD-caller-outcome.js",
  "OFFGRD-tendencies.js",
  "OFFGRD-assist-import.js",
  "OFFGRD-caller-analysis.js",
];
const THRESH = /0\.4\s*\*\s*d\b|d\s*\*\s*0\.4\b|0\.5\s*\*\s*d\b|0\.7\s*\*\s*d\b/;
const hits = [];
PROD.forEach(function (rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const lines = src.split(/\r?\n/);
  lines.forEach(function (line, i) {
    if (THRESH.test(line)) hits.push(rel + ":" + (i + 1) + " " + line.trim());
  });
});
if (hits.length !== 2) {
  throw new Error("expected exactly two threshold lines (0.5 / 0.7) in SSoT, got " + hits.length + "\n" + hits.join("\n"));
}
if (!hits.every(function (h) { return h.indexOf("OFFGRD-caller-outcome.js") === 0; })) {
  throw new Error("threshold constants leaked:\n" + hits.join("\n"));
}

const html = fs.readFileSync(path.join(ROOT, "OFFGRD.html"), "utf8");
const po = html.match(/function parseOffense\(text\)\{[\s\S]*?\nfunction /);
if (!po) throw new Error("parseOffense not found");
if (!/ci\.qtr/.test(po[0])) throw new Error("parseOffense must map qtr");
if (!/zoneFromYardLine\(at\(c,ci\.yl\)\)/.test(po[0])) throw new Error("parseOffense must derive fieldZone from yard line");
if (/fieldZone:\s*""/.test(po[0])) throw new Error("parseOffense still hardcodes fieldZone \"\"");

const csv = html.match(/function parseCSV\(text,forceKeep\)\{[\s\S]*?\nfunction /);
if (!csv) throw new Error("parseCSV not found");
if (!/if\(!fz\) fz="OWN"/.test(csv[0])) throw new Error("opponent parseCSV OWN default was changed");

console.log("ok  fixtures " + FIXTURES.length);
console.log("ok  10+ = 10 (dbToNum === estYards)");
console.log("ok  Tendencies Success % uses canon");
console.log("ok  one success rule (thresholds only in OFFGRD-caller-outcome.js)");
console.log("ok  parseOffense keeps qtr + yard-line zone; parseCSV untouched");
