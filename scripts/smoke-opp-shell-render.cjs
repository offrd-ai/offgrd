/**
 * Smoke: opponent shell rendering + Southwest/Parkway formation check.
 * Usage: node scripts/smoke-opp-shell-render.cjs
 * Writes docs/_review_opp_shells.html for the opponent-tab screenshot.
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
if (!S || !R) {
  console.error("FAIL load shells/render");
  process.exit(1);
}

const OPP = "Southwest Longhorns";
const DEMO = [
  { play: "Power Lt", formation: "2x2 Doubles (Gun)", playType: "Run", direction: "L", gap: "B", expect: "DOUBLES_2X2" },
  { play: "Hitches", formation: "2x2 Doubles (Gun)", playType: "Pass", direction: "R", passZone: "hitch", expect: "DOUBLES_2X2" },
  { play: "Slant-Flat", formation: "2x2 Doubles (Gun)", playType: "Pass", direction: "R", passZone: "slant-flat", expect: "DOUBLES_2X2" },
  { play: "Smash", formation: "2x2 Doubles (Gun)", playType: "Pass", direction: "R", passZone: "smash", expect: "DOUBLES_2X2" },
  { play: "Stick", formation: "Trips Rt (Gun)", playType: "Pass", direction: "R", passZone: "stick", expect: "TRIPS_RT" },
  { play: "Flood Rt", formation: "Trips Rt (Gun)", playType: "Pass", direction: "R", passZone: "flood", expect: "TRIPS_RT" },
];

function row(partial, i) {
  return Object.assign(
    {
      id: "demo-" + i,
      opponent: OPP,
      side: "off",
      offBackCount: 1,
      offStrength: "right",
      down: 1,
      distance: 10,
      hash: "R",
      fieldZone: "PLUS",
      gain: 5,
      success: 1,
    },
    partial
  );
}

const snaps = [];
DEMO.forEach(function (d, i) {
  for (var n = 0; n < 4; n++) snaps.push(row(d, i + "-" + n));
});

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

S.clearCache();
const grouped = S.groupRows(snaps, OPP);
const rec = S.reconcile(snaps, OPP);
check("six named cards", grouped.groups.length === 6, "n=" + grouped.groups.length);
check(
  "reconcile sumN === verified off rows",
  rec.ok && rec.sumN === rec.verifiedOffRows && rec.verifiedOffRows === 24,
  JSON.stringify({ sumN: rec.sumN, verifiedOffRows: rec.verifiedOffRows, missing: rec.missing, dups: rec.duplicateIds })
);
console.log("RECONCILE " + OPP);
console.log("  verified offensive rows: " + rec.verifiedOffRows);
console.log("  groups: " + rec.groupCount);
console.log("  sum(group.n): " + rec.sumN);
rec.groups.forEach(function (g) {
  console.log("    n=" + g.n + "  " + (g.play || g.shellKey) + "  ·  " + g.formation);
});
console.log("  " + (rec.ok ? "OK — every verified off row in exactly one group" : "FAIL"));

DEMO.forEach(function (d) {
  const resolved = S.resolveFormation(d.formation);
  check(
    d.play + " → " + d.expect,
    !!(resolved.formation && resolved.formation.id === d.expect && !resolved.unresolved),
    resolved.formation && resolved.formation.id
  );
});

const over43 = S.resolveDefFront("4-3 OVER");
check("4-3 OVER own DFRONTS entry", over43.front === "4-3 OVER" && over43.unresolved === false);
["Weird Stack", "4-3 STACK", "NOT A FRONT", "6-2"].forEach(function (raw) {
  const r = S.resolveDefFront(raw);
  check(raw + " DFRONTS-miss sets unresolved", !R.DFRONTS[String(raw).trim()] && r.unresolved === true);
});

const pack = S.cardsForOpponent({ opponent: OPP, snaps: snaps, drawn: [], rowDiagrams: [] });
check("pack has 6 shells", pack.shells.length === 6, "n=" + pack.shells.length);
check("no empty-note path", pack.cards.length === 6);
check("shells never invent skill routes", pack.shells.every(function (c) {
  return (c.players || []).filter(function (p) { return p.type === "route" && p.route && p.route.length; }).length === 0;
}));

const power = pack.shells.find(function (c) { return c.play === "Power Lt"; });
check("Power Lt is 2x2 Doubles", power && /doubles/i.test(power.formation), power && power.formation);
check("Power Lt has RB run arrow", !!(power && power.players.some(function (p) { return p.type === "rb" && p.route && p.route.length; })));

const stick = pack.shells.find(function (c) { return c.play === "Stick"; });
check("Stick is Trips", stick && /trips/i.test(stick.formation), stick && stick.formation);
check("pass shells use dashed area draws", pack.shells.filter(function (c) { return c.playType === "pass"; }).every(function (c) {
  return (c.draws || []).some(function (d) { return d.dashed; });
}));
const flood = pack.shells.find(function (c) { return c.play === "Flood Rt"; });
check("Flood Rt is layered (3 area arrows)", !!(flood && flood.draws && flood.draws.length === 3), flood && flood.draws && flood.draws.length);
const hitches = pack.shells.find(function (c) { return c.play === "Hitches"; });
check("Hitches are short both sides", !!(hitches && hitches.draws && hitches.draws.length === 2), hitches && hitches.draws && hitches.draws.length);

const cardsHtml = pack.shells.map(function (c) {
  const inner = R.renderMarkup(c, { showHandles: false, sel: null, anim: false });
  const badge = "AUTO-SHELL · n=" + c.n;
  return (
    '<article class="sc-card">' +
    '<div class="sc-call"><b>' + c.name + "</b></div>" +
    '<div class="sc-sub">' + c.formation + " · 11</div>" +
    '<div class="sc-meta"><span class="sc-opp">' + OPP + '</span><span class="sc-sep">·</span><span class="sc-shell">' + badge + "</span></div>" +
    '<div class="sc-diagram"><svg viewBox="0 0 1000 640" xmlns="http://www.w3.org/2000/svg">' + inner + "</svg></div>" +
    "</article>"
  );
}).join("\n");

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Opponent scout · ${OPP}</title>
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
.pick{flex:1;min-width:200px;border:1px solid #d8dee6;border-radius:10px;padding:8px}
.preview{flex:2;min-width:280px;border:1px solid #d8dee6;border-radius:10px;padding:8px;background:#f7f9fb}
.sc-sheet-title{font-size:16px;font-weight:800;margin:0 0 10px}
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
<div class="ovbox" id="scModal">
  <div class="row"><h1>Scout cards</h1><div><span class="btn">Print / PDF</span> <span class="btn">Close</span></div></div>
  <p class="hint">Diagrams from the shared renderer — same play you drew. Call strip uses your playbook names.</p>
  <div class="tabs"><span class="btn">Offense install</span><span class="btn on">Opponent scout</span></div>
  <div class="layout">
    <div class="pick">
      ${pack.shells.map(function (c) {
        return '<div class="pick-row"><b>' + c.name + "</b><br><span style=\"color:#5C6673;font-size:12px\">" + c.formation + " · n=" + c.n + "</span></div>";
      }).join("")}
    </div>
    <div class="preview">
      <div class="sc-sheet-title">Opponent scout · ${OPP}</div>
      <div class="sc-grid">${cardsHtml}</div>
    </div>
  </div>
</div>
</body></html>`;

const outPath = path.join(root, "docs", "_review_opp_shells.html");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html);
console.log("wrote " + outPath);

if (fails) {
  console.error(fails + " failed");
  process.exit(1);
}
console.log("smoke-opp-shell-render: all ok");
