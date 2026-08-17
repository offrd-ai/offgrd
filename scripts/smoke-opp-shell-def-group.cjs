/**
 * Smoke: defensive opponent-card grouping + Parkway-shaped marginals.
 * Usage: node scripts/smoke-opp-shell-def-group.cjs
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sandbox = { window: {}, globalThis: {}, console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "OFFGRD-opp-shells.js"), "utf8"), sandbox);
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

function row(partial, i) {
  return Object.assign(
    {
      id: "pn-" + i,
      opponent: OPP,
      side: "def",
      front: "4-3",
      coverage: "Cover 4",
      pressure: 0,
      blitz: "",
      down: 1,
      distance: 10,
      hash: "R",
      fieldZone: "PLUS",
    },
    partial
  );
}

/* 48 defensive snaps. 4-3 = 31/48 ≈ 64.6%. Cover 4 = 25/48 ≈ 52%. */
const snaps = [];
let i = 0;
function add(n, partial) {
  for (let k = 0; k < n; k++) snaps.push(row(partial, i++));
}
add(12, { front: "4-3", coverage: "Cover 4", pressure: 0 });
add(5, { front: "4-3", coverage: "Cover 4", pressure: 1, blitz: "" });
add(3, { front: "4-3", coverage: "Cover 4", pressure: 1, blitz: "MIKE A" });
add(11, { front: "4-3", coverage: "Cover 3" });
add(5, { front: "Nickel", coverage: "Cover 4" });
add(5, { front: "Nickel", coverage: "Cover 1" });
add(4, { front: "3-4", coverage: "Cover 3" });
add(3, { front: "3-4", coverage: "Cover 1" });
/* noise: offense + other opponent must not enter def groups */
snaps.push(row({ id: "off-noise", side: "off", play: "Inside Zone" }, "off"));
snaps.push(row({ id: "other-opp", opponent: "Southwest Longhorns", front: "4-3", coverage: "Cover 4" }, "sw"));

function fieldDist(rows, field) {
  const tally = {};
  let tot = 0;
  rows.forEach((r) => {
    const k = r[field];
    if (k == null || k === "" || k === "—") return;
    tally[k] = (tally[k] || 0) + 1;
    tot += 1;
  });
  return { tally: tally, tot: tot, pct: (k) => (tot ? (tally[k] || 0) / tot : 0) };
}

S.clearCache();
const scoped = S.filterRows(snaps, OPP, "def");
check("48 verified def rows", scoped.length === 48, scoped.length);
const rec = S.reconcile(snaps, OPP, "def");
check("reconcile ok", rec.ok && rec.side === "def");
check("sumN === verified def rows", rec.sumN === rec.verifiedRows && rec.verifiedRows === 48, JSON.stringify({ sumN: rec.sumN, n: rec.verifiedRows, missing: rec.missing }));

const fronts = fieldDist(scoped, "front");
const covs = fieldDist(scoped, "coverage");
const front43 = Math.round(fronts.pct("4-3") * 100);
const cov4 = Math.round(covs.pct("Cover 4") * 100);
check("Tendencies-style 4-3 ≈ 64%", Math.abs(front43 - 64) <= 2, front43 + "%");
check("Tendencies-style Cover 4 ≈ 51%", Math.abs(cov4 - 51) <= 2, cov4 + "%");

const grouped = S.groupRows(snaps, OPP, "def");
const byKey = {};
grouped.groups.forEach((g) => { byKey[g.shellKey] = g; });
const base = grouped.groups.find((g) => g.shellKey === "def:4-3|cover 4");
const mike = grouped.groups.find((g) => g.shellKey === "def:4-3|cover 4|mike a");
check("bare pressure does not fork a card", !!(base && base.n === 17), base && base.n);
check("charted MIKE A forks a card", !!(mike && mike.n === 3), mike && mike.n);
check("pressure rate on 4-3 Cover 4", !!(base && Math.abs(base.pressureRate - 5 / 17) < 0.001), base && base.pressureRate);
check("shellKey is namespaced def:", grouped.groups.every((g) => String(g.shellKey).indexOf("def:") === 0));
check("off default still excludes these def rows", S.groupRows(snaps, OPP).total === 1);

const offRec = S.reconcile(snaps, OPP, "off");
check("reconcile(off) does not swallow def rows", offRec.ok && offRec.verifiedRows === 1);

if (fails) {
  console.error(fails + " failed");
  process.exit(1);
}
console.log("smoke-opp-shell-def-group: all ok");
