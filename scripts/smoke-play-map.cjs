/**
 * Slice 2: play-map norm, stems, rollup Magic 3, keep-out.
 *   node scripts/smoke-play-map.cjs
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

check(
  "HITCH & PITCH === HITCH AND PITCH",
  M.normCall("HITCH & PITCH") === "hitch and pitch" &&
    M.normCall("HITCH AND PITCH") === M.normCall("HITCH & PITCH")
);
check("ST. LOUIS === ST LOUIS", M.normCall("ST. LOUIS") === M.normCall("ST LOUIS"));
check("does not reuse trim-only keys", M.normCall("ST. LOUIS") === "st louis");

const coll = M.collapseFamilies(["Quick", "Quick Game", "Mesh"]);
check("Quick + Quick Game collapse", coll.families.indexOf("Quick Game") >= 0 && coll.families.length === 2);
check("collapse is announced", /Quick/.test(coll.notices.join(" ")) && /Quick Game/.test(coll.notices.join(" ")));

const book = [
  { id: "p1", name: "MEMPHIS", family: "Mesh" },
  { id: "p2", name: "Slam West", family: "Slam" },
  { id: "p3", name: "Cali", family: "Quick" },
];
const inv = M.inventoryCalls(
  [
    { play: "MEMPHIS" }, { play: "MEMPHIS" },
    { play: "HOUSTON" },
    { play: "FARGO" }, { play: "FARGO SWITCH" },
  ],
  [],
  book
);
const mem = inv.items.filter(function (i) { return i.raw === "MEMPHIS"; })[0];
check("MEMPHIS suggests Mesh", !!(mem && mem.suggestedFamily === "Mesh"));
check("suggestion not auto-mapped", !mem.mapped);

const stems = M.suggestStems(inv.items);
const fargo = stems.filter(function (s) { return s.stem === "fargo"; })[0];
check("FARGO / FARGO SWITCH offered as group", !!(fargo && fargo.members.length === 2));
check("stem not applied as map rows", inv.unmapped.length === 4);

const rows = [
  { play: "HOUSTON", playType: "Pass", direction: "R", down: 1, distance: 10, gain: 6, success: 0 },
  { play: "HOUSTON", playType: "Pass", direction: "R", down: 1, distance: 10, gain: 4, success: 0 },
  { play: "DINO", playType: "Run", direction: "L", down: 1, distance: 10, gain: 5, success: 0 },
];
const struct = M.rollup(rows, { playbook: [], maps: [], axis: "structure" });
check("structure labels are honest", struct.buckets.every(function (b) { return /^(RUN|PASS|PLAY)/.test(b.label); }));
check("structure reconcile", struct.reconcile && struct.total === 3);
check("every bucket has n", struct.buckets.every(function (b) { return b.n > 0; }));

const zero = M.rollup(rows, { playbook: [], maps: [], axis: "family" });
check("zero mapping → UNMAPPED counted", zero.buckets.some(function (b) { return b.unmapped && b.n === 3; }));
check("zero mapping reconcile", zero.reconcile);

const mapped = M.rollup(rows, {
  playbook: [],
  maps: [{ raw_call: "HOUSTON", raw_call_norm: "houston", family: "Mesh" }],
  axis: "family",
});
const mesh = mapped.buckets.filter(function (b) { return b.key === "Mesh"; })[0];
const un = mapped.buckets.filter(function (b) { return b.unmapped; })[0];
check("HOUSTON leaves UNMAPPED", !!(mesh && mesh.n === 2) && !!(un && un.n === 1));
check("mapped reconcile", mapped.reconcile);
check("EFF uses 50/70 not stored success", mesh && mesh.eff === 0.5);

const live = M.rollup(
  [{ play: "Slam West", playType: "Run", down: 1, distance: 10, gain: 5 }],
  { playbook: book, maps: [], axis: "family" }
);
check("live_call playbook path without map", live.buckets.some(function (b) { return b.key === "Slam" && b.n === 1; }));

const mixed = [
  { play: "A", playType: "Run", down: 1, distance: 10, gain: 5, qtr: "1", fieldZone: "OWN" },
  { play: "B", playType: "Run", down: 1, distance: 10, gain: 5 },
];
const sliced = M.rollup(mixed, { axis: "structure", qtr: "1" });
check("partial qtr slice is unavailable", sliced.slice === "unavailable");

const src = fs.readFileSync(path.join(ROOT, "OFFGRD-play-map.js"), "utf8");
const banned = /inside zone|outside zone|"counter"|"power"|"gap scheme"/i;
check("no scheme-name derived labels", !banned.test(src));
check("rollup does not touch Cloud", !/Cloud\./.test(src.split("function rollup")[1] || ""));

const html = fs.readFileSync(path.join(ROOT, "OFFGRD.html"), "utf8");
const rollFn = (html.match(/function callerPlayRollupHtml\(\)\{[\s\S]*?\nfunction /) || [])[0] || "";
check("rollup container in normal flow", /rd-gd-play-rollup/.test(rollFn) && /position:static/.test(rollFn));
check("rollup not fixed/sticky/absolute", !/position:\s*(fixed|sticky|absolute)/.test(rollFn.replace(/position:static/g, "")));
check("rollup not in sticky bar", !/rd-gd-sticky/.test(rollFn));
check("MEMPHIS suggest chip in panel", /suggested from playbook/.test(html));

if (fails) {
  console.error(fails + " FAIL");
  process.exit(1);
}
console.log("ok  smoke-play-map");
