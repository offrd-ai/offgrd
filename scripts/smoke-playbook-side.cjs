/**
 * Smoke: v322 Offense / Defense as the first choice.
 *   node scripts/smoke-playbook-side.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const HTML = fs.readFileSync(path.join(ROOT, "OFFGRD-Playbook.html"), "utf8");
const DOCK_SRC = fs.readFileSync(path.join(ROOT, "OFFGRD-pb-dock.js"), "utf8");
const HOME = fs.readFileSync(path.join(ROOT, "OFFGRD.html"), "utf8");

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

const sandbox = {
  window: {},
  globalThis: {},
  console: console,
  localStorage: { getItem: function () { return null; }, setItem: function () {} },
  location: { search: "" }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(DOCK_SRC, sandbox);
const D = sandbox.OFFGRD_PB_DOCK;

const pms = { window: {}, globalThis: {}, console: console, localStorage: { getItem: function () { return null; }, setItem: function () {} } };
pms.window = pms;
pms.globalThis = pms;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "OFFGRD-play-map.js"), "utf8"), pms);
const PM = pms.OFFGRD_PLAY_MAP;

const rs = { window: {}, globalThis: {}, console: console, document: { getElementById: function () { return null; } } };
rs.window = rs;
rs.globalThis = rs;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "OFFGRD-render.js"), "utf8"), rs);
const R = rs.OFFGRD_RENDER;

check("cold editor has Offense + Defense chips", /id="pbSideOff"/.test(HTML) && /Offense play/.test(HTML) && /id="pbSideDef"/.test(HTML) && /Defense play/.test(HTML));
check("Offense chip starts selected", /<button[^>]*id="pbSideOff"[^>]*class="[^"]*\bon\b/.test(HTML) || /<button[^>]*class="[^"]*\bon\b[^"]*"[^>]*id="pbSideOff"/.test(HTML));
check("canvas stays in the document with the chips", /id="pbSideBar"[\s\S]*id="field"/.test(HTML) && /<svg id="field"/.test(HTML));

const sideCss = (HTML.match(/#pbSideBar\{[^}]+\}/) || [])[0] || "";
check("IP keep-out: side bar is relative, not overlay", /position:\s*relative/.test(sideCss) && !/position:\s*(fixed|absolute|sticky)/.test(sideCss));
check("IP keep-out: side bar is not a modal", !/id="pbSideBar"[\s\S]{0,80}class="ov"/.test(HTML));
check("dock on does not hide #pbSideBar", !/body\.pb-dock-on #pbSideBar/.test(HTML));

check("session key is offgrd_pb_edit_side", /offgrd_pb_edit_side/.test(HTML) && /function readEditSide/.test(HTML) && /function persistEditSide/.test(HTML));
check("dirty switch uses askConfirm", /function askConfirm/.test(HTML) && /function chooseSide/.test(HTML) && /if\(canvasDirty\(\)\)/.test(HTML) && /await askConfirm\(/.test(HTML));
const chooseFn = (HTML.match(/async function chooseSide\([\s\S]*?\nfunction /) || [])[0] || "";
check("chooseSide never uses window.confirm", chooseFn.length > 0 && !/\bwindow\.confirm\b/.test(chooseFn) && !/(?<!ask)confirm\(/.test(chooseFn.replace(/askConfirm\(/g, "ASK(")));
check("askConfirm Escape cancels", /id="pbConfirmOv"/.test(HTML) && /e\.key==="Escape"/.test(HTML));

check("defense seed uses shared placeDefenseOn", /seedDefensePlay/.test(HTML) && /OFFGRD_RENDER\.placeDefenseOn\(STATE/.test(HTML) && /front:"4-3"/.test(HTML));
check("Place offense look is the D-side verb", /Place offense look/.test(HTML) && /function placeOffenseLook/.test(HTML));
check("family chips hidden on defense", /body\.pb-side-defense #m-family-wrap/.test(HTML) && /if\(EDIT_SIDE==="defense"\)/.test(HTML));

const fronts = Object.keys(R.DFRONTS);
["4-3", "3-4", "Nickel", "4-2-5", "Bear (46)", "3-3-5 (Tite)", "Dime (4-1-6)", "4-3 EAGLE"].forEach(function (k) {
  check("DFRONTS has " + k, fronts.indexOf(k) >= 0);
});

function spot(front) {
  const st = { players: [], defs: [] };
  R.placeDefenseOn(st, front, "none");
  const canon = R.DFRONTS[front];
  const ok = st.defs.length === 11 && canon.length === 11 &&
    st.defs.every(function (d, i) { return d.x === canon[i].x && d.y === canon[i].y; });
  return { n: st.defs.length, ok: ok, will: st.defs.filter(function (d) { return d.lab === "W" || d.pos === "WLB"; })[0] };
}
const fourThree = spot("4-3");
const tite = spot("3-3-5 (Tite)");
check("4-3 seeds 11 defenders on canon coords", fourThree.ok, "n=" + fourThree.n);
check("3-3-5 (Tite) seeds 11 on canon coords", tite.ok, "n=" + tite.n);
check("4-3 Will is present", !!(fourThree.will && fourThree.will.group === "LB"));

const will = D.groupsForSelection({ group: "LB", lab: "W" });
check("Will tap shows blitz/drop/spy/man", will.indexOf("blitz") >= 0 && will.indexOf("zone-drop") >= 0 && will.indexOf("spy") >= 0 && will.indexOf("man") >= 0);
check("defender tap still drags", D.tapDrags({ group: "LB", lab: "W" }, { mode: "move" }) === true);

const dPlay = [
  { name: "North Base D", front: "4-3", coverage: "Cover 3", defs: [{ lab: "W" }] },
  { name: "4-3 Cover 2", front: "4-3", coverage: "Cover 2", defs: [{ lab: "W" }] },
  { name: "3-3 Stack", front: "3-3-5 (Tite)", defs: [{ lab: "W" }] },
  { name: "Kero 3-4 Cover 4", front: "3-4", coverage: "Cover 4", defs: [{ lab: "W" }] }
];
const oPlay = [
  { name: "Stick", family: "Quick Game", players: [{ lab: "X", route: [{ x: 1, y: 1 }] }] },
  { name: "Mesh", family: "Mesh" },
  { name: "HOUSTON", family: "Mesh" },
  { name: "HAMMER", family: "Mesh" },
  { name: "Hitches", family: "Quick Game" },
  { name: "Smash", family: "Dropback" },
  { name: "Flood Rt", family: "Dropback" },
  { name: "Four Verts", family: "Dropback" },
  { name: "Curl-Flat", family: "Dropback" },
  { name: "Inside Zone Rt", family: "Run" }
];
dPlay.forEach(function (p) {
  check("infer " + p.name + " → defense", PM.classifyPlay(p).side === "defense");
});
oPlay.forEach(function (p) {
  check("infer " + p.name + " → offense", PM.classifyPlay(p).side === "offense");
});
const unknown = PM.classifyPlay({ name: "Untitled" });
check("unclassifiable is logged not guessed", unknown.side === "" && unknown.reason === "unknown");
const ohioCanvas = {
  name: "Ohio",
  formation: "Ohio",
  players: [
    { lab: "LT", ol: 1 },
    { lab: "X" },
    { lab: "Z" }
  ],
  front: "4-3",
  coverage: "Cover 3",
  defs: [{ lab: "W", group: "LB" }]
};
const ohioVsLook = PM.classifyPlay(ohioCanvas);
check(
  "O personnel + teaching D look stays unclassified",
  ohioVsLook.side === "" && ohioVsLook.reason === "unknown",
  JSON.stringify(ohioVsLook)
);
check(
  "inferPlaySide does not resolve the mixed canvas",
  PM.inferPlaySide(ohioCanvas) === ""
);
const storedOffOnD = PM.classifyPlay(Object.assign({}, ohioCanvas, { side: "offense" }));
check(
  "stored offense beats D canvas",
  storedOffOnD.side === "offense" && storedOffOnD.reason === "stored",
  JSON.stringify(storedOffOnD)
);
const storedDefOnO = PM.classifyPlay({
  side: "defense",
  family: "Mesh",
  players: [{ lab: "X", route: [{ x: 1, y: 1 }] }]
});
check(
  "stored defense beats O canvas",
  storedDefOnO.side === "defense" && storedDefOnO.reason === "stored"
);
const storedOffAlias = PM.classifyPlay(Object.assign({}, ohioCanvas, { side: "off" }));
check(
  "stored off alias beats D canvas",
  storedOffAlias.side === "offense" && storedOffAlias.reason === "stored"
);
const fillsNull = PM.classifyPlay({ family: "Mesh" });
check(
  "inference fills a null side only",
  fillsNull.side === "offense" && fillsNull.reason === "inferred"
);
const emptyStored = PM.classifyPlay({ side: "", family: "Mesh" });
check(
  "empty stored side is treated as null",
  emptyStored.side === "offense" && emptyStored.reason === "inferred"
);
const ohioNameOnly = PM.classifyPlay({ name: "Ohio" });
check("name Ohio alone is not a side key", ohioNameOnly.side === "" && ohioNameOnly.reason === "unknown");
const dOnly = PM.classifyPlay({
  name: "Ohio",
  front: "4-3",
  coverage: "Cover 3",
  defs: [{ lab: "W", group: "LB" }]
});
check("D look with no O personnel → defense", dOnly.side === "defense");
check("Playbook migrate logs unknown", /unclassified play/.test(HTML) && /not guessing side/.test(HTML));
check(
  "unclassified load does not default to offense",
  /function loadPlayId[\s\S]*?EDIT_SIDE=playSide\(STATE\)/.test(HTML) &&
    !/EDIT_SIDE=\(playSide\(STATE\)==="defense"/.test(HTML)
);
check(
  "unset side chips stay off",
  /off\.classList\.toggle\("on", EDIT_SIDE==="offense"\)/.test(HTML)
);
check(
  "chooseSide assigns unset side without reseed",
  /const committed=EDIT_SIDE==="offense"\|\|EDIT_SIDE==="defense"/.test(HTML) &&
    /if\(STATE\) STATE\.side=next/.test(HTML)
);

const pw = oPlay.concat(dPlay);
check("Parkway West 14 → 10 offense join", pw.length === 14 && PM.offensePlaybook(pw).length === 10);
check("library filter uses stored/classified side", /_libFilt\.side/.test(HTML) && /playSide\(p\)!==_libFilt\.side/.test(HTML) && /id="libSide"/.test(HTML));
check("save writes STATE.side from EDIT_SIDE", /STATE\.side=EDIT_SIDE/.test(HTML));
check("same-play picker lists offense only", /offensePlaybook\(book/.test(HOME));

const defNull = D.groupsForSelection(null, { side: "defense" });
check("defense null dock has front + coverage + place O", defNull.indexOf("front") >= 0 && defNull.indexOf("coverage") >= 0 && defNull.indexOf("offense-look") >= 0);

if (fails) {
  console.error(fails + " FAIL");
  process.exit(1);
}
console.log("ok  smoke-playbook-side");
