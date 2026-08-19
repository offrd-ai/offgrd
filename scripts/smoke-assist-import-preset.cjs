/**
 * Smoke: Assist preset + buildSnaps against testplaylogs CSV (no network).
 * Usage: node scripts/smoke-assist-import-preset.cjs
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const csvPath =
  "D:\\mattb\\Claude Cowork OFFGRD\\offgrd-web\\testplaylogs\\PlaylistData_2026-07-01 (3).csv";
const src = fs.readFileSync(
  path.join(__dirname, "..", "OFFGRD-assist-import.js"),
  "utf8"
);

const sandbox = {
  window: {},
  globalThis: {},
  console,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "..", "OFFGRD-caller-outcome.js"), "utf8"),
  sandbox
);
sandbox.OFFGRD_FORMATION_CANON = {
  resolve: function () {
    return null;
  },
  resolveId: function (raw) {
    var k = String(raw || "")
      .trim()
      .toLowerCase();
    if (k === "2x2" || k === "2x2 doubles") return "DOUBLES_2X2";
    if (k === "3x1") return "TRIPS_RT_11";
    return null;
  },
  getById: function (id) {
    if (id === "DOUBLES_2X2")
      return {
        id: id,
        familyHint: "2x2",
        personnel: "11",
        backfield: [{ label: "QB" }, { label: "RB" }],
      };
    if (id === "TRIPS_RT_11")
      return {
        id: id,
        familyHint: "3x1",
        personnel: "11",
        backfield: [{ label: "QB" }, { label: "RB" }],
      };
    return null;
  },
  computeNxM: function (f) {
    return f.familyHint === "bunch" ? "3x1" : f.familyHint;
  },
};
vm.runInNewContext(src, sandbox);

const AI = sandbox.OFFGRD_ASSIST_IMPORT;
const text = fs.readFileSync(csvPath, "utf8");
const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
const headers = lines[0].split(",");
const map = AI.detectPresetMap(headers);

const required = [
  "odk",
  "down",
  "distance",
  "gain",
  "formation",
  "front",
  "coverage",
  "pressure",
];
const missing = required.filter((k) => !map[k]);
if (missing.length) {
  console.error("FAIL preset missing", missing, map);
  process.exit(1);
}
if (map.gain !== "GN/LS") {
  console.error("FAIL gain header", map.gain);
  process.exit(1);
}
if (map.pressure !== "BLITZ") {
  console.error("FAIL pressure←BLITZ", map.pressure);
  process.exit(1);
}

// Minimal parse using module internals via buildSnaps path — rebuild rows
function splitCSVLine(line) {
  const parts = [];
  let cur = "",
    q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      q = !q;
      continue;
    }
    if (ch === "," && !q) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}
const rows = lines.slice(1).map(splitCSVLine);
const built = AI.buildSnaps(
  { headers, rows },
  map,
  {
    teamId: "00000000-0000-0000-0000-000000000001",
    opponent: "Test Opp",
    week: "Wk smoke",
    side: "off",
    odkKeep: "auto",
  }
);

console.log(
  JSON.stringify(
    {
      headers: headers.length,
      mapKeys: Object.keys(map).sort(),
      kept: built.stats.kept,
      droppedOdk: built.stats.droppedOdk,
      odkKeep: built.stats.odkKeep,
      defColumnsPresent: built.stats.defColumnsPresent,
      defRowsFilled: built.stats.defRowsFilled,
      formMatchRate: built.stats.formMatchRate,
      formMatched: built.stats.formMatched,
      formTagged: built.stats.formTagged,
      unmatchedTop: built.stats.unmatchedForms.slice(0, 8),
      sample: built.snaps[0] && {
        formation: built.snaps[0].formation,
        formation_id: built.snaps[0].formation_id,
        off_structure: built.snaps[0].off_structure,
        coverage: built.snaps[0].coverage,
        front: built.snaps[0].front,
        pressure: built.snaps[0].pressure,
        motion_type: built.snaps[0].motion_type,
        success: built.snaps[0].success,
      },
    },
    null,
    2
  )
);

if (!built.stats.defColumnsPresent || built.stats.kept < 1) {
  console.error("FAIL sanity");
  process.exit(1);
}
console.log("PASS assist-import preset smoke");
