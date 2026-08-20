/**
 * Auth reentrancy: TOKEN_REFRESHED same identity skips hydrate/myTeams.
 *   node scripts/smoke-auth-reentry.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const cloud = fs.readFileSync(path.join(ROOT, "OFFGRD-cloud.js"), "utf8");
const acct = fs.readFileSync(path.join(ROOT, "OFFGRD-account.js"), "utf8");

const fn = (cloud.match(/function authEventNeedsHydrate\([\s\S]*?\n\}/) || [])[0];
if (!fn) throw new Error("authEventNeedsHydrate missing");
const box = {};
vm.runInNewContext(fn + "; this.authEventNeedsHydrate = authEventNeedsHydrate;", box);
const need = box.authEventNeedsHydrate;

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

const same = { userId: "u1", teamId: "t1" };
const other = { userId: "u2", teamId: "t1" };

check(
  "TOKEN_REFRESHED same identity needs no hydrate",
  need("TOKEN_REFRESHED", same, same) === false
);
check(
  "TOKEN_REFRESHED new user needs hydrate",
  need("TOKEN_REFRESHED", same, other) === true
);
check(
  "SIGNED_IN different user needs hydrate",
  need("SIGNED_IN", same, other) === true
);
check(
  "SIGNED_IN always hydrates even same user",
  need("SIGNED_IN", same, same) === true
);
check("SIGNED_OUT hydrates", need("SIGNED_OUT", same, { userId: "", teamId: "" }) === true);

/* Simulate 60s AFTER: TOKEN_REFRESHED same identity → 0 myTeams / 0 hydrate. */
let myTeams = 0;
let hydrates = 0;
function onAuthAfter(ev, prev, next) {
  if (!need(ev, prev, next)) return;
  myTeams += 1;
  hydrates += 1;
}
for (let i = 0; i < 9; i++) onAuthAfter("TOKEN_REFRESHED", same, same);
check("AFTER 60s TOKEN_REFRESHED same identity: 0 myTeams", myTeams === 0);
check("AFTER 60s TOKEN_REFRESHED same identity: 0 hydrates", hydrates === 0);
onAuthAfter("SIGNED_IN", same, other);
check("SIGNED_IN different user: exactly one hydrate", myTeams === 1 && hydrates === 1);

check("onAuth passes event to callback", /cb\(session \? session\.user : null, ev\)/.test(cloud));
check("account skips when !need", /if\(!need\)/.test(acct) && /authEventNeedsHydrate/.test(acct));
check("myTeams still de-dupes inflight", /if \(_myTeamsInflight\) return _myTeamsInflight/.test(cloud));
check("counter renamed off per-load reset", /page calls:/.test(cloud) && !/calls per load:/.test(cloud));
check("ensureFreshSession still uses refreshSession", /refreshSession\(\)/.test(cloud));

if (fails) {
  console.error(fails + " FAIL");
  process.exit(1);
}
console.log("ok  smoke-auth-reentry");
