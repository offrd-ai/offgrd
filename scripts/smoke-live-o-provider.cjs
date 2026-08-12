/**
 * O Caller live provider + drive inference smoke.
 * Synthetic 60-snap fully look-tagged session (hscoach shape).
 *   node scripts/smoke-live-o-provider.cjs
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
  return A.lineText(ln);
}

const PLAYS = ["Slam West", "Mesh", "ISO", "Stick", "Zone Belly", "Y Cross", "Power", "Smash"];
const COVS = ["Cover 1", "Cover 3", "Cover 4", "Cover 2", "Cover 0"];
const FRONTS = ["4-2", "3-3", "4-3"];
const PRESS = ["A-gap", "edge", "B-gap"];

function hscoach60() {
  const log = [];
  for (let i = 0; i < 60; i++) {
    const play = PLAYS[i % PLAYS.length];
    const cov = COVS[i % COVS.length];
    /* Bias Cover 4 heavier late so tonight mix ≠ flat season */
    const coverage = i >= 40 ? (i % 3 === 0 ? "Cover 4" : cov) : cov;
    const dn = (i % 4) + 1;
    const success = i % 5 === 0 ? 0 : 1;
    const gain = success ? 4 + (i % 8) : i % 3;
    const entry = {
      playIndex: i,
      play: play,
      playType: /Mesh|Stick|Cross|Smash/.test(play) ? "Pass" : "Run",
      dn: dn,
      db: dn === 3 ? "7-9" : "10+",
      result: "gain",
      gain: gain,
      success: success,
      coverage: coverage,
      front: FRONTS[i % FRONTS.length],
      pressure: i % 4 === 0 ? PRESS[i % PRESS.length] : null,
      zone: i % 17 === 0 ? "RZ" : "mid",
      concept: success ? "worked" : "didnt_work",
      side: "offense",
    };
    /* Inject strong drive-end signals at known indices */
    if (i === 20) {
      entry.result = "td";
      entry.gain = 12;
      entry.success = 1;
    }
    if (i === 35) {
      entry.result = "turnover";
      entry.gain = 0;
      entry.success = 0;
    }
    if (i === 50) {
      entry.dn = 4;
      entry.db = "4-6";
      entry.result = "gain";
      entry.gain = 1; /* failed 4th vs ~5 yards */
      entry.success = 0;
    }
    /* One thin-n play for LOW badge */
    if (i === 58) {
      entry.play = "Rare Jet";
      entry.success = 1;
      entry.gain = 9;
    }
    log.push(entry);
  }
  return log;
}

const oLog = hscoach60();
assert(oLog.length === 60, "60 snaps");
assert(
  oLog.every((e) => e.coverage),
  "fully look-tagged"
);

const seasonCovDist = {
  arr: [
    { k: "Cover 3", fam: "C3", pct: 0.35 },
    { k: "Cover 1", fam: "C1", pct: 0.28 },
    { k: "Cover 4", fam: "C4", pct: 0.2 },
    { k: "Cover 2", fam: "C2", pct: 0.12 },
    { k: "Cover 0", fam: "C0", pct: 0.05 },
  ],
};

const plays = PLAYS.map((name) => ({ name: name }));
plays.push({ name: "Unused Post" });

const view = A.halftimeTemplate({
  side: "offense",
  offenseLog: oLog,
  defenseLog: [],
  seasonCovDist: seasonCovDist,
  plays: plays,
  scoutRows: [],
});

assert(view.side === "offense", "offense side");
assert(view.sections && view.sections.length === 4, "4 O sections");
const ids = view.sections.map((s) => s.id).join(",");
assert(
  ids === "what_showing,working,call_ideas,tags",
  "O section ids: " + ids
);

const showing = view.sections[0];
assert(showing.lines.length >= 1, "what_showing non-empty");
assert(
  !showing.lines.some((l) => /Formations: season data/i.test(lt(l))),
  "no dead formations stub on O"
);
assert(
  showing.lines.some((l) => /tonight/i.test(lt(l))),
  "tonight look mix: " + showing.lines.map(lt).join(" | ")
);

const working = view.sections[1];
assert(working.lines.length >= 3, "working non-empty");
assert(
  working.lines.some((l) => /Rare Jet/i.test(lt(l)) && l.badge === "LOW"),
  "LOW badge on thin play"
);

const ideas = view.sections[2];
assert(ideas.lines.length >= 1, "call_ideas non-empty");
assert(
  ideas.lines.some((l) => /Lean on|EV |Park |Unused/i.test(lt(l))),
  "call ideas content: " + ideas.lines.map(lt).join(" | ")
);

const tags = view.sections[3];
assert(tags.lines.length >= 1, "tags section present");

/* Drive inference: score / takeaway / failed 4th → exactly one each */
const scoreSnap = oLog[20];
const toSnap = oLog[35];
const fourthSnap = oLog[50];
const infScore = A.inferDriveEndFromSnap(scoreSnap);
const infTo = A.inferDriveEndFromSnap(toSnap);
const inf4 = A.inferDriveEndFromSnap(fourthSnap);
assert(infScore && infScore.kind === "score", "infer score");
assert(infTo && infTo.kind === "takeaway", "infer takeaway");
assert(inf4 && inf4.kind === "downs", "infer failed 4th");

/* Simulate feed + button-press dedup */
const feed = [];
function pushFeed(ev) {
  if (feed.some((x) => x.id === ev.id)) return;
  feed.unshift(ev);
}
function inferPush(entry) {
  const inf = A.inferDriveEndFromSnap(entry);
  if (!inf) return;
  const id = "drive-auto-" + inf.kind + "-" + inf.playIndex;
  pushFeed({
    id: id,
    kind: "drive",
    line: inf.label + " · drive over (auto)",
    playIndex: inf.playIndex,
    inferred: true,
    auto: true,
    driveKind: inf.kind,
  });
}
function mergeButton(kind, tipPi) {
  const dk = kind;
  let hit = null;
  for (let i = 0; i < feed.length; i++) {
    const ev = feed[i];
    if (!ev || ev.kind !== "drive" || !ev.inferred) continue;
    if (ev.playIndex === tipPi || ev.driveKind === dk) {
      hit = ev;
      break;
    }
  }
  const line =
    (kind === "score" ? "Score" : kind === "takeaway" ? "Takeaway" : "Downs") +
    " · drive over";
  if (hit) {
    hit.line = line;
    hit.inferred = false;
    hit.auto = false;
    hit.driveKind = dk;
  } else {
    pushFeed({
      id: "drive-" + dk + "-" + tipPi,
      kind: "drive",
      line: line,
      playIndex: tipPi,
      driveKind: dk,
    });
  }
}

inferPush(scoreSnap);
inferPush(toSnap);
inferPush(fourthSnap);
assert(feed.filter((e) => e.inferred).length === 3, "three inferred lines");
assert(
  feed.filter((e) => e.driveKind === "score").length === 1 &&
    feed.filter((e) => e.driveKind === "takeaway").length === 1 &&
    feed.filter((e) => e.driveKind === "downs").length === 1,
  "exactly one per kind"
);

mergeButton("score", 20);
assert(
  feed.filter((e) => e.driveKind === "score").length === 1,
  "button merge keeps one score line"
);
assert(
  feed.some((e) => e.driveKind === "score" && !e.inferred && /Score · drive over/.test(e.line)),
  "button overrides inferred"
);

console.log("PASS smoke-live-o-provider");
