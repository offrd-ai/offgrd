/**
 * Halftime template smoke — 4 sections, shared tendencyShift facts, no LLM.
 *   node scripts/smoke-halftime.cjs
 */
"use strict";

const A = require("../OFFGRD-caller-analysis.js");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

function lt(ln) {
  return A.lineText ? A.lineText(ln) : typeof ln === "string" ? ln : (ln && ln.text) || "";
}

const dLog = [];
for (let i = 0; i < 6; i++) {
  dLog.push({
    playIndex: i,
    dn: i < 3 ? 1 : 2,
    db: "10+",
    playType: i % 2 ? "pass" : "run",
    result: "gain",
    gain: i % 2 ? 8 : 2,
    coverage: i < 3 ? "Cover 3" : "Cover 1",
    front: "4-2",
    pressure: "none",
    flags: i === 1 ? ["bust"] : i === 4 ? ["missed_fit"] : [],
    isChunk: i === 5,
    side: "defense",
  });
}
const oLog = [
  { dn: 3, db: "7-9", playType: "pass", result: "gain", gain: 9, success: 1, concept: "Mesh" },
  { dn: 3, db: "4-6", playType: "run", result: "gain", gain: 1, success: 0, concept: "ISO" },
];

const live = [
  { playType: "pass" },
  { playType: "pass" },
  { playType: "run" },
];
const season = [
  { playType: "run" },
  { playType: "run" },
  { playType: "run" },
  { playType: "pass" },
];
const shift = A.tendencyShift({ live: live, season: season });
assert(shift, "tendencyShift should fire");

const ht = A.halftimeTemplate({
  side: "defense",
  offenseLog: oLog,
  defenseLog: dLog,
  shifts: [{ bucket: "1st & 10+", shift: shift }],
});

assert(ht.sections && ht.sections.length === 4, "4 sections");
assert(ht.side === "defense", "default/defense side");
const ids = ht.sections.map((s) => s.id).join(",");
assert(ids === "what_they,working,suggested,tags", "section ids: " + ids);

const what = ht.sections[0];
assert(
  what.lines.some((l) => /tonight \d+% pass/.test(lt(l))),
  "shift line in what_they: " + what.lines.map(lt).join(" | ")
);
assert(
  what.lines.some((l) => /season data/i.test(lt(l))),
  "formations season-data honesty"
);

const sug = ht.sections[2];
assert(sug.looks && sug.looks.length, "suggested looks present");
assert(
  sug.looks.every((l) => l.facts && l.facts.kind),
  "every look has rule facts"
);

console.log("PASS smoke-halftime");
