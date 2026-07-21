/**
 * Formation library drift + legality smoke (v2).
 *   node scripts/smoke-formation-canon.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const jsonPath = path.join(root, "formations", "formations.v1.json");
const dataA = path.join(root, "OFFGRD-formations-data.js");
const dataB = path.join(root, "offgrd-web", "OFFGRD-formations-data.js");
const canonA = path.join(root, "OFFGRD-formation-canon.js");
const canonB = path.join(root, "offgrd-web", "OFFGRD-formation-canon.js");

// offrd-ai/offgrd is a FLAT single-mirror repo (no offgrd-web/). In the authoring
// monorepo both mirrors exist and this gate keeps them in sync; here we require only
// the top-level copies and check offgrd-web drift when that mirror is present.
const hasMirror = fs.existsSync(path.join(root, "offgrd-web"));

function sha(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}
function must(p) {
  if (!fs.existsSync(p)) throw new Error("missing " + p);
}

[jsonPath, dataA, canonA].forEach(must);
if (hasMirror) {
  [dataB, canonB].forEach(must);
  if (sha(dataA) !== sha(dataB)) throw new Error("formations-data.js drifted");
  if (sha(canonA) !== sha(canonB)) throw new Error("formation-canon.js drifted");
}

const json = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const embed = require(dataA);
if (JSON.stringify(embed.formations) !== JSON.stringify(json.formations)) {
  throw new Error("embed out of sync — run: node scripts/sync-formations-embed.cjs");
}

const FC = require(canonA);

/* —— Alias uniqueness —— */
const aliasOwner = Object.create(null);
function norm(a) {
  return String(a || "")
    .toLowerCase()
    .replace(/[×✕]/g, "x")
    .replace(/^vs\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}
for (const f of FC.allFormations()) {
  for (const a of [f.display, f.id].concat(f.aliases || [])) {
    const k = norm(a);
    if (!k) continue;
    if (aliasOwner[k] && aliasOwner[k] !== f.id) {
      throw new Error(`duplicate alias "${k}": ${aliasOwner[k]} vs ${f.id}`);
    }
    aliasOwner[k] = f.id;
  }
}

/* —— Per-formation legality, personnel, 7-on-LOS, naming, placement —— */
for (const f of FC.allFormations()) {
  FC.assertFormationLegal(f);
  const ol = f.olCount != null ? f.olCount : 5;
  const skillOnLos = (f.skill || []).filter((s) => !!s.onLOS).length;
  if (ol + skillOnLos !== 7) {
    throw new Error(`${f.id}: onLOS ${ol + skillOnLos} (ol=${ol} skillOnLOS=${skillOnLos}) need 7`);
  }
  const players = FC.playersFromFormation(f);
  if (FC.skillPlayersOverlap(players)) throw new Error("overlap: " + f.id);
  /* Placed skill on LOS must match flags (depth / y). */
  const placedOn = players.filter((p) => !p.ol && (p.type === "route" || p.type === "rb") && Math.abs((p.y || 0) - 380) < 2);
  if (placedOn.length !== skillOnLos) {
    throw new Error(
      `${f.id}: placed LOS skill ${placedOn.length} != skillOnLOS ${skillOnLos} [${placedOn.map((p) => p.lab).join(",")}]`
    );
  }

  const m = String(f.display).match(/(\d)\s*[xX×]\s*(\d)/);
  if (m) {
    const want = m[1] + "x" + m[2];
    const got = FC.computeNxM(f);
    if (got !== want) throw new Error(`${f.id} display ${want} but computeNxM=${got}`);
  }
}

/* —— Empty + Across must keep two sides (land outside #1, not into the trips) —— */
{
  const empty = FC.playersForId("EMPTY_3X2");
  const x = empty.find((p) => p.lab === "X");
  if (!x) throw new Error("EMPTY_3X2 missing X");
  const land = FC.acrossLandX(x, empty);
  const left = empty.filter((p) => p !== x && (p.type === "route" || p.type === "rb") && (p.x || 0) < 500).length;
  const rightAfter = empty.filter((p) => p !== x && (p.type === "route" || p.type === "rb") && (p.x || 0) >= 500).length + (land >= 500 ? 1 : 0);
  const leftAfter = left + (land < 500 ? 1 : 0);
  if (land < 900) throw new Error("EMPTY Across from X should land outside Z (>=900), got " + land);
  if (leftAfter < 1 || rightAfter < 2) {
    throw new Error("EMPTY Across collapsed sides L=" + leftAfter + " R=" + rightAfter + " land=" + land);
  }
}

/* —— playersFromFormation must throw on bad input (never partial) —— */
let threw = false;
try {
  FC.playersFromFormation("NOT_A_REAL_ID");
} catch (e) {
  threw = true;
}
if (!threw) throw new Error("playersFromFormation(bad id) should throw");
threw = false;
try {
  FC.playersFromFormation(null);
} catch (e) {
  threw = true;
}
if (!threw) throw new Error("playersFromFormation(null) should throw");

/* String id that IS valid must return full 11 */
const eleven = FC.playersFromFormation("WING_2X1");
if (eleven.length !== 11) throw new Error("WING_2X1 placed " + eleven.length + " not 11");
const nx = FC.computeNxM(FC.getById("WING_2X1"));
if (nx !== "2x1") throw new Error("WING_2X1 computeNxM=" + nx);

/* Required ids */
for (const id of ["WING_2X1", "WING_3X1", "QUADS_RT", "HEAVY_GOAL_LINE", "GOAL_LINE_JUMBO", "DOUBLES_2X2"]) {
  if (!FC.getById(id)) throw new Error("missing " + id);
}
const jumbo = FC.playersFromFormation("GOAL_LINE_JUMBO");
if (jumbo.filter((p) => p.ol).length !== 6) throw new Error("jumbo olCount != 6");

/* Motion clear */
const wing = FC.playersForId("WING_3X1");
const x = wing.find((p) => p.lab === "X");
const z = wing.find((p) => p.lab === "Z");
const clear = FC.findClearSkillX(1000 - x.x, x, wing);
if (Math.abs(clear - z.x) < FC.SKILL_MIN_SEP) throw new Error("motion clear hits Z");

/* Resolve cases */
const cases = [
  ["2X2", "DOUBLES_2X2"],
  ["2x1 Wing", "WING_2X1"],
  ["3x1 wing", "WING_3X1"],
  ["Quads", "QUADS_RT"],
  ["Gun Ace", "GUN_ACE"],
  ["Pistol Doubles", "PISTOL_DOUBLES"],
];
for (const [raw, id] of cases) {
  if (FC.resolveId(raw) !== id) throw new Error(`resolve(${raw})=${FC.resolveId(raw)} want ${id}`);
}

/* Conservative resolve — ambiguous / structurally distinct must NOT silently alias */
const mustUnmap = ["SPREAD", "spread", "Unbalanced 2x1", "unbalanced 2x1", "Tackle Over", "spread offense"];
for (const raw of mustUnmap) {
  const got = FC.resolveId(raw);
  if (got) throw new Error(`resolve(${raw}) should be null (map prompt), got ${got}`);
}
if (FC.resolveId("Tank Wing") !== "HEAVY_WING") {
  throw new Error("Tank Wing should still exact-alias to HEAVY_WING");
}

/* Explicit coach maps win before hard-blocks (Scout modal) */
globalThis.__FORMATION_ALIAS_OVERRIDES__ = { spread: "DOUBLES_2X2", "slot wing": "TWINS_WING" };
if (FC.resolveId("SPREAD") !== "DOUBLES_2X2") {
  throw new Error("coach map SPREAD → DOUBLES_2X2 should win, got " + FC.resolveId("SPREAD"));
}
if (FC.resolveId("SLOT WING") !== "TWINS_WING") {
  throw new Error("coach map SLOT WING → TWINS_WING should win, got " + FC.resolveId("SLOT WING"));
}
/* Unmapped unbalanced still refuses (no honest library match) */
if (FC.resolveId("Unbalanced 2x1")) {
  throw new Error("Unbalanced 2x1 must stay unmapped without an explicit override");
}
globalThis.__FORMATION_ALIAS_OVERRIDES__ = {};

const htmlA = fs.readFileSync(path.join(root, "OFFGRD-QB.html"), "utf8");
if (!htmlA.includes("OFFGRD-formations-data.js")) throw new Error("QB.html missing data script");
if (hasMirror) {
  const htmlB = fs.readFileSync(path.join(root, "offgrd-web", "OFFGRD-QB.html"), "utf8");
  if (!htmlB.includes("OFFGRD-formations-data.js")) throw new Error("offgrd-web QB.html missing data script");
}

console.log("OK formation-library smoke v2");
console.log("  formations:", FC.allFormations().length);
console.log("  aliases:", Object.keys(aliasOwner).length);
console.log("  WING_2X1:", nx, "players", eleven.length);
process.exit(0);
