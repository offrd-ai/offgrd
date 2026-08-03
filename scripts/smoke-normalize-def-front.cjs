/**
 * Smoke: reverse Excel DEF FRONT date coercion (3-Apr→4-3, 4-Mar→3-4).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "..", "OFFGRD-assist-import.js"), "utf8");
const sandbox = {
  console,
  Promise,
  document: { getElementById: function () { return null; }, querySelector: function () { return null; } },
  OFFGRD_CALLER_OUTCOME: { isSuccessVal: function () { return null; } },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(src, sandbox);
const n = sandbox.OFFGRD_ASSIST_IMPORT.normalizeDefFront;

const cases = [
  ["3-Apr", "4-3"],
  ["3-APR", "4-3"],
  ["4-Mar", "3-4"],
  ["4-MAR", "3-4"],
  ["Apr-3", "4-3"],
  ["Mar-4", "3-4"],
  ["4-3", "4-3"],
  ["3-4", "3-4"],
  ["4-3 OVER", "4-3 OVER"],
  ["3-Apr OVER", "4-3 OVER"],
  ["42 OVER-G", "42 OVER-G"],
  ["BEAR", "BEAR"],
  ["33 STACK", "33 STACK"],
  ["", ""],
];

let fails = 0;
for (const [inp, want] of cases) {
  const got = n(inp);
  if (got !== want) {
    console.error("FAIL", JSON.stringify(inp), "→", JSON.stringify(got), "want", JSON.stringify(want));
    fails++;
  }
}

/* End-to-end: CSV text with corrupted fronts → buildSnaps stores 4-3 / 3-4 */
const csv =
  "PLAY #,ODK,DN,DIST,DEF FRONT,COVERAGE\n" +
  "1,O,1,10,3-Apr,Cover 3\n" +
  "2,O,2,7,3-Apr,Cover 3\n" +
  "3,O,1,10,4-Mar,Cover 1\n" +
  "4,O,3,5,4-3,Cover 3\n";
const parsed = sandbox.OFFGRD_ASSIST_IMPORT.parseText(csv);
const map = sandbox.OFFGRD_ASSIST_IMPORT.detectPresetMap(parsed.headers);
const built = sandbox.OFFGRD_ASSIST_IMPORT.buildSnaps(parsed, map, {
  opponent: "Sample Tech",
  week: "Ship Gate",
  side: "def",
  odkKeep: "O",
});
const fronts = built.snaps.map(function (s) { return s.front; });
const wantFronts = ["4-3", "4-3", "3-4", "4-3"];
if (JSON.stringify(fronts) !== JSON.stringify(wantFronts)) {
  console.error("FAIL buildSnaps fronts", fronts, "want", wantFronts);
  fails++;
}

if (fails) process.exit(1);
console.log("PASS normalizeDefFront —", cases.length, "cases + buildSnaps CSV e2e");
