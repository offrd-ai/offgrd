/**
 * smoke-play-stubs.cjs — paste call-sheet stubs (names first, draw later)
 *
 *   node scripts/smoke-play-stubs.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const S = require(path.join(__dirname, "..", "OFFGRD-play-stubs.js"));
const ROOT = path.resolve(__dirname, "..");
const PB = fs.readFileSync(path.join(ROOT, "OFFGRD-Playbook.html"), "utf8");
const HOME = fs.readFileSync(path.join(ROOT, "OFFGRD.html"), "utf8");
const QB = fs.readFileSync(path.join(ROOT, "OFFGRD-QB.html"), "utf8");

let n = 0;
function ok(cond, msg) {
  n++;
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const messy = [
  "12. SMASH 2x2",
  "\t• Mesh",
  "Flood Rt,",
  "",
  "SMASH 2x2",
  "Cover 3 Beater",
  "  ",
  "4) Power Lt",
].join("\n");

const parsed = S.parseCallSheetText(messy);
ok(parsed.rows.length === 5, "messy paste yields 5 unique names");
ok(parsed.skippedDupes === 1, "duplicate SMASH reported, not silent");
ok(parsed.rows[0].name === "SMASH 2x2", "strips leading 12.");
ok(parsed.rows[1].name === "Mesh", "strips bullet");
ok(parsed.rows[2].name === "Flood Rt", "strips trailing comma");
ok(parsed.rows[4].name === "Power Lt", "strips 4)");

const csv = S.parseCallSheetCsv("name,family\nStick,Quick Game\nMesh,Mesh\nStick,Quick Game\n");
ok(csv.rows.length === 2, "CSV header + unique names");
ok(csv.rows[0].family === "Quick Game", "second column is family hint");
ok(csv.skippedDupes === 1, "CSV duplicate reported");

const lib = [
  { id: "p1", name: "Mesh", side: "offense", players: [{ route: [{ x: 1, y: 1 }] }, { route: [] }, { route: [] }, { route: [] }, { route: [] }] },
  { id: "p2", name: "Stick", side: "offense", starter: true, formation: "Trips Rt (Gun)", players: [{ route: [{ x: 1, y: 1 }] }, {}, {}, {}, {}] },
];
const prev = S.previewStubs(parsed, lib, "offense");
ok(prev.alreadyIn === 1, "Mesh already in book");
ok(prev.willAdd === 4, "4 new names will be added");
ok(/5 plays/.test(S.previewSentence(prev)), "preview names the count");
ok(/1 already in your book/.test(S.previewSentence(prev)), "preview reports already-in");
ok(/4 will be added/.test(S.previewSentence(prev)), "preview reports will-add");
ok(/1 duplicate/.test(S.previewSentence(prev)), "preview reports duplicates");

const stub = S.makeStub("SMASH 2x2", "offense", "Smash", "stub-1");
ok(stub.id === "stub-1" && stub.stub === true && stub.needsDiagram === true, "stub flags set");
ok(stub.family === "Smash" && stub.concept === "Smash", "second column lands on family+concept (SCHEME MATCH fields)");
ok(stub.side === "offense" && stub.players.length === 0, "stub is name-only");
ok(S.isStub(stub) && !S.isTeachable(stub) && !S.isDrawn(stub), "stub not teachable");
ok(S.suggestTagsFromName("SMASH 2x2").indexOf("2x2") >= 0, "name hint suggests 2x2 — coach confirms");
ok(S.suggestTagsFromName("Cover 3 Beater").indexOf("Cover 3") >= 0, "name hint suggests Cover 3");

const drawn = {
  id: "stub-1",
  name: "SMASH 2x2",
  stub: true,
  needsDiagram: true,
  players: [
    { route: [{ x: 10, y: 10 }] },
    { route: [{ x: 2, y: 2 }] },
    {},
    {},
    {}
  ]
};
S.upgradeIfDrawn(drawn);
ok(drawn.stub === false && drawn.needsDiagram === false && drawn.id === "stub-1", "draw upgrades in place, same id");
ok(S.isTeachable(drawn), "drawn stub becomes teachable");

const defStub = S.makeStub("Nickel Fire", "defense", "", "d1");
ok(defStub.side === "defense" && defStub.type === "defense", "defense stub side");
ok(S.playSide(defStub) === "defense", "playSide reads defense");
ok(S.filterBySide([stub, defStub], "defense").length === 1, "side filter keeps D stubs");

const starter = { name: "Smash", formation: "2x2 Doubles (Gun)", starter: true, players: [{ route: [1] }, {}, {}, {}, {}] };
ok(S.isStarterPlay(starter), "starter flagged / inferred");
ok(S.hasOwnPlays([starter, stub]), "own stub counts as own play");
ok(S.shouldHideStarter(starter, [starter, stub]), "starter demoted once own plays exist");
ok(!S.shouldHideStarter(starter, [starter]), "starter stays when it's the only book");

const entries = [
  { play: "Smash", playObj: starter, sr: 0.7, n: 0, rankGroup: S.rankGroup(starter, 0, [starter, stub]) },
  { play: "SMASH 2x2", playObj: stub, sr: 0.4, n: 20, rankGroup: S.rankGroup(stub, 20, [starter, stub]) },
  { play: "Flood Rt", playObj: S.makeStub("Flood Rt", "offense"), sr: 0, n: 0, rankGroup: 2 },
];
const sorted = S.sortCallerEntries(entries, [starter, stub]);
ok(sorted[0].play === "SMASH 2x2", "stub called 20 times outranks unused starter");
ok(sorted.some(function (e) { return e.play === "Flood Rt"; }), "untouched stub still shown");
ok(!sorted.some(function (e) { return e.play === "Smash"; }), "starter excluded once own plays exist");
ok(S.rankGroup(stub, 20, lib) === 0, "stub with EV is group 0");
ok(S.rankGroup(S.makeStub("X", "offense"), 0, lib) === 2, "untouched stub is group 2");

ok(S.teachablePlays([stub, drawn]).length === 1 && S.teachablePlays([stub, drawn])[0].id === "stub-1", "install/reps skip stubs");

ok(/id="stubSheetBtn"/.test(PB) && /Add plays from your call sheet/.test(PB), "playbook entry button");
ok(/id="stubSheetModal"/.test(PB) && /id="stubSideOff"/.test(PB) && /id="stubSideDef"/.test(PB), "paste modal + side selector");
ok(/id="stubCsvFile"/.test(PB) && /Needs diagram/.test(PB), "CSV upload + badge");
ok(/Houston, Flood/.test(PB) && /concept\/family/.test(PB) && /SMASH, MESH, FLOOD, VERTS, STICK, CURL/.test(PB) && !/optional family\/tag/.test(PB), "paste copy names concept words + house-name column");
ok(/OFFGRD-play-stubs\.js\?v=/.test(PB) && /OFFGRD-play-stubs\.js\?v=/.test(HOME) && /OFFGRD-play-stubs\.js\?v=/.test(QB), "stubs module pinned on playbook + caller + reps");
ok(/rankGroup/.test(HOME) && /CALL SHEET/.test(HOME), "caller ranks stubs below EV, still shown");
ok(/isTeachable/.test(QB), "reps lab skips unteachable stubs");
ok(/namedCallHtml/.test(fs.readFileSync(path.join(ROOT, "OFFGRD-dcaller.js"), "utf8")), "D Caller lists named D calls");
ok(/OFFGRD_PLAY_STUBS\.isTeachable/.test(fs.readFileSync(path.join(ROOT, "OFFGRD-scoutcards.js"), "utf8")), "scout cards skip stubs");
ok(/OFFGRD_PLAY_STUBS\.isTeachable/.test(fs.readFileSync(path.join(ROOT, "OFFGRD-week-autotest.js"), "utf8")), "week autotest skip stubs");
ok(/isStub\(copy\)/.test(PB), "save does not persist a seeded blank as drawn");
ok(/stPaste/.test(PB) && /Paste call sheet/.test(PB), "starter overlay offers paste");

console.log("ok", n, "play-stub checks");
