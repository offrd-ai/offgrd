/**
 * Opening a caller must not overwrite the library.
 *   node scripts/smoke-caller-library-write.cjs
 *
 * Pre-fix (2026-08-28 v338): callerSyncToGames replaced rows[] wholesale,
 * fuzzy-matched any Live week, restamped week + play date from the session,
 * and ran on open. One stray MEMPHIS call emptied Friday's ours game.
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
      return this._m[k] || null;
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
const root = path.join(__dirname, "..");
vm.runInNewContext(fs.readFileSync(path.join(root, "OFFGRD-caller-side.js"), "utf8"), sandbox);

const S = sandbox.OFFGRD_CALLER_SIDE;
if (!S || !S.planLiveLibraryWrite) throw new Error("planLiveLibraryWrite missing");

const html = fs.readFileSync(path.join(root, "OFFGRD.html"), "utf8");
const dcaller = fs.readFileSync(path.join(root, "OFFGRD-dcaller.js"), "utf8");

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

function row(id, extra) {
  return Object.assign(
    { callId: id, play: "MEMPHIS", date: "2026-08-27", source: "live_call" },
    extra || {}
  );
}

function game(partial) {
  return Object.assign(
    {
      opponent: "Parkway North",
      week: "Live 2026-08-27",
      side: "ours",
      source: "live_call",
      rows: [row("9c3244ab"), row("22d64ab3")],
      cid: "0ba6a21b",
    },
    partial || {}
  );
}

const friday = game();
const sess27 = { opp: "Parkway North", week: "Live 2026-08-27" };
const sess28 = { opp: "Parkway North", week: "Live 2026-08-28" };

/* 1 — open / empty store writes nothing */
const openEmpty = S.planLiveLibraryWrite({
  games: [],
  incomingRows: [],
  session: sess28,
  dest: "ours",
  fromCall: false,
});
check("1 open empty store is readonly", openEmpty.wrote === false && openEmpty.skipped === "open-is-readonly");

const openThin = S.planLiveLibraryWrite({
  games: [friday],
  incomingRows: [row("c3a24359", { date: "2026-08-28" })],
  session: sess28,
  dest: "ours",
  fromCall: false,
});
check("1 open with stray call writes zero", openThin.wrote === false && openThin.games[0].rows.length === 2);

/* 2 — fold of 1 vs stored 2 refuses */
const shrink = S.planLiveLibraryWrite({
  games: [friday],
  incomingRows: [row("c3a24359", { date: "2026-08-28" })],
  session: sess27,
  dest: "ours",
  fromCall: true,
});
check("2 thin fold refuses shrink", shrink.ok === false && shrink.reason === "refuse-shrink");
check("2 stored row still 2", (shrink.games[0].rows || []).length === 2);

/* 3 — different session week never mutates stored week */
const otherWeek = S.planLiveLibraryWrite({
  games: [friday],
  incomingRows: [row("c3a24359", { date: "2026-08-28" })],
  session: sess28,
  dest: "ours",
  fromCall: true,
});
check("3 Friday week unchanged", otherWeek.ok && otherWeek.games[0].week === "Live 2026-08-27");
check("3 Saturday writes a different row", otherWeek.action === "insert" && otherWeek.games.length === 2);
check(
  "3 new row is Saturday",
  otherWeek.games[1] && otherWeek.games[1].week === "Live 2026-08-28" && otherWeek.games[1].rows.length === 1
);

/* 4 — per-play date survives a same-week sync whose session is "today" */
const dated = S.planLiveLibraryWrite({
  games: [friday],
  incomingRows: [
    { callId: "9c3244ab", play: "HOUSTON" },
    { callId: "22d64ab3", play: "MEMPHIS" },
  ],
  session: sess27,
  dest: "ours",
  fromCall: true,
});
check("4 write is a merge", dated.ok && dated.action === "merge" && dated.rows.length === 2);
check(
  "4 play dates stay 2026-08-27",
  dated.rows.every(function (r) {
    return r.date === "2026-08-27";
  })
);

/* 5 — opp|week|side unique after sync */
const uniq = S.assertUniqueLogicalKeys(otherWeek.games);
check("5 no duplicate logical keys", uniq.ok === true, JSON.stringify(uniq.duplicates || []));
const dupRefuse = S.planLiveLibraryWrite({
  games: [friday, Object.assign({}, friday, { cid: "c3a18c94" })],
  incomingRows: [row("9c3244ab"), row("22d64ab3")],
  session: sess27,
  dest: "ours",
  fromCall: true,
});
check("5 duplicate key refuses", dupRefuse.ok === false && dupRefuse.reason === "duplicate-logical-key");

/* 6 — stored 39 + local fold of 1 → still 39 */
const thirtyNine = [];
for (let i = 0; i < 39; i++) thirtyNine.push(row("call-" + i, { play: "Run" }));
const defGame = game({
  side: "off",
  rows: thirtyNine,
  cid: "d510cfa3",
});
const fixture = S.planLiveLibraryWrite({
  games: [defGame],
  incomingRows: [row("stray-1", { date: "2026-08-28", play: "MEMPHIS" })],
  session: { opp: "Parkway North", week: "Live 2026-08-27" },
  dest: "off",
  fromCall: true,
});
check("6 fixture 39+1 refuses", fixture.ok === false && fixture.reason === "refuse-shrink");
check("6 still 39", (fixture.games[0].rows || []).length === 39);

/* HTML / D caller: open is not a write */
check(
  "html open gate: fromCall required",
  /if\s*\(\s*!opts\.fromCall\s*\)/.test(html) && /open-is-readonly/.test(html)
);
check(
  "html boot does not callerSyncToGames",
  !/callerHydrateFromGames\(\);\s*if\(CALLER_EVENTS\.length\|\|CALLER_LOG\.length\) callerSyncToGames/.test(html)
);
check(
  "html APP.set does not callerSyncToGames",
  !/callerHydrateFromGames\(\);if\(CALLER_EVENTS\.length\|\|CALLER_LOG\.length\) callerSyncToGames/.test(html)
);
check(
  "html dropped fuzzy Live-week find",
  !/indexOf\("live"\)===0/.test(html.match(/function callerSyncToGames[\s\S]*?\nfunction callerAppend/)[0])
);
check(
  "html callerEntryToRow does not session-stamp date",
  /date:\s*l\.date\|\|null/.test(html)
);
check(
  "dcaller loadSession refold is readonly",
  /function loadSession[\s\S]*?refold\(\);/.test(dcaller) &&
    /if\s*\(\s*!\s*\(opts\s*&&\s*opts\.fromCall\)\s*\)\s*return/.test(dcaller)
);
check("dcaller append is fromCall", /refold\(\s*\{\s*fromCall:\s*true\s*\}\s*\)/.test(dcaller));

if (fails) {
  console.error(fails + " smoke-caller-library-write failure(s)");
  process.exit(1);
}
console.log("smoke-caller-library-write ok");
