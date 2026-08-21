/**
 * Caller side integrity — the contract, enforced.
 *   node scripts/smoke-caller-side-integrity.cjs
 *
 * O Caller records OUR OFFENSE against THEIR DEFENSE.
 * D Caller records OUR DEFENSE against THEIR OFFENSE.
 * offense → ours · defense → off · unstamped writes throw.
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
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "OFFGRD-caller-side.js"), "utf8"), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "OFFGRD-caller-outcome.js"), "utf8"), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "OFFGRD-caller-log.js"), "utf8"), sandbox);

const S = sandbox.OFFGRD_CALLER_SIDE;
const C = sandbox.OFFGRD_CALLER;
if (!S) throw new Error("OFFGRD_CALLER_SIDE missing");
if (!C) throw new Error("OFFGRD_CALLER missing");

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

const PLAYBOOK = ["Slam West", "SOUTH BEND", "2x2 Smash", "Florida West", "KARATE COMBO"];

function throws(fn) {
  try {
    fn();
    return false;
  } catch (e) {
    return true;
  }
}

/* 1 + 2 — unstamped / bad value throws */
["call", "outcome", "observation", "correction"].forEach(function (type) {
  check(
    "unstamped " + type + " throws",
    throws(function () {
      C.buildEvent({ type: type, playIndex: 0, payload: { play: "SOUTH BEND" }, gameId: "g", deviceId: "d", seq: 1 });
    })
  );
});
["off", "", null, undefined].forEach(function (bad) {
  check(
    "bad side " + JSON.stringify(bad) + " throws",
    throws(function () {
      C.buildEvent({
        type: "call",
        playIndex: 0,
        payload: { play: "Pass" },
        side: bad,
        gameId: "g",
        deviceId: "d",
        seq: 1,
      });
    })
  );
});
check(
  "offense / defense pass",
  !!C.buildEvent({ type: "call", playIndex: 0, payload: { play: "SOUTH BEND" }, side: "offense", gameId: "g", deviceId: "d", seq: 1 }) &&
    !!C.buildEvent({ type: "call", playIndex: 0, payload: { play: "Pass" }, side: "defense", gameId: "g", deviceId: "d", seq: 2 })
);

/* 3 — no offensive play name on a defense event */
check(
  "defense + Slam West throws",
  throws(function () {
    S.assertEventAllowed({ play: "Slam West" }, "defense", PLAYBOOK);
  })
);
check(
  "defense + Pass is allowed",
  S.assertEventAllowed({ play: "Pass", playType: "Pass" }, "defense", PLAYBOOK) === true
);

/* 4 — no theirPlayType on offense; no playbook play on opponent-side row */
check(
  "offense + theirPlayType throws",
  throws(function () {
    S.assertEventAllowed({ play: "SOUTH BEND", theirPlayType: "Pass" }, "offense", PLAYBOOK);
  })
);
const dPromo = S.eventToRow(
  { play: "Pass", playType: "Pass", theirDirection: "L", front: "Nickel", coverage: "Cover 1", side: "defense" },
  "defense",
  PLAYBOOK
);
check("defense promotes to off", dPromo.ok && dPromo.dest === "off" && dPromo.row.side === "off");
check(
  "promoted off row has no playbook play",
  S.assertRowAllowed(dPromo.row, PLAYBOOK).ok && !PLAYBOOK.some(function (n) { return dPromo.row.play === n; })
);

/* 5 — log isolation */
const mixed = [];
for (let i = 0; i < 5; i++) {
  mixed.push({ play: PLAYBOOK[i % PLAYBOOK.length], side: "offense", playIndex: i });
  mixed.push({ play: i % 2 ? "Run" : "Pass", side: "defense", playIndex: i });
}
const oLog = S.filterLogBySide(mixed, "offense");
const dLog = S.filterLogBySide(mixed, "defense");
check("O log is exactly 5 offense rows", oLog.length === 5 && oLog.every(function (r) { return r.side === "offense"; }));
check("D log is exactly 5 defense rows", dLog.length === 5 && dLog.every(function (r) { return r.side === "defense"; }));
check("D log has zero offense plays", !dLog.some(function (r) { return PLAYBOOK.indexOf(r.play) >= 0; }));

/* 6 — promotion routing */
const oEntries = oLog.map(function (r) { return { play: r.play, side: "offense" }; });
const dEntries = dLog.map(function (r) { return { play: r.play, playType: r.play, side: "defense" }; });
const oProm = S.promoteEntries(oEntries, "offense", PLAYBOOK);
const dProm = S.promoteEntries(dEntries, "defense", PLAYBOOK);
check("5 offense events promote to ours", oProm.dest === "ours" && oProm.rows.length === 5 && oProm.rows.every(function (r) { return r.side === "ours"; }));
check("5 defense events promote to off", dProm.dest === "off" && dProm.rows.length === 5 && dProm.rows.every(function (r) { return r.side === "off"; }));
check(
  "zero cross-contamination",
  !oProm.rows.some(function (r) { return r.side === "off"; }) &&
    !dProm.rows.some(function (r) { return r.side === "ours"; })
);

/* 7 — reconciliation */
const allPromoted = oProm.rows.concat(dProm.rows);
const seen = Object.create(null);
let both = 0;
allPromoted.forEach(function (r, i) {
  const k = r.side + ":" + r.play + ":" + i;
  if (seen[k]) both += 1;
  seen[k] = 1;
});
check(
  "offense + defense === total, no overlap, no orphan",
  oProm.rows.length + dProm.rows.length === 10 &&
    allPromoted.length === 10 &&
    both === 0
);
check("mapper offense→ours", S.eventSideToSeasonSide("offense") === "ours");
check("mapper defense→off", S.eventSideToSeasonSide("defense") === "off");
check("mapper never returns def", S.eventSideToSeasonSide("defense") !== "def");

if (fails) {
  console.error(fails + " failed");
  process.exit(1);
}
console.log("smoke-caller-side-integrity: all ok");
