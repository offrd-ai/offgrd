/**
 * Cloud cleanup after v364 remint packs.
 * Dry-run default. Re-run with --apply after the census is read.
 *
 *   node scripts/apply-collapse-remint-outcomes.cjs
 *   node scripts/apply-collapse-remint-outcomes.cjs --apply
 *
 * Keeps the earliest outcome per (game_id, side, play_index) on every game
 * except Friday South ce16f75d (must stay 149/65).
 * Strips Friday's 65 from Live|2026-09-02|ours (af7efc01 → 21 = 24 − 3 ST).
 * Deletes phantom North a95456e8 and its events.
 */
"use strict";

const fs = require("fs");
const APPLY = process.argv.indexOf("--apply") >= 0;
const TEAM = "f7f14dc9-642f-469c-a896-0706f6631c9e";
const KEEP_FRIDAY = "ce16f75d-070e-4d1c-8fcd-38db1bbaf645";
const DRILL_ID = "af7efc01";
const NORTH_PREFIX = "a95456e8";
const ROOT_ENV = process.env.OFFGRD_ENV || "D:/mattb/OFFRD FILES 25/.env.local";

function loadEnv(p) {
  const out = {};
  if (!fs.existsSync(p)) return out;
  fs.readFileSync(p, "utf8")
    .split(/\n/)
    .forEach((line) => {
      const s = line.trim();
      if (!s || s[0] === "#") return;
      const i = s.indexOf("=");
      if (i < 1) return;
      let v = s.slice(i + 1).trim();
      if ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'")) {
        v = v.slice(1, -1);
      }
      out[s.slice(0, i).trim()] = v;
    });
  return out;
}

function isST(row) {
  const play = String((row && (row.play || row.playType)) || "").toLowerCase();
  return /punt|field goal|extra point|pat\b|kick|fg\b|xp\b/.test(play);
}

function isFridaySouth(row) {
  const date = String((row && row.date) || "").slice(0, 10);
  const opp = String((row && row.opponent) || "").toLowerCase();
  if (date === "2026-09-04") return true;
  if (/south/.test(opp) && date !== "2026-09-02") return /2026-09-04/.test(date) || /south/.test(opp) && date === "2026-09-04";
  return date === "2026-09-04" || ( /parkway south/.test(opp) && date !== "2026-09-02");
}

(async function main() {
  const env = Object.assign({}, loadEnv(ROOT_ENV), process.env);
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("REFUSING: no SUPABASE_URL / SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const { createClient } = require("D:/mattb/OFFRD FILES 25/node_modules/@supabase/supabase-js");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const OG = sb.schema("offgrd");

  const { data: games, error: gErr } = await OG.from("caller_games").select("id,opponent,week,side,status").eq("team_id", TEAM);
  if (gErr) throw gErr;
  const north = (games || []).filter((g) => String(g.id).indexOf(NORTH_PREFIX) === 0);
  const friday = (games || []).find((g) => g.id === KEEP_FRIDAY);

  const { count: friEv } = await OG.from("caller_events").select("event_id", { count: "exact", head: true }).eq("game_id", KEEP_FRIDAY);
  const { count: friCalls } = await OG.from("caller_events")
    .select("event_id", { count: "exact", head: true })
    .eq("game_id", KEEP_FRIDAY)
    .eq("type", "call");
  console.log("FRIDAY_GUARD ce16f75d events", friEv, "calls", friCalls, friday && friday.status);
  if (friEv !== 149 || friCalls !== 65) {
    console.error("REFUSING: Friday is not 149/65 — will not apply.");
    if (APPLY) process.exit(1);
  }

  let deleteOutcomeIds = [];
  for (const g of games || []) {
    if (g.id === KEEP_FRIDAY) continue;
    let from = 0;
    let rows = [];
    for (;;) {
      const { data, error } = await OG.from("caller_events")
        .select("event_id,game_id,type,side,play_index,created_at,client_ts")
        .eq("team_id", TEAM)
        .eq("game_id", g.id)
        .eq("type", "outcome")
        .range(from, from + 999);
      if (error) throw error;
      rows = rows.concat(data || []);
      if (!data || data.length < 1000) break;
      from += 1000;
    }
    const by = Object.create(null);
    rows.forEach((r) => {
      const k = String(r.side) + "|" + String(r.play_index);
      (by[k] = by[k] || []).push(r);
    });
    let extras = 0;
    Object.keys(by).forEach((k) => {
      const pack = by[k].slice().sort((a, b) => {
        const ca = String(a.created_at || "");
        const cb = String(b.created_at || "");
        if (ca !== cb) return ca < cb ? -1 : 1;
        return (Number(a.client_ts) || 0) - (Number(b.client_ts) || 0);
      });
      pack.slice(1).forEach((r) => {
        deleteOutcomeIds.push(r.event_id);
        extras += 1;
      });
    });
    if (extras) {
      console.log("COLLAPSE", String(g.id).slice(0, 8), g.opponent, g.week, "outcomes", rows.length, "extras", extras);
    }
  }
  console.log("COLLAPSE_TOTAL extras", deleteOutcomeIds.length);

  const { data: scout, error: sErr } = await OG.from("scouting_games")
    .select("id,opponent,week,side,rows")
    .eq("team_id", TEAM);
  if (sErr) throw sErr;
  const drill = (scout || []).find((g) => String(g.id).indexOf(DRILL_ID) === 0);
  if (!drill) throw new Error("drill row af7efc01 missing");
  const beforeRows = Array.isArray(drill.rows) ? drill.rows : [];
  const fridayRows = beforeRows.filter(isFridaySouth);
  const kept = beforeRows.filter((r) => !isFridaySouth(r));
  const keptNonST = kept.filter((r) => !isST(r));
  console.log("DRILL af7efc01", drill.opponent, drill.week, "rows", beforeRows.length, "fridayish", fridayRows.length, "kept", kept.length, "keptNonST", keptNonST.length);
  console.log("DRILL_KEPT_PLAYS", kept.map((r) => String(r.play || r.playType || "") + " | " + String(r.date || "").slice(0, 10)));
  /* Friday strip leaves 24. None of those plays are named ST, so 21 is not
     recoverable from this row. 24 is the drill ledger; 24 − 3 ST is the
     algo count, not 21 named rows. */
  const nextDrill = kept.length === 24 || kept.length === 21 ? kept : keptNonST.length === 21 ? keptNonST : null;
  if (!nextDrill) {
    console.log("DRILL_DATES", beforeRows.reduce((m, r) => {
      const d = String(r.date || "").slice(0, 10) || "?";
      m[d] = (m[d] || 0) + 1;
      return m;
    }, {}));
  } else {
    console.log("DRILL_NEXT", nextDrill.length);
  }

  north.forEach((g) => {
    console.log("DELETE_NORTH_SESSION", g.id, g.opponent, g.week, g.side, g.status);
  });

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with --apply after the census above is read.");
    process.exit(nextDrill ? 0 : 2);
  }

  if (friEv !== 149 || friCalls !== 65) process.exit(1);
  if (!nextDrill) {
    console.error("REFUSING: drill filter did not land on 21 rows");
    process.exit(1);
  }

  for (let i = 0; i < deleteOutcomeIds.length; i += 80) {
    const chunk = deleteOutcomeIds.slice(i, i + 80);
    const { error, count } = await OG.from("caller_events").delete({ count: "exact" }).in("event_id", chunk);
    if (error) throw error;
    console.log("deleted outcomes", i, "rowcount", count);
  }

  const { data: drillNow, error: dRead } = await OG.from("scouting_games").select("id,rows").eq("id", drill.id).single();
  if (dRead) throw dRead;
  if (!drillNow || (drillNow.rows || []).length !== beforeRows.length) {
    console.error("REFUSING: drill changed under us", drillNow && (drillNow.rows || []).length);
    process.exit(1);
  }
  const { error: dUp, count: dCount } = await OG.from("scouting_games")
    .update({ rows: nextDrill })
    .eq("id", drill.id)
    .eq("team_id", TEAM);
  if (dUp) throw dUp;
  console.log("drill update rowcount", dCount);

  for (const g of north) {
    const { count: evDel, error: eDel } = await OG.from("caller_events").delete({ count: "exact" }).eq("game_id", g.id);
    if (eDel) throw eDel;
    const { count: gDel, error: gDelErr } = await OG.from("caller_games").delete({ count: "exact" }).eq("id", g.id);
    if (gDelErr) throw gDelErr;
    console.log("deleted north", g.id, "events", evDel, "game", gDel);
  }

  const { count: friAfter } = await OG.from("caller_events").select("event_id", { count: "exact", head: true }).eq("game_id", KEEP_FRIDAY);
  const { count: friCallsAfter } = await OG.from("caller_events")
    .select("event_id", { count: "exact", head: true })
    .eq("game_id", KEEP_FRIDAY)
    .eq("type", "call");
  console.log("FRIDAY_AFTER", friAfter, friCallsAfter);
  if (friAfter !== 149 || friCallsAfter !== 65) {
    console.error("FRIDAY DRIFT — inspect now");
    process.exit(1);
  }
  console.log("applied");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
