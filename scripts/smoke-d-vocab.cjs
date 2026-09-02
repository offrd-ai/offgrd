/**
 * smoke-d-vocab.cjs — team D Caller vocabulary (Step 3 only)
 *
 *   node scripts/smoke-d-vocab.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const V = require(path.join(__dirname, "..", "OFFGRD-d-vocab.js"));
const ROOT = path.resolve(__dirname, "..");
const PB = fs.readFileSync(path.join(ROOT, "OFFGRD-Playbook.html"), "utf8");
const HOME = fs.readFileSync(path.join(ROOT, "OFFGRD.html"), "utf8");
const DC = fs.readFileSync(path.join(ROOT, "OFFGRD-dcaller.js"), "utf8");
const AN = fs.readFileSync(path.join(ROOT, "OFFGRD-caller-analysis.js"), "utf8");
const seed = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts/fixtures/offgrd-d-vocab-parkway-west.json"), "utf8")
);

let n = 0;
function ok(cond, msg) {
  n++;
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

ok(V.sameCall("Boss", "BOSS"), "Boss/BOSS are one call");
ok(V.sameCall("SAM & BILL", "SAM AND BILL"), "SAM & BILL == SAM AND BILL");
ok(V.sameCall("SAM  &   BILL", "sam and bill"), "whitespace + &/AND collapse");
ok(!V.sameCall("SAM & BILL", "SAM"), "compound is not either player alone");
ok(!V.sameCall("SAM & BILL", "BILL"), "compound is not BILL alone");
ok(
  !V.sameCall("SCOUT LONG STICK", "SCOUT AND BANDIT LONGSTICK"),
  "near-twins stay distinct (space vs no space in LONGSTICK)"
);
ok(V.sameCall("SCOUT  LONG   STICK", "SCOUT LONG STICK"), "collapsed whitespace matches typo-twin");

const west = V.applySeed(V.emptyBook(), seed);
ok(west.front.map(function (i) { return i.name; }).join("·") === seed.front.join("·"), "front order is coach order");
ok(west.coverage.map(function (i) { return i.name; }).join("·") === seed.coverage.join("·"), "coverage order is coach order");
ok(west.blitz.map(function (i) { return i.name; }).join("·") === seed.blitz.join("·"), "blitz order is coach order");
ok(west.front.length === 5 && west.coverage.length === 14 && west.blitz.length === 15, "West counts 5/14/15");
ok(V.hasActiveVocab(west), "West seed is an active vocabulary");
ok(!V.hasActiveVocab(V.emptyBook()), "empty book is not a vocabulary");

const lists = V.callerLists(west);
ok(lists.fronts.items[0].name === "ALPHA" && lists.fronts.items[4].name === "ZULU", "caller fronts in seed order");
ok(lists.coverages.items.some(function (i) { return i.name === "LOCK CALL"; }), "LOCK CALL is an ordinary coverage");
ok(lists.pressures.items.some(function (i) { return i.name === "X TAG"; }), "X TAG is an ordinary blitz");
ok(lists.fronts.items[lists.fronts.items.length - 1].name === "other", "other on front row");
ok(lists.coverages.items[lists.coverages.items.length - 1].name === "other", "other on coverage row");
ok(lists.pressures.items[lists.pressures.items.length - 1].name === "other", "other on blitz row");
ok(!lists.pressures.more, "West 15 pressures do not trip More…");

const padded = V.applySeed(V.emptyBook(), {
  front: ["A"],
  coverage: ["C"],
  blitz: Array.from({ length: 17 }, function (_, i) { return "P" + i; })
});
const moreLists = V.callerLists(padded);
ok(moreLists.pressures.more === true && moreLists.pressures.items.length === 16, "17 blitzes → 15 + other + More… flag");
ok(moreLists.pressures.items[15].name === "other", "More… row still ends with other");
const expanded = V.callerLists(padded, { showAll: { blitz: true } });
ok(expanded.pressures.more === false && expanded.pressures.items.length === 18, "expanded list shows all 17 + other");

const retired = V.retireName(west, "front", "CHARLIE");
ok(V.activeItems(retired, "front").every(function (i) { return i.name !== "CHARLIE"; }), "retired name stops rendering");
ok(V.allItems(retired, "front").some(function (i) { return i.name === "CHARLIE" && i.retired; }), "retire keeps the row");
ok(V.callOfRecord({ dCallFront: "CHARLIE", dCallCoverage: "CHICAGO", dCallBlitz: "SAM" }) === "CHARLIE · CHICAGO · SAM", "historical snap still formats retired name");

const pasted = V.adoptPaste(retired, { front: "ALPHA\nBRAVO\nDELTA\nZULU" });
ok(V.allItems(pasted, "front").some(function (i) { return i.name === "CHARLIE" && i.retired; }), "omitted paste name stays retired");
const back = V.adoptPaste(pasted, { front: "ALPHA\nBRAVO\nCHARLIE\nDELTA\nZULU" });
ok(V.activeItems(back, "front").map(function (i) { return i.name; }).join("·") === "ALPHA·BRAVO·CHARLIE·DELTA·ZULU", "re-paste un-retires in coach order");

ok(V.formatCall("BRAVO", "CHICAGO", "SAM & BILL") === "BRAVO · CHICAGO · SAM & BILL", "call of record format");
ok(V.callOfRecord({ front: "BRAVO", coverage: "CHICAGO", pressure: "SAM & BILL" }) === "BRAVO · CHICAGO · SAM & BILL", "fallback fields format");
ok(V.callOfRecord({ dCallFront: "BRAVO", front: "3-4", dCallCoverage: "CHICAGO", coverage: "Cover 3", dCallBlitz: "SAM & BILL" }) === "BRAVO · CHICAGO · SAM & BILL", "dCall* wins over generic leftovers");
ok(V.formatCall("BRAVO", "", "none") === "BRAVO", "blank + none omitted");

const pay = V.payloadFromSit({ front: "BRAVO", coverage: "CHICAGO", pressure: "SAM & BILL" }, west);
ok(pay.dCallFront === "BRAVO" && pay.dCallCoverage === "CHICAGO" && pay.dCallBlitz === "SAM & BILL", "snap stores team names");
ok(pay.frontFamily === "" && pay.coverageFamily === "" && pay.pressureFamily === "", "unmapped families stay empty — not a gate");
ok(V.mappingHint(west).indexOf("need mapping") >= 0, "optional mapping hint counts unmapped calls");

const mapped = V.setFamily(west, "front", "BRAVO", "3-4");
ok(V.familyOf(mapped, "front", "bravo") === "3-4", "optional family maps case-insensitively");
ok(V.payloadFromSit({ front: "BRAVO" }, mapped).frontFamily === "3-4", "mapped family lands on the snap");

const emptyRemote = V.adoptRemote(null, west, { confirmedEmpty: false });
ok(V.hasActiveVocab(emptyRemote), "unknown empty keeps local vocab");
const confirmedGone = V.adoptRemote(null, west, { confirmedEmpty: true });
ok(!V.hasActiveVocab(confirmedGone), "confirmed empty is no vocabulary");

ok(/id="dVocabBtn"/.test(PB) && /Defense calls/.test(PB), "playbook Defense calls button");
ok(/id="dVocabModal"/.test(PB) && /id="dVocabFront"/.test(PB) && /id="dVocabCoverage"/.test(PB) && /id="dVocabBlitz"/.test(PB), "three paste textareas");
ok(/OFFGRD-d-vocab\.js\?v=/.test(PB) && /OFFGRD-d-vocab\.js\?v=/.test(HOME), "vocab module pinned on playbook + caller");
ok(/OFFGRD-d-vocab\.js/.test(fs.readFileSync(path.join(ROOT, "offgrd-sw.js"), "utf8")), "SW precaches D vocab");
ok(/OFFGRD_D_VOCAB/.test(DC) && /payloadFromSit/.test(DC) && /callerLists/.test(DC), "D Caller Step 3 reads team vocab");
ok(/dCallFront/.test(DC) && /frontFamily/.test(DC), "live D snap writes team name + family slots");
ok(/callOfRecord/.test(DC), "This-Play / log use team call of record");

ok(/callerLookChipsHtml/.test(HOME) && /Cover 0/.test(HOME) && /Mike A/.test(HOME), "O Caller look-logging vocabulary unchanged");
ok(/function callerDefPlaybook/.test(HOME) && /offgrd_def_playbook_/.test(HOME), "O Caller still reads generic def_playbook");
const lookStart = HOME.indexOf("function callerLookChipsHtml");
const lookEnd = HOME.indexOf("\nfunction callerOut", lookStart);
const lookChips = lookStart >= 0 ? HOME.slice(lookStart, lookEnd > 0 ? lookEnd : lookStart + 2500) : "";
ok(lookChips && !/OFFGRD_D_VOCAB/.test(lookChips), "callerLookChipsHtml does not read D vocab");

ok(/dCallFront/.test(AN) && /dCallFront \|\| e\.front/.test(AN), "What's working groups D snaps by team call");

ok(/listDVocab/.test(fs.readFileSync(path.join(ROOT, "OFFGRD-cloud.js"), "utf8")), "Cloud listDVocab");
ok(/upsertDVocab/.test(fs.readFileSync(path.join(ROOT, "OFFGRD-cloud.js"), "utf8")), "Cloud upsertDVocab");
ok(/pullDVocab/.test(fs.readFileSync(path.join(ROOT, "OFFGRD-account.js"), "utf8")), "account pull hydrates D vocab");
ok(/offgrd_d_vocab/.test(fs.readFileSync(path.join(ROOT, "docs/apply-offgrd-d-vocab.sql"), "utf8")), "apply SQL present");
const v2 = fs.readFileSync(path.join(ROOT, "docs/apply-offgrd-d-vocab-v2.sql"), "utf8");
ok(/DROP POLICY IF EXISTS d_vocab_delete/.test(v2) && /REVOKE DELETE ON offgrd\.offgrd_d_vocab FROM authenticated/.test(v2), "v2 drops authenticated DELETE");
ok(/touch_updated_at/.test(v2) && /trg_assert_write_access/.test(v2), "v2 updated_at + trial write triggers");
ok(/BEGIN;[\s\S]*20260902010000[\s\S]*COMMIT/.test(v2), "v2 stamps schema_migrations inside the transaction");

console.log("ok", n, "d-vocab checks");
