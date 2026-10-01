/**
 * Gameday pin — pick once, never re-resolve, rotate only on Exit→pick.
 *   node scripts/smoke-gameday-pin.cjs
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

function makeSandbox() {
  const sandbox = {
    console,
    localStorage: ls(),
    document: {
      getElementById() {
        return null;
      },
      createElement() {
        return { textContent: "" };
      },
      head: { appendChild() {} },
    },
    CALLER_SESSION: null,
    CALLER_EVENTS: [],
    CALLER_SESSION_ARCHIVES: [],
    callerSit: {},
    SCHEDULE: [
      { opponent: "Parkway Central", date: "2026-09-10", ha: "H" },
      { opponent: "Parkway North", date: "2026-09-17", ha: "A" },
    ],
    setView() {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.OFFGRD_DCALLER = {
    applyPin(pin, rotatePrior) {
      this.lastPin = pin;
      this.lastRotate = !!rotatePrior;
      this._sess = { opp: pin.opponent, gameId: pin.gameId, week: "Live " + pin.date };
    },
    getSession() {
      return this._sess || null;
    },
  };
  return sandbox;
}

function load(sandbox) {
  vm.runInNewContext(fs.readFileSync(path.join(root, "OFFGRD-caller-side.js"), "utf8"), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(root, "OFFGRD-gameday-pin.js"), "utf8"), sandbox);
}

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

const a = makeSandbox();
const b = makeSandbox();
load(a);
load(b);
const PinA = a.OFFGRD_GAMEDAY_PIN;
const PinB = b.OFFGRD_GAMEDAY_PIN;
if (!PinA || !PinB) throw new Error("OFFGRD_GAMEDAY_PIN missing");

const idA = PinA.gameIdFor("Parkway Central", "2026-09-10");
const idB = PinB.gameIdFor("parkway central", "2026-09-10");
check("two devices hash the same UUID gameId", idA === idB && PinA.isUuid(idA));
check(
  "North is a different schedule key",
  PinA.gameIdFor("Parkway North", "2026-09-10") !== idA
);

a.CALLER_SESSION = { opp: "Live", week: "Live 2026-09-08", gameId: "leftover-o", game_date: "2026-09-08" };
a.OFFGRD_DCALLER._sess = { opp: "Parkway Central", gameId: "leftover-d" };
const pin1 = PinA.pick({ opponent: "Parkway Central", date: "2026-09-10", ha: "H" });
check("pick pins Central and that gameId", !!(pin1 && pin1.opponent === "Parkway Central" && pin1.gameId === idA));
check("pick overwrites leftover O Live store", a.CALLER_SESSION.opp === "Parkway Central" && a.CALLER_SESSION.gameId === idA);
check("pick stamps the D store with the same opponent", a.OFFGRD_DCALLER.getSession().opp === "Parkway Central" && a.OFFGRD_DCALLER.getSession().gameId === idA);
check("writes use the pin id", PinA.writeId() === idA);
check("entered after pick", PinA.entered() === "caller");
a.sit = { opp: "Parkway North" };
check("scout opponent does not change the pin", PinA.get().opponent === "Parkway Central" && PinA.get().gameId === idA);
check("adoptIfPinned is deleted — pick is the only identity path", typeof PinA.adoptIfPinned === "undefined");
check("writeOpp is the pin, never Live", PinA.writeOpp() === "Parkway Central" && PinA.isFallbackOpp("Live"));
a.CALLER_EVENTS = [
  { eventId: "live-tag", gameId: idA, payload: { opponent: "Live" } },
  { eventId: "fri-leftover", gameId: "leftover-o", payload: { opponent: "Parkway South" } },
];
PinA.request("offense");
check(
  "re-enter restamps Live-tagged pin events onto the pin opponent",
  a.CALLER_EVENTS[0].payload.opponent === "Parkway Central"
);
check(
  "re-enter never retargets leftover events onto the pin",
  a.CALLER_EVENTS.some(function (e) { return e.eventId === "fri-leftover" && e.gameId === "leftover-o" && e.payload.opponent === "Parkway South"; }) &&
    !a.CALLER_EVENTS.some(function (e) { return e.eventId === "fri-leftover" && e.gameId === idA; })
);

PinA.leave();
check("Exit clears entered, keeps pin", PinA.entered() === "" && PinA.get().opponent === "Parkway Central");

const pin2 = PinA.pick({ opponent: "Parkway North", date: "2026-09-17", ha: "A" });
check("Exit→pick of a new opponent is the rotation", !!(pin2 && pin2.opponent === "Parkway North" && pin2.gameId !== idA));
check("prior Central session was archived", (a.CALLER_SESSION_ARCHIVES || []).length === 1);
check("D applyPin saw the rotate", a.OFFGRD_DCALLER.lastRotate === true);

const html = fs.readFileSync(path.join(root, "OFFGRD.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "offgrd-sw.js"), "utf8");
const dc = fs.readFileSync(path.join(root, "OFFGRD-dcaller.js"), "utf8");
check("HTML loads the pin module", /OFFGRD-gameday-pin\.js/.test(html));
check("HTML has the picker host", /id="view-pick"/.test(html));
check("O/D nav asks the pin, never auto-enters", /OFFGRD_GAMEDAY_PIN\.request\('offense'\)/.test(html) && /OFFGRD_GAMEDAY_PIN\.request\('defense'\)/.test(html));
check("setView gates caller until entered", /Pin&&!Pin\.entered\(\)/.test(html));
check("Exit leaves to the picker", /OFFGRD_GAMEDAY_PIN\.leave\(\)/.test(html));
check("SW precaches the pin module", /OFFGRD-gameday-pin\.js/.test(sw));
const cloud = fs.readFileSync(path.join(root, "OFFGRD-cloud.js"), "utf8");
const sync = fs.readFileSync(path.join(root, "OFFGRD-caller-sync.js"), "utf8");
const log = fs.readFileSync(path.join(root, "OFFGRD-caller-log.js"), "utf8");
check("ensureCallerGame inserts the pinned id, never a leftover active game", /if \(meta && meta.id\)/.test(cloud) && /archiveCallerGame\(other\.id\)/.test(cloud));
check("sync flush keeps the pin gameId", /pinnedId/.test(sync) && /sess\.gameId = pinnedId/.test(sync));
check("fold prefers the pin over leftover event ids", /Pin\.writeId/.test(log));
check("O append stamps writeId", /Pin\.writeId&&Pin\.writeId\(\)/.test(html));
check("D append stamps writeId", /PinW && PinW.writeId/.test(dc));
check("O append stamps pin opponent", /Pin\.stampPayload/.test(html) && /Pin\.writeOpp/.test(html));
check("D append stamps pin opponent", /PinW\.stampPayload/.test(dc) && /Pin\.writeOpp/.test(dc));
check("O session opp prefers the pin over Live", /function callerSessionOpp\(\)\{[\s\S]*?writeOpp/.test(html));
check(
  "caller Expect/shortlist prefer pin over Scout sit.opp",
  /function callerOppScope\(/.test(html) &&
    /function callerOppRows\(/.test(html) &&
    /callerOppRows\("def"\)/.test(html) &&
    /Scout selection must not drive the caller/.test(html)
);
check(
  "callerRankedCalls scopes ours rows to the pin",
  /callerOppScope\(\)/.test(html) && /r\.opponent===scopeOpp/.test(html)
);
check("D expect opp prefers the pin", /Pin\.writeOpp/.test(dc) && /function opp\(\)/.test(dc));
check("sync flush does not let a leftover cloud opponent overwrite the pin", /if \(game && !pinnedId\)/.test(sync));
check("O ensureSession does not rotate", !/shouldRotateForOpponent/.test(html));
check("D ensureSession does not rotate", !/shouldRotateForOpponent/.test(dc));
check("setOpponent does not pick or rotate", /function setOpponent\(v\)\{ sit\.opp=v;/.test(html) && !/function setOpponent[\s\S]{0,400}shouldRotateForOpponent/.test(html));

const pinSrc = fs.readFileSync(path.join(root, "OFFGRD-gameday-pin.js"), "utf8");
const acct = fs.readFileSync(path.join(root, "OFFGRD-account.js"), "utf8");
check("resume reapplies the pin to both stores", /applyPinToSessions\(pin, false\)/.test(pinSrc));
check("picker re-renders on program-ready", /offgrd-program-ready/.test(pinSrc) && /refreshIfPick/.test(pinSrc));
check("picker re-renders on brand-hydrated", /offgrd-brand-hydrated/.test(pinSrc) && /offgrd-brand-hydrated/.test(acct));
check("empty picker offers Start a game from the library", /Start a game/.test(pinSrc) && /libraryOpponents/.test(pinSrc));
check(
  "empty picker always offers tonight's-opponent input (Maple Lake)",
  /gdPickTyped/.test(pinSrc) && !/if \(!libs\.length\)/.test(pinSrc)
);
check(
  "typed-opponent input is outside the zero-games branch (always in DOM)",
  /games\.forEach\(function \(g\) \{/.test(pinSrc) &&
    pinSrc.indexOf("gdPickTyped") > pinSrc.indexOf("games.forEach(function (g) {")
);
check("typed-opponent submits on Enter", /key === "Enter"/.test(pinSrc) && /submitTyped/.test(pinSrc));
check("typed draft survives re-render / skips wipe while focused", /typedDraft/.test(pinSrc) && /gdPickTyped/.test(pinSrc) && /activeElement/.test(pinSrc));

check(
  "pin reads schedule via OFFGRD_SCHEDULE.get / localStorage (not bare SCHEDULE)",
  /function scheduleRows\(/.test(pinSrc) && /OFFGRD_SCHEDULE/.test(pinSrc) && /offgrd_schedule_v1/.test(pinSrc)
);
check("HTML exposes OFFGRD_SCHEDULE.get", /OFFGRD_SCHEDULE=\{get:function\(\)\{ return SCHEDULE; \}/.test(html));

const w = makeSandbox();
load(w);
const PinW = w.OFFGRD_GAMEDAY_PIN;
const soakNow = new Date(2026, 8, 8);
w.SCHEDULE = [
  { opponent: "Parkway South", date: "2026-09-04", ha: "A" },
  { opponent: "Parkway Central", date: "2026-09-10", ha: "H" },
  { opponent: "Parkway North", date: "2026-09-15", ha: "A" },
];
const windowed = PinW.listGames(soakNow);
check(
  "window includes Central · Sep 10 from Sep 8",
  windowed.some(function (g) { return g.opponent === "Parkway Central" && g.date === "2026-09-10"; })
);
check(
  "window excludes South · Sep 4 (before yesterday)",
  !windowed.some(function (g) { return /South/i.test(g.opponent); })
);
check(
  "window includes North · Sep 15 (today+7)",
  windowed.some(function (g) { return /North/i.test(g.opponent) && g.date === "2026-09-15"; })
);
w.SCHEDULE = [{ opponent: "Parkway Central", date: "Sep 10", ha: "H" }];
check(
  "Sep 10 label parses into the window",
  PinW.parseGameDate("Sep 10", "2026-09-08") === "2026-09-10" &&
    PinW.listGames(soakNow).some(function (g) { return /Central/i.test(g.opponent); })
);

/* Production path: schedule is script-scoped — expose via OFFGRD_SCHEDULE.get / localStorage. */
w.SCHEDULE = undefined;
w.OFFGRD_SCHEDULE = {
  get: function () {
    return [{ opponent: "Riverview", date: "2026-09-18", ha: "H" }];
  },
};
const viaGet = PinW.listGames(new Date(2026, 8, 17));
check(
  "listGames reads OFFGRD_SCHEDULE.get (Riverview · Sep 18)",
  viaGet.some(function (g) { return g.opponent === "Riverview" && g.date === "2026-09-18"; })
);
w.OFFGRD_SCHEDULE = undefined;
w.localStorage.setItem(
  "offgrd_schedule_v1",
  JSON.stringify([{ opponent: "Riverview", date: "2026-09-18", ha: "H" }])
);
const viaLs = PinW.listGames(new Date(2026, 8, 17));
check(
  "listGames falls back to offgrd_schedule_v1 when SCHEDULE is undefined",
  viaLs.some(function (g) { return g.opponent === "Riverview" && g.date === "2026-09-18"; })
);
w.localStorage.removeItem("offgrd_schedule_v1");

w.SCHEDULE = [];
w.GAMES = [{ opponent: "Parkway Central", week: "Wk 3" }];
check("zero schedule cards still expose the library", PinW.libraryOpponents().indexOf("Parkway Central") >= 0);
check("typed 'Live' can never pin", PinW.pick({ opponent: "Live", date: "2026-09-15", ha: "H" }) === null);
check("typed 'ANY' can never pin", PinW.pick({ opponent: "ANY", date: "2026-09-15", ha: "H" }) === null);
check("a caller never opens on Live: fallback pin is refused by get()", (function () {
  w.localStorage.setItem(PinW.PIN_KEY, JSON.stringify({ opponent: "Live", date: "2026-09-15", gameId: "x", pinnedAt: 1 }));
  return PinW.get() === null && PinW.writeOpp() === null;
})());

check("picker badge is N queued", /class="queued"/.test(pinSrc) && /queued<\/span>/.test(pinSrc));
check("pick reopens the card's gameId", /game\.gameId \|\| existingGameId/.test(pinSrc));
check("a queued session blocks a new pin", /pinReplaceBlock/.test(pinSrc) && /sessionHoldsQueue/.test(pinSrc));
check(
  "D applyPin and ensureSession refuse to replace a queued session",
  /queuedCount\(session\.gameId, "defense"\)/.test(dc)
);
check(
  "O ensureSession refuses to replace a queued session",
  /queuedCount\(CALLER_SESSION\.gameId,"offense"\)/.test(html)
);

const q = makeSandbox();
load(q);
const PinQ = q.OFFGRD_GAMEDAY_PIN;
const southId = "576d2d63-fdbc-4f18-88d9-65819864f5da";
const friday = [
  {
    eventId: "ev-friday-1",
    gameId: southId,
    side: "defense",
    type: "call",
    playIndex: 0,
    payload: { opponent: "Hazelwood East", date: "2026-09-25", play: "Run" },
    clientTs: Date.parse("2026-09-25T23:02:01.961Z"),
  },
  {
    eventId: "ev-friday-2",
    gameId: southId,
    side: "defense",
    type: "outcome",
    playIndex: 0,
    payload: { opponent: "Hazelwood East", date: "2026-09-25" },
    clientTs: Date.parse("2026-09-25T23:02:10.000Z"),
  },
  {
    eventId: "clear-" + southId + "-1",
    gameId: southId,
    side: "defense",
    type: "clear",
    payload: { undoUntil: 1 },
    clientTs: Date.parse("2026-09-25T23:30:00.000Z"),
  },
];
q.OFFGRD_CALLER_JOURNAL = {
  allRows: function () { return friday; },
  eventsForGame: function (id) {
    return friday.filter(function (r) { return r.gameId === id && r.type !== "clear" && r.type !== "undo_clear"; });
  },
  isLedgerEvent: function (r) { return !!(r && r.eventId && r.type !== "clear" && r.type !== "undo_clear"); },
  snapRowsForGame: function () { return friday.filter(function (r) { return r.type === "call"; }); },
  hydrateView: function () { return []; },
};
q.OFFGRD_CALLER_SYNC_ENGINE = { isSynced: function () { return false; } };
q.SCHEDULE = [
  { opponent: "Hazelwood East", date: "2026-09-25", ha: "A" },
  { opponent: "Parkway Central", date: "2026-09-10", ha: "H" },
];
const aged = PinQ.listGames(new Date(2026, 8, 28));
const hazel = aged.filter(function (g) { return g.opponent === "Hazelwood East"; })[0];
check("Friday's card stays visible on Monday when events are queued", !!hazel);
check("queued card reopens the journal game id", hazel && hazel.gameId === southId);
check("queued badge counts ledger rows, not the clear", hazel && hazel.queued === 2, hazel && String(hazel.queued));
const central = aged.filter(function (g) { return g.opponent === "Parkway Central"; })[0];
check("an aged card with no queue stays off the Monday list", !central || central.date >= "2026-09-27");

const reopened = PinQ.pick(hazel, { side: "defense" });
check("reopening the queued game is allowed", reopened && reopened.gameId === southId);
q.CALLER_SESSION = { opp: "Hazelwood East", gameId: southId, side: "offense" };
q.OFFGRD_DCALLER._sess = { opp: "Hazelwood East", gameId: southId, side: "defense" };
const blocked = PinQ.pick({ opponent: "Parkway Central", date: "2026-10-02", ha: "H" }, { side: "defense" });
check("a new pin is refused while the session still has queued events", blocked === null);
check("the refused pin did not replace the queued game", PinQ.get() && PinQ.get().gameId === southId);
check("D applyPin was not called for the new opponent", q.OFFGRD_DCALLER.lastPin && q.OFFGRD_DCALLER.lastPin.gameId === southId);

q.OFFGRD_CALLER_SYNC_ENGINE.isSynced = function () { return true; };
q.localStorage.removeItem(PinQ.PIN_KEY);
q.SCHEDULE.push({ opponent: "Parkway North", date: "2026-10-02", ha: "A" });
const drained = PinQ.listGames(new Date(2026, 8, 28));
check(
  "once every row is acked, Friday ages off the Monday list",
  !drained.some(function (g) { return g.opponent === "Hazelwood East"; })
);

const tomb = makeSandbox();
load(tomb);
const soakId = "c7c38b25-8d62-4f6e-8c9a-94aa754ff726";
const tombRows = [
  {
    eventId: "soak-1",
    gameId: soakId,
    side: "offense",
    type: "call",
    payload: { opponent: "TEST SOAK 4", date: "2026-09-21" },
    clientTs: Date.parse("2026-09-21T18:00:00Z"),
    superseded: true,
  },
  {
    eventId: "real-1",
    gameId: southId,
    side: "defense",
    type: "call",
    payload: { opponent: "Hazelwood East", date: "2026-09-25" },
    clientTs: Date.parse("2026-09-25T23:00:00Z"),
  },
];
tomb.OFFGRD_CALLER_JOURNAL = {
  allRows: function () { return tombRows; },
  eventsForGame: function (id) {
    return tombRows.filter(function (r) { return r.gameId === id; });
  },
  isLedgerEvent: function (r) { return !!(r && r.eventId); },
  snapRowsForGame: function () { return []; },
  hydrateView: function () { return []; },
};
tomb.OFFGRD_CALLER_SYNC_ENGINE = { isSynced: function () { return false; } };
tomb.SCHEDULE = [{ opponent: "Parkway North", date: "2026-10-02", ha: "A" }];
const shown = tomb.OFFGRD_GAMEDAY_PIN.listGames(new Date(2026, 8, 30));
check(
  "a superseded soak card drops while its rows are still unacked",
  !shown.some(function (g) { return g.opponent === "TEST SOAK 4"; })
);
check(
  "an unacked real game stays on the card",
  shown.some(function (g) { return g.opponent === "Hazelwood East" && g.queued === 1; })
);

const syncBox = {
  console: console,
  localStorage: ls(),
  document: { addEventListener: function () {}, hidden: false, visibilityState: "visible" },
  navigator: { onLine: true },
};
syncBox.window = syncBox;
syncBox.globalThis = syncBox;
vm.runInNewContext(fs.readFileSync(path.join(root, "OFFGRD-caller-sync.js"), "utf8"), syncBox);
const Sync = syncBox.OFFGRD_CALLER_SYNC_ENGINE;
const sampleTombs = [
  { game_id: soakId, opponent: "TEST SOAK 4", week: "Live 2026-09-21" },
  { game_id: null, opponent: "Soak Test 7", week: "Live 2026-09-28" },
  { game_id: "b0ef2adf-3ac7-424c-9a41-482320c8cf9c", opponent: "Parkway North", week: "Wk?" },
];
const idSet = Sync.tombstoneGameIdSet(sampleTombs);
const nameSet = Sync.tombstoneOpenTestKeys(sampleTombs);
check(
  "a tombstone game id matches that caller game",
  Sync.eventMatchesTombstone({ gameId: soakId, payload: {} }, idSet, nameSet)
);
check(
  "Soak Test 7 matches by name when the tombstone has no game id",
  Sync.eventMatchesTombstone(
    { gameId: "local-7", payload: { opponent: "Soak Test 7", date: "2026-09-28" } },
    idSet,
    nameSet
  )
);
check(
  "Parkway North does not match by opponent name",
  !Sync.eventMatchesTombstone(
    { gameId: "real-north", payload: { opponent: "Parkway North", date: "2026-10-02" } },
    idSet,
    nameSet
  )
);
check(
  "an unknown tombstone pull matches nothing",
  !Sync.eventMatchesTombstone({ gameId: soakId, payload: { opponent: "TEST SOAK 4", date: "2026-09-21" } }, null, null)
);
const syncSrc = fs.readFileSync(path.join(root, "OFFGRD-caller-sync.js"), "utf8");
check(
  "pull reads tombstones before an orphan game can be inserted",
  syncSrc.indexOf("listGameTombstonesResult") > 0 &&
    syncSrc.indexOf("listGameTombstonesResult") < syncSrc.indexOf("ensureCallerGameRow")
);

if (fails) {
  console.error(fails + " gameday-pin smoke(s) failed");
  process.exit(1);
}
console.log("ok  gameday pin");
