/**
 * Coach identity: Account has a Name field; setMyName is not a silent no-op.
 *
 *   node scripts/smoke-coach-identity.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const auth = fs.readFileSync(path.join(ROOT, "OFFGRD-auth.js"), "utf8");
const account = fs.readFileSync(path.join(ROOT, "OFFGRD-account.js"), "utf8");
const cloud = fs.readFileSync(path.join(ROOT, "OFFGRD-cloud.js"), "utf8");
const apply = path.join(
  ROOT,
  "..",
  "OFFRD FILES 25",
  "docs",
  "security",
  "apply-offgrd-coach-identity.sql"
);
const sql = fs.readFileSync(apply, "utf8");

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

check("Account modal has Name field", /ogaMyName/.test(auth) && /Save name/.test(auth));
check("setMyName calls offgrd_set_my_name or upserts", /offgrd_set_my_name/.test(cloud) && /no_member/.test(cloud));
check("setMyName throws when signed out", /Sign in first/.test(cloud));
check("SQL display_coach_name exists", /display_coach_name/.test(sql));
check("SQL display_coach_name takes role", /p_role text/.test(sql) && /p_role = 'player'/.test(sql));
check("SQL formats dotted email local part", /format_email_local_name/.test(sql));
check("account rosterDisplayName is role-aware", /rosterDisplayName/.test(account) && /role === "player"/.test(account));
check("SQL set_my_name refuses no_member", /no_member/.test(sql));
check("SQL team_roster LEFT JOIN profiles", /LEFT JOIN offgrd\.profiles/.test(sql));
check("SQL backfills missing profiles", /INSERT INTO offgrd\.profiles/.test(sql));

if (fails) {
  console.error(fails + " FAIL");
  process.exit(1);
}
console.log("ok  smoke-coach-identity");
