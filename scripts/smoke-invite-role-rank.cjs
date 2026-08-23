/**
 * App ROLES must all appear in the SQL rank table.
 * A role scored as 0 silently keeps the old membership ("already").
 *
 *   node scripts/smoke-invite-role-rank.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const parseSrc = fs.readFileSync(path.join(ROOT, "OFFGRD-invite-parse.js"), "utf8");
const account = fs.readFileSync(path.join(ROOT, "OFFGRD-account.js"), "utf8");

const m = parseSrc.match(/export const ROLES = \[([^\]]+)\]/);
if (!m) throw new Error("export const ROLES missing from OFFGRD-invite-parse.js");
const roles = m[1]
  .split(",")
  .map(function (s) { return s.replace(/['"\s]/g, ""); })
  .filter(Boolean);

const sqlPaths = [
  path.join(ROOT, "scripts/fixtures/offgrd-role-rank.sql"),
  path.join(ROOT, "..", "OFFRD FILES 25", "docs/security/apply-offgrd-accept-invite.sql"),
].filter(function (p) { return fs.existsSync(p); });

if (!sqlPaths.length) throw new Error("no role-rank SQL fixture found");

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

check("ROLES has owner/coach_edit/coach_view/player", roles.join(",") === "owner,coach_edit,coach_view,player");
check("account imports ROLES", /ROLES/.test(account));

sqlPaths.forEach(function (sqlPath) {
  const sql = fs.readFileSync(sqlPath, "utf8");
  const label = path.basename(sqlPath);
  roles.forEach(function (role) {
    const hit = new RegExp("WHEN '" + role + "' THEN").test(sql);
    check(label + " ranks " + role, hit);
  });
  check(label + " has no invented admin rank", !/WHEN 'admin' THEN/.test(sql));
  check(label + " has no invented coach rank", !/WHEN 'coach' THEN/.test(sql));
});

if (fails) {
  console.error(fails + " FAIL");
  process.exit(1);
}
console.log("ok  smoke-invite-role-rank");
