/**
 * D Step 3: front + coverage, blitz secondary, optional top-5 formation row.
 *   node scripts/smoke-d-step3.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "OFFGRD-dcaller.js"), "utf8");
const lookAt = src.indexOf("function lookHtml");
const lookEnd = src.indexOf("function yardToneClass");
if (lookAt < 0 || lookEnd < lookAt) throw new Error("lookHtml missing");
const look = src.slice(lookAt, lookEnd);
if (!/Formation <span class="foot">optional<\/span>/.test(look)) {
  throw new Error("formation row must be optional");
}
if (!/slice\(0, 5\)/.test(src.slice(src.indexOf("function bookFormations"), lookAt))) {
  throw new Error("formation chips must be the book's top 5");
}
if (!/rd-dc-look-secondary/.test(look) || !/Blitz\/Stunt <span class="foot">optional<\/span>/.test(look)) {
  throw new Error("blitz must be visually secondary and optional");
}
if (!/chips\("front"/.test(look) || !/chips\("coverage"/.test(look)) {
  throw new Error("front and coverage stay on Step 3");
}

const box = { window: null, globalThis: null };
box.window = box;
box.globalThis = box;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "OFFGRD-dcaller-expect.js"), "utf8"), box);
const counts = box.OFFGRD_DCALLER_EXPECT.formCounts([
  { formation: "TRIPS" },
  { formation: "TRIPS" },
  { formation: "2x2" },
  { formation: "ACE" },
  { formation: "BUNCH" },
  { formation: "EMPTY" },
  { formation: "TREY" },
]);
if (counts.length < 6) throw new Error("formCounts dropped a formation");
const top = counts.slice(0, 5).map(function (f) { return f.display || f.key; });
if (top.length !== 5 || top[0] !== "TRIPS") {
  throw new Error("top 5 formations: " + top.join(","));
}
console.log("ok D step 3");
