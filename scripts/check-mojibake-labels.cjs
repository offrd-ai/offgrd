/**
 * Fail loud if Play / TAP / Show glyphs re-mangle to ASCII "?",
 * plus the v292 class: A?Z and placeholder/label strings ending in "?"
 * that are not genuine questions.
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
  [/Run blocks \?/, "Run blocks ?"],
  [/A\?Z/, "A?Z"]
];

/** Real questions — do not treat a trailing "?" as an eaten ellipsis. */
const QUESTION_ALLOW = [
  /what's your assignment\?$/i,
  /^where'?s the throw/i,
  /what's beating us\?/i,
  /ask booth a question/i,
  /is the 3-pay/i,
  /^per-seat\?$/i,
  /do we need to leave hudl\?/i,
  /what happens after the season\?/i,
  /what happens when the trial ends\?/i,
  /does it replace hudl\?/i,
  /does it really work without internet\?/i,
  /can i call defense with it too\?/i,
  /what does the in-game ai actually do\?/i,
  /who owns the playbook\?/i,
  /how do players join\?/i,
  /what does the coach have to build/i,
  /load .+\? this replaces/i,
  /clear the field\?$/i,
  /delete this play\?$/i
];

function isAllowedQuestion(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  return QUESTION_ALLOW.some(function (re) { return re.test(t); });
}

function decodeLite(s) {
  return String(s || "")
    .replace(/&hellip;/g, "\u2026")
    .replace(/&ndash;/g, "\u2013")
    .replace(/\\u2026/g, "\u2026")
    .replace(/\\u2013/g, "\u2013");
}

function collectTrailingQuestionLabels(src) {
  const hits = [];
  const add = function (kind, raw) {
    const text = decodeLite(raw);
    if (/\$\{/.test(text)) return;
    if (!/\?\s*$/.test(text)) return;
    if (isAllowedQuestion(text)) return;
    hits.push({ kind: kind, text: text });
  };
  let m;
  const phAttr = /placeholder\s*=\s*(["'])([^"']*)\1/gi;
  while ((m = phAttr.exec(src))) add("placeholder", m[2]);
  const phJs = /\.placeholder\s*=\s*(?:[^=\n]*?\|\|)?\s*(["'])([^"']*)\1/g;
  while ((m = phJs.exec(src))) add("placeholder-js", m[2]);
  const opt = /<option\b[^>]*>([^<]*)<\/option>/gi;
  while ((m = opt.exec(src))) add("option", m[1]);
  return hits;
}

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
  collectTrailingQuestionLabels(s).forEach(function (h) {
    fails += 1;
    console.error("FAIL " + rel + ": " + h.kind + " ends with ? — " + JSON.stringify(h.text));
  });
});

if (fails) {
  console.error(fails + " mojibake-label FAIL");
  process.exit(1);
}
console.log("ok  check-mojibake-labels");
