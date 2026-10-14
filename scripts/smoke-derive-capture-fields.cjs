/**
 * Derive must copy capture fields from the call payload onto the library row.
 *   node scripts/smoke-derive-capture-fields.cjs
 */
"use strict";
const { loadCaller, toSeasonRow } = require("./lib/derive-live-from-caller-game.cjs");

const sandbox = loadCaller();
const C = sandbox.OFFGRD_CALLER;
const S = sandbox.OFFGRD_CALLER_SIDE;
if (!C || !S) throw new Error("caller fold missing");

function ev(partial) {
  return Object.assign(
    {
      eventId: partial.eventId,
      gameId: "game-soak",
      type: "call",
      deviceId: "devA",
      clientTs: partial.clientTs || 1,
      seq: partial.seq || 1,
      side: partial.side,
      playIndex: partial.playIndex,
      payload: partial.payload,
    },
    partial.type ? { type: partial.type } : {}
  );
}

const oFold = C.foldCallerEvents(
  [
    ev({
      eventId: "o1",
      playIndex: 1,
      side: "offense",
      clientTs: 10,
      payload: {
        play: "HAWK",
        dn: 1,
        db: "10+",
        coverage: "Cover 3",
        carried: true,
        qtr: "1",
        heroAtCall: "HAMMER",
        heroPct: 67,
        calledHero: false,
        pressure: "",
      },
    }),
    ev({
      eventId: "o1r",
      playIndex: 1,
      side: "offense",
      type: "outcome",
      clientTs: 11,
      seq: 2,
      payload: { result: "miss", success: 0 },
    }),
  ],
  { side: "offense", gameId: "game-soak" }
);
const o = toSeasonRow(S, oFold.log[0], {
  eventSide: "offense",
  opponent: "SOAK TEST 110",
  week: "Live 2026-10-13",
  date: "2026-10-13",
});
["qtr", "carried", "heroAtCall", "heroPct", "calledHero", "pressure", "coverage"].forEach(function (k) {
  if (!Object.prototype.hasOwnProperty.call(o, k)) throw new Error("ours row missing " + k);
});
if (o.qtr !== "1" || o.carried !== true || o.heroAtCall !== "HAMMER" || o.heroPct !== 67 || o.calledHero !== false) {
  throw new Error("ours capture fields: " + JSON.stringify(o));
}
if (o.coverage !== "Cover 3") throw new Error("coverage dropped");
if (o.pressure !== "") throw new Error("empty pressure became " + JSON.stringify(o.pressure));

const dFold = C.foldCallerEvents(
  [
    ev({
      eventId: "d1",
      playIndex: 0,
      side: "defense",
      clientTs: 20,
      payload: {
        play: "Run",
        playType: "Run",
        dn: 1,
        db: "10+",
        front: "ALPHA",
        coverage: "DALLAS",
        pressure: "",
        formation: "PRO",
        qtr: "1",
      },
    }),
  ],
  { side: "defense", gameId: "game-soak" }
);
const d = toSeasonRow(S, dFold.log[0], {
  eventSide: "defense",
  opponent: "Hazelwood East",
  week: "Live 2026-10-13",
  date: "2026-10-13",
});
if (d.formation !== "PRO" || d.front !== "ALPHA" || d.coverage !== "DALLAS" || d.pressure !== "" || d.qtr !== "1") {
  throw new Error("D capture fields: " + JSON.stringify(d));
}
console.log("ok derive copies qtr, carried, hero, formation, pressure");
