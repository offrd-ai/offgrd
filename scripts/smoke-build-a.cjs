/**
 * Build A — device is trustworthy.
 *   node scripts/smoke-build-a.cjs
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

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

function loadCore() {
  const sandbox = {
    console,
    localStorage: ls(),
    sessionStorage: ls(),
    navigator: { userAgent: "Mozilla/5.0", platform: "Win32", maxTouchPoints: 0, standalone: undefined },
    document: { getElementById() { return null; }, createElement() { return { textContent: "" }; }, head: { appendChild() {} } },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  ["OFFGRD-caller-side.js", "OFFGRD-caller-log.js", "OFFGRD-caller-journal.js", "OFFGRD-gameday-pin.js"].forEach((f) => {
    vm.runInNewContext(fs.readFileSync(path.join(root, f), "utf8"), sandbox);
  });
  return sandbox;
}

const s = loadCore();
const C = s.OFFGRD_CALLER;
const S = s.OFFGRD_CALLER_SIDE;
const J = s.OFFGRD_CALLER_JOURNAL;
const Pin = s.OFFGRD_GAMEDAY_PIN;

const gid = Pin.gameIdFor("Parkway Central", "2026-09-10");
const oOutcomes = [];
for (let i = 0; i < 65; i++) {
  oOutcomes.push({
    eventId: "o-out-" + i,
    gameId: gid,
    playIndex: i,
    type: "outcome",
    side: "offense",
    payload: { result: "hit" },
    deviceId: "dev_o",
    clientTs: i + 1,
    seq: i + 1,
  });
}
const dCalls = [];
for (let i = 0; i < 10; i++) {
  const opened = C.openSnap(oOutcomes.concat(dCalls), { side: "defense", gameId: gid, deviceId: "dev_d" });
  dCalls.push({
    eventId: "d-call-" + i,
    gameId: gid,
    playIndex: opened.playIndex,
    type: "call",
    side: "defense",
    payload: { play: i % 2 ? "Pass" : "Run", playType: i % 2 ? "Pass" : "Run" },
    deviceId: "dev_d",
    clientTs: 1000 + i,
    seq: 100 + i,
  });
}
check(
  "65 O outcomes on a gameId, 10 D snaps use indexes 0–9",
  dCalls.length === 10 &&
    dCalls.every(function (e, i) { return e.playIndex === i; }) &&
    C.allocatePlayIndex(oOutcomes.concat(dCalls), { side: "defense", gameId: gid }) === 10
);

const leftover = { eventId: "fri-o", gameId: "friday-id", side: "offense", type: "outcome", payload: {}, clientTs: 1 };
J.appendNow(leftover);
check("retargetGameId is deleted (never re-parents)", typeof J.retargetGameId === "undefined" && J.eventsForGame("friday-id").length === 1);

s.CALLER_EVENTS = [leftover];
s.localStorage.setItem(
  "offgrd_gameday_pin_v1",
  JSON.stringify({ opponent: "Parkway Central", date: "2026-09-10", gameId: gid, ha: "H", pinnedAt: 1 })
);
check("adoptIfPinned is deleted (pick is the only identity path)", typeof Pin.adoptIfPinned === "undefined");
check("pin writeId is the pinned game", Pin.writeId() === gid);
check("leftover event gameIds are never rewritten", s.CALLER_EVENTS[0].gameId === "friday-id");

const dcSrc = fs.readFileSync(path.join(root, "OFFGRD-dcaller.js"), "utf8");
const amendSrc = dcSrc.match(/function shouldAmendOpenCall\(live, playType, now\) \{[\s\S]*?return \(now != null \? now : Date\.now\(\)\) - ts <= 3000;\s*\}/);
check("D exports shouldAmendOpenCall", !!(amendSrc && /shouldAmendOpenCall: shouldAmendOpenCall/.test(dcSrc)));
const amendBox = {};
vm.runInNewContext(amendSrc[0] + "; this.shouldAmendOpenCall = shouldAmendOpenCall;", amendBox);
const live = { playIndex: 0, playType: "Run", result: null, ts: 10_000 };
check("same D call within 3s amends", amendBox.shouldAmendOpenCall(live, "Run", 12_000) === true);
check("same D call after 3s is a new snap", amendBox.shouldAmendOpenCall(live, "Run", 14_000) === false);
check("different D call is a new snap", amendBox.shouldAmendOpenCall(live, "Pass", 10_500) === false);
check("graded D call is not amended", amendBox.shouldAmendOpenCall({ playIndex: 0, playType: "Run", result: "short", ts: 10_000 }, "Run", 10_500) === false);

const iphoneSafari = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", platform: "iPhone", standalone: false, maxTouchPoints: 5 };
const iphoneIcon = { userAgent: iphoneSafari.userAgent, platform: "iPhone", standalone: true, maxTouchPoints: 5 };
const ipadSafari = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", platform: "MacIntel", standalone: false, maxTouchPoints: 5 };
check("iPhone Safari is read-only until unlocked", S.callerWritesAllowed(iphoneSafari) === false);
check("iPhone home-screen icon can write", S.callerWritesAllowed(iphoneIcon) === true);
check("iPad Safari is read-only until unlocked", S.callerWritesAllowed(ipadSafari) === false);
check("desktop can write", S.callerWritesAllowed({ userAgent: "Mozilla/5.0", platform: "Win32", maxTouchPoints: 0 }) === true);
s.navigator = iphoneSafari;
check("Safari banner names the icon", /OFFGRD icon/.test(S.safariReadOnlyBannerHtml()));
check("Safari banner offers Log here anyway", /Log here anyway/.test(S.safariReadOnlyBannerHtml()));
S.allowSafariLogging();
check("Log here anyway unlocks this tab", S.callerWritesAllowed(iphoneSafari) === true);
check("unlocked Safari still shows the banner", /Logging in this Safari tab/.test(S.safariReadOnlyBannerHtml()));
s.sessionStorage.removeItem("offgrd_safari_log_anyway");
check("unlock is per tab (cleared session locks again)", S.callerWritesAllowed(iphoneSafari) === false);
check("Safari mint uses a per-tab id, not the icon key", (function () {
  const id1 = C.deviceId();
  s.localStorage.setItem("offgrd_device_id", "dev_icon_should_stay");
  const id2 = C.deviceId();
  return id1 === id2 && id1 !== "dev_icon_should_stay" && s.localStorage.getItem("offgrd_device_id") === "dev_icon_should_stay" && s.sessionStorage.getItem("offgrd_device_id_safari_tab") === id1;
})());

const html = fs.readFileSync(path.join(root, "OFFGRD.html"), "utf8");
const pinSrc = fs.readFileSync(path.join(root, "OFFGRD-gameday-pin.js"), "utf8");
const journalSrc = fs.readFileSync(path.join(root, "OFFGRD-caller-journal.js"), "utf8");
check("hydrateFromGames is deleted", !/function callerHydrateFromGames/.test(html));
check("journal retarget is deleted", !/function retargetGameId/.test(journalSrc));
check("pin retargetLive is deleted", !/function retargetLive/.test(pinSrc));
check("pin adoptIfPinned is deleted", !/function adoptIfPinned/.test(pinSrc));
const sideSrc = fs.readFileSync(path.join(root, "OFFGRD-caller-side.js"), "utf8");
check("restampStaleSession is deleted", !/function restampStaleSession/.test(sideSrc));
check("no code rewrites event gameIds", !/e\.gameId = next\.gameId/.test(sideSrc));
check("migrateV1Log is deleted", !/function migrateV1Log/.test(fs.readFileSync(path.join(root, "OFFGRD-caller-log.js"), "utf8")));
check("O append refuses Safari writes", /callerWritesAllowed/.test(html));
check("D append refuses Safari writes", /callerWritesAllowed/.test(dcSrc));

if (fails) {
  console.error(fails + " build-a smoke(s) failed");
  process.exit(1);
}
console.log("ok  build A");
