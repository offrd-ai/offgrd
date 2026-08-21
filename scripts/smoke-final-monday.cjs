/**
 * Final template + Monday Focus payload — 20-snap tagged game, no player names.
 *   node scripts/smoke-final-monday.cjs
 */
"use strict";

const A = require("../OFFGRD-caller-analysis.js");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const dLog = [];
for (let i = 0; i < 20; i++) {
  const dn = (i % 4) + 1;
  dLog.push({
    playIndex: i,
    dn: dn,
    db: dn === 3 ? "10+" : "4-6",
    playType: i % 3 === 0 ? "pass" : "run",
    result: i === 7 ? "turnover" : "gain",
    gain: i === 7 ? 0 : i % 5,
    coverage: i % 2 ? "Cover 3" : "Cover 1",
    front: "4-2",
    pressure: i % 5 === 0 ? "mike" : "none",
    flags: i % 4 === 1 ? ["bust"] : i % 4 === 3 ? ["missed_fit"] : [],
    isChunk: i % 6 === 0,
    isStop: i % 5 === 2,
    side: "defense",
    sitTxt: dn + " & " + (dn === 3 ? "10+" : "4-6"),
  });
}
const oLog = [
  { playIndex: 0, dn: 1, db: "10+", playType: "run", result: "gain", gain: 4, success: 1, concept: "ISO" },
  { playIndex: 1, dn: 2, db: "6", playType: "pass", result: "turnover", gain: 0, success: 0, concept: "Mesh" },
];

const live = Array(4).fill({ playType: "pass" });
const season = Array(4).fill({ playType: "run" });
const shift = A.tendencyShift({ live: live, season: season });
assert(shift, "shift");

const ft = A.finalTemplate({
  offenseLog: oLog,
  defenseLog: dLog,
  shifts: [{ bucket: "1st & 10+", shift: shift }],
  breaks: [{ kind: "final", afterPlayIndex: 19 }],
});

assert(ft.sections && ft.sections.length >= 6, "final has halftime + drives + turnovers");
const ids = ft.sections.map((s) => s.id);
assert(ids.indexOf("drives") >= 0, "drive chart section");
assert(ids.indexOf("turnovers") >= 0, "turnover section");
assert(ids.indexOf("what_they") >= 0, "inherits halftime sections");

const mf = A.buildMondayFocusPayload({
  offenseLog: oLog,
  defenseLog: dLog,
  shifts: [{ bucket: "1st & 10+", shift: shift }],
  breaks: [],
  session: { gameId: "g1", opp: "Test Opp", week: "W1", side: "defense" },
});

assert(mf.kind === "offgrd_monday_focus_input", "kind");
assert(mf.schemaVersion === 3, "schemaVersion");
assert(mf.tagsBySchemeSituation.length, "tag cells");
assert(
  mf.tagsBySchemeSituation.some((t) => /bust × Cover/.test(t.evidence)),
  "evidence shape: " + mf.tagsBySchemeSituation[0].evidence
);
assert(Array.isArray(mf.candidates) && mf.candidates.length, "ranked candidates");
assert(mf.candidates[0].score >= mf.candidates[mf.candidates.length - 1].score, "candidates sorted");
const bust = mf.candidates.find((c) => c.tag === "bust" && /Cover 3/i.test(c.schemeValue || ""));
assert(bust, "Cover-3 bust candidate");
assert(bust.kind === "coverage", "kind=coverage not game_tag");
assert(bust.dimension == null, "dimension null (tag is evidence)");
assert(bust.positionGroup === "DB", "A default DB for Cover");
assert(bust.focusHint && bust.focusHint.kind === "coverage", "focusHint.kind");
assert(bust.focusHint.scheme_type === "coverage", "focusHint.scheme_type");
assert(bust.focusHint.scheme_value === "Cover 3", "focusHint.scheme_value");
assert(bust.focusHint.dimension == null, "focusHint.dimension null");
assert(bust.focusHint.position_group === "DB", "focusHint.position_group");
assert(bust.focusHint.baseline_attempts === bust.n, "baseline_attempts = n");
assert(bust.focusHint.baseline_correct === 0, "baseline_correct 0 for busts");
assert(bust.focusHint.source_tag === "livetag_monday", "source_tag");

/* merge preserves accepted + coach group override */
const prior = JSON.parse(JSON.stringify(mf));
prior.candidates[0].status = "accepted";
prior.candidates[0].positionGroup = "LB";
prior.candidates[0].trackedFocusId = "tf-1";
const mf2 = A.buildMondayFocusPayload({
  offenseLog: oLog,
  defenseLog: dLog,
  shifts: [{ bucket: "1st & 10+", shift: shift }],
  breaks: [],
  session: { gameId: "g1", opp: "Test Opp", week: "W1", side: "defense" },
  priorMondayFocus: prior,
});
const k0 = A.mondayCandidateKey(prior.candidates[0]);
const merged = mf2.candidates.find((c) => A.mondayCandidateKey(c) === k0);
assert(merged && merged.status === "accepted", "merge keeps accepted");
assert(merged.positionGroup === "LB", "merge keeps coach group");
assert(merged.trackedFocusId === "tf-1", "merge keeps tracked id");

/* Re-sync / second Final build — same key stays one accepted row, not a second proposal */
const mf3 = A.buildMondayFocusPayload({
  offenseLog: oLog,
  defenseLog: dLog,
  shifts: [{ bucket: "1st & 10+", shift: shift }],
  breaks: [],
  session: { gameId: "g1", opp: "Test Opp", week: "W1", side: "defense" },
  priorMondayFocus: mf2,
});
const sameKey = mf3.candidates.filter((c) => A.mondayCandidateKey(c) === k0);
assert(sameKey.length === 1, "re-sync: exactly one row per candidate key (got " + sameKey.length + ")");
assert(sameKey[0].status === "accepted", "re-sync: stays accepted, not re-proposed");
assert(sameKey[0].trackedFocusId === "tf-1", "re-sync: tracked id unchanged");
const proposedDup = mf3.candidates.filter(
  (c) => A.mondayCandidateKey(c) === k0 && c.status === "proposed"
);
assert(proposedDup.length === 0, "re-sync: no second proposed for accepted key");

/* Cover-3 bust count ≥ 3 in this fixture (acceptance scenario) */
assert(bust.n >= 3, "fixture has ≥3 Cover-3 busts (n=" + bust.n + ")");

assert(mf.callFamilies.length, "call families");
assert(mf.driveEfficiency.defense.length, "drive efficiency");
assert(mf.shifts.length === 1 && mf.shifts[0].liveN === 4, "shift both numbers");
assert(mf.sample.defenseN === 20, "sample n");

const json = JSON.stringify(mf);
assert(!/"player_id"/.test(json), "no player_id key");
assert(!/"playerName"/.test(json), "no playerName key");
assert(!/"jersey"/.test(json), "no jersey key");
assert(!/athleteName/.test(json), "no athleteName");
assert(!/"dimension":"bust"/.test(json), "no invalid dimension=bust");
assert(!/"kind":"game_tag"/.test(json), "no kind=game_tag");
/* Opponent / scheme names are fine; ban common person-name fields only */
assert(mf.session.opp === "Test Opp", "opp ok on session");

/* Headline stays rep-earned: accept path must not touch focus_today_overrides */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const syncSrc = fs.readFileSync(path.join(root, "OFFGRD-caller-sync.js"), "utf8");
assert(
  /never start_tracked_focus/.test(syncSrc) && !/startTrackedFocusFromGame/.test(syncSrc),
  "sync must not call start_tracked_focus / startTrackedFocusFromGame"
);
const cloudSrc = fs.readFileSync(path.join(root, "OFFGRD-cloud.js"), "utf8");
assert(
  /start_tracked_focus/.test(cloudSrc) && /Does NOT touch focus_today_overrides/.test(cloudSrc),
  "cloud accept documents no overrides write"
);
assert(
  !/from\([\"']focus_today_overrides[\"']\)/.test(cloudSrc) &&
    !/\.from\([\"']focus_today_overrides[\"']\)/.test(cloudSrc),
  "cloud must not write focus_today_overrides"
);
const dSrc = fs.readFileSync(path.join(root, "OFFGRD-dcaller.js"), "utf8");
assert(
  /startTrackedFocusFromGame/.test(dSrc) && !/focus_today_overrides/.test(dSrc),
  "dcaller confirm → RPC only; no overrides"
);

/* Fold: later flags:[] is a coach clear, not "no update". */
global.window = global;
require("../OFFGRD-caller-outcome.js");
require("../OFFGRD-caller-log.js");
const L = global.OFFGRD_CALLER;
function evFold(partial) {
  return Object.assign(
    {
      playIndex: 0,
      clientTs: 1,
      seq: 1,
      deviceId: "d",
      side: "defense",
      payload: {},
    },
    partial
  );
}
const call0 = evFold({
  eventId: "c1",
  type: "call",
  payload: {
    dn: 1,
    db: "10+",
    coverage: "Cover 3",
    playType: "pass",
    play: "Pass",
    sitTxt: "1st & 10+",
    signal: "42",
  },
});
const foldEvents = [
  call0,
  evFold({
    eventId: "o1",
    type: "outcome",
    clientTs: 2,
    seq: 2,
    payload: { result: "chunk", flags: [], flag: null },
  }),
  evFold({
    eventId: "e1",
    type: "correction",
    clientTs: 3,
    seq: 3,
    payload: {
      result: "chunk",
      coverage: "Cover 3",
      dn: 1,
      db: "10+",
      flags: ["bust"],
      flag: "bust",
    },
  }),
  evFold({
    eventId: "o2",
    type: "outcome",
    clientTs: 4,
    seq: 4,
    payload: { result: "chunk", flags: [], flag: null },
  }),
];
const folded = L.foldCallerEvents(foldEvents);
assert(folded.log[0], "fold has the snap");
assert((folded.log[0].flags || []).indexOf("bust") < 0, "late flags:[] clears bust from flags");
assert(!folded.log[0].flag, "late flags:[] clears flag");
assert((folded.log[0].flags || []).length === 0, "cleared flags land as []");

const omitted = L.foldCallerEvents(foldEvents.slice(0, 3).concat([
  evFold({
    eventId: "o2-omit",
    type: "outcome",
    clientTs: 4,
    seq: 4,
    payload: { result: "chunk" },
  }),
]));
assert((omitted.log[0].flags || []).indexOf("bust") >= 0, "omitted flags key keeps bust");

const clearResult = L.foldCallerEvents([
  call0,
  evFold({
    eventId: "or1",
    type: "outcome",
    clientTs: 2,
    seq: 2,
    payload: { result: "chunk", flags: ["bust"], flag: "bust" },
  }),
  evFold({
    eventId: "or2",
    type: "outcome",
    clientTs: 3,
    seq: 3,
    payload: { result: null },
  }),
]);
assert(clearResult.log[0].result == null, "late result:null clears result");
assert((clearResult.log[0].flags || []).indexOf("bust") >= 0, "result:null does not drop flags");

const clearSignal = L.foldCallerEvents([
  call0,
  evFold({
    eventId: "os1",
    type: "outcome",
    clientTs: 2,
    seq: 2,
    payload: { result: "chunk", signal: null },
  }),
]);
assert(clearSignal.log[0].signal == null, "late signal:null clears signal");

const keepSignal = L.foldCallerEvents([
  call0,
  evFold({
    eventId: "os2",
    type: "outcome",
    clientTs: 2,
    seq: 2,
    payload: { result: "chunk" },
  }),
]);
assert(keepSignal.log[0].signal === "42", "omitted signal key keeps call signal");

const mfFold = A.buildMondayFocusPayload({
  defenseLog: dLog,
  offenseLog: [],
  session: { gameId: "g-fold" },
});
assert(mfFold.candidates && mfFold.candidates.length, "payload from tagged log has candidates");

/* Same focus_tracked cell → one accept with summed baselines */
const collapsed = A.collapseMondayCandidatesForAccept([
  {
    n: 2,
    positionGroup: "DB",
    kind: "coverage",
    schemeType: "coverage",
    schemeValue: "Cover 3",
    dimension: null,
    evidence: "bust × Cover 3 × 1st: 2",
    focusHint: { kind: "coverage", scheme_type: "coverage", scheme_value: "Cover 3", dimension: null, position_group: "DB", baseline_correct: 0, baseline_attempts: 2 },
  },
  {
    n: 1,
    positionGroup: "DB",
    kind: "coverage",
    schemeType: "coverage",
    schemeValue: "Cover 3",
    dimension: null,
    evidence: "bust × Cover 3 × 2nd-short: 1",
    focusHint: { kind: "coverage", scheme_type: "coverage", scheme_value: "Cover 3", dimension: null, position_group: "DB", baseline_correct: 0, baseline_attempts: 1 },
  },
]);
assert(collapsed.length === 1, "collapse to one tracked cell");
assert(collapsed[0].baseline_attempts === 3, "sum baselines 2+1=3");
assert(collapsed[0].sources.length === 2, "keeps source candidates");

console.log(
  "ok: finalTemplate + mondayFocus v3 — fold/payload one reader, cell collapse sums baselines"
);
