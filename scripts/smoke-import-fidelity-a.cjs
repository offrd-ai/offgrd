/**
 * Slice A: STUNT ≠ BLITZ, PRESNAP SAFETIES stored, coverage modifiers kept.
 *   node scripts/smoke-import-fidelity-a.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "OFFGRD.html"), "utf8");

function grab(name) {
  const re = new RegExp("function " + name + "\\([\\s\\S]*?\\n\\}");
  const m = html.match(re);
  if (!m) throw new Error("missing " + name);
  return m[0];
}

const sandbox = { window: {}, globalThis: {}, console: console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(
  grab("isCanonicalCoverage") + "\n" + grab("normCoverage") + "\n" + grab("coverageParts"),
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

const aliases = (html.match(/const ALIASES=\{[\s\S]*?\n\};/) || [])[0] || "";
check("stunt is not a blitz alias", /blitz:\[[^\]]*\]/.test(aliases) && !/blitz:\[[^\]]*\"stunt\"/.test(aliases));
check("stunt has its own alias list", /stunt:\["stunt"/.test(aliases));
check("presnap safeties aliased", /presnapSafeties:\["presnap safeties"/.test(aliases));
check("parseCSV writes stunt + presnapSafeties", /stunt:at\(c,"stunt"\)/.test(html) && /presnapSafeties:at\(c,"presnapSafeties"\)/.test(html));
check("combined BLITZ/STUNT still maps to blitz", /"blitz\/stunt"/.test(aliases));

const traces = [
  ["4 PRESS", "Cover 4", "PRESS"],
  ["3 CLOUD", "Cover 3", "CLOUD"],
  ["3 SKY", "Cover 3", "SKY"],
  ["2 MAN", "2-man", ""],
  ["SOFT 0", "Cover 0", "SOFT"],
  ["JACK / SOLO", "JACK / SOLO", ""],
  ["PREVENT", "PREVENT", ""],
];
traces.forEach(function (row) {
  const got = sandbox.coverageParts(row[0]);
  check(
    "coverage " + row[0],
    got.coverage === row[1] && got.coverageMod === row[2] && got.coverageRaw === row[0],
    JSON.stringify(got)
  );
});

const ours = (html.match(/function parseOffense\(text\)\{[\s\S]*?\nfunction /) || [])[0] || "";
check("ours stores coverageRaw + coverageMod", /coverageRaw:covParts\.coverageRaw/.test(ours) && /coverageMod:covParts\.coverageMod/.test(ours));

if (fails) {
  console.error(fails + " FAIL");
  process.exit(1);
}
console.log("ok  smoke-import-fidelity-a");
