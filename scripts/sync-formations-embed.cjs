/**
 * Sync formations.v1.json → OFFGRD-formations-data.js (browser embed).
 * Run after editing the JSON seed. Smoke test fails if out of sync.
 *
 *   node scripts/sync-formations-embed.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const jsonPath = path.join(root, "formations", "formations.v1.json");
const outA = path.join(root, "OFFGRD-formations-data.js");
const outB = path.join(root, "offgrd-web", "OFFGRD-formations-data.js");

const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
if (data.version !== 1 || !Array.isArray(data.formations)) {
  throw new Error("invalid formations.v1.json");
}

const body =
  "/** AUTO-GENERATED from formations/formations.v1.json — do not edit by hand.\n" +
  " *  Regenerate: node scripts/sync-formations-embed.cjs\n" +
  " */\n" +
  "(function (root) {\n" +
  "  var data = " +
  JSON.stringify(data) +
  ";\n" +
  "  if (typeof module !== 'undefined' && module.exports) module.exports = data;\n" +
  "  if (root) root.OFFGRD_FORMATIONS_V1 = data;\n" +
  "})(typeof globalThis !== 'undefined' ? globalThis : this);\n";

fs.writeFileSync(outA, body);
// offrd-ai/offgrd is flat (no offgrd-web/); only mirror-write when the dir exists.
if (fs.existsSync(path.join(root, "offgrd-web"))) fs.writeFileSync(outB, body);
console.log("Synced", data.formations.length, "formations → OFFGRD-formations-data.js");
