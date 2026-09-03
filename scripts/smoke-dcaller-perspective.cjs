/**
 * D Caller defense-own perspective — flip table, South hash, import toggle.
 *   node scripts/smoke-dcaller-perspective.cjs
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

function load(name, sandbox) {
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, name), "utf8"), sandbox, {
    filename: name,
  });
  return sandbox;
}

function ok(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("ok:", msg);
}

const sandbox = { console: console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
load("OFFGRD-dcaller-perspective.js", sandbox);
load("OFFGRD-caller-sit.js", sandbox);

const P = sandbox.OFFGRD_DCALLER_PERSPECTIVE;
const Sit = sandbox.OFFGRD_CALLER_SIT;

ok(!!P && typeof P.flipSide === "function", "perspective module exports");
ok(P.flipSide("L") === "R" && P.flipSide("R") === "L", "L↔R");
ok(P.flipSide("M") === "M" && P.flipSide("ANY") === "ANY", "M/ANY stay");
ok(P.flipSide("Left") === "R" && P.flipSide("RIGHT") === "L", "word forms flip");
ok(P.fromDefenseTap("L") === "R", "your L tap → canonical R");
ok(P.fromDefenseTap("R") === "L", "your R tap → canonical L");
ok(P.speakDirShort("L") === "your R", "offense L displays your R");
ok(P.speakDirShort("R") === "your L", "offense R displays your L");
ok(P.speakDirShort("M") === "middle", "M short is middle");
ok(P.speakDir("L") === "your right" && P.speakWent("L") === "to your right", "prose your right");
ok(P.speakHash("R") === "your L hash", "canonical hash R → your L hash");
ok(P.speakHashChip("R") === "your L" && P.speakHashChip("M") === "M", "hash chips");
ok(P.speakPlay("Run L") === "Run your R", "play label flips");

/* South row by hand: Hudl HASH R (offense right) is the DC's left. */
const southHashRow = {
  down: 1,
  distance: 10,
  hash: "R",
  playType: "Run",
  direction: "L",
};
ok(southHashRow.hash === P.fromDefenseTap("L"), "South hash R matches your L chip");
ok(typeof Sit.filterPool === "function", "caller-sit filterPool");
const pool = [
  southHashRow,
  { down: 1, distance: 10, hash: "L", playType: "Run", direction: "R" },
];
const yourL = Sit.filterPool(pool, { dn: 1, db: "10+", hash: P.fromDefenseTap("L") });
ok(yourL.length === 1 && yourL[0].hash === "R", "your L chip filters canonical hash R");

const flipped = P.canonicalizeFromDefenseView({ hash: "L", play_dir: "R", direction: "Left" });
ok(flipped.hash === "R" && flipped.play_dir === "L" && flipped.direction === "R", "import defense-view flip");

const dc = fs.readFileSync(path.join(ROOT, "OFFGRD-dcaller.js"), "utf8");
ok(/your L/.test(dc) && /your R/.test(dc), "D Caller templates say your L / your R");
ok(!/>L</.test(dc) && !/>R</.test(dc), "no bare >L< / >R< chip labels");
ok(!/"Left"/.test(dc) && !/"Right"/.test(dc), "no Left/Right button labels");
ok(/your L hash/.test(dc) || /speakHash/.test(dc), "sit speaks hash via helper");

const html = fs.readFileSync(path.join(ROOT, "OFFGRD.html"), "utf8");
ok(/Direction\/hash in this film is tagged from/.test(html), "import perspective toggle present");
ok(/the offense/.test(html) && /Hudl default/.test(html), "default copy is offense / Hudl");
ok(/our defense/.test(html), "defense-view option present");
ok(/name="imp-dir-view" value="offense" checked/.test(html), "defaults offense");
ok(/direction: \$\{getImportDirView\(\)==="defense"\?"defense":"offense"\} view/.test(html) ||
  /direction: /.test(html) && /offense view/.test(html), "receipt shows direction view");
ok(/OFFGRD-dcaller-perspective\.js\?v=/.test(html), "HTML pins perspective module");

const sw = fs.readFileSync(path.join(ROOT, "offgrd-sw.js"), "utf8");
ok(/OFFGRD-dcaller-perspective\.js/.test(sw), "SW precaches perspective module");

const assist = fs.readFileSync(path.join(ROOT, "OFFGRD-assist-import.js"), "utf8");
ok(/canonicalizeRowsFromDefenseView/.test(assist), "assist flips defense-tagged film");
ok(/direction: /.test(assist) && /offense view/.test(assist), "assist receipt direction line");

const callerHtml = html;
ok(/seg\("seg-hash",\["ANY","L","M","R"\],"hash"\)/.test(callerHtml), "O surfaces keep bare L/R hash chips");

console.log("ok: dcaller perspective (flip + South hash + import toggle)");
