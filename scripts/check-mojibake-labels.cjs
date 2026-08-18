/**
 * Fail loud if Play / TAP / Show glyphs re-mangle to ASCII "?".
 *   node scripts/check-mojibake-labels.cjs
 *
 * Targeted UI-label casualties only — not a blind whole-file mojibake pass.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const FILES = [
  "OFFGRD-Playbook.html",
  "OFFGRD.html",
  "OFFGRD-QB.html",
  "index.html"
];
const PATTERNS = [
  [/\? Play\s*</, "? Play"],
  [/Show \?/, "Show ?"],
  [/Hide \?/, "Hide ?"],
  [/\? [Tt]ap a player/, "? TAP / tap"],
  [/Quick routes \?/, "Quick routes ?"],
  [/Concepts \?/, "Concepts ?"],
  [/Run blocks \?/, "Run blocks ?"]
];

let fails = 0;
FILES.forEach(function (rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return;
  const s = fs.readFileSync(p, "utf8");
  PATTERNS.forEach(function (pair) {
    if (pair[0].test(s)) {
      fails += 1;
      console.error("FAIL " + rel + ": " + pair[1]);
    }
  });
});

if (fails) {
  console.error(fails + " mojibake-label FAIL");
  process.exit(1);
}
console.log("ok  check-mojibake-labels");
