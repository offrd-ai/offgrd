/**
 * Slice 2: play-map norm, stems, rollup Magic 3, keep-out.
 *   node scripts/smoke-play-map.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const sandbox = {
  window: {},
  globalThis: {},
  console: console,
  localStorage: {
    getItem: function () { return null; },
    setItem: function () {},
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "OFFGRD-caller-outcome.js"), "utf8"), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "OFFGRD-play-map.js"), "utf8"), sandbox);

const M = sandbox.OFFGRD_PLAY_MAP;
if (!M) throw new Error("OFFGRD_PLAY_MAP missing");

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

/* Unit fixture — do not replace with a live-data HITCH & PITCH check. */
check(
  "HITCH & PITCH === HITCH AND PITCH (norm fixture)",
  M.normCall("HITCH & PITCH") === "hitch and pitch" &&
    M.normCall("HITCH AND PITCH") === M.normCall("HITCH & PITCH")
);
check("ST. LOUIS === ST LOUIS", M.normCall("ST. LOUIS") === M.normCall("ST LOUIS"));
check("does not reuse trim-only keys", M.normCall("ST. LOUIS") === "st louis");

const coll = M.collapseFamilies(["Quick", "Quick Game", "Mesh"]);
check("Quick + Quick Game collapse", coll.families.indexOf("Quick Game") >= 0 && coll.families.length === 2);
check("collapse is announced", /Quick/.test(coll.notices.join(" ")) && /Quick Game/.test(coll.notices.join(" ")));

const book = [
  { id: "p1", name: "MEMPHIS", family: "Mesh" },
  { id: "p2", name: "Slam West", family: "Slam" },
  { id: "p3", name: "Cali", family: "Quick" },
];
const inv = M.inventoryCalls(
  [
    { play: "MEMPHIS" }, { play: "MEMPHIS" },
    { play: "HOUSTON" },
    { play: "FARGO" }, { play: "FARGO SWITCH" },
  ],
  [],
  book
);
const mem = inv.items.filter(function (i) { return i.raw === "MEMPHIS"; })[0];
check("MEMPHIS suggests Mesh", !!(mem && mem.suggestedFamily === "Mesh"));
check("suggestion not auto-mapped", !mem.mapped);

const stems = M.suggestStems(inv.items);
const fargo = stems.filter(function (s) { return s.stem === "fargo"; })[0];
check("FARGO / FARGO SWITCH offered as group", !!(fargo && fargo.members.length === 2));
check("stem not applied as map rows", inv.unmapped.length === 4);

const rows = [
  { play: "HOUSTON", playType: "Pass", direction: "R", down: 1, distance: 10, gain: 6, success: 0 },
  { play: "HOUSTON", playType: "Pass", direction: "R", down: 1, distance: 10, gain: 4, success: 0 },
  { play: "DINO", playType: "Run", direction: "L", down: 1, distance: 10, gain: 5, success: 0 },
];
const struct = M.rollup(rows, { playbook: [], maps: [], axis: "structure" });
check("structure labels are honest", struct.buckets.every(function (b) { return /^(RUN|PASS|PLAY)/.test(b.label); }));
check("structure reconcile", struct.reconcile && struct.total === 3);
check("every bucket has n", struct.buckets.every(function (b) { return b.n > 0; }));

const zero = M.rollup(rows, { playbook: [], maps: [], axis: "family" });
check("zero mapping → UNMAPPED counted", zero.buckets.some(function (b) { return b.unmapped && b.n === 3; }));
check("zero mapping reconcile", zero.reconcile);

const mapped = M.rollup(rows, {
  playbook: [],
  maps: [{ raw_call: "HOUSTON", raw_call_norm: "houston", family: "Mesh" }],
  axis: "family",
});
const mesh = mapped.buckets.filter(function (b) { return b.key === "Mesh"; })[0];
const un = mapped.buckets.filter(function (b) { return b.unmapped; })[0];
check("HOUSTON leaves UNMAPPED", !!(mesh && mesh.n === 2) && !!(un && un.n === 1));
check("mapped reconcile", mapped.reconcile);
check("EFF uses 50/70 not stored success", mesh && mesh.eff === 0.5);

const live = M.rollup(
  [{ play: "Slam West", playType: "Run", down: 1, distance: 10, gain: 5 }],
  { playbook: book, maps: [], axis: "family" }
);
check("live_call playbook path without map", live.buckets.some(function (b) { return b.key === "Slam" && b.n === 1; }));

const mixed = [
  { play: "A", playType: "Run", down: 1, distance: 10, gain: 5, qtr: "1", fieldZone: "OWN" },
  { play: "B", playType: "Run", down: 1, distance: 10, gain: 5 },
];
const sliced = M.rollup(mixed, { axis: "structure", qtr: "1" });
check("partial qtr slice is unavailable", sliced.slice === "unavailable");

const src = fs.readFileSync(path.join(ROOT, "OFFGRD-play-map.js"), "utf8");
const banned = /inside zone|outside zone|"counter"|"power"|"gap scheme"/i;
check("no scheme-name derived labels", !banned.test(src));
check("rollup does not touch Cloud", !/Cloud\./.test(src.split("function rollup")[1] || ""));

const html = fs.readFileSync(path.join(ROOT, "OFFGRD.html"), "utf8");
const rollFn = (html.match(/function callerPlayRollupHtml\(\)\{[\s\S]*?\nfunction /) || [])[0] || "";
check("rollup container in normal flow", /rd-gd-play-rollup/.test(rollFn) && /position:static/.test(rollFn));
check("rollup not fixed/sticky/absolute", !/position:\s*(fixed|sticky|absolute)/.test(rollFn.replace(/position:static/g, "")));
check("rollup not in sticky bar", !/rd-gd-sticky/.test(rollFn));
check("MEMPHIS suggest chip in panel", /suggested from playbook/.test(html));
check("panel header is paint.statusText", /status\.textContent\s*=\s*paint\.statusText/.test(html));
check("panel has no local coverage % copy", !/mapped = /.test(html) && !/% of your calls/.test(html));

const rows238 = [];
let i;
for (i = 0; i < 183; i++) rows238.push({ play: "OTHER" + (i % 20) });
for (i = 0; i < 11; i++) rows238.push({ play: "HOUSTON" });
for (i = 0; i < 44; i++) rows238.push({ play: "HAMMER" });
const bookPH = [
  { id: "h", name: "HOUSTON", family: "Mesh" },
  { id: "m", name: "HAMMER", family: "Mesh" },
];
const invNoBook = M.inventoryCalls(rows238, []);
const lineNoBook = M.coverageLine(invNoBook, M.coverageCounts(invNoBook));
check(
  "coverageLine without playbook is 0 resolve",
  lineNoBook === "0 of 238 calls resolve — 0 you mapped, 0 from your playbook = 0%."
);
const invBook = M.inventoryCalls(rows238, [], bookPH);
const countsBook = M.coverageCounts(invBook);
const lineBook = M.coverageLine(invBook, countsBook);
check("playbook resolve is 55/238 = 23%", countsBook.resolved === 55 && countsBook.fromBook === 55 && countsBook.mapped === 0);
const caliBook = [{ id: "c", name: "Cali", family: "" }, { id: "m2", name: "MEMPHIS", family: "Mesh" }];
const caliRows = [];
for (i = 0; i < 14; i++) caliRows.push({ play: "Cali" });
caliRows.push({ play: "MEMPHIS" });
const invCali = M.inventoryCalls(caliRows, [], caliBook);
const caliItem = invCali.items.filter(function (it) { return it.raw === "Cali"; })[0];
check(
  "blank playbook family is not resolved",
  !!(caliItem && caliItem.n === 14 && !caliItem.mapped && invCali.bookOnlySnaps === 1 && invCali.resolvedSnaps === 1 && invCali.totalSnaps === 15)
);
check(
  "Cali blank family does not inflate coverage",
  M.coverageLine(invCali, M.coverageCounts(invCali)) ===
    "1 of 15 calls resolve — 0 you mapped, 1 from your playbook = 7%."
);
check(
  "coverageLine uses one definition",
  lineBook === "55 of 238 calls resolve — 0 you mapped, 55 from your playbook = 23%."
);
M.setCache("t", []);
const paint = M.panelPaint(rows238, { fetched: [], playbook: bookPH });
check("panelPaint header equals coverageLine", !!(paint && paint.state === "ready" && paint.statusText === lineBook));

const junkRows = [
  { play: "Pass", opponent: "North", week: "Wk 1" },
  { play: "Run", opponent: "North", week: "Wk 1" },
  { play: "2-pt", opponent: "South", date: "2025-10-10" },
  { play: "PLAY", opponent: "South", date: "2025-10-10" },
  { play: "HOUSTON", opponent: "North", week: "Wk 1" },
];
const invJunk = M.inventoryCalls(junkRows, [], bookPH);
check("playType tokens are junk not mappable", invJunk.junk.length === 4 && invJunk.totalSnaps === 1);
check("junk excluded from coverage", invJunk.items.length === 1 && invJunk.items[0].raw === "HOUSTON");
check("junk snaps counted", invJunk.junkSnaps === 4);
check(
  "coverage names the set-aside",
  /4 play-type labels set aside/.test(M.coverageLine(invJunk, M.coverageCounts(invJunk)))
);
const junkRoll = M.rollup(
  junkRows.concat([{ play: "Pass", playType: "Pass", down: 1, distance: 10, gain: 0 }]),
  { playbook: bookPH, maps: [], axis: "family" }
);
check("rollup drops playType tokens", junkRoll.total === 1 && junkRoll.buckets.every(function (b) { return b.key !== "Pass" && b.key !== "PLAY"; }));
check("rollup reports set-aside count", junkRoll.junkN === 5);
check("Magic 3 footer names set-aside", /play-type label/.test(rollFn) && /view\.junkN/.test(rollFn));
check("panel lists play-type labels", /Looks like a play type, not a call/.test(html));

const rows215 = [];
for (i = 0; i < 160; i++) rows215.push({ play: "OTHER" + (i % 20) });
for (i = 0; i < 11; i++) rows215.push({ play: "HOUSTON" });
for (i = 0; i < 44; i++) rows215.push({ play: "HAMMER" });
const junk23 = [];
for (i = 0; i < 10; i++) junk23.push({ play: "Pass" });
for (i = 0; i < 8; i++) junk23.push({ play: "Run" });
for (i = 0; i < 3; i++) junk23.push({ play: "2-pt" });
for (i = 0; i < 2; i++) junk23.push({ play: "PLAY" });
const inv215 = M.inventoryCalls(rows215.concat(junk23), [], bookPH);
const line215 = M.coverageLine(inv215, M.coverageCounts(inv215));
check("238 charted = 215 mappable + 23 set-aside", inv215.totalSnaps === 215 && inv215.junkSnaps === 23);
check(
  "coverage does not silently drop 23",
  /55 of 215/.test(line215) && /23 play-type labels set aside/.test(line215)
);
const roll215 = M.rollup(rows215.concat(junk23), { playbook: bookPH, maps: [], axis: "family" });
check("rollup 215 + junkN 23", roll215.total === 215 && roll215.junkN === 23);

const writes = [];
function persist(payload) {
  writes.push(payload);
  const cur = (M.getCached && M.getCached()) || [];
  M.setCache("t", cur.filter(function (r) { return M.normCall(r.raw_call) !== payload.raw_call_norm; }).concat([payload]));
}

const chipPrep = M.prepareSave({ chip: "Flood", typed: "", families: ["Flood", "Quick Game"], play_id: "" });
check("a) chip Flood is enough", !!(chipPrep.ok && chipPrep.family === "Flood" && chipPrep.play_id == null));
const chipPay = M.buildUpsertPayload({ raw_call: "HOUSTON", family: chipPrep.family, play_id: chipPrep.play_id });
persist(chipPay);
const afterChip = M.inventoryCalls([{ play: "HOUSTON" }], M.getCached(), []);
check("a) chip Save persists", !!(afterChip.mapped[0] && afterChip.mapped[0].mapped.family === "Flood"));

writes.length = 0;
M.setCache("t", []);
const typedNew = M.prepareSave({ chip: "", typed: "Mesh Attack", families: ["Flood"], play_id: "" });
check("b) typed new family", !!(typedNew.ok && typedNew.family === "Mesh Attack"));
const typedColl = M.prepareSave({ chip: "Flood", typed: "quick game", families: ["Quick Game"] });
check("b) typed wins + collapses", !!(typedColl.ok && typedColl.family === "Quick Game" && typedColl.collapsed && /Quick Game/.test(typedColl.notice)));
persist(M.buildUpsertPayload({ raw_call: "HAMMER", family: typedColl.family }));
const afterTyped = M.inventoryCalls([{ play: "HAMMER" }], M.getCached(), []);
check("b) typed Save persists collapsed family", !!(afterTyped.mapped[0] && afterTyped.mapped[0].mapped.family === "Quick Game"));

const writesBeforeEmpty = writes.length;
const emptyPrep = M.prepareSave({ chip: "", typed: "  ", families: ["Flood"] });
check("c) empty family is an error", !!(!emptyPrep.ok && emptyPrep.target === "family" && /family/i.test(emptyPrep.error)));
check("c) empty does not write", writes.length === writesBeforeEmpty);

check("play map CSS paints .fm-chip.on", /\.fm-chip\.on\{/.test(html) && /pm-fam-row/.test(html));
check("save uses prepareSave", /M\.prepareSave\(/.test(html) && /typed:\s*free/.test(html));
check("empty save paints inline error", /showFamErr/.test(html) && /pm-fam-row\.is-err/.test(html));
check("same-play is optional in handler", /play_id:\s*prep\.play_id/.test(html));
check("shared chip styles helper", /function ensureMapChipStyles/.test(html) && /offgrd-map-chip-css/.test(html));
check("play map does not inject .fm-chip.on locally", !/H\+='<style>\.pm-card[\s\S]*\.fm-chip\.on/.test(html));
check("formations does not inject .fm-chip.on locally", !/H\+='<style>\.fm-panel[\s\S]*\.fm-chip\.on/.test(html));
check("idle hydrate skips focused input", /mapPanelSkipRebuild/.test(html) && /pmNoteRender/.test(html));
check("cached open does not background-pull", !/M\.pullMap\(teamId\)\.catch/.test(html));

let hydrates = 0;
M.onAfterHydrate(function () { hydrates += 1; });
M.setCache("loop", [{ raw_call: "A", raw_call_norm: "a", family: "Mesh" }]);
const afterFirst = hydrates;
M.setCache("loop", [{ raw_call: "A", raw_call_norm: "a", family: "Mesh" }]);
check("same cache does not re-hydrate", hydrates === afterFirst);

const idleRows = [{ raw_call: "A", raw_call_norm: "a", family: "Mesh" }];
M.setCache("rps", idleRows);
let extraHydrates = 0;
const unsub = M.onAfterHydrate(function () { extraHydrates += 1; });
const t0 = Date.now();
let ticks = 0;
while (Date.now() - t0 < 250) {
  M.setCache("rps", idleRows);
  ticks += 1;
}
if (typeof unsub === "function") unsub();
const idleRps = extraHydrates / 0.25;
console.log("idle same-cache hydrate rps=" + idleRps + " extra=" + extraHydrates + " ticks=" + ticks);
check("idle same-cache rps is 0", extraHydrates === 0);

if (fails) {
  console.error(fails + " FAIL");
  process.exit(1);
}
console.log("ok  smoke-play-map");
