/**
 * Smoke: side:"ours" must never enter opponent-facing filters / reconcile.
 * Usage: node scripts/smoke-ours-side-isolation.cjs
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sandbox = { window: {}, globalThis: {}, console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "..", "OFFGRD-opp-shells.js"), "utf8"),
  sandbox
);
const S = sandbox.OFFGRD_OPP_SHELLS;
if (!S) {
  console.error("FAIL load OFFGRD_OPP_SHELLS");
  process.exit(1);
}

const OPP = "Parkway North";
let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

check("isOffSide(ours) is false", S.isOffSide("ours") === false);
check("isDefSide(ours) is false", S.isDefSide("ours") === false);
check("isOffSide(off) still true", S.isOffSide("off") === true);
check("isDefSide(def) still true", S.isDefSide("def") === true);

function offRow(partial) {
  return Object.assign(
    {
      id: partial.id || "r" + Math.random().toString(16).slice(2),
      opponent: OPP,
      side: "off",
      play: "Inside Zone",
      formation: "2x2 Doubles Gun",
      playType: "Run",
      direction: "R",
      gap: "B",
      down: 1,
      distance: 10,
      hash: "L",
      fieldZone: "PLUS",
      gain: 4,
      success: 1,
    },
    partial
  );
}

const offCorpus = [
  offRow({ id: "o1" }),
  offRow({ id: "o2", play: "Stick", formation: "Trips Rt Gun" }),
  offRow({ id: "o3", play: "Power" }),
];
const defCorpus = [
  offRow({ id: "d1", side: "def", front: "4-3", coverage: "Cover 3", play: "" }),
  offRow({ id: "d2", side: "def", front: "3-4", coverage: "Cover 1", play: "" }),
];
const oursPoison = [
  offRow({ id: "ours1", side: "ours", play: "DINO", formation: "Trey" }),
  offRow({ id: "ours2", side: "ours", play: "MEMPHIS", formation: "Bunch Dart" }),
  offRow({ id: "ours3", side: "ours", play: "TANK", formation: "Tank Wing" }),
];

const mixedOff = offCorpus.concat(oursPoison);
const mixedDef = defCorpus.concat(oursPoison);

const filteredOff = S.filterOffRows(mixedOff, OPP);
check(
  "filterOffRows drops every ours row",
  filteredOff.length === offCorpus.length && filteredOff.every(function (r) { return r.side === "off"; }),
  "n=" + filteredOff.length
);
check(
  "filterRows(def) drops every ours row",
  S.filterRows(mixedDef, OPP, "def").every(function (r) { return r.side === "def"; }) &&
    S.filterRows(mixedDef, OPP, "def").length === defCorpus.length
);

S.clearCache();
const recOff0 = S.reconcile(offCorpus, OPP, "off");
const recOff1 = S.reconcile(mixedOff, OPP, "off");
check(
  "reconcile(off) sumN unchanged after ours rows",
  recOff1.sumN === recOff0.sumN && recOff1.verifiedOffRows === recOff0.verifiedOffRows,
  JSON.stringify({ before: recOff0.sumN, after: recOff1.sumN })
);

S.clearCache();
const recDef0 = S.reconcile(defCorpus, OPP, "def");
const recDef1 = S.reconcile(mixedDef, OPP, "def");
check(
  "reconcile(def) sumN unchanged after ours rows",
  recDef1.sumN === recDef0.sumN && recDef1.verifiedRows === recDef0.verifiedRows,
  JSON.stringify({ before: recDef0.sumN, after: recDef1.sumN })
);

if (fails) {
  console.error(fails + " failed");
  process.exit(1);
}
console.log("smoke-ours-side-isolation: all ok");
