/**
 * Smoke: v294 formation panel — never inventory against an unhydrated [].
 *   node scripts/smoke-formation-panel.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const store = Object.create(null);
const localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; },
};
const sandbox = { window: {}, globalThis: {}, console: console, document: undefined, localStorage: localStorage };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.window.localStorage = localStorage;

function load(file) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox);
}
load("OFFGRD-formations-data.js");
load("OFFGRD-formation-canon.js");
load("OFFGRD-assist-import.js");
load("OFFGRD-render.js");
load("OFFGRD-opp-shells.js");
load("OFFGRD-formation-map.js");

const M = sandbox.OFFGRD_FORMATION_MAP;
if (!M || typeof M.panelPaint !== "function") {
  console.error("FAIL load OFFGRD_FORMATION_MAP.panelPaint");
  process.exit(1);
}

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

const TEAM = "team-panel";
const FIXTURE_TAGS = [
  "DART", "SPREAD", "ACE", "PRO", "SLOT", "JUMBO",
  "TANK", "DUO", "POWER", "UNBALANCED", "RIP", "LIZ"
];
const playRows = FIXTURE_TAGS.map(function (t) { return { formation: t }; });
const mapRows = FIXTURE_TAGS.map(function (t) {
  return {
    raw_tag: t,
    raw_tag_norm: M.normTag(t),
    off_structure: "2x2",
    off_back_count: 1,
    off_personnel: "11",
    side_scope: "both"
  };
});

check("fresh module is not hydrated", M.isHydrated() === false);
check("fresh cache is empty", !((M.getCached() || []).length));

const leftover = M.resolvePanelMaps({ fetched: [] });
check("leftover [] before hydrate is unknown", leftover.known === false && leftover.source === "unknown");

const pending = M.panelPaint(playRows, { fetched: [], hydrating: true });
check("pending paint is loading", pending.state === "loading");
check("pending paint has no inv", pending.inv == null);
check("pending does not emit a count from []", !/\d+\s+formation/.test(pending.statusText || ""));
check("pending status is loading/unknown", /loading|isn.t loaded/i.test(pending.statusText || ""));

const unknown = M.panelPaint(playRows, { fetched: [] });
check("unhydrated leftover [] is unknown, not a count", unknown.state === "unknown" && !/\d+\s+formation/.test(unknown.statusText || ""));

let after = null;
M.onAfterHydrate(function () {
  after = M.panelPaint(playRows, { fetched: M.getCached() });
});
M.setCache(TEAM, mapRows);
check("hydrate signal re-paints", !!(after && after.state === "ready"));
check("after hydrate 0 unmapped", !!(after && after.inv && after.inv.unmapped.length === 0));
check("after hydrate 12 mapped", !!(after && after.inv && after.inv.mapped.length === 12));
check("after hydrate honest mapped copy", after.statusText === "All charted tags are mapped or auto-recognized.");

const fromCache = M.resolvePanelMaps({ fetched: [] });
check("populated cache wins leftover []", fromCache.known === true && fromCache.source === "cache" && fromCache.rows.length === 12);

const cachedPaint = M.panelPaint(playRows, { fetched: [] });
check("panel inventory from cache is 0 unmapped", cachedPaint.state === "ready" && cachedPaint.inv.unmapped.length === 0);
check("panel inventory from cache is 12 mapped", cachedPaint.inv.mapped.length === 12);

const emptyInv = M.inventoryTags(playRows, []);
check("raw inventory against [] is 12 unmapped (the lie we must not paint)", emptyInv.unmapped.length === 12);

if (fails) {
  console.error(fails + " FAIL");
  process.exit(1);
}
console.log("ok  smoke-formation-panel");
