/**
 * Ticket A — attempt_n stamping / same-day retry points.
 * Same-item identity: (player, kind, play_key, program-local day)
 *   play_key = lower(trim(concept|subskill|coverage))
 *
 * Fails when a same-day same-item pair both pay 10 on correct singles.
 *
 * Pure unit checks (no DB):
 *   node scripts/smoke-attempt-n-retry.cjs
 *
 * Live Braden check (needs .env.prod.pull or env):
 *   node scripts/smoke-attempt-n-retry.cjs --live
 */
"use strict";

const fs = require("fs");
const path = require("path");

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert failed");
}

function playKey(r) {
  return String((r && (r.concept || r.subskill || r.coverage)) || "")
    .trim()
    .toLowerCase();
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

/** Same algorithm the quiz client uses (stampDetailAttempts). */
function stampAttempts(priorCounts, detail) {
  const counts = Object.assign(Object.create(null), priorCounts || {});
  return (detail || []).map((r) => {
    const key = playKey(r);
    const n = key ? Math.min(20, (counts[key] || 0) + 1) : 1;
    if (key) counts[key] = n;
    return Object.assign({}, r, { attempt_n: n });
  });
}

function findDoubleTenPairs(rows) {
  /* Identity: tested_on|kind|play_key */
  const by = Object.create(null);
  for (const r of rows || []) {
    if (+r.correct <= 0 || (+r.total || 1) !== 1) continue;
    const pk = playKey(r);
    if (!pk) continue;
    const key = [r.tested_on, r.kind || "", pk].join("|");
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

/* Braden Aug 8 reads pattern: Slam West correct, miss, correct — must not both pay 10 */
const bradenSlamWest = stampAttempts({}, [
  { concept: "Slam West", correct: true },
  { concept: "Slam West", correct: false },
  { concept: "Slam West", correct: true },
]);
assert(bradenSlamWest.map((r) => r.attempt_n).join(",") === "1,2,3", "in-session play_key increments");
assert(repPoints(1, 1, bradenSlamWest[0].attempt_n) === 10, "first Slam West correct = 10");
assert(repPoints(1, 1, bradenSlamWest[2].attempt_n) === 4, "retried Slam West correct = 4");

const badUnit = findDoubleTenPairs([
  { tested_on: "2026-08-08", kind: "reads", subskill: "Slam West", correct: 1, total: 1, attempt_n: 1 },
  { tested_on: "2026-08-08", kind: "reads", subskill: "Slam West", correct: 1, total: 1, attempt_n: 1 },
]);
assert(badUnit.length === 1, "detects double-10 same-day same-item");

const okUnit = findDoubleTenPairs([
  { tested_on: "2026-08-08", kind: "reads", subskill: "Slam West", correct: 1, total: 1, attempt_n: 1 },
  { tested_on: "2026-08-08", kind: "reads", subskill: "Slam West", correct: 1, total: 1, attempt_n: 2 },
]);
assert(okUnit.length === 0, "10 then 4 is fine");

/* Cross-kind same play_key name is a different item */
const crossKind = findDoubleTenPairs([
  { tested_on: "2026-08-08", kind: "reads", subskill: "Slam", correct: 1, total: 1, attempt_n: 1 },
  { tested_on: "2026-08-08", kind: "protect", subskill: "Slam — LG (pre+stunt)", correct: 1, total: 1, attempt_n: 1 },
]);
assert(crossKind.length === 0, "different kind/play_key are distinct items");

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
  let createClient;
  try {
    ({ createClient } = require(path.join(__dirname, "..", "node_modules", "@supabase/supabase-js")));
  } catch (e1) {
    try {
      ({ createClient } = require(path.join(
        __dirname,
        "..",
        "..",
        "OFFRD FILES 25",
        "node_modules",
        "@supabase/supabase-js"
      )));
    } catch (e2) {
      console.warn("SKIP live: @supabase/supabase-js not found — use supabase db query");
      return;
    }
  }
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
    .order("tested_at", { ascending: true });
  if (error) {
    console.warn("LIVE query error (use supabase db query if 42501):", error.message);
    return;
  }
  const rows = data || [];
  console.log("LIVE Braden reps today:", rows.length, "tested_on=", today);
  for (const r of rows) {
    const pts = repPoints(r.correct, r.total, r.attempt_n);
    console.log(
      [r.kind, r.tested_at, r.subskill, "c=" + r.correct + "/" + r.total, "attempt_n=" + r.attempt_n, "pts=" + pts].join(
        " | "
      )
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
    console.error("FAIL: rows present but every attempt_n=1 — quiz client not detecting same-day repeats");
    process.exit(2);
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
