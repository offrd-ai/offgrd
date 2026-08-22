/**
 * Smoke: v321 dock-default + one vocabulary (family / formation / personnel).
 *   node scripts/smoke-playbook-dock.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const HTML = fs.readFileSync(path.join(ROOT, "OFFGRD-Playbook.html"), "utf8");
const DOCK_SRC = fs.readFileSync(path.join(ROOT, "OFFGRD-pb-dock.js"), "utf8");

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

const store = Object.create(null);
const localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};
const sandbox = {
  window: {},
  globalThis: {},
  console: console,
  localStorage: localStorage,
  location: { search: "" }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.window.localStorage = localStorage;
vm.runInNewContext(DOCK_SRC, sandbox);
const D = sandbox.OFFGRD_PB_DOCK;

check("dock on with no flag", D.isDockOn() === true);
store.offgrd_pb_dock = "1";
check("offgrd_pb_dock is a no-op", D.isDockOn() === true);
store.offgrd_pb_dock = "0";
check("offgrd_pb_dock=0 still default on", D.isDockOn() === true);
delete store.offgrd_pb_dock;
sandbox.location.search = "?dock=1";
vm.runInNewContext(DOCK_SRC, sandbox);
check("?dock=1 is a no-op (still on)", sandbox.OFFGRD_PB_DOCK.isDockOn() === true);
sandbox.location.search = "";
store.offgrd_pb_classic = "1";
vm.runInNewContext(DOCK_SRC, sandbox);
check("classic=1 hides dock / restores palette", sandbox.OFFGRD_PB_DOCK.isDockOn() === false && sandbox.OFFGRD_PB_DOCK.isClassicOn() === true);
delete store.offgrd_pb_classic;
vm.runInNewContext(DOCK_SRC, sandbox);

check("HTML hides palette/skill/wizard when dock on", /body\.pb-dock-on #skillBar/.test(HTML) && /body\.pb-dock-on #routePanel/.test(HTML) && /body\.pb-dock-on #wizDock/.test(HTML) && /body\.pb-dock-on \.panel\.expert-only/.test(HTML));
check("HTML parks play tools in #pbDock", /id="pbDock"/.test(HTML) && /fieldDockWrap/.test(HTML));

const dockCss = (HTML.match(/#pbDock\{[^}]+\}/) || [])[0] || "";
check("IP: #pbDock is position relative", /position:\s*relative/.test(dockCss));
check("IP: #pbDock is not overlay", !/position:\s*(fixed|absolute|sticky)/.test(dockCss));
check("IP: wrap is flex adjacent", /#fieldDockWrap\{display:flex/.test(HTML));
check("IP: no float over field", !/#pbDock\{[^}]*(fixed|absolute|sticky)/.test(HTML));

check("Motion path label (not Move)", /Motion path/.test(HTML) && /dockBtn\(dockRow\(host\),"Motion path"/.test(HTML));
check("no dock Move reposition button", !/dockBtn\(dockRow\(host\),"Move"/.test(HTML));

check("family chips host present", /id="m-family-chips"/.test(HTML) && /id="m-family-list"/.test(HTML));
check("playbook sources family from PLAY_MAP", /offerFamilies/.test(HTML) && /prepareSave/.test(HTML));
check("playbook loads play-map + formation-map", /OFFGRD-play-map\.js/.test(HTML) && /OFFGRD-formation-map\.js/.test(HTML));

const pms = { window: {}, globalThis: {}, console: console, localStorage: { getItem: function () { return null; }, setItem: function () {} } };
pms.window = pms;
pms.globalThis = pms;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "OFFGRD-play-map.js"), "utf8"), pms);
const PM = pms.OFFGRD_PLAY_MAP;

const fms = { window: {}, globalThis: {}, console: console, localStorage: { getItem: function () { return null; }, setItem: function () {} } };
fms.window = fms;
fms.globalThis = fms;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "OFFGRD-formation-map.js"), "utf8"), fms);
const FM = fms.OFFGRD_FORMATION_MAP;

const book = [
  { id: "1", name: "Cali", family: "Quick" },
  { id: "2", name: "DINO", family: "Mesh" },
  { id: "3", name: "Vegas", family: "Intermediate" }
];
const maps = [
  { raw_call: "HOUSTON", raw_call_norm: "houston", family: "Quick Game" },
  { raw_call: "DINO", raw_call_norm: "dino", family: "Mesh" }
];
const rows = [{ play: "HOUSTON" }, { play: "HOUSTON" }, { play: "DINO" }];
const offer = PM.offerFamilies(book, maps, rows);
PM.setCache("t", maps);
const paint = PM.panelPaint(rows, { playbook: book, fetched: maps, hydrating: false });
check("one family source: offer === panel chips", JSON.stringify(offer.familyChips) === JSON.stringify(paint.familyChips));
check("one family source: offer === panel families", JSON.stringify(offer.families) === JSON.stringify(paint.families));
const typed = PM.prepareSave({ typed: "Quick", chip: "", families: offer.families });
check("typed Quick collapses to Quick Game", !!(typed.ok && typed.family === "Quick Game" && typed.collapsed));
check("HTML applyPlaybookFamily uses prepareSave", /applyPlaybookFamily/.test(HTML) && /prepareSave/.test(HTML));

check("shared PERSONNEL includes 00/10/11/12/13/20/21/22", FM.PERSONNEL.join(",") === "00,10,11,12,13,20,21,22");
check("playbook dropdown uses shared PERSONNEL", /OFFGRD_FORMATION_MAP/.test(HTML) && /PERSONNEL/.test(HTML) && /fillPersSel/.test(HTML));

const builtins = ["2x2 Doubles (Gun)", "Trips Rt (Gun)"];
const cold = FM.playbookFormOptions(builtins, { hydrated: false, rows: [] });
check("unhydrated [] adds no mapped tags", cold.mapped.length === 0 && cold.known === false && cold.forms.length === 2);

FM.setCache("team", [
  { raw_tag: "DART", raw_tag_norm: "dart", off_structure: "3x1", off_personnel: "11" },
  { raw_tag: "SPREAD", raw_tag_norm: "spread", off_structure: "2x2", off_personnel: "10" },
  { raw_tag: "ORPHAN", raw_tag_norm: "orphan", off_structure: "", off_personnel: null }
]);
const hot = FM.playbookFormOptions(builtins, { hydrated: true, rows: FM.getCached() });
const tags = hot.mapped.map(function (m) { return m.raw_tag; });
check("mapped DART + SPREAD listed", tags.indexOf("DART") >= 0 && tags.indexOf("SPREAD") >= 0);
check("unmapped ORPHAN absent", tags.indexOf("ORPHAN") < 0);
check("contains-match DART LEFT absent", tags.indexOf("DART LEFT") < 0);
check("resolveMapped DART LEFT is null", FM.resolveMapped("DART LEFT") == null);
check("resolveMapped DART is 3x1", !!(FM.resolveMapped("DART") && FM.resolveMapped("DART").off_structure === "3x1"));
check("HTML loads mapped shell on select", /applyFormationChoice/.test(HTML) && /formKeyForMappedStructure/.test(HTML));
check("HTML fillFormSel uses playbookFormOptions", /playbookFormOptions/.test(HTML));

const labels = HTML.match(/dockBtn\([^)]+"[^"]+"/g) || [];
const bad = labels.filter(function (s) { return /\?/.test(s) || /â/.test(s); });
check("new dock labels have no mojibake ?", bad.length === 0, bad.join(" | "));

if (fails) {
  console.error(fails + " FAIL");
  process.exit(1);
}
console.log("ok  smoke-playbook-dock");
