/**
 * Season merge idempotency — reloading N times must equal loading once.
 *   node scripts/smoke-merge-games.cjs
 */
"use strict";

function gameNaturalKey(opp, week, side) {
  return (
    String(opp || "?")
      .trim()
      .toLowerCase() +
    "|" +
    String(week || "?")
      .trim()
      .toLowerCase() +
    "|" +
    String(side || "")
  );
}
function seasonRowIdentity(r) {
  if (!r) return "∅";
  if (r.callId) return "c:" + String(r.callId);
  if (r.source === "live_call" && r.id) return "c:" + String(r.id);
  const playNum =
    r.playNum != null && r.playNum !== ""
      ? r.playNum
      : r["PLAY #"] != null
        ? r["PLAY #"]
        : "";
  return [
    "s",
    r.date || "",
    r.down || "",
    r.distance || "",
    r.play || "",
    r.hash || "",
    r.gain != null ? r.gain : "",
    r.source || "",
    r.coverage || "",
    r.fieldZone || "",
    r.front || "",
    r.formation || "",
    r.qtr || "",
    r.result || "",
    playNum,
  ].join("|");
}
function mergeSeasonRows(a, b) {
  const map = new Map();
  (a || []).forEach((r) => map.set(seasonRowIdentity(r), r));
  (b || []).forEach((r) => map.set(seasonRowIdentity(r), r));
  return Array.from(map.values());
}
function mergeGames(cloudRows, local) {
  const byCid = new Map();
  const byKey = new Map();
  function adopt(g) {
    if (!g) return;
    const key = gameNaturalKey(g.opponent, g.week, g.side);
    const cid = g.cid ? String(g.cid) : null;
    const rows = Array.isArray(g.rows) ? g.rows : [];
    let prev = null;
    if (cid && byCid.has(cid)) prev = byCid.get(cid);
    else if (byKey.has(key)) prev = byKey.get(key);
    if (prev) {
      prev.rows = mergeSeasonRows(prev.rows, rows);
      if (!prev.cid && cid) {
        prev.cid = cid;
        byCid.set(cid, prev);
      }
      if (prev.source === "live_call" && g.source && g.source !== "live_call") prev.source = g.source;
      prev.key = key;
      byKey.set(key, prev);
      return;
    }
    const next = {
      key,
      opponent: g.opponent,
      week: g.week,
      side: g.side,
      source: g.source || "import",
      rows: rows.slice(),
      cid,
    };
    byKey.set(key, next);
    if (cid) byCid.set(cid, next);
  }
  (cloudRows || []).forEach((r) =>
    adopt({
      opponent: r.opponent,
      week: r.week,
      side: r.side,
      source: r.source,
      rows: r.rows,
      cid: r.id || r.cid || null,
    })
  );
  (local || []).forEach((g) =>
    adopt({
      opponent: g.opponent,
      week: g.week,
      side: g.side,
      source: g.source,
      rows: g.rows,
      cid: g.cid || g.id || null,
    })
  );
  return Array.from(byKey.values());
}

function oursCount(games) {
  let n = 0;
  (games || []).forEach((g) => {
    if (g.side === "ours") n += (g.rows || []).length;
  });
  return n;
}

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const hudlRows = [];
for (let i = 0; i < 75; i++) {
  hudlRows.push({
    date: "2025-09-01",
    down: 1,
    distance: 10,
    play: "HOUSTON",
    source: "Hudl",
    coverage: "Cover 3",
  });
}
/* Distinct scout identities — vary play index via distance so merge keeps 75 */
hudlRows.forEach((r, i) => {
  r.distance = 1 + (i % 20);
  r.down = 1 + (i % 4);
  r.play = ["HOUSTON", "ST LOUIS", "KARATE", "SOUTH BEND", "COMBO"][i % 5] + " " + i;
});

const cloud = [
  {
    id: "hudl-ours",
    opponent: "Parkway North",
    week: "2025",
    side: "ours",
    source: "Hudl",
    rows: hudlRows,
  },
  {
    id: "live-a",
    opponent: "Parkway North",
    week: "Live 2026-07-24",
    side: "ours",
    source: "live_call",
    rows: [
      { play: "HOUSTON", source: "live_call", callId: "e1", down: 1, distance: 10 },
      { play: "ST LOUIS", source: "live_call", callId: "e2", down: 2, distance: 7 },
    ],
  },
  /* Duplicate Live blob — same natural key, different id (the bug) */
  {
    id: "live-b",
    opponent: "Parkway North",
    week: "Live 2026-07-24",
    side: "ours",
    source: "live_call",
    rows: [
      { play: "HOUSTON", source: "live_call", callId: "e1", down: 1, distance: 10 },
      { play: "SOUTH BEND", source: "live_call", callId: "e3", down: 3, distance: 5 },
    ],
  },
];

let local = [];
let merged = mergeGames(cloud, local);
assert(merged.length === 2, "collapse to 2 games (Hudl + one Live)");
assert(oursCount(merged) === 75 + 3, "75 Hudl + 3 unique live callIds, got " + oursCount(merged));

/* N reload cycles — same cloud list each time */
for (let i = 0; i < 5; i++) {
  merged = mergeGames(cloud, merged);
}
assert(merged.length === 2, "still 2 games after 5 merges");
assert(oursCount(merged) === 78, "ours stable at 78 after 5 merges, got " + oursCount(merged));

/* Trim mismatch must not create a second key */
const spaced = [
  {
    id: "live-c",
    opponent: " Parkway North ",
    week: " Live 2026-07-24 ",
    side: "ours",
    source: "live_call",
    rows: [{ play: "HOUSTON", source: "live_call", callId: "e1", down: 1, distance: 10 }],
  },
];
merged = mergeGames(spaced, merged);
assert(merged.length === 2, "trim-normalized key still 2 games");
assert(oursCount(merged) === 78, "e1 upsert not duplicate");

/* St Mary's regression: defense snaps sharing 1st&10 / Cover 4 / OWN must not collapse. */
const defDup = [
  {
    date: "vs St Marys 11/21/2025",
    down: 1,
    distance: 10,
    hash: "R",
    coverage: "Cover 4",
    fieldZone: "OWN",
    source: "scout_import",
    front: "4-3",
    formation: "SPREAD",
    qtr: "1",
    result: "Rush",
    playNum: 6,
  },
  {
    date: "vs St Marys 11/21/2025",
    down: 1,
    distance: 10,
    hash: "R",
    coverage: "Cover 4",
    fieldZone: "OWN",
    source: "scout_import",
    front: "4-3",
    formation: "2x1 Wing",
    qtr: "1",
    result: "Rush",
    playNum: 33,
  },
];
assert(
  mergeSeasonRows(defDup, defDup).length === 2,
  "defense snaps with distinct playNum/formation stay 2, got " +
    mergeSeasonRows(defDup, defDup).length
);

console.log("ok: merge-games idempotent", {
  games: merged.length,
  ours: oursCount(merged),
  keys: merged.map((g) => g.key),
});
