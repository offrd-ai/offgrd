/**
 * Import opponent picker: schedule labels, week fill, near-match, gameKey.
 */
function importSchedDateShort(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months[+m[2] - 1] + " " + +m[3];
}
function importSchedGames(SCHEDULE, SCHED_SEASON) {
  const rows = (Array.isArray(SCHEDULE) ? SCHEDULE : []).filter((g) => (g.opponent || "").trim());
  let year = SCHED_SEASON;
  if (!year || year === "ALL") {
    const ys = rows.map((g) => (g.date || "").slice(0, 4)).filter(Boolean).sort();
    year = ys.length ? ys[ys.length - 1] : "";
  }
  let list = rows.slice();
  if (year && year !== "ALL") list = list.filter((g) => {
    const y = (g.date || "").slice(0, 4);
    return !y || y === year;
  });
  list.sort((a, b) => ((a.date || "") + "").localeCompare(b.date || ""));
  const weekOf = {};
  const sid = (g) => g.id || ((g.date || "") + "|" + ((g.opponent || "").trim()));
  list.filter((g) => g.date).forEach((g, i) => { weekOf[sid(g)] = i + 1; });
  return list.map((g) => {
    const name = (g.opponent || "").trim();
    const id = sid(g);
    const wk = weekOf[id];
    const ds = importSchedDateShort(g.date);
    const bits = [];
    if (wk) bits.push("Wk " + wk);
    if (ds) bits.push(ds);
    const weekVal = bits.join(" · ") || g.date || "";
    return { id, opponent: name, week: weekVal, label: bits.length ? name + " — " + bits.join(" · ") : name };
  });
}
function gameKey(opp, week, side) {
  return String(opp || "?").trim().toLowerCase() + "|" + String(week || "?").trim().toLowerCase() + "|" + side;
}
function importOppDistance(a, b) {
  const s = String(a || "").toLowerCase(), t = String(b || "").toLowerCase();
  if (s === t) return 0;
  const n = s.length, m = t.length;
  if (!n) return m;
  if (!m) return n;
  if (Math.abs(n - m) > 3) return 99;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
    }
  }
  return dp[n][m];
}

const SCHEDULE = [
  { id: "g1", date: "2026-09-05", opponent: "McClure" },
  { id: "g2", date: "2026-09-12", opponent: "Kirkwood" },
  { id: "g3", date: "2026-09-26", opponent: "Parkway North" },
  { id: "g4", date: "", opponent: "" },
];
const games = importSchedGames(SCHEDULE, "2026");
const fails = [];
if (games.length !== 3) fails.push("expected 3 named games, got " + games.length);
const pn = games.find((g) => g.opponent === "Parkway North");
if (!pn) fails.push("missing Parkway North");
if (pn && pn.label !== "Parkway North — Wk 3 · Sep 26") fails.push("label: " + pn.label);
if (pn && pn.week !== "Wk 3 · Sep 26") fails.push("week fill: " + pn.week);
const k1 = gameKey(pn && pn.opponent, pn && pn.week, "def");
const k2 = gameKey("Parkway North", "Wk 3 · Sep 26", "def");
if (k1 !== k2) fails.push("canonical keys should match: " + k1 + " vs " + k2);
if (importOppDistance("parkway north", "Parkway North") !== 0) fails.push("case-insensitive distance");
if (importOppDistance("Parkway Nrth", "Parkway North") > 2) fails.push("trivial typo should be near");
if (importSchedGames([], null).length !== 0) fails.push("empty schedule should skip dropdown");

const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "OFFGRD.html"), "utf8");
if (!/id="imp-sched-pick"/.test(html)) fails.push("missing schedule picker");
if (!/Game not on schedule/.test(html)) fails.push("missing not-on-schedule row");
if (!/Whose film is this/.test(html)) fails.push("whose-film radio missing");
if (!/function applyImportSchedulePick/.test(html)) fails.push("missing applyImportSchedulePick");

if (fails.length) {
  console.error("FAIL\n" + fails.map((f) => " - " + f).join("\n"));
  process.exit(1);
}
console.log("PASS");
console.log("  " + games.map((g) => g.label).join(" | "));
console.log("  key " + k1);
