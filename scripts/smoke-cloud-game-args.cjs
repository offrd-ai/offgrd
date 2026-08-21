/**
 * clearGameTombstone / tombstoneGame must throw on a string key or id.
 *   node scripts/smoke-cloud-game-args.cjs
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "..", "OFFGRD-cloud.js"), "utf8");
const m = src.match(/function requireGameNaturalArgs\([\s\S]*?\n\}/);
if (!m) throw new Error("requireGameNaturalArgs missing from OFFGRD-cloud.js");
if (!/clearGameTombstone[\s\S]{0,500}requireGameNaturalArgs/.test(src)) {
  throw new Error("clearGameTombstone does not call requireGameNaturalArgs");
}
if (!/tombstoneGame[\s\S]{0,500}requireGameNaturalArgs/.test(src)) {
  throw new Error("tombstoneGame does not call requireGameNaturalArgs");
}

const sandbox = {};
vm.runInNewContext(m[0] + "; this.requireGameNaturalArgs = requireGameNaturalArgs;", sandbox);
const req = sandbox.requireGameNaturalArgs;

function throws(fn) {
  try {
    fn();
    return false;
  } catch (e) {
    return e && e.message ? e.message : true;
  }
}

function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
    process.exit(1);
  }
}

const ok = req(
  { opponent: "Parkway North", week: "Live 2026-08-21", side: "ours" },
  "clearGameTombstone"
);
check("object with opponent/week/side passes", ok.opponent === "Parkway North" && ok.side === "ours");

["parkway north|live 2026-07-24|ours", "532950a1-north", "f7f14dc9-642f-469c-a896-0706f6631c9e"].forEach(
  function (bad) {
    const msg = throws(function () {
      req(bad, "clearGameTombstone");
    });
    check(
      "string " + JSON.stringify(bad).slice(0, 24) + " throws",
      typeof msg === "string" && /expects \{ opponent, week, side \}/.test(msg) && /not a string/.test(msg)
    );
  }
);

[null, undefined, 1, true, ["ours"]].forEach(function (bad) {
  check(
    "non-object " + JSON.stringify(bad) + " throws",
    !!throws(function () {
      req(bad, "clearGameTombstone");
    })
  );
});

check(
  "missing side throws",
  /requires opponent, week, and side/.test(
    throws(function () {
      req({ opponent: "Parkway North", week: "Live 2026-08-21" }, "clearGameTombstone");
    })
  )
);
check(
  "bad side throws",
  /side must be ours/.test(
    throws(function () {
      req({ opponent: "Parkway North", week: "W1", side: "offense" }, "clearGameTombstone");
    })
  )
);

console.log("smoke-cloud-game-args: all ok");
