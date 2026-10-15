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
function seasonRowPlayNum(r) {
  if (!r) return "";
  if (r.playNum != null && r.playNum !== "") return r.playNum;
  if (r["PLAY #"] != null && r["PLAY #"] !== "") return r["PLAY #"];
  return "";
}
function seasonRowIdentity(r) {
  if (!r) return "∅";
  if (r.callId) return "c:" + String(r.callId);
  if (r.source === "live_call" && r.id) return "c:" + String(r.id);
  const playNum = seasonRowPlayNum(r);
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
  const out = Array.from(map.values());
  const hasPlayNum = out.some((r) => seasonRowPlayNum(r) !== "");
  if (!hasPlayNum) return out;
  return out.filter((r) => seasonRowPlayNum(r) !== "");
}
function blobStamp(g) {
  if (!g) return null;
  const t = Date.parse(g.updatedAt || g.updated_at || "");
  return Number.isFinite(t) ? t : null;
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
      const prevT = blobStamp(prev);
      const nextT = blobStamp(g);
      const storedWins = prevT != null && (nextT == null || prevT >= nextT);
      prev.rows = storedWins ? mergeSeasonRows(rows, prev.rows) : mergeSeasonRows(prev.rows, rows);
      if (!prev.cid && cid) {
        prev.cid = cid;
        byCid.set(cid, prev);
      }
      if (prev.source === "live_call" && g.source && g.source !== "live_call") prev.source = g.source;
      if (g.updatedAt) {
        const prevTs = Date.parse(prev.updatedAt || "");
        const nextTs = Date.parse(g.updatedAt || "");
        if (!Number.isFinite(prevTs) || (Number.isFinite(nextTs) && nextTs >= prevTs)) {
          prev.updatedAt = g.updatedAt;
        }
      }
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
      updatedAt: g.updatedAt || null,
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
      updatedAt: r.updated_at || r.updatedAt || null,
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
      updatedAt: g.updatedAt || g.updated_at || null,
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

/* Cloud 61 + local collapsed 44 → keep 61 (St Mary's clobber recovery). */
const cloudMary = {
  id: "mary-def",
  opponent: "Parkway North",
  week: "vs St Marys 11/21/2025",
  side: "def",
  source: "import",
  updated_at: "2026-08-07T03:30:00.000Z",
  rows: defDup.concat(
    defDup.map((r, i) => Object.assign({}, r, { playNum: 100 + i, formation: "ACE" }))
  ),
};
const localMary = {
  cid: "mary-def",
  opponent: "Parkway North",
  week: "vs St Marys 11/21/2025",
  side: "def",
  source: "import",
  updatedAt: "2026-08-07T02:00:00.000Z",
  rows: [defDup[0], Object.assign({}, defDup[1], { playNum: 100, formation: "ACE" })],
};
const maryMerged = mergeGames([cloudMary], [localMary]);
assert(maryMerged.length === 1, "one Mary game after merge");
assert(
  maryMerged[0].rows.length === cloudMary.rows.length,
  "cloud supersets local collapsed rows, got " + maryMerged[0].rows.length
);
assert(
  maryMerged[0].updatedAt === cloudMary.updated_at,
  "newer cloud updatedAt wins as CAS base"
);

/* Legacy no-playNum survivors + restored playNum rows must not double-count. */
const legacyNoPn = {
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
  /* no playNum — pre-fix collapsed survivor */
};
const restoredPn = Object.assign({}, legacyNoPn, { playNum: 6 });
const overMerged = mergeSeasonRows(
  [legacyNoPn, Object.assign({}, legacyNoPn, { formation: "ACE" })],
  [restoredPn, Object.assign({}, restoredPn, { playNum: 33, formation: "2x1 Wing" })]
);
assert(
  overMerged.length === 2,
  "no-playNum dropped when playNum rows present, got " + overMerged.length
);
assert(
  overMerged.every((r) => seasonRowPlayNum(r) !== ""),
  "every surviving row is playNum-keyed"
);
const gameOver = mergeGames(
  [
    {
      id: "mary-def-2",
      opponent: "Parkway North",
      week: "vs St Marys 11/21/2025",
      side: "def",
      source: "import",
      updated_at: "2026-08-07T04:00:00.000Z",
      rows: [restoredPn, Object.assign({}, restoredPn, { playNum: 33, formation: "2x1 Wing" })],
    },
  ],
  [
    {
      cid: "mary-def-2",
      opponent: "Parkway North",
      week: "vs St Marys 11/21/2025",
      side: "def",
      source: "import",
      updatedAt: "2026-08-07T03:00:00.000Z",
      rows: [legacyNoPn, Object.assign({}, legacyNoPn, { hash: "M", coverage: "Cover 3" })],
    },
  ]
);
assert(gameOver[0].rows.length === 2, "game merge keeps only playNum rows, got " + gameOver[0].rows.length);

/* Stale live cache: newer cloud blob wins the same callId, unsynced callId stays. */
const soakCloud = [
  {
    id: "live-soak",
    opponent: "SOAK TEST 110",
    week: "Live 2026-10-13",
    side: "ours",
    source: "live_call",
    updated_at: "2026-10-14T04:28:37.000Z",
    rows: [
      { play: "HAMMER", source: "live_call", callId: "o1", coverage: "Cover 3", qtr: "1", carried: false, heroAtCall: "HAMMER", heroPct: 76, calledHero: true },
      { play: "HAWK", source: "live_call", callId: "o2", coverage: "Cover 3", qtr: "1", carried: true, heroAtCall: "HAMMER", heroPct: 67, calledHero: false },
    ],
  },
];
const soakStale = [
  {
    cid: "live-soak",
    opponent: "SOAK TEST 110",
    week: "Live 2026-10-13",
    side: "ours",
    source: "live_call",
    updatedAt: "2026-10-14T04:16:00.000Z",
    rows: [
      { play: "HAMMER", source: "live_call", callId: "o1", coverage: "Cover 3" },
      { play: "HAWK", source: "live_call", callId: "o2", coverage: "Cover 3" },
      { play: "LOCAL ONLY", source: "live_call", callId: "o9", coverage: "Cover 0" },
    ],
  },
];
const soaked = mergeGames(soakCloud, soakStale);
const byCall = {};
soaked[0].rows.forEach((r) => {
  byCall[r.callId] = r;
});
assert(byCall.o2 && byCall.o2.carried === true && byCall.o2.qtr === "1" && byCall.o2.heroPct === 67, "newer cloud row replaces stale HAWK");
assert(byCall.o1 && byCall.o1.calledHero === true && byCall.o1.heroAtCall === "HAMMER", "cloud hero fields win");
assert(byCall.o9 && byCall.o9.play === "LOCAL ONLY", "unsynced callId stays");
assert(soaked[0].updatedAt === "2026-10-14T04:28:37.000Z", "cloud stamp kept");

/* Cache already copied the new stamp but still holds the old row. Equal stamp: cloud wins. */
const stuck = [
  {
    cid: "live-soak",
    opponent: "SOAK TEST 110",
    week: "Live 2026-10-13",
    side: "ours",
    source: "live_call",
    updatedAt: "2026-10-14T04:28:37.000Z",
    rows: [{ play: "HAWK", source: "live_call", callId: "o2", coverage: "Cover 3" }],
  },
];
const stuckRow = mergeGames(soakCloud, stuck)[0].rows.find((r) => r.callId === "o2");
assert(stuckRow && stuckRow.carried === true && stuckRow.heroAtCall === "HAMMER", "equal stamp still takes the cloud row");

/* A cache stamped after the cloud keeps its own row and still unions cloud-only snaps. */
const newerLocal = [
  {
    cid: "live-soak",
    opponent: "SOAK TEST 110",
    week: "Live 2026-10-13",
    side: "ours",
    source: "live_call",
    updatedAt: "2026-10-14T05:00:00.000Z",
    rows: [{ play: "HAWK", source: "live_call", callId: "o2", coverage: "Cover 1", qtr: "2", carried: false }],
  },
];
const localWon = mergeGames(soakCloud, newerLocal)[0];
const hawkLocal = localWon.rows.find((r) => r.callId === "o2");
assert(hawkLocal && hawkLocal.coverage === "Cover 1" && hawkLocal.qtr === "2", "newer local row wins");
assert(localWon.rows.some((r) => r.callId === "o1" && r.heroAtCall === "HAMMER"), "cloud-only snap stays");

console.log("ok: merge-games idempotent", {
  games: merged.length,
  ours: oursCount(merged),
  keys: merged.map((g) => g.key),
});
