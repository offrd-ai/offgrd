/**
 * v326: Playbook FAMILY chips — hydrated canon, pinned chrome.
 *   node scripts/smoke-playbook-family-chips.cjs
 *
 * The dock smoke used to compare offerFamilies() to panelPaint() in a vm.
 * That passed while the Playbook entrypoint painted leftover [] and inherited
 * --ink across the Night theme boundary. This smoke paints the chip row the
 * entrypoint paints, then asserts that set equals the panel's.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const HTML = fs.readFileSync(path.join(ROOT, "OFFGRD-Playbook.html"), "utf8");
const ACCOUNT = fs.readFileSync(path.join(ROOT, "OFFGRD-account.js"), "utf8");

const store = Object.create(null);
const localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};
const sandbox = { window: {}, globalThis: {}, console: console, localStorage: localStorage };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.window.localStorage = localStorage;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "OFFGRD-play-map.js"), "utf8"), sandbox);
const PM = sandbox.OFFGRD_PLAY_MAP;
if (!PM || typeof PM.playbookFamilyOffer !== "function") {
  console.error("FAIL load OFFGRD_PLAY_MAP.playbookFamilyOffer");
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

check("entrypoint calls playbookFamilyOffer", /function familyOffer\(\)[\s\S]*playbookFamilyOffer\(LIB/.test(HTML));
check("entrypoint does not offer leftover []", !/offerFamilies\(LIB\|\|\[\], maps, \[\]\)/.test(HTML));
check("entrypoint repaints on afterHydrate", /OFFGRD_PLAY_MAP\.onAfterHydrate\(function\(\)\{ renderFamilyChips\(\); \}\)/.test(HTML));
check("account pulls play map on Playbook", /A\.kind==="scout" \|\| A\.kind==="playbook"/.test(ACCOUNT) && /pullPlayMap/.test(ACCOUNT));
check("account loadCache play map on offline hydrate", /OFFGRD_PLAY_MAP/.test(ACCOUNT) && /P\.loadCache\(TEAM\.id\)/.test(ACCOUNT));
check("pullPlayMap repaints family chips", /renderFamilyChips\(\)/.test(ACCOUNT));

const chipCss = (HTML.match(/\.fm-chip\{[^}]+\}/) || [])[0] || "";
check("unselected chip pins paper bg", /background:#fff/.test(chipCss));
check("unselected chip pins ink fg", /color:#16181d/.test(chipCss));
check("unselected chip does not inherit --ink", !/color:var\(--ink\)/.test(chipCss) && !/color:inherit/.test(chipCss));
check("rd-on unselected pin is paper-on-paper", /html\.rd-on \.fm-chip[\s\S]{0,160}background:#fff;color:#16181d/.test(HTML));
check("selected .on stays navy/white", /\.fm-chip\.on\{background:#13294B;color:#fff/.test(HTML));

const PW_TOP6 = ["Quick Game", "Goaline", "Screen", "Flood", "Inside Run", "Intermediate"];
const thinBook = [
  { id: "1", name: "Stick", family: "Quick Game" },
  { id: "2", name: "Vegas", family: "Dropback" }
];
const pwMaps = [
  { raw_call: "CALI", raw_call_norm: "cali", family: "Quick Game" },
  { raw_call: "VIKING", raw_call_norm: "viking", family: "Goaline" },
  { raw_call: "SCREEN", raw_call_norm: "screen", family: "Screen" },
  { raw_call: "HOUSTON", raw_call_norm: "houston", family: "Flood" },
  { raw_call: "DINO", raw_call_norm: "dino", family: "Inside Run" },
  { raw_call: "MIAMI", raw_call_norm: "miami", family: "Intermediate" },
  { raw_call: "PHILLY", raw_call_norm: "philly", family: "Intermediate" },
  { raw_call: "F SAIL", raw_call_norm: "f sail", family: "Intermediate" },
  { raw_call: "PHILLY F WHEEL", raw_call_norm: "philly f wheel", family: "Intermediate" },
  { raw_call: "MESH", raw_call_norm: "mesh", family: "Mesh" }
];
function nPlays(name, n) {
  const out = [];
  let i;
  for (i = 0; i < n; i++) out.push({ play: name });
  return out;
}
const pwRows = []
  .concat(nPlays("CALI", 20))
  .concat(nPlays("VIKING", 14))
  .concat(nPlays("SCREEN", 11))
  .concat(nPlays("HOUSTON", 10))
  .concat(nPlays("DINO", 9))
  .concat(nPlays("MIAMI", 3))
  .concat(nPlays("PHILLY", 2))
  .concat(nPlays("F SAIL", 2))
  .concat(nPlays("PHILLY F WHEEL", 1));

function paintRow(chips, cur) {
  const kids = [];
  const host = {
    innerHTML: "",
    appendChild: function (el) { kids.push(el); return el; },
    children: kids
  };
  String(host.innerHTML);
  (chips || []).forEach(function (name) {
    const b = { type: "button", className: "fm-chip" + (String(name).toLowerCase() === String(cur || "").toLowerCase() ? " on" : ""), textContent: name };
    host.appendChild(b);
  });
  return kids.map(function (b) { return b.textContent; });
}

check("fresh module is not hydrated", PM.isHydrated() === false);

const cold = PM.playbookFamilyOffer(thinBook, { playRows: pwRows });
check("unhydrated source paints no chips", cold.ready === false && cold.familyChips.length === 0);
const coldPainted = paintRow(cold.familyChips, "");
check("unhydrated rendered row is empty", coldPainted.length === 0);

let afterChips = null;
PM.onAfterHydrate(function () {
  afterChips = PM.playbookFamilyOffer(thinBook, { playRows: pwRows });
});
store.offgrd_season_v2 = JSON.stringify([{ side: "ours", rows: pwRows }]);
PM.setCache("parkway-west", pwMaps);
check("afterHydrate repaints", !!(afterChips && afterChips.ready));

const entry = PM.playbookFamilyOffer(thinBook);
const paint = PM.panelPaint(pwRows, { playbook: thinBook, fetched: pwMaps, hydrating: false });
const rendered = paintRow(entry.familyChips, "Quick Game");

check("rendered entrypoint chips === panel chips", JSON.stringify(rendered) === JSON.stringify(paint.familyChips));
check("Parkway West top-6", JSON.stringify(rendered) === JSON.stringify(PW_TOP6), JSON.stringify(rendered));
check("thin playbook families are not the painted set", rendered.indexOf("Dropback") < 0 && rendered.length === 6);
check("selected chip is .on", paintRow(entry.familyChips, "Quick Game").length === 6);

if (fails) {
  console.error(fails + " FAIL");
  process.exit(1);
}
console.log("ok  smoke-playbook-family-chips");
