/**
 * B2 — push ack is this device's response, pull window is 14 days, no Sync button.
 *   node scripts/smoke-caller-b2.cjs
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

let fails = 0;
function check(name, cond) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name);
  }
}

const html = read("OFFGRD.html");
const dc = read("OFFGRD-dcaller.js");
const syncSrc = read("OFFGRD-caller-sync.js");
const cloud = read("OFFGRD-cloud.js");

check("O caller has no Sync button", !/Sync now/.test(html) && !/>Sync</.test(html));
check("D caller has no Sync button", !/Sync now/.test(dc) && !/>Sync</.test(dc));
check("header does not ask for a Sync tap", !/tap Sync now/.test(syncSrc));
check("backoff does not give up", !/_backoffN >= 8/.test(syncSrc));
check("pull uses listCallerGames and the 14-day window", /listCallerGames/.test(syncSrc) && /gameInPullWindow/.test(syncSrc));
check("a row that merely exists is not marked synced", !/confirmed\.length\) markSynced/.test(syncSrc));
check(
  "caller upsert returns ids already stored",
  /from\("caller_events"\)\.upsert\(rows, \{ onConflict: "event_id" \}\)\.select\("event_id"\)/.test(cloud)
);
function fnSlice(src, start, end) {
  const i = src.indexOf(start);
  if (i < 0) return "";
  const j = src.indexOf(end, i + start.length);
  return src.slice(i, j < 0 ? i + 900 : j);
}
const oRemote = fnSlice(html, "applyRemote: function(merged, game, sess){", "onDone:");
const dRemote = fnSlice(dc, "applyRemote: function (merged, game, sess) {", "if (game && game.monday_focus)");
check("O applyRemote does not take a remote session", oRemote.length > 40 && !/CALLER_SESSION\s*=\s*sess/.test(oRemote));
check("D applyRemote does not take a remote session", dRemote.length > 40 && !/session\s*=\s*sess/.test(dRemote));
check("client shrink compare is gone", !/localN < serverN/.test(cloud));
check("client row cap is gone", !/scoutingRowCap/.test(cloud));
check("SQL refuse-shrink is still surfaced", /refuse shrink/i.test(cloud));
check("O census header is in guided and advanced", (html.match(/callerUiChrome\(\)/g) || []).length >= 2);
check("D census header is on the caller screen", /h \+= syncStateHtml\(\)/.test(dc));

const sandbox = {
  console: console,
  localStorage: {
    _m: {},
    getItem(k) {
      return this._m[k] || null;
    },
    setItem(k, v) {
      this._m[k] = String(v);
    },
    removeItem(k) {
      delete this._m[k];
    },
  },
  setInterval: function () {
    return 0;
  },
  clearInterval: function () {},
  setTimeout: function () {
    return 0;
  },
  clearTimeout: function () {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.document = { hidden: false, addEventListener: function () {} };
vm.runInNewContext(read("OFFGRD-caller-side.js"), sandbox);
vm.runInNewContext(read("OFFGRD-caller-outcome.js"), sandbox);
vm.runInNewContext(read("OFFGRD-caller-log.js"), sandbox);
vm.runInNewContext(read("OFFGRD-caller-sync.js"), sandbox);

const Sync = sandbox.OFFGRD_CALLER_SYNC_ENGINE;
const now = new Date(2026, 8, 22, 12, 0, 0).getTime();
check(
  "active game stays in the pull",
  Sync.gameInPullWindow({ id: "a", status: "active", game_date: "2026-08-01" }, now)
);
check(
  "archived inside 14 days is in the pull",
  Sync.gameInPullWindow({ id: "b", status: "archived", game_date: "2026-09-20" }, now)
);
check(
  "archived outside 14 days is out of the pull",
  !Sync.gameInPullWindow({ id: "c", status: "archived", game_date: "2026-09-01" }, now)
);
check(
  "undated archived game is out of the pull",
  !Sync.gameInPullWindow({ id: "d", status: "archived" }, now)
);

(async function () {
  const empty = await Sync.appendIsolated(
    [
      { eventId: "e1", clientTs: 2, seq: 1 },
      { eventId: "e2", clientTs: 1, seq: 1 },
    ],
    function () {
      return Promise.resolve([]);
    }
  );
  check("empty push response acks nothing", empty.synced.length === 0);

  const ordered = [];
  const acked = await Sync.appendIsolated(
    [
      { eventId: "late", clientTs: 5, seq: 1 },
      { eventId: "early", clientTs: 1, seq: 1 },
    ],
    function (chunk) {
      chunk.forEach(function (e) {
        ordered.push(e.eventId);
      });
      return Promise.resolve([{ event_id: chunk[0].eventId }]);
    }
  );
  check("push is in client_ts order", ordered.join(",") === "early,late");
  check("ack is only the id this push returned", acked.synced.join(",") === "early" && acked.synced.indexOf("late") < 0);

  if (fails) {
    console.error("smoke-caller-b2 " + fails + " failed");
    process.exit(1);
  }
  console.log("smoke-caller-b2 ok");
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
