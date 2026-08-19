/**
 * Situational truth: avg DIST beside EFF, RESULT on ours, COMP on pass families.
 *   node scripts/smoke-situational-truth.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const sandbox = {
  window: {},
  globalThis: {},
  console: console,
  localStorage: {
    getItem: function () { return null; },
    setItem: function () {},
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "OFFGRD-caller-outcome.js"), "utf8"), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "OFFGRD-play-map.js"), "utf8"), sandbox);

const M = sandbox.OFFGRD_PLAY_MAP;
if (!M) throw new Error("OFFGRD_PLAY_MAP missing");

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

const maps = [
  { raw_call: "FLOOD", raw_call_norm: "flood", family: "Flood" },
  { raw_call: "CALI", raw_call_norm: "cali", family: "Quick Game" },
  { raw_call: "VIKING", raw_call_norm: "viking", family: "Goaline" },
  { raw_call: "PHILLY", raw_call_norm: "philly", family: "Goaline" },
];

const sameEff = M.rollup(
  [
    { play: "FLOOD", playType: "Pass", down: 1, distance: 4, gain: 2 },
    { play: "FLOOD", playType: "Pass", down: 1, distance: 4, gain: 3 },
    { play: "CALI", playType: "Pass", down: 1, distance: 10, gain: 5 },
    { play: "CALI", playType: "Pass", down: 1, distance: 10, gain: 8 },
  ],
  { maps: maps, playbook: [], axis: "family" }
);
const flood = sameEff.buckets.filter(function (b) { return b.key === "Flood"; })[0];
const quick = sameEff.buckets.filter(function (b) { return b.key === "Quick Game"; })[0];
check("same EFF, different DIST", !!(flood && quick && flood.eff === 1 && quick.eff === 1 && flood.distAvg === 4 && quick.distAvg === 10));
check("DIST uses EFF rows", !!(flood && flood.distN === flood.effN && quick.distN === quick.effN));
check("totals still reconcile", sameEff.reconcile && sameEff.total === 4);

const noDist = M.rollup(
  [{ play: "FLOOD", playType: "Pass", down: 1, gain: 5 }],
  { maps: maps, playbook: [], axis: "family" }
);
const floodBlank = noDist.buckets.filter(function (b) { return b.key === "Flood"; })[0];
check("missing DIST is blank, not zero", !!(floodBlank && floodBlank.distAvg == null && floodBlank.eff == null));

const goaline = M.rollup(
  [
    { play: "VIKING", playType: "Pass", down: 2, distance: 25, gain: 0 },
    { play: "PHILLY", playType: "Pass", down: 4, distance: 20, gain: 0 },
  ],
  { maps: maps, playbook: [], axis: "family" }
);
const g = goaline.buckets.filter(function (b) { return b.key === "Goaline"; })[0];
check("Goaline shows long avg distance", !!(g && g.eff === 0 && g.distAvg === 22.5));
check("COMP blank without RESULT", !!(g && g.comp == null));

const withResult = M.rollup(
  [
    { play: "CALI", playType: "Pass", down: 1, distance: 10, gain: 12, result: "Complete" },
    { play: "CALI", playType: "Pass", down: 1, distance: 10, gain: 0, result: "Incomplete" },
    { play: "CALI", playType: "Pass", down: 1, distance: 10, gain: 0 },
  ],
  { maps: maps, playbook: [], axis: "family" }
);
const qg = withResult.buckets.filter(function (b) { return b.key === "Quick Game"; })[0];
check("COMP is known completes only", !!(qg && qg.comp === 0.5 && qg.compN === 2 && qg.n === 3));
check("blank RESULT is not inferred", M.resultKind("") === "" && M.resultKind("hit") === "other");

const pen = M.rollup(
  [
    { play: "FLOOD", playType: "Pass", down: 1, distance: 10, gain: 8, result: "Complete" },
    { play: "FLOOD", playType: "Pass", down: 1, distance: 10, gain: 0, result: "Penalty" },
  ],
  { maps: maps, playbook: [], axis: "family" }
);
const floodPen = pen.buckets.filter(function (b) { return b.key === "Flood"; })[0];
check("penalty stays in EFF denom", !!(floodPen && floodPen.n === 2 && floodPen.effN === 2 && floodPen.eff === 0.5 && floodPen.penaltyN === 1));
check("penalty is not a COMP attempt", !!(floodPen && floodPen.comp === 1 && floodPen.compN === 1));

const sackRows = [
  { play: "CALI", playType: "Pass", down: 1, distance: 10, gain: -7, result: "Sack" },
];
const sackFam = M.rollup(sackRows, { maps: maps, playbook: [], axis: "family" });
const sackStruct = M.rollup(sackRows, { maps: maps, playbook: [], axis: "structure" });
const qgSack = sackFam.buckets.filter(function (b) { return b.key === "Quick Game"; })[0];
check("sack is not a run", sackStruct.buckets[0] && sackStruct.buckets[0].key.indexOf("PASS") === 0);
check("sack sits in YPP as the gain", !!(qgSack && qgSack.ypp === -7 && qgSack.sackN === 1));
check("sack is not a COMP attempt", !!(qgSack && qgSack.comp == null));

const src = fs.readFileSync(path.join(ROOT, "OFFGRD-play-map.js"), "utf8");
check("no adjusted/composite EFF", !/expected.?point|situation.?weight|adjusted.?eff|normalized.?eff/i.test(src));

const html = fs.readFileSync(path.join(ROOT, "OFFGRD.html"), "utf8");
const po = (html.match(/function parseOffense\(text\)\{[\s\S]*?\nfunction /) || [])[0] || "";
check("parseOffense maps RESULT", /ci\.result/.test(po) && /result:at\(c,ci\.result\)/.test(po));
check("parseCSV still writes result", /result:at\(c,"result"\)/.test(html));
const rollFn = (html.match(/function callerPlayRollupHtml\(\)\{[\s\S]*?\nfunction /) || [])[0] || "";
check("DIST sits beside n", /<th>n<\/th><th>DIST<\/th>/.test(rollFn));
check("footer contract unchanged", /view\.total\} calls · totals reconcile/.test(rollFn) && /view\.junkN/.test(rollFn));
check("no down-mix column", !/1st 60%|downMix|AVG TO GO/.test(rollFn));

const assist = fs.readFileSync(path.join(ROOT, "OFFGRD-assist-import.js"), "utf8");
check("Assist typed snap includes result", /result: result/.test(assist));
check("Assist result stays off RPC payload", !/result: snap\.result/.test(assist));

if (fails) {
  console.error(fails + " FAIL");
  process.exit(1);
}
console.log("ok  smoke-situational-truth");
