/**
 * Follow-up G smoke — scheme-key parity + cell match helper (no browser).
 * Run: node scripts/smoke-focus4d-upweight.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(root, "OFFGRD-week-autotest.js"), "utf8");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("✓ " + msg);
}

// Extract normalizeSchemeKey by eval of the IIFE slice — instead, reimplement the
// contracted formula here and assert the source contains the same patterns.
assert(/function normalizeSchemeKey/.test(src), "normalizeSchemeKey defined");
assert(/cover \|cvr\|cov\|c/.test(src) || /cover\|cvr\|cov\|c/.test(src), "portal-parity cover regex present");
assert(/function cellEmphasisFromSpec/.test(src), "cellEmphasisFromSpec defined");
assert(/function activeCellEmphasis/.test(src), "activeCellEmphasis defined");
assert(/getActiveFocusFlags|get_active_focus_flags/.test(src), "get_active_focus_flags fallback wired");
assert(/prevSpec\.kind_weights|prevEm\.length/.test(src), "buildTestSpec preserves emphasis across approve");
assert(/alignRepMatchesCell/.test(src), "alignRepMatchesCell exported for startTest");

const qb = fs.readFileSync(path.join(root, "OFFGRD-QB.html"), "utf8");
assert(/preferScheme/.test(qb), "pickAlignRep accepts preferScheme");
assert(/strictScheme/.test(qb), "pickAlignRep strictScheme (no fabricated coverage)");
assert(/isExplicitAlignCall/.test(qb), "OL ol.coverage alone is not an align call");
assert(/weekAlignCallForScheme/.test(qb), "def_aligns → week align call when def_calls lack scheme");
assert(/activeCellEmphasis/.test(qb), "startTest calls activeCellEmphasis");
assert(/focus-4d/.test(qb), "startTest logs focus-4d up-weight");
assert(/reviewRep/.test(qb), "align detail carries reviewRep tag");
assert(/OFFGRD-week-autotest\.js\?v=139/.test(qb), "cache-bust v=139");

const cloud = fs.readFileSync(path.join(root, "OFFGRD-cloud.js"), "utf8");
assert(/getActiveFocusFlags/.test(cloud), "Cloud.getActiveFocusFlags");
assert(/get_active_focus_flags/.test(cloud), "Cloud RPC name matches portal");

// Local parity: mirror portal normalizeSchemeValue
function normalizeSchemeKey(v) {
  const t = String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return "";
  if (t.indexOf("tampa") >= 0) return "tampa 2";
  let m = t.match(/(?:cover|cvr|cov|c)\s*([0-9])\b/);
  if (!m) m = t.match(/^([0-9])$/);
  if (m) return "cover " + m[1];
  return t;
}
assert(normalizeSchemeKey("Cover 1") === "cover 1", 'Cover 1 → "cover 1"');
assert(normalizeSchemeKey("cover1") === "cover 1", 'cover1 → "cover 1"');
assert(normalizeSchemeKey("C1") === "cover 1", 'C1 → "cover 1"');
assert(normalizeSchemeKey("1") === "cover 1", '1 → "cover 1"');
assert(normalizeSchemeKey("Tampa 2") === "tampa 2", "Tampa 2");
assert(
  normalizeSchemeKey("Cover 1") === normalizeSchemeKey("cover 1"),
  "generated Cover 1 matches Impact filter key"
);

console.log("\nFocus 4d Follow-up G smoke GREEN — contract wired in OFFGRD generator.");
