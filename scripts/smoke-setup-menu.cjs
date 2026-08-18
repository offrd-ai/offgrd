/**
 * Smoke: Setup menu items must resolve to a live local target OR a ?setup= link.
 * Fails if a 13th item is wired only to a main-app function.
 *   node scripts/smoke-setup-menu.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const ENTRY = [
  "OFFGRD.html",
  "OFFGRD-Playbook.html",
  "OFFGRD-QB.html",
  "index.html"
];

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function parseObjects(block) {
  const out = [];
  const re = /\{\s*action:\s*"([^"]+)"([^}]*)\}/g;
  let m;
  while ((m = re.exec(block))) {
    const extra = m[2] || "";
    const nav = (extra.match(/nav:\s*"([^"]+)"/) || [])[1] || "";
    const local = (extra.match(/local:\s*"([^"]+)"/) || [])[1] || "";
    out.push({ action: m[1], nav: nav, local: local });
  }
  return out;
}

const redesign = read("OFFGRD-redesign.js");
const itemsBlock = (redesign.match(/const SETUP_ITEMS = \[([\s\S]*?)\];/) || [])[1] || "";
const dispatchBlock = (redesign.match(/const SETUP_DISPATCH = \[([\s\S]*?)\];/) || [])[1] || "";
const itemActions = [];
const itemRe = /action:\s*"([^"]+)"/g;
let im;
while ((im = itemRe.exec(itemsBlock))) itemActions.push(im[1]);
const dispatch = parseObjects(dispatchBlock);

check("SETUP_ITEMS parsed", itemActions.length >= 12, "n=" + itemActions.length);
check("SETUP_DISPATCH parsed", dispatch.length >= 12, "n=" + dispatch.length);
check("SETUP_ITEMS count matches DISPATCH", itemActions.length === dispatch.length, itemActions.length + " vs " + dispatch.length);

const byAction = {};
dispatch.forEach(function (d) { byAction[d.action] = d; });

itemActions.forEach(function (action) {
  const d = byAction[action];
  check("item " + action + " is in DISPATCH", !!d);
  if (!d) return;
  const resolved = !!(d.nav || d.local);
  check("item " + action + " resolves (nav or local)", resolved, JSON.stringify(d));
  check("item " + action + " is not undefined-only", resolved);
});

const navs = dispatch.map(function (d) { return d.nav; }).filter(Boolean);
const html = read("OFFGRD.html");
const paramBlock = (html.match(/OFFGRD_SETUP_PARAMS\s*=\s*\{([\s\S]*?)\};/) || [])[1] || "";
const handled = {};
const keyRe = /^\s*([a-z]+)\s*:/gm;
let km;
while ((km = keyRe.exec(paramBlock))) handled[km[1]] = true;

check("OFFGRD_SETUP_PARAMS present", Object.keys(handled).length >= 7, Object.keys(handled).join(","));
navs.forEach(function (nav) {
  check("?setup=" + nav + " has OFFGRD.html handler", !!handled[nav]);
});

ENTRY.forEach(function (rel) {
  const src = read(rel);
  const hasChrome = /OFFGRD-redesign\.js/i.test(src);
  if (rel === "index.html") {
    check("index.html does not render Setup chrome", !hasChrome);
    return;
  }
  check(rel + " renders Setup chrome", hasChrome);
  itemActions.forEach(function (action) {
    const d = byAction[action];
    if (!d) return;
    check(rel + " " + action + " has nav or local", !!(d.nav || d.local));
  });
});

if (fails) {
  console.error(fails + " FAIL");
  process.exit(1);
}
console.log("ok  smoke-setup-menu");
