/**
 * smoke-caller-select.cjs — unit checks for OFFGRD-caller-select.js
 *
 * Covers acceptance for the play-selection slice:
 *  - situation → bucket match (fields compared + tie-break rule)
 *  - id:null bucket plays resolve to gen.plays/PBOOK by name
 *  - playInBucket, searchPlaybook, families
 *
 * Run: node scripts/smoke-caller-select.cjs   (also wired into npm run check)
 */
"use strict";
const path = require("path");
const S = require(path.join(__dirname, "..", "OFFGRD-caller-select.js"));

let n = 0;
function ok(cond, msg) {
  n++;
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

// Coach's call sheet — real bucket shapes (dn string, db string, zone REDZONE, plays[{id,name}]).
const buckets = [
  { name: "1st & 10 (openers)", dn: "1", db: "10+", zone: "ANY", plays: [{ id: null, name: "Slam West" }, { id: null, name: "Ohio" }, { id: "p_hou", name: "HOUSTON" }] },
  { name: "2nd & medium", dn: "2", db: "4-6", zone: "ANY", plays: [{ id: null, name: "MEMPHIS" }] },
  { name: "3rd & short", dn: "3", db: "1-3", zone: "ANY", plays: [{ id: null, name: "Slam" }] },
  { name: "3rd & long", dn: "3", db: "10+", zone: "ANY", plays: [{ id: null, name: "ST LOUIS" }] },
  { name: "Red zone", dn: "ANY", db: "ANY", zone: "REDZONE", plays: [{ id: null, name: "KARATE COMBO" }] },
  { name: "Goal line", dn: "ANY", db: "1-3", zone: "REDZONE", plays: [{ id: null, name: "SOUTH BEND" }] },
];

// Playbook (PBOOK / gen.plays as an array). Library plays have real ids here.
const pbook = [
  { id: "p_cali", name: "Cali", family: "Run", formation: "Gun Trips" },
  { id: "p_ohio", name: "Ohio", family: "Pass", formation: "Gun Trips" },
  { id: "p_slam", name: "Slam", family: "Run", formation: "I-Form" },
  { id: "p_miami", name: "MIAMI", family: "Pass", formation: "Empty" },
  { id: "p_hou", name: "HOUSTON", family: "Pass", formation: "Gun Trips" },
  { id: "p_mem", name: "MEMPHIS", family: "Screen", formation: "Gun" },
  { id: "p_stl", name: "ST LOUIS", family: "Shot", formation: "Gun Trips" },
  { id: "p_slamw", name: "Slam West", family: "Run", formation: "I-Form" },
  { id: "p_sb", name: "SOUTH BEND", family: "Run", formation: "Goal Line" },
  { id: "p_karate", name: "KARATE COMBO", family: "Pass", formation: "Bunch" },
];

// --- Tier 1: situation → bucket (fields compared: dn numeric, db string, zone string) ---
ok(S.matchBucket(buckets, { dn: "1", db: "10+", zone: "ANY" }).bucket.name === "1st & 10 (openers)", "1st & 10 → openers");
ok(S.matchBucket(buckets, { dn: 3, db: "1-3", zone: "ANY" }).bucket.name === "3rd & short", "3rd & short (numeric dn)");
ok(S.matchBucket(buckets, { dn: 3, db: "10+", zone: "OWN" }).bucket.name === "3rd & long", "3rd & long ignores zone when bucket zone=ANY");

// No sheet for this exact down/distance → null (never a silent default)
ok(S.matchBucket(buckets, { dn: 2, db: "10+", zone: "ANY" }) === null, "2nd & long has no bucket → null");

// --- Tie-break: most specific wins, then coach order ---
// The spec's example: zone:ANY vs zone:REDZONE both fit → the more specific (RZ) wins.
// On 2nd & 1-3 in the red zone: "Goal line" (db+zone, spec 2) beats "Red zone" (zone, spec 1);
// "3rd & short" doesn't apply (needs dn 3).
const rz = S.matchBucket(buckets, { dn: 2, db: "1-3", zone: "REDZONE" });
ok(rz.bucket.name === "Goal line", "redzone 2nd & 1-3 → most specific (Goal line) beats Red zone");
ok(rz.specificity === 2, "Goal line specificity is 2");
// Generic red zone (2nd & 10) → only Red zone matches
ok(S.matchBucket(buckets, { dn: 2, db: "10+", zone: "REDZONE" }).bucket.name === "Red zone", "redzone generic → Red zone");
// Equal specificity (3rd&short dn+db=2 vs Goal line db+zone=2) → earliest coach order wins.
const tie = S.matchBucket(buckets, { dn: 3, db: "1-3", zone: "REDZONE" });
ok(tie.bucket.name === "3rd & short", "equal specificity → coach order (3rd & short listed first)");

// allMatches returns every cover (for widening) in coach order
const all = S.allMatches(buckets, { dn: 3, db: "1-3", zone: "REDZONE" });
ok(all.length === 3, "3rd&1-3 in RZ covered by 3rd&short, Red zone, Goal line");
ok(all[0].bucket.name === "3rd & short" && all[2].bucket.name === "Goal line", "allMatches preserves coach order");

// --- Acceptance #4: id:null bucket plays resolve by name from gen.plays ---
ok(S.resolvePlayDef({ id: null, name: "Slam West" }, pbook).id === "p_slamw", "id:null 'Slam West' → p_slamw by name");
ok(S.resolvePlayDef({ id: null, name: "ohio" }, pbook).id === "p_ohio", "id:null resolves case-insensitively");
ok(S.resolvePlayDef({ id: "p_hou", name: "Renamed" }, pbook).id === "p_hou", "id present → resolves by id first");
ok(S.resolvePlayDef({ id: null, name: "Nonexistent" }, pbook) === null, "unknown name → null (name still callable)");
ok(S.playFamily({ id: null, name: "MEMPHIS" }, pbook) === "Screen", "family resolves through def for id:null play");

// --- playInBucket ---
const openers = buckets[0];
ok(S.playInBucket(openers, "HOUSTON") === true, "HOUSTON is on the openers sheet");
ok(S.playInBucket(openers, "houston") === true, "playInBucket case-insensitive");
ok(S.playInBucket(openers, "MIAMI") === false, "MIAMI is not on the openers sheet");

// --- Tier 3: search + families ---
ok(S.searchPlaybook(pbook, "hou").length === 1 && S.searchPlaybook(pbook, "hou")[0].name === "HOUSTON", "search 'hou' → HOUSTON");
ok(S.searchPlaybook(pbook, "slam").map(p => p.name).sort().join(",") === "Slam,Slam West", "search 'slam' → Slam + Slam West");
ok(S.searchPlaybook(pbook, "gun trips").length === 4, "search matches formation");
ok(S.searchPlaybook(pbook, "").length === pbook.length, "empty query → whole book");
const fams = S.families(pbook);
ok(fams.indexOf("Run") >= 0 && fams.indexOf("Pass") >= 0 && fams.indexOf("Screen") >= 0 && fams.indexOf("Shot") >= 0, "families lists Run/Pass/Screen/Shot");

console.log(`smoke-caller-select: ${n} checks passed`);
