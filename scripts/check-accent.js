#!/usr/bin/env node
/**
 * Guard: adjustAccent must return in a bounded number of steps for a hue sweep.
 * Loads OFFGRD-redesign.js in a minimal window/document shim and asserts
 * Night/Chalk outputs are finite hexes that finish instantly (no hangs).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const rootDir = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(rootDir, "OFFGRD-redesign.js"), "utf8");

const storage = Object.create(null);
const attrs = Object.create(null);
const styleProps = Object.create(null);

const documentElement = {
  classList: { add: function () {}, remove: function () {}, toggle: function () {} },
  dataset: {},
  style: {
    setProperty: function (k, v) { styleProps[k] = v; },
    getPropertyValue: function (k) { return styleProps[k] || ""; }
  },
  setAttribute: function (k, v) { attrs[k] = String(v); },
  getAttribute: function (k) { return attrs[k] != null ? attrs[k] : null; },
  removeAttribute: function (k) { delete attrs[k]; }
};

const document = {
  documentElement: documentElement,
  body: {
    style: {
      setProperty: function () {},
      getPropertyValue: function () { return ""; },
      removeProperty: function () {}
    }
  },
  readyState: "complete",
  getElementById: function () { return null; },
  querySelector: function () { return null; },
  createElement: function () {
    return { style: {}, appendChild: function () {}, setAttribute: function () {} };
  },
  head: { appendChild: function () {} },
  addEventListener: function () {}
};

const localStorage = {
  getItem: function (k) { return storage[k] != null ? storage[k] : null; },
  setItem: function (k, v) { storage[k] = String(v); },
  removeItem: function (k) { delete storage[k]; }
};

const location = { search: "" };

const sandbox = {
  OFFGRD_CONFIG: { redesign: false },
  location: location,
  document: document,
  localStorage: localStorage,
  setTimeout: function () { return 0; },
  MutationObserver: function () {
    return { observe: function () {}, disconnect: function () {} };
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.runInNewContext(src, sandbox, { timeout: 2000, filename: "OFFGRD-redesign.js" });

const api = sandbox.OFFGRD_REDESIGN;
if (!api || typeof api.adjustAccent !== "function") {
  console.error("ACCENT FAIL: OFFGRD_REDESIGN.adjustAccent missing");
  process.exit(1);
}

function hexOk(h) {
  return typeof h === "string" && /^#[0-9a-fA-F]{6}$/.test(h);
}

const samples = [
  "#4B9CD3", "#F5B301", "#1D4ED8", "#c8102e", "#00FFFF", "#FFFF00",
  "#FFFFFF", "#000000", "#0A63FF", "#C6FF3A", "#7CFC00", "#FF00FF",
  "#808080", "#123456", "#abcdef", null, "", "not-a-color"
];

const t0 = Date.now();
let n = 0;
for (let i = 0; i < samples.length; i++) {
  for (const base of ["night", "chalk"]) {
    const out = api.adjustAccent(samples[i], base);
    n += 1;
    if (!out || !hexOk(out.accent) || !hexOk(out.accentText)) {
      console.error("ACCENT FAIL: bad output for", samples[i], base, out);
      process.exit(1);
    }
  }
}
const hueSamples = [
  "#FF0000", "#FF8000", "#FFFF00", "#80FF00", "#00FF00", "#00FF80",
  "#00FFFF", "#0080FF", "#0000FF", "#8000FF", "#FF00FF", "#FF0080"
];
for (let i = 0; i < hueSamples.length; i++) {
  for (const base of ["night", "chalk"]) {
    const out = api.adjustAccent(hueSamples[i], base);
    n += 1;
    if (!hexOk(out.accent)) {
      console.error("ACCENT FAIL: hue sweep", hueSamples[i], base, out);
      process.exit(1);
    }
  }
}
const ms = Date.now() - t0;
if (ms > 500) {
  console.error("ACCENT FAIL: adjustAccent sweep too slow (" + ms + "ms) — possible hang");
  process.exit(1);
}

const night = api.adjustAccent("#4B9CD3", "night").accent.toLowerCase();
const chalk = api.adjustAccent("#4B9CD3", "chalk").accent.toLowerCase();
if (night === chalk) {
  console.error("ACCENT FAIL: #4B9CD3 Night and Chalk accents identical:", night);
  process.exit(1);
}

console.log("accent ok:", n, "calls in", ms + "ms; night", night, "chalk", chalk);
