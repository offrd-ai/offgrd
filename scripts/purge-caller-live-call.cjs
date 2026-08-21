/**
 * One-shot purge of July/August live_call test data.
 * Default is dry-run. Matt reads the counts before --apply.
 *
 *   node scripts/purge-caller-live-call.cjs
 *   node scripts/purge-caller-live-call.cjs --season path\to\offgrd_season_v2.json
 *   node scripts/purge-caller-live-call.cjs --apply --season ... --events ...
 *
 * PRESERVE: scout_import and empty-source film rows, play map, formation map,
 * opp cards, playbook, schedule.
 * DELETE: live_call rows only, plus caller event stores / synced-id map.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const APPLY = process.argv.indexOf("--apply") >= 0;
const seasonArg = argVal("--season");
const eventsArg = argVal("--events");
const GAME_ID = "9831eb33-587e-46e4-a9c8-b872722421b2";

function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

const sandbox = { console, localStorage: { getItem() { return null; }, setItem() {} } };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "..", "OFFGRD-caller-side.js"), "utf8"),
  sandbox
);
const S = sandbox.OFFGRD_CALLER_SIDE;

function readJson(p) {
  if (!p) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const season = readJson(seasonArg) || [];
const eventsState = readJson(eventsArg) || { events: [] };
const plan = S.planLiveCallPurge(season, eventsState, { gameId: GAME_ID });

console.log(APPLY ? "APPLY" : "DRY-RUN", "— live_call purge");
console.log("caller gameId:", plan.gameId);
console.log("events matched / in dump:", plan.dropEventCount);
console.log("\nWould drop whole live games:");
if (!plan.dropWholeGames.length) console.log("  (none)");
plan.dropWholeGames.forEach(function (g) {
  console.log("  -", g.opponent, "|", g.week, "|", g.side, "| src=" + g.source, "| n=" + g.rows);
});
console.log("\nWould strip live_call rows from mixed games:");
if (!plan.stripLiveCallFrom.length) console.log("  (none)");
plan.stripLiveCallFrom.forEach(function (g) {
  console.log("  -", g.opponent, "|", g.week, "|", g.side, "| strip", g.strip, "keep", g.keep);
});
console.log("\nSurviving after purge:");
console.log("  games:", plan.survivingGames);
console.log("  rows:", plan.survivingRows);
console.log("  by source:", JSON.stringify(plan.survivingBySource));
console.log("\nLocal keys to clear (browser):", plan.localKeys.join(", "));
console.log("  plus live_call slice of offgrd_season_v2");
console.log("Cloud: archiveCallerGame(" + GAME_ID + ") then tombstone any source=live_call scouting_games.");

if (plan.survivingBySource.live_call) {
  console.error("\nREFUSING: surviving live_call count is", plan.survivingBySource.live_call);
  process.exit(1);
}

if (!APPLY) {
  console.log("\nDry-run only. Re-run with --apply --season <file> after Matt reads this.");
  process.exit(0);
}

if (!seasonArg) {
  console.error("--apply requires --season <offgrd_season_v2.json>");
  process.exit(1);
}
const next = S.applySeasonPurge(season, plan);
const out = seasonArg.replace(/\.json$/i, "") + ".purged.json";
fs.writeFileSync(out, JSON.stringify(next));
console.log("\nWrote", out);
if (eventsArg) {
  const evOut = eventsArg.replace(/\.json$/i, "") + ".purged.json";
  fs.writeFileSync(evOut, JSON.stringify({ session: null, events: [], seq: 0 }));
  console.log("Wrote", evOut);
}
