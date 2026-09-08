/**
 * Caller journal — tap is permanent; store is a derived view.
 *   node scripts/smoke-caller-journal.cjs
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sandbox = {
  console,
  navigator: { onLine: true },
  document: {
    addEventListener() {},
    visibilityState: "visible",
  },
  localStorage: {
    _m: {},
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : null;
    },
    setItem(k, v) {
      this._m[k] = String(v);
    },
    removeItem(k) {
      delete this._m[k];
    },
    key(i) {
      return Object.keys(this._m)[i] || null;
    },
    get length() {
      return Object.keys(this._m).length;
    },
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.addEventListener = function () {};

const root = path.join(__dirname, "..");
vm.runInNewContext(fs.readFileSync(path.join(root, "OFFGRD-empty-unknown.js"), "utf8"), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(root, "OFFGRD-caller-journal.js"), "utf8"), sandbox);

const J = sandbox.OFFGRD_CALLER_JOURNAL;
if (!J) throw new Error("OFFGRD_CALLER_JOURNAL missing");

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

const evs = [];
for (let i = 0; i < 60; i++) {
  evs.push({
    eventId: "e" + i,
    gameId: "fri-d",
    side: "defense",
    type: "call",
    playIndex: i,
    payload: { play: "Run", date: "2026-09-04" },
    clientTs: Date.parse("2026-09-04T20:00:00-05:00") + i * 1000,
    seq: i + 1,
  });
}
evs.forEach(function (e) {
  J.appendNow(e);
});
check("60 taps land in the journal", J.allRows().filter(J.isLedgerEvent).length === 60);
check("append is idempotent", J.appendNow(evs[0]) && J.allRows().filter(J.isLedgerEvent).length === 60);

const wiped = J.hydrateView([], "defense");
check("empty store rebuilds from journal", wiped.length === 60);

const unknown = J.hydrateView(
  [{ eventId: "keep-me", gameId: "g2", side: "offense", type: "call", payload: {}, clientTs: 1 }],
  "offense"
);
check("empty journal does not wipe a store that has rows", unknown.some(function (e) { return e.eventId === "keep-me"; }));

J.recordClear("fri-d", "defense");
check("clear hides the game in the view", J.activeEvents("defense").length === 0);
check("clear keeps every journal row", J.eventsForGame("fri-d").length === 60);
check("Undo is offered for 30 minutes", J.clearUndoUntil("fri-d") > Date.now());
J.undoClear("fri-d", "defense");
check("Undo restore brings the game back", J.activeEvents("defense").length === 60);

const cen = J.census({
  side: "defense",
  gameId: "fri-d",
  log: new Array(60),
});
check("census counts snaps/saved", cen.snaps === 60 && cen.saved === 60);
check("empty is never green", J.census({ side: "offense", gameId: "none", log: [] }).reconciled === false);
check("unsynced 60 is not reconciled", cen.reconciled === false && cen.tone !== "good");

const payload = J.exportPayload("halftime");
check("export reads the journal, not the view", payload.kind === "offgrd_caller_journal" && payload.rows.length >= 60);

const html = fs.readFileSync(path.join(root, "OFFGRD.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "offgrd-sw.js"), "utf8");
const dc = fs.readFileSync(path.join(root, "OFFGRD-dcaller.js"), "utf8");
check("HTML loads the journal", /OFFGRD-caller-journal\.js/.test(html));
check("SW precaches the journal", /OFFGRD-caller-journal\.js/.test(sw));
check("O append writes the journal first", /OFFGRD_CALLER_JOURNAL\.appendNow/.test(html));
check("D append writes the journal first", /OFFGRD_CALLER_JOURNAL\.appendNow/.test(dc));
check("applyRemote refuses unknown empty (O)", /isUnknownEmpty/.test(html));
check("applyRemote refuses unknown empty (D)", /isUnknownEmpty/.test(dc));

if (fails) {
  console.error(fails + " journal smoke(s) failed");
  process.exit(1);
}
console.log("ok  caller journal");
