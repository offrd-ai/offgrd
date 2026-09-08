/**
 * Caller recovery — all-sessions dump + replay grouping.
 *   node scripts/smoke-caller-recovery.cjs
 *
 * Friday 9/4: session-scoped Export followed restamp to Live-today / events:[].
 * This lock: raw dump keeps every gameId, restamp cannot orphan sit/events,
 * replay pushes under the event gameId (not today's Live session).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sandbox = {
  console,
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
  document: {
    createElement() {
      return { click() {}, style: {} };
    },
    body: { appendChild() {} },
  },
  URL: {
    createObjectURL() {
      return "blob:test";
    },
    revokeObjectURL() {},
  },
  Blob: function (parts) {
    this.size = String(parts[0] || "").length;
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.document.body.appendChild = function () {};

const root = path.join(__dirname, "..");
vm.runInNewContext(fs.readFileSync(path.join(root, "OFFGRD-caller-side.js"), "utf8"), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(root, "OFFGRD-caller-recovery.js"), "utf8"), sandbox);

const R = sandbox.OFFGRD_CALLER_RECOVERY;
const S = sandbox.OFFGRD_CALLER_SIDE;
if (!R || !S) throw new Error("recovery / side missing");

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

const fridayEvents = [
  {
    eventId: "d-fri-1",
    gameId: "211ccbe3-fri-d",
    type: "call",
    playIndex: 0,
    side: "defense",
    clientTs: Date.parse("2026-09-04T20:10:00-05:00"),
    payload: { play: "Run", date: "2026-09-04", opponent: "OMAHA" },
    deviceId: "ipad-d",
    seq: 1,
  },
  {
    eventId: "d-fri-2",
    gameId: "211ccbe3-fri-d",
    type: "outcome",
    playIndex: 0,
    side: "defense",
    clientTs: Date.parse("2026-09-04T20:11:00-05:00"),
    payload: { result: "short", date: "2026-09-04" },
    deviceId: "ipad-d",
    seq: 2,
  },
];
const mondayEmpty = {
  session: { gameId: "live-2026-09-07", week: "Live 2026-09-07", game_date: "2026-09-07", opp: "OMAHA" },
  sit: { dn: 4, db: "GOAL", namedCall: "OMAHA", zone: "REDZONE" },
  events: [],
};
sandbox.localStorage.setItem(
  "offgrd_dcaller_events_v2",
  JSON.stringify({
    session: mondayEmpty.session,
    sit: mondayEmpty.sit,
    events: fridayEvents,
    updatedAt: Date.parse("2026-09-07T12:00:00-05:00"),
  })
);
sandbox.localStorage.setItem(
  "offgrd_caller_events_v2",
  JSON.stringify({
    session: { gameId: "o-fri", week: "Live 2026-09-04", game_date: "2026-09-04", opp: "OMAHA" },
    sit: { dn: 1, db: "10+" },
    events: [
      {
        eventId: "o-fri-1",
        gameId: "o-fri",
        type: "call",
        playIndex: 0,
        side: "offense",
        clientTs: Date.parse("2026-09-04T20:10:00-05:00"),
        payload: { play: "HOUSTON", date: "2026-09-04", opponent: "OMAHA" },
        deviceId: "ipad-o",
        seq: 1,
      },
    ],
  })
);
sandbox.localStorage.setItem(
  "offgrd_dcaller_export_211ccbe3-fri-d",
  JSON.stringify({
    kind: "offgrd_dcaller_export",
    session: { gameId: "211ccbe3-fri-d", week: "Live 2026-09-04" },
    events: fridayEvents,
  })
);

const dump = R.buildDump();
check("dump kind", dump.kind === "offgrd_caller_all_sessions");
check("raw D store present", !!(dump.stores && dump.stores.offgrd_dcaller_events_v2));
check("raw O store present", !!(dump.stores && dump.stores.offgrd_caller_events_v2));
const all = R.collectAllEvents(dump);
check("collects both sides", all.length >= 3, "got " + all.length);
const ids = new Set(all.map((e) => e.gameId));
check("keeps Friday D gameId", ids.has("211ccbe3-fri-d"));
check("keeps Friday O gameId", ids.has("o-fri"));
check("receipt keys included", !!(dump.receipts && dump.receipts["offgrd_dcaller_export_211ccbe3-fri-d"]));

const snap = R.snapshotIfNeeded();
check("snapshot writes once", !!(snap && snap.stores));
const firstSnap = sandbox.localStorage.getItem(R.SNAPSHOT_KEY);
sandbox.localStorage.setItem(
  "offgrd_dcaller_events_v2",
  JSON.stringify({ session: mondayEmpty.session, sit: mondayEmpty.sit, events: [] })
);
const snap2 = R.snapshotIfNeeded();
const afterWipe = JSON.parse(sandbox.localStorage.getItem(R.SNAPSHOT_KEY) || "null");
check("snapshot is never overwritten", firstSnap === sandbox.localStorage.getItem(R.SNAPSHOT_KEY));
check("wiped store does not erase snapshot events", (afterWipe.stores.offgrd_dcaller_events_v2.events || []).length === 2);

const dumpedAfterWipe = R.buildDump();
const recovered = R.collectAllEvents(dumpedAfterWipe);
check(
  "export-all still finds Friday D events via snapshot",
  recovered.some((e) => e.eventId === "d-fri-1")
);

const groups = R.groupEventsByGame(recovered);
check("replay groups by original gameId", !!(groups["211ccbe3-fri-d"] && groups["o-fri"]));
check("replay does not invent today's Live id", !groups["live-2026-09-07"]);

let ensured = [];
let appended = [];
sandbox.OFFGRD_CALLER_BRIDGE = {
  getTeamId() {
    return "team-1";
  },
  canSync() {
    return true;
  },
  getActorId() {
    return "coach-1";
  },
  cloud: {
    async ensureCallerGameRow(teamId, meta) {
      ensured.push({ teamId: teamId, id: meta.id, week: meta.week, game_date: meta.game_date, side: meta.side, status: meta.status });
      return { id: meta.id };
    },
    async appendCallerEvents(teamId, evs) {
      appended = appended.concat(evs);
      return evs.map((e) => ({ event_id: e.eventId }));
    },
  },
};

R.replayPayload(dumpedAfterWipe)
  .then(function (r) {
    check("replay ok", !!(r && r.ok));
    check("replay ensures Friday D row", ensured.some((g) => g.id === "211ccbe3-fri-d" && g.game_date === "2026-09-04"));
    check("replay does not push onto Live-today", !ensured.some((g) => g.id === "live-2026-09-07"));
    check("replay keeps event gameIds", appended.every((e) => e.gameId !== "live-2026-09-07"));
    const listed = R.listSelectableSessions(
      {
        session: mondayEmpty.session,
        events: fridayEvents,
        sessionArchives: [
          {
            session: { gameId: "211ccbe3-fri-d", week: "Live 2026-09-04", game_date: "2026-09-04" },
            sit: mondayEmpty.sit,
            eventCount: 2,
          },
        ],
      },
      [
        {
          session: { gameId: "211ccbe3-fri-d", week: "Live 2026-09-04", game_date: "2026-09-04" },
          sit: mondayEmpty.sit,
          eventCount: 2,
        },
      ]
    );
    check(
      "archived Friday session is selectable",
      listed.some((row) => row.gameId === "211ccbe3-fri-d" && row.source === "archive")
    );

    const dc = fs.readFileSync(path.join(root, "OFFGRD-dcaller.js"), "utf8");
    const html = fs.readFileSync(path.join(root, "OFFGRD.html"), "utf8");
    check("D Tools has Export all sessions", /Export all sessions/.test(dc));
    check("O Tools has Export all sessions", /Export all sessions/.test(html));
    check("HTML loads recovery module", /OFFGRD-caller-recovery\.js/.test(html));

    if (fails) {
      console.error(fails + " recovery smoke(s) failed");
      process.exit(1);
    }
    console.log("ok  caller recovery");
  })
  .catch(function (e) {
    console.error("FAIL replay", e && e.message);
    process.exit(1);
  });
