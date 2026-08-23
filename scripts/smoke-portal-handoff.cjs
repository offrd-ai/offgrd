/**
 * Team Portal click must keep the gameday session (from=gameday + SSO hash)
 * and both consumers must scrub #at=/#rt= via replaceState.
 *   node scripts/smoke-portal-handoff.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const shell = fs.readFileSync(path.join(root, "OFFGRD-shell.js"), "utf8");
const cloud = fs.readFileSync(path.join(root, "OFFGRD-cloud.js"), "utf8");
const account = fs.readFileSync(path.join(root, "OFFGRD-account.js"), "utf8");

function check(cond, msg) {
  if (!cond) throw new Error("portal-handoff: " + msg);
}

check(/function goPortal/.test(shell), "goPortal exists");
check(/from["']?\s*,\s*["']gameday["']/.test(shell) || /from=gameday/.test(shell), "marks from=gameday");
check(/#at=/.test(shell) && /"&rt="/.test(shell), "attaches SSO hash");
check(/getSession/.test(shell), "reads the live gameday session");
check(!/signOut\(\)/.test(shell.split("function goPortal")[1]?.split("function ")[0] || ""), "goPortal does not sign out");

const consume = (cloud.match(/async consumeAuthHandOff\(\) \{[\s\S]*?\n  \},/) || [])[0] || "";
check(/replaceState/.test(consume), "gameday consume replaceState");
check(/pathname \+ location\.search/.test(consume) || /pathname\s*\+\s*location\.search/.test(consume), "gameday replaceState drops hash");
check(!/location\.hash/.test(consume.replace(/location\.hash \|\| ""/, "")), "gameday replaceState does not write hash back");
check(/Cloud\.consumeAuthHandOff/.test(account), "gameday boot consumes the handoff");

console.log("OK portal handoff from=gameday + SSO hash + hash scrub");
