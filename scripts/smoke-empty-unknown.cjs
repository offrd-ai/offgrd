/**
 * [] is never authoritative.
 *   node scripts/smoke-empty-unknown.cjs
 */
"use strict";
const path = require("path");
const E = require(path.join(__dirname, "..", "OFFGRD-empty-unknown.js"));

let n = 0;
function ok(cond, msg) {
  n++;
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const prior = [{ id: "local", name: "HOUSTON" }];

ok(E.fromExactCount([], 0) === true, "count 0 + [] is confirmed");
ok(E.fromExactCount([], null) === false, "null count is unknown");
ok(E.fromExactCount([], undefined) === false, "missing count is unknown");
ok(E.fromExactCount([], 5) === false, "count 5 + [] is not confirmed");
ok(E.fromExactCount([{ id: 1 }], 0) === false, "rows + count 0 is not confirmed");
ok(E.isUnknownEmpty([]) === true, "bare [] is unknown");
ok(E.isUnknownEmpty([], { confirmedEmpty: true }) === false, "confirmed [] is known empty");
ok(E.isUnknownEmpty([], { confirmedEmpty: E.fromExactCount([], 0) }) === false, "fromExactCount is the only true path");
ok(E.isUnknownEmpty([{ id: 1 }]) === false, "non-empty is known");
ok(E.isUnknownEmpty(null) === false, "null is not an empty list");

ok(E.adoptRemoteList([{ id: "cloud" }], prior)[0].id === "cloud", "non-empty remote wins");
ok(E.adoptRemoteList([], prior)[0].name === "HOUSTON", "unknown empty keeps local");
ok(E.adoptRemoteList([], prior, { confirmedEmpty: true }).length === 0, "confirmed empty clears");
ok(E.adoptRemoteList(null, prior)[0].name === "HOUSTON", "failed fetch keeps local");
ok(E.adoptRemoteList([], []).length === 0, "unknown empty + no local stays empty");

console.log("smoke-empty-unknown: " + n + " checks passed");
