/**
 * Opening a caller must not restamp scouting_games.
 *   node scripts/smoke-scouting-save-noop.cjs
 *
 * 22:49:00.890–22:49:03.499 (16 sequential upserts): push() → Cloud.saveGame.
 * JSON.stringify(cur.rows) === JSON.stringify(game.rows) missed because
 * PostgREST/jsonb parse and localStorage parse rebuild the same snaps with
 * different key order. stringify then disagrees and upsert restamps updated_at.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const cloud = fs.readFileSync(path.join(root, "OFFGRD-cloud.js"), "utf8");
const account = fs.readFileSync(path.join(root, "OFFGRD-account.js"), "utf8");
const html = fs.readFileSync(path.join(root, "OFFGRD.html"), "utf8");

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

const start = cloud.indexOf("function canonScouting");
const end = cloud.indexOf("export const Cloud");
if (start < 0 || end < 0 || end <= start) throw new Error("canonScouting block missing from OFFGRD-cloud.js");
const sandbox = {};
vm.runInNewContext(cloud.slice(start, end) + "this.scoutingRowsEqual = scoutingRowsEqual;", sandbox);
const eq = sandbox.scoutingRowsEqual;

const rowA = {
  play: "EXTRA HAWK",
  down: 1,
  distance: 10,
  opponent: "McClure North",
  gameWeek: "vs McClure North 2025",
  source: "scout_import",
};
const rowB = {
  source: "scout_import",
  gameWeek: "vs McClure North 2025",
  opponent: "McClure North",
  distance: 10,
  down: 1,
  play: "EXTRA HAWK",
};

check("stringify disagrees on key order (the missed no-op)", JSON.stringify([rowA]) !== JSON.stringify([rowB]));
check("canonical equal on key-order-only", eq([rowA], [rowB]) === true);
check("canonical unequal on play change", eq([rowA], [Object.assign({}, rowA, { play: "MEMPHIS" })]) === false);
check("never sorts snap sequence", eq([rowA, { play: "MEMPHIS" }], [{ play: "MEMPHIS" }, rowA]) === false);
check(
  "recurses into nested objects",
  eq([{ meta: { b: 1, a: 2 }, play: "X" }], [{ play: "X", meta: { a: 2, b: 1 } }]) === true
);
check(
  "nested value change is unequal",
  eq([{ meta: { a: 2, b: 1 } }], [{ meta: { a: 2, b: 9 } }]) === false
);

/* McClure North 4cb64dc0 snap SOUTH BEND — pulled from scouting_games after jsonb round-trip.
   Census of all 19 Parkway West games: 0 non-integer numbers (jsonb already normalized
   1.0→1). This row has integer down/distance/success and gain:null. */
const mcclureNorthRoundTrip = {
  gap: "",
  qtr: "1",
  date: "vs McClure North 2025",
  down: 4,
  gain: null,
  hash: "R",
  play: "SOUTH BEND",
  front: "",
  result: "Interception",
  source: "scout_import",
  success: 0,
  coverage: "",
  distance: 6,
  gameWeek: "vs McClure North 2025",
  opponent: "McClure North",
  passZone: "",
  playType: "Pass",
  fieldZone: "",
  formation: "3x1 wing",
  coverageMod: "",
  coverageRaw: "",
  offStrength: "L",
};
const mcclureShuffled = {
  offStrength: "L",
  coverageRaw: "",
  coverageMod: "",
  formation: "3x1 wing",
  fieldZone: "",
  playType: "Pass",
  passZone: "",
  opponent: "McClure North",
  gameWeek: "vs McClure North 2025",
  distance: 6,
  coverage: "",
  success: 0,
  source: "scout_import",
  result: "Interception",
  front: "",
  play: "SOUTH BEND",
  hash: "R",
  gain: null,
  down: 4,
  date: "vs McClure North 2025",
  qtr: "1",
  gap: "",
};
check(
  "round-tripped McClure North: stringify loses, canonical holds",
  JSON.stringify([mcclureNorthRoundTrip]) !== JSON.stringify([mcclureShuffled]) &&
    eq([mcclureNorthRoundTrip], [mcclureShuffled]) === true
);
const withoutGain = Object.assign({}, mcclureNorthRoundTrip);
delete withoutGain.gain;
check("gain:null vs missing gain is unequal", eq([mcclureNorthRoundTrip], [withoutGain]) === false);
check("jsonb number normalize 1.0 vs 1 is equal", eq([{ gain: 1.0 }], [{ gain: 1 }]) === true);
check("source does not sort arrays", /if \(Array\.isArray\(v\)\) return v\.map\(canonScouting\)/.test(cloud) && !/v\.sort\(/.test(cloud.slice(start, end)));
check("saveGame uses scoutingRowsEqual, not raw stringify of rows", /scoutingRowsEqual\(cur\.rows/.test(cloud) && !/JSON\.stringify\(cur\.rows/.test(cloud));
check("CAS error with cur does not fall through to upsert", /if \(cur\) return cur;/.test(cloud));

const pull = account.match(/async function pull\(silent\)\{[\s\S]*?\nasync function push/);
check("pull exists", !!pull);
check(
  "scout pull empty-cloud does not push",
  pull && /A\.kind!=="scout" && local && local.length && canEdit\(\)/.test(pull[0])
);
check("OFFGRD_SYNC refuses while pull is busy", /OFFGRD_SYNC=function\(\)\{[^}]*if\(_busy\) return/.test(account));
check("APP.set saveGames is sync:false", /callerHydrateFromGames\(\);saveGames\(\{sync:false\}\)/.test(html.replace(/\s+/g, "")));
check("html open gate still fromCall", /if\s*\(\s*!opts\.fromCall\s*\)/.test(html) && /open-is-readonly/.test(html));

if (fails) {
  console.error(fails + " smoke-scouting-save-noop failure(s)");
  process.exit(1);
}
console.log("smoke-scouting-save-noop ok");
