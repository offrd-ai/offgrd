/**
 * smoke-play-direction.cjs — merge mirrored play names
 *
 *   node scripts/smoke-play-direction.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const D = require(path.join(__dirname, "..", "OFFGRD-play-direction.js"));
const ROOT = path.resolve(__dirname, "..");
const PB = fs.readFileSync(path.join(ROOT, "OFFGRD-Playbook.html"), "utf8");
const HOME = fs.readFileSync(path.join(ROOT, "OFFGRD.html"), "utf8");

let n = 0;
function ok(cond, msg) {
  n++;
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

ok(D.peekTrailing("WEST") == null, "token-as-name WEST is untouched");
ok(D.peekTrailing("East") == null, "token-as-name East is untouched");
ok(D.peekTrailing("HOUSTON WEST").base === "HOUSTON", "HOUSTON WEST peels WEST");
ok(D.peekTrailing("HOUSTON WEST").dir === "L", "WEST → L");
ok(D.peekTrailing("houston east").dir === "R", "EAST → R");
ok(D.peekTrailing("ZONE LT").dir === "L", "LT → L");
ok(D.peekTrailing("POWER RT").dir === "R", "RT → R");
ok(D.peekTrailing("BALL") == null, "BALL is not trailing L");
ok(D.peekTrailing("Flood Rt," ) == null || D.peekTrailing("Flood Rt").base === "Flood", "Flood Rt peels");

const book = [
  { id: "a", name: "HOUSTON", side: "offense" },
  { id: "b", name: "HOUSTON WEST", side: "offense" },
  { id: "c", name: "WEST", side: "offense" },
  { id: "d", name: "Inside Zone Rt", side: "offense" },
  { id: "e", name: "Inside Zone Lt", side: "offense" },
  { id: "f", name: "Florida West", side: "offense" }
];

const onlyWest = D.foldName("HOUSTON WEST", [{ name: "MESH" }], null);
ok(onlyWest.stripped === false && onlyWest.name === "HOUSTON WEST", "no strip unless base exists");

const fold = D.foldName("HOUSTON WEST", book, null);
ok(fold.stripped === true && fold.name === "HOUSTON", "strip when HOUSTON exists");
ok(fold.dir === "L", "fills L from WEST");

const dirWins = D.foldName("HOUSTON WEST", book, "R");
ok(dirWins.dir === "R" && dirWins.name === "HOUSTON", "PLAY DIR wins over stripped token");

const pairs = D.findPairs(book);
ok(pairs.length === 1, "one pair: HOUSTON WEST → HOUSTON (Florida West has no Florida)");
ok(pairs[0].keepName === "HOUSTON" && pairs[0].dropName === "HOUSTON WEST", "keep unmarked");
ok(pairs.every(function (p) { return p.dropName !== "WEST"; }), "WEST play not paired");
ok(!pairs.some(function (p) { return /Inside Zone/i.test(p.keepName); }), "Zone Lt/Rt stay split without base");

const prev = D.previewMerge(book);
ok(prev.beforeCount === 6 && prev.afterCount === 5, "24-style count: 6 → 5");
ok(/HOUSTON WEST → HOUSTON · L/.test(D.previewSentence(prev)), "receipt names the pair");
ok(/6 names → 5 plays/.test(D.previewSentence(prev)), "receipt names the collapse");
ok(prev.nearMisses && prev.nearMisses.length === 3, "near-misses: Florida West + Zone Lt/Rt");
ok(prev.nearMisses.some(function (m) { return m.name === "Florida West"; }), "Florida West is a near-miss");
ok(/no unmarked twin/.test(D.previewSentence(prev)) && /Florida West/.test(D.previewSentence(prev)), "receipt names what it is not merging");
ok(D.findNearMisses([{ name: "HOUSTON WEST" }]).length === 1, "lone WEST name is a near-miss, not a pair");
ok(/No mirrored plays to merge/.test(D.previewSentence(D.previewMerge([{ name: "TANK WEST" }]))), "near-miss-only book still gets a receipt");
ok(/TANK WEST/.test(D.previewSentence(D.previewMerge([{ name: "TANK WEST" }]))), "near-miss-only receipt names the play");

const applied = D.applyMerge(book, pairs);
ok(applied.plays.length === 5, "commit drops the mirror");
ok(applied.plays.some(function (p) { return p.name === "HOUSTON"; }), "HOUSTON remains");
ok(!applied.plays.some(function (p) { return p.name === "HOUSTON WEST"; }), "HOUSTON WEST removed");
ok((applied.plays.find(function (p) { return p.name === "HOUSTON"; }).aliases || []).indexOf("HOUSTON WEST") >= 0, "alias retained");

const rows = [
  { play: "HOUSTON WEST", success: 1, play_dir: "", hash: "L" },
  { play: "HOUSTON", success: 1, play_dir: "R", hash: "L" },
  { play: "HOUSTON WEST", success: 0, hash: "R" }
];
const folded = D.foldRows(rows, book);
ok(folded.every(function (r) { return r.play === "HOUSTON"; }), "snaps fold onto HOUSTON");
ok(folded[0].playDir === "L", "blank PLAY DIR filled from WEST");
ok(folded[1].play_dir === "R" || folded[1].playDir === "R", "existing PLAY DIR kept");

const hidden = D.hideMirrors(book);
ok(hidden.length === 5 && hidden.every(function (p) { return p.name !== "HOUSTON WEST"; }), "caller hides the mirror");

const stubPrev = {
  rows: [
    { name: "HOUSTON WEST", status: "new" },
    { name: "MESH", status: "new" }
  ],
  willAdd: 2,
  side: "offense"
};
D.annotateStubPreview(stubPrev, [{ name: "HOUSTON", side: "offense" }]);
ok(stubPrev.rows[0].status === "merge" && stubPrev.merged === 1, "paste of HOUSTON WEST merges");
ok(stubPrev.willAdd === 1, "willAdd drops the mirror");
ok(stubPrev.rows[1].status === "new", "MESH still added");

const custom = D.parseTokenList("NORTH=L, SOUTH=R");
ok(D.peekTrailing("BLAST NORTH", custom).dir === "L", "token list is configurable");

ok(D.toField({ hash: "L", play_dir: "R" }) === "field", "left hash + R = field");
ok(D.toField({ hash: "L", playDir: "L" }) === "boundary", "left hash + L = boundary");

const thin = [];
for (let i = 0; i < 4; i++) thin.push({ play: "HOUSTON", success: 1, hash: "L", play_dir: "R" });
ok(D.directionSplit(thin, "HOUSTON").show === false, "tiny N does not surface a split");

const fat = [];
for (let i = 0; i < 10; i++) fat.push({ play: "HOUSTON", success: i < 8 ? 1 : 0, hash: "L", play_dir: "R" });
const split = D.directionSplit(fat, "HOUSTON");
ok(split.show === true && /field/.test(split.label), "N>=8 can show field split");

ok(/OFFGRD-play-direction\.js/.test(PB), "Playbook loads play-direction");
ok(/OFFGRD-play-direction\.js/.test(HOME), "Caller loads play-direction");
ok(/Merge mirrored plays/.test(PB), "Playbook has merge control");

console.log("ok", n, "play-direction checks");
