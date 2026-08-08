/**
 * Ticket A — attempt_n stamping / same-day retry points.
 * Fails when a same-day same-item pair both pay 10 on correct singles.
 *
 * Pure unit checks (no DB):
 *   node scripts/smoke-attempt-n-retry.cjs
 *
 * Live Braden check (after a retake; needs .env.prod.pull or env):
 *   node scripts/smoke-attempt-n-retry.cjs --live
 */
"use strict";

const fs = require("fs");
const path = require("path");

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert failed");
}

function repPoints(correct, total, attemptN) {
  const t = total == null ? 1 : +total;
  const c = +correct || 0;
  const a = attemptN == null ? 1 : +attemptN;
  if (t > 1) return Math.max(c, 0) * 10 + Math.max(t - c, 0) * 1;
  if (c <= 0) return 1;
  if (a <= 1) return 10;
  return 4;
}

/** Same algorithm the quiz client uses after loadPriorAttemptCounts. */
function stampAttempts(priorCounts, detail) {
  const counts = Object.assign(Object.create(null), priorCounts || {});
  return (detail || []).map((r) => {
    const key = String(r.concept || r.subskill || r.coverage || "")
      .trim()
      .toLowerCase();
    const n = key ? Math.min(20, (counts[key] || 0) + 1) : 1;
    if (key) counts[key] = n;
    return Object.assign({}, r, { attempt_n: n });
  });
}

function findDoubleTenPairs(rows) {
  /* rows: { tested_on, kind, subskill|concept, correct, total, attempt_n, points? } */
  const by = Object.create(null);
  for (const r of rows || []) {
    if (+r.correct <= 0 || (+r.total || 1) !== 1) continue;
    const key = [r.tested_on, r.kind || "", String(r.subskill || r.concept || "").trim().toLowerCase()].join("|");
    if (!key.endsWith("|") && !String(r.subskill || r.concept || "").trim()) continue;
    (by[key] || (by[key] = [])).push(r);
  }
  const bad = [];
  for (const key of Object.keys(by)) {
    const group = by[key];
    if (group.length < 2) continue;
    const tens = group.filter((r) => {
      const pts = r.points != null ? +r.points : repPoints(r.correct, r.total, r.attempt_n);
      return pts === 10;
    });
    if (tens.length >= 2) bad.push({ key, n: tens.length, rows: tens });
  }
  return bad;
}

/* ---- unit ---- */
assert(repPoints(1, 1, 1) === 10, "first correct = 10");
assert(repPoints(1, 1, 2) === 4, "retry correct = 4");
assert(repPoints(0, 1, 1) === 1, "miss = 1");
assert(repPoints(0, 1, 2) === 1, "retry miss = 1");

const stamped = stampAttempts({ "slam — x": 1 }, [
  { concept: "Slam — X", correct: true },
  { concept: "Cali — H", correct: true },
  { concept: "Slam — X", correct: true },
]);
assert(stamped[0].attempt_n === 2, "prior day count → attempt 2");
assert(stamped[1].attempt_n === 1, "fresh item → 1");
assert(stamped[2].attempt_n === 3, "second in-session → 3");
assert(repPoints(1, 1, stamped[0].attempt_n) === 4, "stamped retry pays 4");

const badUnit = findDoubleTenPairs([
  { tested_on: "2026-08-08", kind: "routes", subskill: "Slam — X", correct: 1, total: 1, attempt_n: 1 },
  { tested_on: "2026-08-08", kind: "routes", subskill: "Slam — X", correct: 1, total: 1, attempt_n: 1 },
]);
assert(badUnit.length === 1, "detects double-10 same-day same-item");

const okUnit = findDoubleTenPairs([
  { tested_on: "2026-08-08", kind: "routes", subskill: "Slam — X", correct: 1, total: 1, attempt_n: 1 },
  { tested_on: "2026-08-08", kind: "routes", subskill: "Slam — X", correct: 1, total: 1, attempt_n: 2 },
]);
assert(okUnit.length === 0, "10 then 4 is fine");

console.log("PASS unit: attempt_n stamp + double-10 detector");

async function liveCheck() {
  function loadEnv() {
    const out = { ...process.env };
    for (const name of [".env.prod.pull", ".env.local", ".env"]) {
      const p = path.join(__dirname, "..", "..", "OFFRD FILES 25", name);
      const p2 = path.join(__dirname, "..", name);
      for (const file of [p, p2]) {
        if (!fs.existsSync(file)) continue;
        for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
          if (!line || line.startsWith("#") || !line.includes("=")) continue;
          const i = line.indexOf("=");
          const k = line.slice(0, i).trim();
          const v = line.slice(i + 1).trim();
          if (k && out[k] === undefined) out[k] = v;
        }
      }
    }
    return out;
  }
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("SKIP live: no SUPABASE_URL / SERVICE_ROLE_KEY");
    return;
  }
  /* Prefer Management API via npx is heavy — use PostgREST if granted; else note. */
  const { createClient } = require(path.join(__dirname, "..", "node_modules", "@supabase/supabase-js"));
  const svc = createClient(url, key, { auth: { persistSession: false }, db: { schema: "offgrd" } });
  const braden = "fbd940e2-d26f-4a4e-bdc0-2ad00685d878";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const { data, error } = await svc
    .from("reps_results")
    .select("tested_on,tested_at,kind,subskill,correct,total,attempt_n")
    .eq("user_id", braden)
    .eq("tested_on", today)
    .eq("kind", "routes")
    .order("tested_at", { ascending: true });
  if (error) {
    console.warn("LIVE query error (use supabase db query if 42501):", error.message);
    return;
  }
  const rows = data || [];
  console.log("LIVE Braden routes today:", rows.length, "tested_on=", today);
  for (const r of rows) {
    const pts = repPoints(r.correct, r.total, r.attempt_n);
    console.log(
      [r.tested_at, r.subskill, "c=" + r.correct + "/" + r.total, "attempt_n=" + r.attempt_n, "pts=" + pts].join(" | ")
    );
  }
  const bad = findDoubleTenPairs(rows);
  if (bad.length) {
    console.error("FAIL: same-day same-item correct pairs both paid 10:", JSON.stringify(bad, null, 2));
    process.exit(2);
  }
  const retries = rows.filter((r) => +r.attempt_n > 1);
  if (!rows.length) {
    console.warn("LIVE: no rows yet — retake still pending");
  } else if (!retries.length) {
    console.warn("LIVE: rows present but no attempt_n>1 — client stamp may still be broken/undeployed");
  } else {
    console.log("PASS live: retries present, no double-10 pairs");
  }
}

(async () => {
  if (process.argv.includes("--live")) await liveCheck();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
