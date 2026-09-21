/**
 * Build B1a — devices do not write Live scouting_games rows.
 *   node scripts/smoke-caller-library-write.cjs
 *
 * planLiveLibraryWrite and callerSyncToGames are deleted, not no-op'd.
 * Local fold (foldCallerEvents) stays for the in-game UI.
 * Season push skips live_call / Live-week blobs.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "OFFGRD.html"), "utf8");
const dcaller = fs.readFileSync(path.join(root, "OFFGRD-dcaller.js"), "utf8");
const side = fs.readFileSync(path.join(root, "OFFGRD-caller-side.js"), "utf8");
const account = fs.readFileSync(path.join(root, "OFFGRD-account.js"), "utf8");

const sandbox = {
  console,
  localStorage: {
    _m: {},
    getItem(k) {
      return this._m[k] || null;
    },
    setItem(k, v) {
      this._m[k] = String(v);
    },
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(side, sandbox);
const S = sandbox.OFFGRD_CALLER_SIDE;

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

check("planLiveLibraryWrite deleted", !S.planLiveLibraryWrite && !/function planLiveLibraryWrite/.test(side));
check("callerSyncToGames deleted", !/function callerSyncToGames/.test(html) && !/callerSyncToGames\(/.test(html));
check("dcaller does not call callerSyncToGames", !/callerSyncToGames/.test(dcaller));
check("html persist does not write the library", /function callerPersist\(\)\{ callerSaveLocal\(\); callerScheduleSync\(\); \}/.test(html));
check("html refold still folds", /function callerRefold[\s\S]{0,400}foldCallerEvents/.test(html));
check("dcaller refold still folds", /function refold[\s\S]{0,280}foldCallerEvents/.test(dcaller));
check(
  "push skips live library games",
  /g\.source==="live_call"/.test(account) && /\/\^live\\b\/i\.test\(String\(g\.week/.test(account)
);
check("open-is-readonly gate is gone", !/open-is-readonly/.test(html) && !/open-is-readonly/.test(side));

if (fails) {
  console.error(fails + " smoke-caller-library-write failure(s)");
  process.exit(1);
}
console.log("smoke-caller-library-write ok");
