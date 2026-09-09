/**
 * Outcome eventIds are deterministic. Three boots cannot multiply them.
 *   node scripts/smoke-outcome-eventid.cjs
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");

function ls() {
  const m = {};
  return {
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null;
    },
    setItem(k, v) {
      m[k] = String(v);
    },
    removeItem(k) {
      delete m[k];
    },
  };
}

function load() {
  const sandbox = {
    console,
    localStorage: ls(),
    navigator: { onLine: true },
    document: { addEventListener() {}, visibilityState: "visible" },
    addEventListener() {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(root, "OFFGRD-empty-unknown.js"), "utf8"), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(root, "OFFGRD-caller-side.js"), "utf8"), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(root, "OFFGRD-caller-log.js"), "utf8"), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(root, "OFFGRD-caller-journal.js"), "utf8"), sandbox);
  return sandbox;
}

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

const box = load();
const E = box.OFFGRD_CALLER;
const J = box.OFFGRD_CALLER_JOURNAL;
if (!E || !E.outcomeEventId) throw new Error("outcomeEventId missing");

const gid = "87c34cae-305d-448e-8a44-03288485a487";
const a = E.outcomeEventId(gid, "offense", 3);
const b = E.outcomeEventId(gid, "offense", 3);
const c = E.outcomeEventId(gid, "defense", 3);
const d = E.outcomeEventId(gid, "offense", 4);
check("same snap same id", a === b && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/i.test(a));
check("side and playIndex change the id", a !== c && a !== d);

const ev1 = E.buildEvent({
  gameId: gid,
  playIndex: 3,
  type: "outcome",
  payload: { result: "hit" },
  deviceId: "dev",
  seq: 1,
  side: "offense",
});
const ev2 = E.buildEvent({
  gameId: gid,
  playIndex: 3,
  type: "outcome",
  payload: { result: "miss" },
  deviceId: "dev",
  seq: 2,
  side: "offense",
});
check("buildEvent remint reuses the outcome id", ev1.eventId === a && ev2.eventId === a);

const log = [];
for (let i = 0; i < 11; i++) {
  log.push({
    id: "call-" + i + "-xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    playIndex: i,
    play: "TRAP",
    result: "hit",
    ts: 1000 + i,
  });
}
const sess = { gameId: gid, opp: "Parkway Central", week: "Live 2026-09-08", side: "offense" };
const boot1 = E.migrateV1Log(log, sess, "dev", null);
const boot2 = E.migrateV1Log(log, sess, "dev", null);
const boot3 = E.migrateV1Log(log, sess, "dev", null);
check("three migrates emit the same outcome ids", boot1.events.filter(function (e) { return e.type === "outcome"; }).every(function (e, i) {
  return e.eventId === boot2.events.filter(function (x) { return x.type === "outcome"; })[i].eventId &&
    e.eventId === boot3.events.filter(function (x) { return x.type === "outcome"; })[i].eventId;
}));

[boot1, boot2, boot3].forEach(function (boot) {
  boot.events.forEach(function (e) { J.appendNow(e); });
});
const outcomes = J.allRows().filter(function (r) {
  return r.type === "outcome" && String(r.gameId) === gid;
});
check(
  "three boots: outcome count == graded snaps",
  outcomes.length === 11,
  "got " + outcomes.length
);

const html = fs.readFileSync(path.join(root, "OFFGRD.html"), "utf8");
const dc = fs.readFileSync(path.join(root, "OFFGRD-dcaller.js"), "utf8");
check(
  "hydrateFromGames returns while a pin exists",
  /function callerHydrateFromGames\(\)\{[\s\S]{0,180}Pin\.get\(\)\) return;/.test(html)
);
check("O fallback outcome id is deterministic", /outcomeEventId\(gid,"offense"/.test(html));
check("D fallback outcome id is deterministic", /outcomeEventId\(gid, "defense"/.test(dc));

if (fails) {
  console.error(fails + " outcome-eventid smoke(s) failed");
  process.exit(1);
}
console.log("ok  outcome eventId");
