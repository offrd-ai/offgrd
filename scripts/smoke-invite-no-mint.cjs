/**
 * Invite accept must never mint a personal team/school.
 *
 *   node scripts/smoke-invite-no-mint.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const APPLY = path.join(
  ROOT,
  "..",
  "OFFRD FILES 25",
  "docs",
  "security",
  "apply-offgrd-invite-attach-school.sql"
);
const account = fs.readFileSync(path.join(ROOT, "OFFGRD-account.js"), "utf8");
const auth = fs.readFileSync(path.join(ROOT, "OFFGRD-auth.js"), "utf8");
const cloud = fs.readFileSync(path.join(ROOT, "OFFGRD-cloud.js"), "utf8");
const sql = fs.readFileSync(APPLY, "utf8");

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

check("apply file exists", fs.existsSync(APPLY));
check("SQL attaches invitee to invited school", /attach_invitee_to_invited_school/.test(sql));
check("SQL ensure_team_school uses team.name, not typed text", /ensure_team_school/.test(sql) && /coalesce\(nullif\(btrim\(tname\)/.test(sql));
check("accept_invite calls attach", /PERFORM offgrd\.attach_invitee_to_invited_school\(uid, inv\.team_id\)/.test(sql));
const acceptFn = (sql.split("CREATE OR REPLACE FUNCTION offgrd.accept_invite")[1] || "").split("CREATE OR REPLACE FUNCTION")[0];
check("accept_invite does not INSERT offgrd.teams", !/INSERT INTO offgrd\.teams/.test(acceptFn));
check("create_team refuses pending invite email", /Join your invite instead of creating a new program/.test(sql));
check("create_team refuses existing team_members", /You already belong to a program/.test(sql));
check("create_team refuses names shorter than 3", /char_length\(nm\) < 3/.test(sql));
check(
  "create_owned_program attaches member/invitee instead of minting",
  /FROM offgrd\.invites i/.test(sql) && /created\s*:=\s*false/.test(sql)
);

check("account marks joined-via-invite on land", /markJoinedViaInvite/.test(account) && /offgrd_joined_via_invite/.test(account));
check("account skips onboard for invitees", /joinedViaInvite\(\)/.test(account) && /pendingInviteToken\(\)/.test(account));
check("auth skips Name your program after invite join", /offgrd_joined_via_invite/.test(auth) && /hasPendingInvite/.test(auth));
check("cloud createTeam refuses invite arrivals", /_arrivedViaInvite/.test(cloud) && /Join your invite instead of creating a new program/.test(cloud));
check("cloud createOwnedProgram refuses invite arrivals", /createOwnedProgram[\s\S]*_arrivedViaInvite/.test(cloud));
check("cloud ensureTeam does not mint for invitees", /ensureTeam[\s\S]*_arrivedViaInvite\(\)\) return null/.test(cloud));
check("program name create requires 3+ chars", /n\.length<3/.test(account) && /schoolName\.length<3/.test(auth));

function acceptTwoInvitees() {
  const team = { id: "parkway", owner_id: "info", high_school_id: "pw-school", name: "Parkway West" };
  const teams = [team];
  const members = [{ team_id: "parkway", user_id: "info", role: "owner" }];
  const schools = { "pw-school": { id: "pw-school" } };
  const coaches = {};

  function accept(uid) {
    members.push({ team_id: team.id, user_id: uid, role: "coach_edit" });
    if (!coaches[uid]) coaches[uid] = { school_id: team.high_school_id };
    return { minted: false };
  }

  accept("u1");
  accept("u2");
  const owned = teams.filter(function (t) {
    return t.owner_id === "u1" || t.owner_id === "u2";
  });
  return {
    ownedCount: owned.length,
    school1: coaches.u1.school_id,
    school2: coaches.u2.school_id,
    teamCount: teams.filter(function (t) { return t.id === "parkway"; }).length,
  };
}

const sim = acceptTwoInvitees();
check("sim: invitees own 0 teams", sim.ownedCount === 0);
check("sim: both school_id = invited team high_school_id", sim.school1 === "pw-school" && sim.school2 === "pw-school");
check("sim: exactly one Parkway team row", sim.teamCount === 1);

if (fails) {
  console.error(fails + " FAIL");
  process.exit(1);
}
console.log("ok  smoke-invite-no-mint");
