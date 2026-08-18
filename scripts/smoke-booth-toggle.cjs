/**
 * Smoke: v294 Booth on secondary entrypoints (Playbook / QB).
 * Applies class + flips label; second click reverses; LS written only when applied.
 *   node scripts/smoke-booth-toggle.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");

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

function makeSandbox(pathname) {
  const store = Object.create(null);
  const localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  };
  const html = {
    classList: new ClassList(),
    dataset: {},
    style: { removeProperty: function () {}, setProperty: function () {} },
    getAttribute: function () { return null; },
    setAttribute: function () {},
    removeAttribute: function () {}
  };
  const body = {
    classList: new ClassList(),
    style: html.style,
    firstChild: null,
    insertBefore: function () {},
    appendChild: function () {}
  };
  const boothBtn = {
    id: "rdSetupBooth",
    textContent: "Booth mode",
    classList: new ClassList(),
    setAttribute: function () {},
    getAttribute: function () { return "booth"; }
  };
  const themeMeta = {
    getAttribute: function () { return "#13294B"; },
    setAttribute: function () {}
  };
  const document = {
    documentElement: html,
    body: body,
    readyState: "loading",
    getElementById: function (id) { return id === "rdSetupBooth" ? boothBtn : null; },
    querySelector: function (sel) {
      if (sel === 'meta[name="theme-color"]') return themeMeta;
      if (sel === "#rdSetupBooth" || sel === '#rdSetupMenu [data-action="booth"]') return boothBtn;
      return null;
    },
    querySelectorAll: function (sel) {
      if (String(sel).indexOf("#rdSetupMenu") >= 0 && String(sel).indexOf("booth") >= 0) return [boothBtn];
      if (String(sel).indexOf("#rdTools") >= 0 && String(sel).indexOf("booth") >= 0) return [boothBtn];
      return [];
    },
    createElement: function () {
      return {
        style: {},
        className: "",
        id: "",
        classList: new ClassList(),
        setAttribute: function () {},
        appendChild: function () {}
      };
    },
    addEventListener: function () {}
  };
  const sandbox = {
    window: {},
    globalThis: {},
    console: console,
    document: document,
    localStorage: localStorage,
    location: { pathname: pathname, search: "", href: "https://getoffrd.com/gameday/" + pathname },
    setTimeout: function () { return 0; },
    clearTimeout: function () {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.localStorage = localStorage;
  sandbox.window.document = document;
  sandbox.window.location = sandbox.location;
  sandbox.window.OFFGRD_CONFIG = { redesign: true };
  vm.runInNewContext(fs.readFileSync(path.join(root, "OFFGRD-redesign.js"), "utf8"), sandbox);
  return { sandbox: sandbox, html: html, boothBtn: boothBtn, store: store, localStorage: localStorage };
}

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

["OFFGRD-QB.html", "OFFGRD-Playbook.html"].forEach(function (page) {
  const ctx = makeSandbox(page);
  const RD = ctx.sandbox.OFFGRD_REDESIGN;
  check(page + " exports booth helpers", !!(RD && RD.applyBoothLocal && RD.toggleBoothLocal && RD.boothLabelText));

  const failHtml = ctx.html;
  const realToggle = failHtml.classList.toggle;
  failHtml.classList.toggle = function () { return false; };
  const denied = RD.applyBoothLocal(true);
  check(page + " apply failure does not write LS", denied === false && ctx.localStorage.getItem("offgrd_booth") !== "1");
  failHtml.classList.toggle = realToggle;

  const first = RD.toggleBoothLocal();
  check(page + " first toggle ok", first && first.ok === true);
  check(page + " first toggle applies rd-booth", ctx.html.classList.contains("rd-booth"));
  check(page + " first toggle sets rd-on", ctx.html.classList.contains("rd-on"));
  check(page + " first toggle writes LS", ctx.localStorage.getItem("offgrd_booth") === "1");
  RD.refreshBoothLabels();
  check(page + " first toggle flips label", ctx.boothBtn.textContent === RD.boothLabelText(true));

  RD.syncPhaseUI();
  check(page + " syncPhaseUI does not strip rd-booth", ctx.html.classList.contains("rd-booth"));

  const second = RD.toggleBoothLocal();
  check(page + " second toggle ok", second && second.ok === true);
  check(page + " second toggle clears rd-booth", !ctx.html.classList.contains("rd-booth"));
  check(page + " second toggle writes LS off", ctx.localStorage.getItem("offgrd_booth") === "0");
  RD.refreshBoothLabels();
  check(page + " second toggle restores label", ctx.boothBtn.textContent === RD.boothLabelText(false));
});

if (fails) {
  console.error(fails + " FAIL");
  process.exit(1);
}
console.log("ok  smoke-booth-toggle");
