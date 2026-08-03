/**
 * Smoke: listImportBatches aggregation shape (one row per import_batch_id).
 */
function aggregate(rows) {
  const by = Object.create(null);
  (rows || []).forEach(function (r) {
    const id = r && r.import_batch_id;
    if (!id) return;
    if (!by[id]) {
      by[id] = {
        import_batch_id: id,
        opponent: r.opponent || "Unknown",
        week: r.week || "Wk?",
        side: r.side || "",
        n: 0,
        created_at: r.created_at || null,
      };
    }
    by[id].n++;
    if (r.created_at && (!by[id].created_at || r.created_at < by[id].created_at)) {
      by[id].created_at = r.created_at;
    }
  });
  return Object.keys(by).map(function (k) { return by[k]; });
}

const rows = [
  { import_batch_id: "b1", opponent: "Sample Tech", week: "Ship", side: "def", created_at: "2026-08-03T12:00:00Z" },
  { import_batch_id: "b1", opponent: "Sample Tech", week: "Ship", side: "def", created_at: "2026-08-03T12:00:01Z" },
  { import_batch_id: "b1", opponent: "Sample Tech", week: "Ship", side: "def", created_at: "2026-08-03T12:00:02Z" },
  { import_batch_id: "b2", opponent: "Rival", week: "Wk 2", side: "off", created_at: "2026-08-02T10:00:00Z" },
  { import_batch_id: null, opponent: "Human", week: "Wk 1", side: "def", created_at: "2026-08-01T10:00:00Z" },
];
const got = aggregate(rows);
if (got.length !== 2) {
  console.error("FAIL expected 2 batches, got", got.length);
  process.exit(1);
}
const b1 = got.find(function (x) { return x.import_batch_id === "b1"; });
if (!b1 || b1.n !== 3 || b1.opponent !== "Sample Tech" || b1.side !== "def") {
  console.error("FAIL b1", b1);
  process.exit(1);
}
console.log("PASS import batch aggregate — 2 batches, b1 n=3");
