/**
 * Graduates / archived players park at the bottom of Program roster
 * and stay out of the active list.
 *
 *   node scripts/smoke-roster-archive.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const account = fs.readFileSync(path.join(ROOT, "OFFGRD-account.js"), "utf8");
const cloud = fs.readFileSync(path.join(ROOT, "OFFGRD-cloud.js"), "utf8");
const apply = [
  path.join(ROOT, "scripts", "fixtures", "apply-offgrd-roster-archive-flags.sql"),
  path.join(ROOT, "..", "OFFRD FILES 25", "docs", "security", "apply-offgrd-roster-archive-flags.sql"),
].find(function (p) { return fs.existsSync(p); }) || "";
if (!apply) throw new Error("no roster-archive SQL fixture found");
const sql = fs.readFileSync(apply, "utf8");

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

check("isRosterShelved exists", /function isRosterShelved/.test(account));
check("shelved is player-only", /m\.role !== "player"/.test(account));
check("class year or archived_at shelves", /archived_at/.test(account) && /graduation_year/.test(account));
check("active list excludes shelved", /!isRosterShelved/.test(account));
check("bottom section is Graduated / archived", /Graduated \/ archived/.test(account));
check("setup roster count skips shelved", /setupState[\s\S]*isRosterShelved/.test(account) || /s\.roster=\(r\|\|\[\]\)\.filter\(function\(m\)\{ return !isRosterShelved/.test(account));
check("Cloud stamps archive flags", /_stampPlayerArchive/.test(cloud) && /graduation_year/.test(cloud));
check("SQL team_roster returns archived_at", /archived_at timestamptz/.test(sql));
check("SQL team_roster returns graduation_year", /graduation_year integer/.test(sql));
check("SQL joins public.players", /public\.players/.test(sql));

if (fails) {
  console.error(fails + " FAIL");
  process.exit(1);
}
console.log("ok  smoke-roster-archive");
