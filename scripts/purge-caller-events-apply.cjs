/**
 * One-shot test-corpus apply: archive caller_games, delete their caller_events.
 *
 * Tombstone only blocks the purged natural key. A new session is a new key.
 * That is why retain-plus-tombstone cannot work — leftover caller_events
 * fold into the next session unless they are deleted (this once) or the
 * fold is scoped by gameId (the September fix).
 *
 * After the first real game this script must not delete events. Clear
 * becomes archive-only; events stay on the archived game as the audit log.
 *
 *   node scripts/purge-caller-events-apply.cjs
 *   node scripts/purge-caller-events-apply.cjs --apply --i-understand-test-corpus
 *
 * PRESERVE: scouting_games, scout_import, maps, playbook, schedule.
 * Default is dry-run. Fails loud without Cloud credentials.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const APPLY = process.argv.indexOf("--apply") >= 0;
const CONFIRM = process.argv.indexOf("--i-understand-test-corpus") >= 0;
const PARKWAY_TEAM = "f7f14dc9-642f-469c-a896-0706f6631c9e";
const ROOT_ENV = process.env.OFFGRD_ENV || "D:/mattb/OFFRD FILES 25/.env";

function loadEnv(p) {
  const out = {};
  if (!fs.existsSync(p)) return out;
  fs.readFileSync(p, "utf8")
    .split(/\n/)
    .forEach((line) => {
      line = line.replace(/\r$/, "");
      const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (!m) return;
      out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    });
  return out;
}

const sandbox = {
  console,
  localStorage: { getItem() { return null; }, setItem() {} },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "..", "OFFGRD-caller-side.js"), "utf8"),
  sandbox
);
const S = sandbox.OFFGRD_CALLER_SIDE;

(async function main() {
  const env = Object.assign({}, loadEnv(ROOT_ENV), process.env);
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("REFUSING: no SUPABASE_URL / SERVICE_ROLE_KEY (checked " + ROOT_ENV + ")");
    process.exit(1);
  }

  let createClient;
  try {
    ({ createClient } = require("@supabase/supabase-js"));
  } catch (e1) {
    ({ createClient } = require(path.join(
      "D:/mattb/OFFRD FILES 25/node_modules/@supabase/supabase-js"
    )));
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const OG = sb.schema("offgrd");

  const { data: games, error: gErr } = await OG.from("caller_games")
    .select("id,opponent,week,side,status,team_id")
    .eq("team_id", PARKWAY_TEAM);
  if (gErr) throw gErr;

  const { data: events, error: eErr } = await OG.from("caller_events")
    .select("event_id,game_id")
    .eq("team_id", PARKWAY_TEAM);
  if (eErr) throw eErr;

  const plan = S.planCallerEventsPurge(
    games || [],
    (events || []).map(function (r) {
      return { eventId: r.event_id, gameId: r.game_id };
    })
  );

  console.log(APPLY ? "APPLY" : "DRY-RUN", "— caller_events test-corpus purge");
  console.log("policy:", plan.policy);
  console.log("after first real game:", plan.afterFirstRealGame);
  console.log("caller_games:", (games || []).length);
  console.log("caller_events:", (events || []).length);
  console.log("archive gameIds:", plan.archiveGameIds.length);
  plan.archiveGameIds.forEach(function (id) {
    const g = (games || []).find(function (x) { return x && x.id === id; });
    console.log(
      "  -",
      id,
      g ? (g.opponent || "?") + " | " + (g.week || "?") + " | " + (g.side || "?") + " | " + (g.status || "?") : "(events only)",
      "events=" + (plan.eventsByGame[id] || 0)
    );
  });
  console.log("delete events:", plan.deleteEventCount);
  console.log("local keys to clear on every device:");
  plan.localKeys.forEach(function (k) {
    console.log("  -", k);
  });
  console.log("  plus live_call slice of offgrd_season_v2 / offgrd_week_v1");
  console.log("D-store is not a second population — it stays empty until D Caller opens.");

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with --apply --i-understand-test-corpus after Matt reads this.");
    process.exit(0);
  }
  if (!CONFIRM) {
    console.error("REFUSING --apply without --i-understand-test-corpus");
    process.exit(1);
  }
  if (!plan.archiveGameIds.length) {
    console.error("REFUSING: no caller_games / gameIds to archive");
    process.exit(1);
  }

  let archived = 0;
  let deleted = 0;
  for (let i = 0; i < plan.archiveGameIds.length; i++) {
    const id = plan.archiveGameIds[i];
    const { error: aErr } = await OG.from("caller_games")
      .update({ status: "archived" })
      .eq("id", id)
      .eq("team_id", PARKWAY_TEAM);
    if (aErr) throw aErr;
    archived += 1;
    const { data: gone, error: dErr } = await OG.from("caller_events")
      .delete()
      .eq("team_id", PARKWAY_TEAM)
      .eq("game_id", id)
      .select("event_id");
    if (dErr) throw dErr;
    deleted += (gone || []).length;
  }

  const { count: left, error: leftErr } = await OG.from("caller_events")
    .select("event_id", { count: "exact", head: true })
    .eq("team_id", PARKWAY_TEAM);
  if (leftErr) throw leftErr;

  console.log("\nArchived", archived, "caller_games · deleted", deleted, "caller_events");
  console.log("Remaining caller_events for team:", left == null ? "?" : left);
  console.log("Clear the local keys above on every booth device, then hard-refresh.");
  console.log("Do not open a caller until those keys are gone — stale O-store will re-sync nothing if cloud is empty.");
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
