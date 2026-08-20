/**
 * Slice B: motion name, MOT ADJ, FORM TAG / GAP / PASS ZONE, Assist typed writes,
 * opponent formation inventory (exact tag, no guess).
 *   node scripts/smoke-import-fidelity-b.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "OFFGRD.html"), "utf8");
const assistSrc = fs.readFileSync(path.join(ROOT, "OFFGRD-assist-import.js"), "utf8");

function grab(name) {
  const re = new RegExp("(?:async )?function " + name + "\\([\\s\\S]*?\\n\\}");
  const m = html.match(re);
  if (!m) throw new Error("missing " + name);
  return m[0];
}

const sandbox = {
  window: {},
  globalThis: {},
  console: console,
  ALIASES: null,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const aliases = (html.match(/const ALIASES=\{[\s\S]*?\n\};/) || [])[0] || "";
const helpers =
  grab("splitCSVLine") +
  "\n" +
  grab("isCanonicalCoverage") +
  "\n" +
  grab("normCoverage") +
  "\n" +
  grab("coverageParts") +
  "\n" +
  grab("zoneFromYardLine") +
  "\n" +
  grab("normPlayType") +
  "\n" +
  (html.match(/function normalizeDefFront\([\s\S]*?\nfunction /) || [""])[0].replace(/\nfunction $/, "\n");

vm.runInNewContext(
  aliases +
    "\nthis.ALIASES=ALIASES;\n" +
    helpers +
    "\n" +
    grab("parseCSV") +
    "\n" +
    grab("parseScout") +
    "\nthis.parseCSV=parseCSV;this.parseScout=parseScout;this.ALIASES=ALIASES;",
  sandbox
);

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

check("MOT ADJ aliased", /defense_response:\["mot adj"/.test(aliases));
check("FORM TAG aliased", /formTag:\["form tag"/.test(aliases));
check("GAP aliased", /gap:\["gap"\]/.test(aliases));
check("PASS ZONE aliased", /passZone:\["pass zone"/.test(aliases));

const scoutCsv = [
  "PLAY TYPE,MOTION DIR,MOT ADJ,FORM TAG,GAP,PASS ZONE,ODK,FORMATION",
  "Pass,H ACROSS,PASS OFF TO OLB,TIGHT,A,CURL,D,BLUE 33",
  "Run,none,,,B,,D,2",
].join("\n");
const scout = sandbox.parseScout(scoutCsv, "D");
check("scout keeps motion name", !!(scout[0] && scout[0].motion === 1 && scout[0].motionType === "H ACROSS"));
check("scout presence still 0/1", scout[1] && scout[1].motion === 0 && scout[1].motionType === "");
check("scout stores MOT ADJ", scout[0] && scout[0].defense_response === "PASS OFF TO OLB");
check("scout stores FORM TAG", scout[0] && scout[0].formTag === "TIGHT");
check("scout stores GAP + PASS ZONE", scout[0] && scout[0].gap === "A" && scout[0].passZone === "CURL");

const defCsv = [
  "ODK,COVERAGE,FRONT,MOT ADJ,FORM TAG,GAP,PASS ZONE,FORMATION",
  "O,Cover 3,4-3,MAN FOLLOW,FLEXED H,B,HOOK,RED 40",
].join("\n");
const def = sandbox.parseCSV(defCsv);
check("parseCSV stores MOT ADJ", !!(def[0] && def[0].defense_response === "MAN FOLLOW"));
check("parseCSV stores FORM TAG", def[0] && def[0].formTag === "FLEXED H");
check("parseCSV stores GAP + PASS ZONE", def[0] && def[0].gap === "B" && def[0].passZone === "HOOK");

const assistBox = { window: {}, globalThis: {}, console: console };
assistBox.window = assistBox;
assistBox.globalThis = assistBox;
assistBox.OFFGRD_CALLER_OUTCOME = { isSuccessVal: function () { return 0; } };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "OFFGRD-caller-outcome.js"), "utf8"), assistBox);
vm.runInNewContext(assistSrc, assistBox);
const A = assistBox.OFFGRD_ASSIST_IMPORT;
const parsed = A.parseText(
  [
    "Play #,QTR,Result,Play Dir,Gap,Pass Zone,MOT ADJ,FORM TAG,Motion Dir,ODK,Off Form,Play Type",
    "12,2,Complete,R,A,CURL,WIDEN OLB,STACK,S JET,D,BUNCH RED,Pass",
  ].join("\n")
);
const map = {
  play_index: "Play #",
  qtr: "QTR",
  result: "Result",
  play_dir: "Play Dir",
  gap: "Gap",
  pass_zone: "Pass Zone",
  defense_response: "MOT ADJ",
  form_tag: "FORM TAG",
  motion: "Motion Dir",
  odk: "ODK",
  formation: "Off Form",
  play_type: "Play Type",
};
const built = A.buildSnaps(parsed, map, { side: "off", odkKeep: "D", teamId: "t" });
const snap = built.snaps[0];
check("Assist typed qtr", snap && String(snap.qtr) === "2");
check("Assist typed result", snap && snap.result === "Complete");
check("Assist typed play_dir", snap && snap.play_dir === "R");
check("Assist typed gap", snap && snap.gap === "A");
check("Assist typed pass_zone", snap && snap.pass_zone === "CURL");
check("Assist typed play_index", snap && snap.play_index === 12);
check("Assist typed defense_response", snap && snap.defense_response === "WIDEN OLB");
check("Assist keeps motion name", snap && snap.motion_type === "S JET");
check("payload writes typed fields", /play_dir: snap\.play_dir/.test(assistSrc) && /defense_response: snap\.defense_response/.test(assistSrc));
check("series/efficiency stay off typed write", !/series: snap\.series/.test(assistSrc));

const mapBox = { window: {}, globalThis: {}, console: console, localStorage: { getItem: function () { return null; }, setItem: function () {} } };
mapBox.window = mapBox;
mapBox.globalThis = mapBox;
mapBox.window.localStorage = mapBox.localStorage;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "OFFGRD-formations-data.js"), "utf8"), mapBox);
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "OFFGRD-formation-canon.js"), "utf8"), mapBox);
vm.runInNewContext(assistSrc, mapBox);
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "OFFGRD-formation-map.js"), "utf8"), mapBox);
const M = mapBox.OFFGRD_FORMATION_MAP;
const exportTags = [
  { formation: "BLUE 33" },
  { formation: "RED 40" },
  { formation: "BUNCH RED" },
  { formation: "3 RED EMPTY" },
  { formation: "STRONG RED 5" },
];
for (let i = 0; i < 31; i++) exportTags.push({ formation: "2" });
M.setCache("t", []);
const paint = M.panelPaint(exportTags, { fetched: [], hydrating: false });
const names = (paint.inv.unmapped.concat(paint.inv.mapped).concat(paint.inv.auto)).map(function (i) { return i.raw; });
const two = paint.inv.unmapped.filter(function (i) { return i.raw === "2"; })[0];
check("export B tags surface for mapping", ["BLUE 33", "RED 40", "BUNCH RED", "3 RED EMPTY", "STRONG RED 5"].every(function (t) { return names.indexOf(t) >= 0; }));
check("bare 2 is unmapped, not guessed", !!(two && two.n === 31 && !two.auto && !two.suggested));
check("resolver does not contains-match 2 to 2x2", M.resolveMapped("2", "off") == null && M.normalizeOffStructure("2") == null);
check("panel sections opponent offense", /Opponent offense/.test(html) && /formationRowsForSide\("off"\)/.test(html));
check("SQL migration written, not applied", fs.existsSync(path.join(ROOT, "docs/security/apply-scout-snaps-slice-b-typed.sql")));

if (fails) {
  console.error(fails + " FAIL");
  process.exit(1);
}
console.log("ok  smoke-import-fidelity-b");
