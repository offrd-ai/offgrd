/**
 * Fail loud if Play / TAP / Show glyphs re-mangle to ASCII "?",
 * plus the v292 class: A?Z and placeholder/label strings ending in "?"
 * that are not genuine questions, and the v295 class: label text
 * STARTING with "? " (eaten leading glyph — the trailing-? grep misses these).
 *   node scripts/check-mojibake-labels.cjs
 *
 * Targeted UI-label casualties only — not a blind whole-file mojibake pass.
 *
 * Also the v313 class: UTF-8 read as Latin-1 / cp1252
 *   â€  (U+00E2 U+20AC)  curly quotes, dashes, ellipsis
 *   â†  (U+00E2 U+2020)  arrows  ↑↓→←
 *   â–  (U+00E2 U+2013)  ▶ / geometric
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const FILES = [
  "OFFGRD-Playbook.html",
  "OFFGRD.html",
  "OFFGRD-QB.html",
  "index.html",
  "OFFGRD-account.js",
  "OFFGRD-auth.js",
  "OFFGRD-dcaller.js",
  "OFFGRD-dcaller-perspective.js",
  "OFFGRD-dcaller-expect.js",
  "OFFGRD-redesign.js"
];
const PATTERNS = [
  [/\? Play\s*</, "? Play"],
  [/Show \?/, "Show ?"],
  [/Hide \?/, "Hide ?"],
  [/\? [Tt]ap a player/, "? TAP / tap"],
  [/Quick routes \?/, "Quick routes ?"],
  [/Concepts \?/, "Concepts ?"],
  [/Run blocks \?/, "Run blocks ?"],
  [/\? this week/, "? this week"],
  [/\? Plan this week/, "? Plan this week"],
  [/A\?Z/, "A?Z"],
  [/\u00e2\u20ac/, "â€ (UTF-8 punctuation read as Latin-1)"],
  [/\u00e2\u2020/, "â† (UTF-8 arrow read as Latin-1)"],
  [/\u00e2\u2013/, "â– (UTF-8 triangle read as Latin-1)"]
];

(function assertDoubleEncGate() {
  const arrow = "Sync \u00e2\u2020\u2018";
  const quote = "\u00e2\u20ac\u0153Join";
  const tri = "\u00e2\u2013\u00b6 Snap";
  if (!PATTERNS[PATTERNS.length - 2][0].test(arrow)) {
    throw new Error("double-enc gate missed â†");
  }
  if (!PATTERNS[PATTERNS.length - 3][0].test(quote)) {
    throw new Error("double-enc gate missed â€");
  }
  if (!PATTERNS[PATTERNS.length - 1][0].test(tri)) {
    throw new Error("double-enc gate missed â–");
  }
})();

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

/** Out of v295 schedule-panel scope — same casualty, later pass. */
const LEADING_ALLOW = [
  /^\? few$/i,
  /^\? no reps vs this look$/i
];

function isAllowedLeading(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (isAllowedQuestion(t)) return true;
  return LEADING_ALLOW.some(function (re) { return re.test(t); });
}

function looksLikeLeadingGlyphLabel(text) {
  const t = String(text || "").trim();
  if (!/^\?\s+\S/.test(t)) return false;
  if (t.length > 40) return false;
  if (/[.]/.test(t)) return false;
  if (/^\?\s+(The|It|This|If|A |An )/i.test(t)) return false;
  if (/\$\{|\+'|\+"/.test(t)) return false;
  return true;
}

function collectLeadingQuestionLabels(src) {
  const hits = [];
  const add = function (kind, raw) {
    const text = decodeLite(raw).trim();
    if (!looksLikeLeadingGlyphLabel(text)) return;
    if (isAllowedLeading(text)) return;
    hits.push({ kind: kind, text: text });
  };
  let m;
  const htmlText = />(\?\s[^<]{1,80})</g;
  while ((m = htmlText.exec(src))) add("html-text", m[1]);
  const quoted = /(["'`])(\?\s[^"'`]{1,80})\1/g;
  while ((m = quoted.exec(src))) add("quoted", m[2]);
  return hits;
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
  collectLeadingQuestionLabels(s).forEach(function (h) {
    fails += 1;
    console.error("FAIL " + rel + ": " + h.kind + " starts with ? — " + JSON.stringify(h.text));
  });
});

if (fails) {
  console.error(fails + " mojibake-label FAIL");
  process.exit(1);
}
console.log("ok  check-mojibake-labels");
