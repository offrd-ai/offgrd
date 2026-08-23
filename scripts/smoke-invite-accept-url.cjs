/**
 * Invite email Join button must land on the gameday accept route
 * with the invite token — never recruiting /auth/select-role or root.
 *
 *   node scripts/smoke-invite-accept-url.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const parseSrc = fs.readFileSync(path.join(ROOT, "OFFGRD-invite-parse.js"), "utf8");
const account = fs.readFileSync(path.join(ROOT, "OFFGRD-account.js"), "utf8");
const auth = fs.readFileSync(path.join(ROOT, "OFFGRD-auth.js"), "utf8");
const cloud = fs.readFileSync(path.join(ROOT, "OFFGRD-cloud.js"), "utf8");

const start = parseSrc.indexOf("export const GAMEDAY_ACCEPT_ORIGIN");
const end = parseSrc.indexOf("export function normalizeInviteEmail");
if (start < 0 || end < 0) throw new Error("invite URL helpers missing from OFFGRD-invite-parse.js");
const helpers = parseSrc
  .slice(start, end)
  .replace(/export const /g, "const ")
  .replace(/export function /g, "function ");

const box = { URL, URLSearchParams };
vm.runInNewContext(
  helpers +
    "; this.inviteAcceptUrl = inviteAcceptUrl;" +
    " this.readInviteToken = readInviteToken;" +
    " this.isGamedayInviteAcceptUrl = isGamedayInviteAcceptUrl;" +
    " this.isInviteToken = isInviteToken;" +
    " this.isSafeAppRedirect = isSafeAppRedirect;",
  box
);

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

const token = "11111111-1111-4111-8111-111111111111";
const url = box.inviteAcceptUrl(token);
const parsed = new URL(url);

check("accept host is getoffrd.com", parsed.hostname === "getoffrd.com", parsed.hostname);
check("accept path is /gameday/OFFGRD.html", parsed.pathname === "/gameday/OFFGRD.html", parsed.pathname);
check("accept query carries invite token", parsed.searchParams.get("invite") === token);
check("accept is not /auth/select-role", !/select-role/i.test(url));
check("accept is not recruiting root", parsed.pathname !== "/" && parsed.pathname !== "/auth/select-role");
check("helper agrees it is the gameday accept route", box.isGamedayInviteAcceptUrl(url) === true);
check(
  "select-role is rejected",
  box.isGamedayInviteAcceptUrl("https://getoffrd.com/auth/select-role") === false
);
check(
  "recruiting root is rejected",
  box.isGamedayInviteAcceptUrl("https://getoffrd.com/") === false
);
check(
  "recruiting HS login is rejected",
  box.isGamedayInviteAcceptUrl(
    "https://getoffrd.com/login/high-school-coach?redirect=https%3A%2F%2Fwww.offops.app%2FOFFGRD.html"
  ) === false
);
check("readInviteToken pulls invite=", box.readInviteToken("?invite=" + token) === token);
check("isInviteToken accepts uuid", box.isInviteToken(token) === true);
check("bare gameday home has no token", box.inviteAcceptUrl() === "https://getoffrd.com/gameday/OFFGRD.html");

check("account persists invite token through auth", /offgrd_pending_invite/.test(account));
check("expired token uses human copy", /This invite link has expired/.test(account));
check("wrong-account offers switch", /Switch accounts/.test(account) && /wrong_account/.test(account));
check("boot runs invite accept", /pendingInviteToken\(\)/.test(account) && /runInviteAccept/.test(account));
check("account invite flow never routes to select-role", !/\/auth\/select-role/.test(account));
check("auth skips Name your program when invite is pending", /hasPendingInvite/.test(auth));
check("auth signup copy stays on the invited team", /Create your account to join/.test(auth));
check("cloud has peek + accept", /offgrd_peek_invite/.test(cloud) && /offgrd_accept_invite/.test(cloud));
check("cloud reads email_hint", /email_hint: row\.email_hint/.test(cloud));
check("cloud reads invite_email_hint", /invite_email_hint: row\.invite_email_hint/.test(cloud));
check("account displays email_hint", /email_hint \|\| row\.invite_email_hint/.test(account) || /inviteHint\(/.test(account));
check("account does not read peek.email", !/peek\.email\b/.test(account) && !/accepted\.invite_email\b/.test(account));
check("invite query is replaceState-scrubbed", /searchParams\.delete\(["']invite["']\)/.test(account) && /replaceState/.test(account));
check("safe redirect allowlist exists", /SAFE_REDIRECT_HOSTS/.test(parseSrc) && /function isSafeAppRedirect/.test(parseSrc));
check("own origin redirect allowed", box.isSafeAppRedirect("https://getoffrd.com/gameday/OFFGRD.html") === true);
check("relative gameday redirect allowed", box.isSafeAppRedirect("/gameday/OFFGRD.html") === true);
check("evil absolute redirect rejected", box.isSafeAppRedirect("https://evil.example/phish") === false);
check("protocol-relative redirect rejected", box.isSafeAppRedirect("//evil.example") === false);

if (fails) {
  console.error(fails + " FAIL");
  process.exit(1);
}
console.log("ok  smoke-invite-accept-url");
