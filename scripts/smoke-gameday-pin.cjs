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
check("two devices hash the same gameId", idA === idB && /^gd-[0-9a-f]{8}$/.test(idA));
check(
  "North is a different schedule key",
  PinA.gameIdFor("Parkway North", "2026-09-10") !== idA
);

const pin1 = PinA.pick({ opponent: "Parkway Central", date: "2026-09-10", ha: "H" });
check("pick pins Central and that gameId", !!(pin1 && pin1.opponent === "Parkway Central" && pin1.gameId === idA));
check("entered after pick", PinA.entered() === "caller");
a.sit = { opp: "Parkway North" };
check("scout opponent does not change the pin", PinA.get().opponent === "Parkway Central" && PinA.get().gameId === idA);
check("adopt keeps the pinned gameId", PinA.adoptIfPinned({ gameId: "random-uuid", opp: "Parkway North" }).gameId === idA);

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
check("O ensureSession does not rotate", !/shouldRotateForOpponent/.test(html));
check("D ensureSession does not rotate", !/shouldRotateForOpponent/.test(dc));
check("setOpponent does not pick or rotate", /function setOpponent\(v\)\{ sit\.opp=v;/.test(html) && !/function setOpponent[\s\S]{0,400}shouldRotateForOpponent/.test(html));

if (fails) {
  console.error(fails + " gameday-pin smoke(s) failed");
  process.exit(1);
}
console.log("ok  gameday pin");
