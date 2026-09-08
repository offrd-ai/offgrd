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
J.appendNow({
  eventId: "misfiled",
  gameId: "stolen-uuid",
  side: "offense",
  type: "call",
  payload: {},
  clientTs: 2,
  seq: 99,
});
check(
  "retarget moves a write onto the pin id",
  J.retargetGameId("stolen-uuid", "pin-id") === 1 &&
    J.snapRowsForGame("pin-id", "offense").some(function (r) { return r.eventId === "misfiled"; }) &&
    J.snapRowsForGame("stolen-uuid", "offense").length === 0
);

const wiped = J.hydrateView([], "defense", "fri-d");
check("empty store rebuilds from journal for that gameId", wiped.length === 60);

const unknown = J.hydrateView(
  [{ eventId: "keep-me", gameId: "g2", side: "offense", type: "call", payload: {}, clientTs: 1 }],
  "offense",
  "g2"
);
check("empty journal does not wipe a store that has rows", unknown.some(function (e) { return e.eventId === "keep-me"; }));

for (let i = 0; i < 19; i++) {
  J.appendNow({
    eventId: "wed" + i,
    gameId: "wed-drill",
    side: "offense",
    type: "call",
    playIndex: i,
    payload: { play: "Drill", date: "2026-09-02" },
    clientTs: Date.parse("2026-09-02T16:00:00-05:00") + i * 1000,
    seq: i + 1,
  });
}
J.appendNow({
  eventId: "fri-out-0",
  gameId: "fri-d",
  side: "defense",
  type: "outcome",
  playIndex: 0,
  payload: { result: "hit" },
  clientTs: Date.parse("2026-09-04T20:00:01-05:00"),
  seq: 61,
});
const onlyFri = J.hydrateView([], "defense", "fri-d");
const onlyWed = J.hydrateView([], "offense", "wed-drill");
const central = J.hydrateView(onlyFri.concat(onlyWed), "offense", "central-new");
check("hydrate for Friday does not include Wednesday", onlyFri.length === 61 && onlyFri.every(function (e) { return e.gameId === "fri-d"; }));
check("hydrate for Wednesday does not include Friday", onlyWed.length === 19 && onlyWed.every(function (e) { return e.gameId === "wed-drill"; }));
check("hydrate for a new gameId does not inherit other games", central.length === 0);
check("unscoped hydrate keeps prior and does not dump the journal", J.hydrateView([{ eventId: "keep-me", gameId: "g2", side: "offense", type: "call", payload: {}, clientTs: 1 }], "offense").some(function (e) { return e.eventId === "keep-me"; }));

J.recordClear("fri-d", "defense");
check("clear hides the game in the view", J.activeEvents("defense").length === 0);
check("clear keeps every journal row", J.eventsForGame("fri-d").length === 61);
check("Undo is offered for 30 minutes", J.clearUndoUntil("fri-d") > Date.now());
J.undoClear("fri-d", "defense");
check("Undo restore brings the game back", J.activeEvents("defense").length === 61);

const cen = J.census({
  side: "defense",
  gameId: "fri-d",
  log: new Array(60),
});
check("census saved is calls for that game, not every ledger type", cen.snaps === 60 && cen.saved === 60);
check("census does not count the other game", J.census({ side: "offense", gameId: "wed-drill", log: new Array(19) }).saved === 19);
check("census without gameId does not count the journal", J.census({ side: "defense", log: new Array(84) }).saved === 0 && J.census({ side: "defense", log: new Array(84) }).missingGameId === true);
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
check("O hydrate is scoped by gameId", /callerHydrateView/.test(html) && /adoptIfPinned/.test(html));
check("D hydrate is scoped by gameId", /hydrateView/.test(dc) && /applyPin/.test(dc) && /endAndMintForOpponent/.test(dc));
check("O ensureSession does not rotate", !/shouldRotateForOpponent/.test(html));
check("D ensureSession does not rotate", !/shouldRotateForOpponent/.test(dc));

if (fails) {
  console.error(fails + " journal smoke(s) failed");
  process.exit(1);
}
console.log("ok  caller journal");
