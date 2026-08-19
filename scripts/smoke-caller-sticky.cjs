/**
 * Sticky bar: navigation + call-flow only (no data-derived %).
 * Live qtr: CALLER_BREAKS → qtrFromBreaks, empty when ambiguous.
 *   node scripts/smoke-caller-sticky.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "OFFGRD.html"), "utf8");

const stickySrc = (html.match(/function callerStickyBarHtml\([\s\S]*?\nfunction /) || [])[0];
if (!stickySrc) throw new Error("callerStickyBarHtml not found");
if (/callerBlitzThreat/.test(stickySrc)) throw new Error("sticky bar must not call callerBlitzThreat");
if (/% blitz/.test(stickySrc)) throw new Error("sticky bar must not render a blitz %");

const box = {
  CALLER_LOG: [{ result: null }, { result: null }],
  callerOnCall: function () {
    return { play: "HOUSTON", result: null };
  },
  callerOut: function () {
    return { pendingEntries: function () { return [{}, {}]; } };
  },
  callerBlitzThreat: function () {
    return { level: "heavy", pr: 0.62 };
  },
  esc: function (s) {
    return String(s == null ? "" : s);
  },
};
vm.runInNewContext(stickySrc.replace(/\nfunction $/, "\nthis.out=callerStickyBarHtml;\n"), box);

function assertNoPct(label, htmlOut) {
  if (htmlOut.indexOf("%") >= 0) {
    throw new Error(label + " sticky HTML must not contain % — got: " + htmlOut);
  }
  if (!/rd-gd-sticky/.test(htmlOut)) throw new Error(label + " missing .rd-gd-sticky");
  if (/rd-gd-sticky-blitz/.test(htmlOut)) throw new Error(label + " still has blitz chip");
}

assertNoPct("grade", box.out("1ST & 10+", 0.62, [{ pressure: 1 }, { pressure: 1 }, { pressure: 1 }]));

box.callerOnCall = function () { return null; };
assertNoPct("pending", box.out("2ND & 7-9"));

box.callerOut = function () {
  return { pendingEntries: function () { return []; } };
};
box.CALLER_LOG = [];
assertNoPct("caught-up", box.out("3RD & 4-6"));

const expectChunk = (html.match(/function callerExpectStripHtml\([\s\S]*?\nfunction callerBlitzAlertHtml/) || [])[0];
if (!expectChunk) throw new Error("callerExpectStripHtml not found");
if (!/id="rd-gd-expect-blitz"/.test(expectChunk)) {
  throw new Error("Expect chip must have id=rd-gd-expect-blitz");
}

const ebox = {
  esc: function (s) { return String(s == null ? "" : s); },
  fmtPct: function (x) { return Math.round((+x || 0) * 100) + "%"; },
  weightedDist: function () { return { arr: [] }; },
};
vm.runInNewContext(
  expectChunk.replace(/\nfunction callerBlitzAlertHtml$/, "\nthis.out=callerExpectStripHtml;\nthis.threat=callerBlitzThreat;\n"),
  ebox
);

function expectHtml(pr, n) {
  const snaps = [];
  let i;
  for (i = 0; i < n; i++) snaps.push({ pressure: pr >= 0.3 ? 1 : 0 });
  return ebox.out({ g: snaps, cov: { k: "Cover 4", pct: 0.51 } }, { k: "4-3" }, pr, []);
}

const expectLow = expectHtml(0.21, 48);
if (expectLow.indexOf('id="rd-gd-expect-blitz"') < 0) {
  throw new Error("Expect chip must exist at 21% pressure — got: " + expectLow);
}
if (!/21% blitz/.test(expectLow)) throw new Error("Expect chip should show 21% blitz at pr=0.21");
if (expectLow.indexOf("rd-gd-sticky") >= 0) throw new Error("Expect strip must not include sticky");

const expectHi = expectHtml(0.51, 12);
if (expectHi.indexOf('id="rd-gd-expect-blitz"') < 0) {
  throw new Error("Expect chip missing on elevated sit");
}

require(path.join(ROOT, "OFFGRD-caller-outcome.js"));
const A = require(path.join(ROOT, "OFFGRD-caller-analysis.js"));
if (!A || typeof A.qtrFromBreaks !== "function") throw new Error("qtrFromBreaks missing");

function q(pi, breaks) {
  return A.qtrFromBreaks(pi, breaks);
}
if (q(0, []) !== "") throw new Error("no breaks → empty qtr");
if (q(null, [{ kind: "quarter", afterPlayIndex: 2 }]) !== "") throw new Error("missing playIndex → empty");

const q1 = [{ kind: "quarter", afterPlayIndex: 2 }];
if (q(0, q1) !== "1" || q(2, q1) !== "1" || q(3, q1) !== "2") {
  throw new Error("Q1 mark at 2 → snaps 0-2 are Q1, after is Q2");
}

const halfOnly = [{ kind: "half", afterPlayIndex: 2 }];
if (q(0, halfOnly) !== "" || q(2, halfOnly) !== "" || q(3, halfOnly) !== "3") {
  throw new Error("half-only → pre-half empty (Q1 vs Q2), after is Q3");
}

const q1h = [
  { kind: "quarter", afterPlayIndex: 1 },
  { kind: "half", afterPlayIndex: 3 },
];
if (q(0, q1h) !== "1" || q(1, q1h) !== "1" || q(2, q1h) !== "2" || q(3, q1h) !== "2" || q(4, q1h) !== "3") {
  throw new Error("Q1 then half → Q1 / Q2 / then Q3");
}

console.log("ok  sticky bar has no data-derived %");
console.log("ok  #rd-gd-expect-blitz exists in Expect (21% and elevated)");
console.log("ok  qtrFromBreaks fixtures");
