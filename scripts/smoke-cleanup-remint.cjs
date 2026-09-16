/**
 * Remint cleanup: collapse extra outcomes, strip Friday from the drill key,
 * refuse the phantom North game id.
 *   node scripts/smoke-cleanup-remint.cjs
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
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
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.runInNewContext(fs.readFileSync(path.join(root, "OFFGRD-caller-journal.js"), "utf8"), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(root, "OFFGRD-cleanup-remint.js"), "utf8"), sandbox);

const C = sandbox.OFFGRD_CLEANUP_REMINT;
const J = sandbox.OFFGRD_CALLER_JOURNAL;
if (!C || !J) throw new Error("cleanup/journal missing");

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

const north = "a95456e8-4b83-4a09-8303-269be46dbc05";
check("rejects phantom North", C.isRejectedGame(north) === true);
check("keeps Central", C.isRejectedGame("87c34cae-305d-448e-8a44-03288485a487") === false);

const evs = [
  { eventId: "o1", gameId: "g1", side: "offense", type: "outcome", playIndex: 1, payload: { result: "hit" } },
  { eventId: "o1b", gameId: "g1", side: "offense", type: "outcome", playIndex: 1, payload: { result: "hit" } },
  { eventId: "o1c", gameId: "g1", side: "offense", type: "outcome", playIndex: 1, payload: { result: "miss" } },
  { eventId: "c1", gameId: "g1", side: "offense", type: "call", playIndex: 1 },
  { eventId: "nx", gameId: north, side: "offense", type: "call", playIndex: 1 },
];
const collapsed = C.collapseOutcomes(evs);
check("drops identical-payload remint, keeps re-grade + call, drops North", collapsed.length === 3 && collapsed[0].eventId === "o1" && collapsed[1].eventId === "o1c" && collapsed[2].eventId === "c1");

const games = [
  {
    opponent: "Live",
    week: "Live 2026-09-02",
    side: "ours",
    rows: [
      { date: "2026-09-02", play: "A" },
      { date: "2026-09-04", play: "Friday" },
      { date: "2026-09-03", play: "B" },
    ],
  },
  { opponent: "Parkway Central", week: "Live 2026-09-08", side: "ours", rows: [{ date: "2026-09-08", play: "X" }] },
];
const stripped = C.stripDrill(games);
check("strips Friday from drill only", stripped[0].rows.length === 2 && stripped[1].rows.length === 1);

evs.forEach(function (e) {
  J.appendNow(e);
});
sandbox.CALLER_EVENTS = evs.slice();
sandbox.GAMES = games;
const r = C.apply();
check("apply drops remint + North from events", sandbox.CALLER_EVENTS.length === 3);
check("apply strips drill", sandbox.GAMES[0].rows.length === 2);
check("journal dropEventIds ran", J.allRows().length === 3);
check("cleanup version stamped", sandbox.localStorage.getItem("offgrd_cleanup_ver") === C.VER && r.ver === C.VER);

const html = fs.readFileSync(path.join(root, "OFFGRD.html"), "utf8");
const cloud = fs.readFileSync(path.join(root, "OFFGRD-cloud.js"), "utf8");
const sw = fs.readFileSync(path.join(root, "offgrd-sw.js"), "utf8");
const sql = fs.readFileSync(path.join(root, "docs/security/apply-offgrd-caller-remint-rejects.sql"), "utf8");
check("html loads cleanup module", /OFFGRD-cleanup-remint\.js\?v=/.test(html));
check("saveGames strips drill", /OFFGRD_CLEANUP_REMINT\.stripDrill/.test(html));
check("sw precaches cleanup", /OFFGRD-cleanup-remint\.js/.test(sw));
check("sql caps the drill key at 24", /live\|live 2026-09-02\|ours/.test(sql) && /max_rows/.test(sql));
check("sql one-outcome trigger", /trg_caller_events_reject_remint/.test(sql));
check("sql drops only identical-payload outcomes", /e\.payload IS NOT DISTINCT FROM NEW\.payload/.test(sql));
check("cloud saveGame refuses grow", /REFUSE_GROW/.test(cloud));

if (fails) {
  console.error(fails + " smoke-cleanup-remint failure(s)");
  process.exit(1);
}
console.log("smoke-cleanup-remint ok");
