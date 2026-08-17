/**
 * Build docs/_review_opp_queue.html from the Southwest/Parkway chart CSV
 * so the coverage header can be reviewed on real snaps, not the n=4 fixture.
 * Usage: node scripts/review-opp-queue.cjs
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const sandbox = { window: {}, globalThis: {}, console, document: undefined };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
function load(file) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox);
}
load("OFFGRD-formations-data.js");
load("OFFGRD-formation-canon.js");
load("OFFGRD-render.js");
load("OFFGRD-opp-shells.js");
const S = sandbox.OFFGRD_OPP_SHELLS;
const R = sandbox.OFFGRD_RENDER;

const OPP = "Southwest Longhorns";
const csvPath = path.join(
  "D:",
  "mattb",
  "Claude Cowork OFFGRD",
  "offgrd-web",
  "testplaylogs",
  "PlaylistData_2026-07-01 (3).csv"
);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur.replace(/\r$/, "")); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur.replace(/\r$/, "")); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim()));
}

function zoneFromYard(y) {
  const n = +y;
  if (isNaN(n)) return "";
  if (n > 0 && n <= 20) return "REDZONE";
  if (n > 0) return "PLUS";
  return "OWN";
}

function formLabel(raw) {
  const u = String(raw || "").trim().toUpperCase();
  if (u === "2X2") return "2x2 Doubles (Gun)";
  if (u === "3X1" || u === "TRIPS" || u === "TRIPS RT") return "Trips Rt (Gun)";
  if (u === "2X1") return "2x1 (Gun)";
  if (u === "EMPTY") return "Empty (Gun)";
  return raw || "2x2 Doubles (Gun)";
}

if (!fs.existsSync(csvPath)) {
  console.error("CSV not on disk: " + csvPath);
  process.exit(1);
}

const table = parseCsv(fs.readFileSync(csvPath, "utf8"));
const headers = table[0].map((h) => String(h).trim().toUpperCase());
const col = (name) => headers.indexOf(name);
const snaps = [];
table.slice(1).forEach((cells, i) => {
  const odk = String(cells[col("ODK")] || "").toUpperCase();
  if (odk !== "D") return;
  const playType = cells[col("PLAY TYPE")] || "";
  snaps.push({
    id: "csv-" + (cells[col("PLAY #")] || i),
    opponent: OPP,
    side: "off",
    play: String(cells[col("OFF PLAY")] || "").trim(),
    formation: formLabel(cells[col("OFF FORM")]),
    playType: playType,
    direction: cells[col("PLAY DIR")] || "",
    gap: cells[col("GAP")] || "",
    passZone: cells[col("PASS ZONE")] || "",
    offStrength: cells[col("OFF STR")] || "",
    down: cells[col("DN")],
    distance: cells[col("DIST")],
    hash: cells[col("HASH")] || "",
    fieldZone: zoneFromYard(cells[col("YARD LN")]),
    gain: cells[col("GN/LS")],
    success: "",
  });
});

S.clearCache();
const rec = S.reconcile(snaps, OPP);
const pack = S.cardsForOpponent({ opponent: OPP, snaps: snaps, drawn: [], rowDiagrams: [] });
const cov = pack.coverage;
const footer = S.printFooterLine({
  drawnCount: pack.drawn.length,
  shellCount: pack.shells.length,
  pct: cov.pct,
  opponent: OPP,
});

console.log("RECONCILE " + OPP + " (chart CSV)");
console.log("  verified offensive rows: " + rec.verifiedOffRows);
console.log("  groups: " + rec.groupCount);
console.log("  sum(group.n): " + rec.sumN);
console.log("  " + (rec.ok ? "OK" : "FAIL"));
console.log("  " + cov.header);
console.log("  " + footer);

const queue = pack.cards.slice(0, 12);
const cardsHtml = queue.map(function (c) {
  const inner = R.renderMarkup(c, { showHandles: false, sel: null, anim: false });
  const badge = (c.cardStatus === "shell" ? "AUTO-SHELL · n=" : "n=") + (c.n != null ? c.n : "?");
  const thin = c.thin ? ' <span style="color:#9a3412">THIN</span>' : "";
  return (
    '<article class="sc-card">' +
    '<div class="sc-call"><b>' + (c.rollupLabel || c.name) + "</b></div>" +
    '<div class="sc-sub">' + c.formation + (c.n != null ? " · n=" + c.n : "") + thin + "</div>" +
    '<div class="sc-meta"><span class="sc-opp">' + OPP + '</span><span class="sc-sep">·</span><span class="sc-shell">' + badge + "</span></div>" +
    '<div class="sc-diagram"><svg viewBox="0 0 1000 640" xmlns="http://www.w3.org/2000/svg">' + inner + "</svg></div>" +
    "</article>"
  );
}).join("\n");

const pick = pack.cards.map(function (c) {
  return '<div class="pick-row"><b>' + (c.rollupLabel || c.name) + "</b><br><span style=\"color:#5C6673;font-size:12px\">"
    + c.formation + " · n=" + (c.n || 0) + (c.thin ? " · THIN" : "") + "</span></div>";
}).join("");

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Opponent queue · ${OPP}</title>
<style>
body{margin:0;background:#e8edf3;font-family:system-ui,Segoe UI,sans-serif;color:#13294B}
.ovbox{max-width:1180px;margin:16px auto;background:#fff;border-radius:12px;padding:16px 18px 20px;box-shadow:0 8px 28px rgba(19,41,75,.12)}
.row{display:flex;justify-content:space-between;align-items:center;gap:8px}
h1{font-size:18px;margin:0}
.hint{margin:6px 0 10px;color:#374151;font-size:13px}
.tabs{display:flex;gap:6px;margin-bottom:10px}
.btn{border:1px solid #c5ced9;background:#fff;border-radius:8px;padding:6px 10px;font-weight:700;font-size:12px}
.btn.on{background:#13294B;color:#fff;border-color:#13294B}
.layout{display:flex;gap:12px;align-items:stretch}
.pick{flex:0 0 240px;border:1px solid #d8dee6;border-radius:10px;padding:8px;max-height:720px;overflow:auto}
.preview{flex:1;border:1px solid #d8dee6;border-radius:10px;padding:8px;background:#f7f9fb}
.sc-sheet-title{font-size:16px;font-weight:800;margin:0 0 6px}
.sc-coverage{font-size:13px;font-weight:800;color:#13294B;margin:0 0 8px}
.sc-footer{font-size:11px;font-weight:700;color:#5a6575;margin:10px 0 0}
.sc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.sc-card{border:1.5px solid #c5ced9;border-radius:10px;padding:8px 10px 10px;background:#fff}
.sc-call{font-size:12px;line-height:1.2;margin-bottom:2px}
.sc-sub{font-size:11px;color:#5a6575;margin-bottom:4px}
.sc-meta{font-size:11px;font-weight:700;margin-bottom:6px;display:flex;flex-wrap:wrap;gap:4px 8px}
.sc-sep{color:#9aa4b2}
.sc-shell{color:#0b5cab}
.sc-diagram svg{width:100%;height:auto;display:block;background:#0b2e17;border-radius:6px}
.pick-row{padding:6px 4px;border-bottom:1px solid #e8edf3;font-size:13px}
</style></head>
<body>
<div class="ovbox">
  <div class="row"><h1>Scout cards</h1><div><span class="btn">Print / PDF</span> <span class="btn">Close</span></div></div>
  <p class="hint">Queue on charted Southwest snaps — coverage header is the acceptance check.</p>
  <div class="tabs"><span class="btn">Offense install</span><span class="btn on">Opponent scout</span></div>
  <div class="layout">
    <div class="pick">${pick}</div>
    <div class="preview">
      <div class="sc-sheet-title">Opponent scout · ${OPP}</div>
      <div class="sc-coverage">${cov.header}</div>
      <div class="sc-grid">${cardsHtml}</div>
      <div class="sc-footer">${footer}</div>
    </div>
  </div>
</div>
</body></html>`;

const outPath = path.join(root, "docs", "_review_opp_queue.html");
fs.writeFileSync(outPath, html);
console.log("wrote " + outPath);
if (!rec.ok) process.exit(1);
