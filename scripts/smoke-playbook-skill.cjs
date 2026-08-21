/**
 * Smoke: Playbook Guided/Expert skill — hydrate re-eval + opp-card session override.
 *   node scripts/smoke-playbook-skill.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const WIZARD = fs.readFileSync(path.join(ROOT, "OFFGRD-play-wizard.js"), "utf8");
const HTML = fs.readFileSync(path.join(ROOT, "OFFGRD-Playbook.html"), "utf8");

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

function ClassList() {
  this._ = Object.create(null);
}
ClassList.prototype.add = function (c) { this._[c] = 1; };
ClassList.prototype.remove = function (c) { delete this._[c]; };
ClassList.prototype.contains = function (c) { return !!this._[c]; };
ClassList.prototype.toggle = function (c, force) {
  if (force === true) { this._[c] = 1; return true; }
  if (force === false) { delete this._[c]; return false; }
  if (this._[c]) { delete this._[c]; return false; }
  this._[c] = 1;
  return true;
};

function makeEl(tag) {
  const el = {
    tagName: String(tag || "div").toUpperCase(),
    id: "",
    className: "",
    type: "",
    textContent: "",
    disabled: false,
    onclick: null,
    children: [],
    style: { display: "", visibility: "", cssText: "", minWidth: "", flexWrap: "", margin: "" },
    classList: new ClassList(),
    appendChild: function (c) { el.children.push(c); return c; },
    setAttribute: function () {},
    getAttribute: function () { return null; }
  };
  let html = "";
  Object.defineProperty(el, "innerHTML", {
    get: function () { return html; },
    set: function (v) {
      html = String(v == null ? "" : v);
      if (html === "") el.children = [];
    }
  });
  return el;
}

function walk(el, fn) {
  fn(el);
  (el.children || []).forEach(function (c) { walk(c, fn); });
}

function boot(opts) {
  opts = opts || {};
  const store = Object.create(null);
  if (opts.pref) store.offgrd_build_skill = opts.pref;
  const localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  };
  const byId = Object.create(null);
  ["skillGuided", "skillExpert", "wizDock", "wizDockHead", "wizDockBody", "wizDockBack", "wizDockNext", "wizDockSkip", "autoTestsBtn"].forEach(function (id) {
    const el = makeEl(id.indexOf("Btn") >= 0 || /Back|Next|Skip|Guided|Expert/.test(id) ? "button" : "div");
    el.id = id;
    byId[id] = el;
  });
  const body = makeEl("body");
  body.classList = new ClassList();
  const document = {
    body: body,
    getElementById: function (id) { return byId[id] || null; },
    createElement: makeEl,
    createTextNode: function (t) { return { textContent: String(t), nodeType: 3 }; },
    addEventListener: function () {}
  };
  const location = { search: opts.search || "", href: "https://getoffrd.com/gameday/OFFGRD-Playbook.html" + (opts.search || "") };
  const sandbox = {
    window: {},
    globalThis: {},
    console: console,
    document: document,
    localStorage: localStorage,
    location: location
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.localStorage = localStorage;
  sandbox.window.document = document;
  sandbox.window.location = location;
  vm.runInNewContext(WIZARD, sandbox);
  const W = sandbox.OFFGRD_PLAY_WIZARD;
  const host = {
    libCount: function () { return opts.libCount || 0; },
    getState: function () { return { players: [], name: "", type: "pass" }; },
    msg: function () {},
    onSkillChange: function () {},
    formations: function () { return ["2x2 Doubles (Gun)"]; },
    personnelCodes: function () { return ["10"]; },
    concepts: function () { return ["Smash"]; },
    routeNames: function () { return ["Hitch"]; },
    snap: function () {},
    newPlay: function () {},
    placePersonnel: function () {},
    applyConcept: function () {},
    applyProtection: function () {},
    applyRunScheme: function () {},
    placeDefense: function () {},
    renderAll: function () {},
    savePlay: function () {},
    setMode: function () {},
    set: function () {},
    readMeta: function () {},
    selectPlayer: function () {}
  };
  return {
    W: W,
    host: host,
    body: body,
    store: store,
    localStorage: localStorage,
    byId: byId,
    setLibCount: function (n) { opts.libCount = n; }
  };
}

function bodySkill(body) {
  const g = body.classList.contains("skill-guided");
  const e = body.classList.contains("skill-expert");
  if (g && !e) return "guided";
  if (e && !g) return "expert";
  return g && e ? "both" : "none";
}

/* Source pins */
const setIdx = HTML.indexOf("window.OFFGRD_APP=");
const touchIdx = HTML.indexOf("touch:a=>", setIdx);
const afterApp = HTML.indexOf("document.addEventListener(\"DOMContentLoaded\"", setIdx);
const setSlice = setIdx >= 0 && touchIdx > setIdx ? HTML.slice(setIdx, touchIdx) : "";
const touchSlice = touchIdx >= 0 && afterApp > touchIdx ? HTML.slice(touchIdx, afterApp) : "";
check("OFFGRD_APP.set calls reevaluateSkill", /reevaluateSkill/.test(setSlice));
check("OFFGRD_APP.touch does not call reevaluateSkill", !/reevaluateSkill/.test(touchSlice));
check("wizard exports reevaluateSkill", /reevaluateSkill:\s*reevaluateSkill/.test(WIZARD));
const persistHits = [];
WIZARD.split(/\n/).forEach(function (line, i) {
  if (/persist/.test(line)) persistHits.push({ n: i + 1, line: line.trim() });
});
check("setSkill honors persist:false", persistHits.some(function (h) { return /opts\.persist\s*!==\s*false/.test(h.line); }));
check(
  "only skipGuided path passes persist:false",
  persistHits.filter(function (h) { return /persist:\s*false/.test(h.line); }).length === 1 &&
    persistHits.some(function (h) { return /setSkill\("expert",\s*\{\s*persist:\s*false\s*\}\)/.test(h.line); })
);

/* 1. empty cache at init → guided; hydrate 15 plays → expert + pref written */
const t1 = boot({ libCount: 0 });
t1.W.init(t1.host);
check("1 init empty lib is guided", t1.W.getSkill() === "guided");
check("1 init body is guided", bodySkill(t1.body) === "guided");
check("1 init did not persist a pref", t1.localStorage.getItem("offgrd_build_skill") == null);
t1.setLibCount(15);
const t1next = t1.W.reevaluateSkill();
check("1 hydrate 15 flips to expert", t1next === "expert" && t1.W.getSkill() === "expert");
check("1 body + getSkill agree expert", bodySkill(t1.body) === "expert" && t1.W.getSkill() === "expert");
check("1 hydrate persists expert pref", t1.localStorage.getItem("offgrd_build_skill") === "expert");
check("1 guided toggle off / expert toggle on", !t1.byId.skillGuided.classList.contains("on") && t1.byId.skillExpert.classList.contains("on"));

/* 2. explicit guided pref is never overridden */
const t2 = boot({ pref: "guided", libCount: 15 });
t2.W.init(t2.host);
check("2 saved guided boots guided despite lib", t2.W.getSkill() === "guided");
const t2next = t2.W.reevaluateSkill();
check("2 reevaluate keeps guided", t2next === "guided" && t2.W.getSkill() === "guided");
check("2 pref still guided", t2.localStorage.getItem("offgrd_build_skill") === "guided");
check("2 body stays guided", bodySkill(t2.body) === "guided");

/* 3. mid-wizard (past first step) does not flip */
const t3 = boot({ libCount: 0 });
t3.W.init(t3.host);
check("3 starts guided at step 0", t3.W.getSkill() === "guided");
let modeBtn = null;
walk(t3.byId.wizDockBody, function (el) {
  if (el.tagName === "BUTTON" && /scratch|template/i.test(el.textContent || "")) modeBtn = el;
});
check("3 entry mode chips rendered", !!modeBtn);
if (modeBtn && modeBtn.onclick) modeBtn.onclick();
t3.setLibCount(15);
const t3next = t3.W.reevaluateSkill();
check("3 mid-wizard stays guided", t3next === "guided" && t3.W.getSkill() === "guided");
check("3 mid-wizard does not persist", t3.localStorage.getItem("offgrd_build_skill") == null);
check("3 body stays guided", bodySkill(t3.body) === "guided");

/* 4. from=opp-card is session expert, does not write pref */
const t4 = boot({ libCount: 0, search: "?from=opp-card" });
t4.W.init(t4.host);
check("4 opp-card getSkill is expert", t4.W.getSkill() === "expert");
check("4 opp-card body is skill-expert", bodySkill(t4.body) === "expert");
check("4 opp-card does not write pref", t4.localStorage.getItem("offgrd_build_skill") == null);
check("4 opp-card toggles agree", !t4.byId.skillGuided.classList.contains("on") && t4.byId.skillExpert.classList.contains("on"));

if (fails) {
  console.error(fails + " FAIL");
  process.exit(1);
}
console.log("ok  smoke-playbook-skill");
