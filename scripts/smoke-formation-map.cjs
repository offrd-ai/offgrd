/**
 * Smoke: Phase B formation mapping — suggest, inventory, upsert shape, preview.
 * Stubs the client; does not require offgrd_formation_map locally.
 * Usage: node scripts/smoke-formation-map.cjs
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const sandbox = { window: {}, globalThis: {}, console, document: undefined };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
function load(file) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox);
}
load("OFFGRD-formations-data.js");
load("OFFGRD-formation-canon.js");
load("OFFGRD-assist-import.js");
load("OFFGRD-render.js");
load("OFFGRD-opp-shells.js");
load("OFFGRD-formation-map.js");

const M = sandbox.OFFGRD_FORMATION_MAP;
if (!M) {
  console.error("FAIL load OFFGRD_FORMATION_MAP");
  process.exit(1);
}

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

check("Tank 3x2 suggests 3x2", M.suggestStructure("Tank 3x2") === "3x2");
check("2x1 Wing suggests 2x1", M.suggestStructure("2x1 Wing") === "2x1");
check("2X2 STACK suggests 2x2", M.suggestStructure("2X2 STACK") === "2x2");
check("3x1 wing suggests 3x1", M.suggestStructure("3x1 wing") === "3x1");
check("DART does not pre-fill", M.suggestStructure("DART") === null);
check("SPREAD does not pre-fill", M.suggestStructure("SPREAD") === null);
check("Unbalanced Trey does not pre-fill", M.suggestStructure("Unbalanced Trey") === null);

check("blank tag is blank", M.isBlankTag("") && M.isBlankTag("   ") && !M.isBlankTag("2x1 Wing"));
const inv = M.inventoryTags(
  [
    { formation: "2x1 Wing" },
    { formation: "2x1 Wing" },
    { formation: "DART" },
    { formation: "" },
    { formation: "   " },
    { formation: "2X2" },
    { formation: "BUNCH" },
  ],
  []
);
check("blank tag never yields a card", inv.unmapped.every(function (i) { return i.raw.trim(); }) && !inv.unmapped.some(function (i) { return !i.raw; }));
check("2x1 Wing is unmapped", inv.unmapped.some(function (i) { return i.raw === "2x1 Wing" && i.n === 2 && i.suggested === "2x1"; }));
check("DART is unmapped without suggestion", inv.unmapped.some(function (i) { return i.raw === "DART" && !i.suggested; }));
check("2X2 is auto-recognized", inv.auto.some(function (i) { return i.raw === "2X2" && i.auto === "2x2"; }));
check("BUNCH is auto-recognized", inv.auto.some(function (i) { return i.raw === "BUNCH" && i.auto === "3x1"; }));

let threwBlank = false;
try { M.buildUpsertPayload({ raw_tag: "  ", off_structure: "2x2" }); } catch (e) { threwBlank = /blank/i.test(e.message); }
check("upsert rejects blank tag", threwBlank);

let threwIllegal = false;
try { M.buildUpsertPayload({ raw_tag: "DART", off_structure: "spread" }); } catch (e) { threwIllegal = /illegal/i.test(e.message); }
check("upsert rejects illegal structure", threwIllegal);

const payload = M.buildUpsertPayload({
  team_id: "team-1",
  raw_tag: "2x1 Wing",
  off_structure: "2x1",
  off_back_count: 1,
  off_personnel: "11",
  created_by: "user-1",
});
check("upsert side_scope is both", payload.side_scope === "both");
check("upsert raw_tag is exact", payload.raw_tag === "2x1 Wing");
check("upsert raw_tag_norm is lower/trim", payload.raw_tag_norm === "2x1 wing");
check("upsert structure is chip value", payload.off_structure === "2x1");
check("upsert back count is int", payload.off_back_count === 1);
check("upsert personnel set", payload.off_personnel === "11");

M.STRUCTURES.forEach(function (s) {
  const shell = M.previewShell(s, 1);
  const n = (shell && shell.players && shell.players.length) || 0;
  check("preview " + s + " has 11 players", n === 11, "n=" + n);
});

if (fails) {
  console.error(fails + " failed");
  process.exit(1);
}
console.log("smoke-formation-map: all ok");
