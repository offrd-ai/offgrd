/**
 * Smoke: opponent scout-card grouping (no UI, no network).
 * Usage: node scripts/smoke-opp-shell-group.cjs
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(
  path.join(__dirname, "..", "OFFGRD-opp-shells.js"),
  "utf8"
);
const sandbox = { window: {}, globalThis: {}, console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(src, sandbox);
const S = sandbox.OFFGRD_OPP_SHELLS;
if (!S) {
  console.error("FAIL load: OFFGRD_OPP_SHELLS missing");
  process.exit(1);
}

const OPP = "Southwest Longhorns";

function row(partial) {
  return Object.assign(
    {
      id: partial.id || "r" + Math.random().toString(16).slice(2),
      opponent: OPP,
      side: "off",
      play: "",
      formation: "2x2 Doubles Gun",
      offBackfield: "Gun 1",
      offBackCount: 1,
      offStrength: "right",
      playType: "Run",
      direction: "R",
      gap: "B",
      passZone: "",
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

/* Demo-shaped corpus: named play + two signatures (2x2 / Trips), plus noise. */
const rows = [
  row({ id: "iz1", play: "Inside Zone", down: 1, distance: 10, hash: "L", gain: 5 }),
  row({ id: "iz2", play: "Inside Zone", formation: "Trips Rt Gun", down: 2, distance: 7, hash: "R", gain: 3 }),
  row({ id: "iz3", play: "Inside Zone", down: 3, distance: 4, hash: "M", fieldZone: "REDZONE", gain: 2 }),
  row({ id: "iz4", play: "Inside Zone", down: 1, distance: 10, hash: "L", gain: 6 }),
  row({
    id: "sig-run-1",
    play: "",
    formation: "2x2 Doubles Gun",
    playType: "Run",
    direction: "R",
    gap: "B",
    down: 1,
    distance: 10,
    hash: "R",
    gain: 4,
  }),
  row({
    id: "sig-run-2",
    play: "n/a",
    formation: "2x2 Doubles Gun",
    playType: "run",
    direction: "R",
    gap: "B",
    down: 2,
    distance: 5,
    hash: "R",
    gain: 8,
  }),
  row({
    id: "sig-pass-1",
    play: "",
    formation: "Trips Rt Gun",
    playType: "Pass",
    direction: "R",
    gap: "",
    passZone: "curl",
    down: 3,
    distance: 8,
    hash: "L",
    fieldZone: "PLUS",
    gain: 12,
  }),
  row({
    id: "sig-pass-2",
    play: "",
    formation: "Trips Rt Gun",
    playType: "Pass",
    direction: "R",
    gap: "",
    passZone: "Curl",
    down: 3,
    distance: 7,
    hash: "M",
    fieldZone: "REDZONE",
    gain: 0,
    success: 0,
  }),
  row({
    id: "thin-1",
    play: "",
    formation: "2x2 Doubles Gun",
    playType: "Run",
    direction: "L",
    gap: "A",
    down: 4,
    distance: 1,
    hash: "L",
    gain: 1,
  }),
  row({ id: "def-noise", side: "def", play: "Inside Zone", formation: "4-3" }),
  row({ id: "other-opp", opponent: "Parkway North", play: "Inside Zone" }),
];

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

S.clearCache();
const out = S.groupRows(rows, OPP);
check("opponent name", out.opponent === OPP);
check("excludes def + other opp", out.total === 9, "total=" + out.total);
check("group count", out.groups.length === 5, "n=" + out.groups.length);

const byKey = {};
out.groups.forEach(function (g) {
  byKey[g.shellKey] = g;
});
const named2x2 = byKey["play:inside zone|2x2 doubles gun"];
const namedTrips = byKey["play:inside zone|trips rt gun"];
check(
  "same named play from two formations → two groups",
  !!(named2x2 && namedTrips && named2x2.n === 3 && namedTrips.n === 1),
  named2x2 && namedTrips && named2x2.n + "/" + namedTrips.n
);
check("named kind", named2x2 && named2x2.groupKind === "play");
const izRollup = (out.rollups || []).find(function (r) {
  return r.rollupKey === "play:inside zone";
});
check(
  "shared rollup label",
  !!(izRollup && izRollup.lookCount === 2 && izRollup.n === 4 && izRollup.label === "Inside Zone · 2 looks"),
  izRollup && JSON.stringify(izRollup)
);
check("both groups share rollup label", named2x2 && namedTrips && named2x2.rollupLabel === "Inside Zone · 2 looks" && namedTrips.rollupLabel === named2x2.rollupLabel);

const runSig = out.groups.find(function (g) {
  return g.groupKind === "signature" && g.playType === "run" && g.gap === "B";
});
check("2x2 run signature n=2", !!(runSig && runSig.n === 2), runSig && runSig.n);
check(
  "run signature key uses gap not pass zone",
  !!(runSig && /\|b$/.test(runSig.shellKey)),
  runSig && runSig.shellKey
);

const passSig = out.groups.find(function (g) {
  return g.groupKind === "signature" && g.playType === "pass";
});
check("trips pass signature n=2", !!(passSig && passSig.n === 2), passSig && passSig.n);
check(
  "pass signature key uses pass zone",
  !!(passSig && /curl$/.test(passSig.shellKey)),
  passSig && passSig.shellKey
);

const thin = out.groups.find(function (g) {
  return g.n === 1 && g.gap === "A";
});
check("thin flag at n<3", !!(thin && thin.thin === true));
check("named 2x2 not thin", named2x2 && named2x2.thin === false);
check("named trips thin (n=1)", namedTrips && namedTrips.thin === true);

check("hash split on named 2x2", named2x2 && named2x2.hashSplit.L === 2 && named2x2.hashSplit.M === 1);
check("down dist on named 2x2", named2x2 && named2x2.downDist["1"] === 2 && named2x2.downDist["3"] === 1);
check("dd dist 1st & 10+", named2x2 && named2x2.ddDist["1st & 10+"] === 2, named2x2 && JSON.stringify(named2x2.ddDist));
check("avg gain named 2x2", named2x2 && named2x2.avgGain === 4.3);
check("success rate pass", passSig && passSig.successRate === 0.5);

check("sorted by n desc", out.groups[0].n >= out.groups[1].n);

const cached = S.groupsFor(rows, OPP);
check("session cache hit", cached === out);
S.clearCache();
const again = S.groupsFor(rows, OPP);
check("cache clear recomputes", again !== out && again.total === out.total);

check("empty opponent → no groups", S.groupRows(rows, "").groups.length === 0);
const rec = S.reconcile(rows, OPP);
check(
  "reconcile sumN === verified off rows",
  rec.ok && rec.sumN === rec.verifiedOffRows && rec.verifiedOffRows === 9,
  JSON.stringify({ sumN: rec.sumN, verifiedOffRows: rec.verifiedOffRows, missing: rec.missing, dups: rec.duplicateIds })
);
check("shellKeyOf named includes formation", S.shellKeyOf(rows[0]) === "play:inside zone|2x2 doubles gun");

const seedCsv = path.join(
  "D:",
  "mattb",
  "Claude Cowork OFFGRD",
  "offgrd-web",
  "testplaylogs",
  "PlaylistData_2026-07-01 (3).csv"
);
if (fs.existsSync(seedCsv)) {
  console.log("ok  southwest/parkway csv present (grouping smoke uses fixture; render check is commit 2)");
} else {
  console.log("skip seed csv not on disk — fixture covers Southwest-shaped 2x2 / Trips");
}

/* Lift off_strength / backfield / pass_zone the same way gap / play dir already are. */
const cloudSrc = fs
  .readFileSync(path.join(__dirname, "..", "OFFGRD-cloud.js"), "utf8")
  .replace(/^export const Cloud/m, "const Cloud");
const cloudBox = {
  window: { supabase: null, OFFGRD_CONFIG: {}, __OFFRD_SUPABASE__: null },
  console,
};
cloudBox.window = Object.assign(cloudBox.window, cloudBox);
vm.runInNewContext(cloudSrc + "\nthis.Cloud = Cloud;", cloudBox);
const Cloud = cloudBox.Cloud || cloudBox.window.Cloud;
if (!Cloud || !Cloud.scoutSnapToRow) {
  fails += 1;
  console.error("FAIL load Cloud.scoutSnapToRow");
} else {
  const lifted = Cloud.scoutSnapToRow({
    id: "snap1",
    opponent: OPP,
    side: "off",
    play: "Power",
    play_type: "Run",
    formation: "2x2 Doubles Gun",
    off_strength: "Rt",
    off_back_count: 1,
    off_structure: "2x2",
    raw: {
      "Play Dir": "R",
      Gap: "C",
      "Off Str": "Right",
      Backfield: "Gun 1",
      "Pass Zone": "flat",
    },
  });
  check("hydrate offStrength from column", lifted.offStrength === "right", lifted.offStrength);
  check("hydrate offBackCount from column", lifted.offBackCount === 1, lifted.offBackCount);
  check("hydrate gap from raw", lifted.gap === "C", lifted.gap);
  check("hydrate direction from raw", lifted.direction === "R", lifted.direction);
  const fromRaw = Cloud.scoutSnapToRow({
    opponent: OPP,
    side: "off",
    raw: {
      "Off Strength": "field",
      Backfield: "empty",
      "Pass Zone": "smash",
      "_off_backfield": "Empty",
    },
  });
  check("hydrate offStrength from raw", fromRaw.offStrength === "field", fromRaw.offStrength);
  check("hydrate back count from _off_backfield", fromRaw.offBackCount === 0, fromRaw.offBackCount);
  check("hydrate passZone from raw", fromRaw.passZone === "smash", fromRaw.passZone);
}

if (fails) {
  console.error(fails + " failed");
  process.exit(1);
}
console.log("smoke-opp-shell-group: all ok");
