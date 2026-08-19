/**
 * Play-map hydrate: never paint 0-mapped from an unknown/loading cache.
 *   node scripts/smoke-play-map-hydrate.cjs
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

const loading = M.panelPaint([{ play: "HOUSTON" }], { hydrating: true, fetched: null, playbook: [] });
check("hydrating empty is loading", !!(loading && loading.state === "loading" && loading.inv == null));
check("loading does not say 0 mapped", !/0 mapped|0 of /.test((loading && loading.statusText) || ""));

M.setCache("t", []);
const emptyReady = M.panelPaint([{ play: "HOUSTON" }], { hydrating: false, fetched: [], playbook: [] });
check("empty hydrated map is ready", !!(emptyReady && emptyReady.state === "ready" && emptyReady.inv));
check("honest zero on empty map", /0 of 1 calls resolve/.test(emptyReady.statusText));

let hydrates = 0;
M.onAfterHydrate(function () { hydrates += 1; });
M.setCache("t", [{ raw_call: "HOUSTON", raw_call_norm: "houston", family: "Mesh" }]);
const afterFirst = hydrates;
M.setCache("t", [{ raw_call: "HOUSTON", raw_call_norm: "houston", family: "Mesh" }]);
check("same cache does not re-hydrate", hydrates === afterFirst);

const html = fs.readFileSync(path.join(ROOT, "OFFGRD.html"), "utf8");
check("opener can pass hydrating", /hydrating:false/.test(html) || /hydrating: true/.test(html));

if (fails) {
  console.error(fails + " FAIL");
  process.exit(1);
}
console.log("ok  smoke-play-map-hydrate");
