/**
 * Deploy gate: unified ?v= pin + required gameday JS present in the tree.
 * Wired as Vercel buildCommand so CLI uploads of incomplete trees fail closed.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");

execFileSync(process.execPath, [path.join(__dirname, "check-asset-v.cjs")], {
  stdio: "inherit",
  cwd: root,
});

const REQUIRED = [
  "OFFGRD-frame-capture.js",
  "OFFGRD-cv-review.js",
  "OFFGRD-assist-import.js",
  "OFFGRD-schedule-import.js",
  "OFFGRD-scout-report.js",
  "OFFGRD-dcaller.js",
  "OFFGRD-booth-ask.js",
  "OFFGRD-caller-side.js",
  "OFFGRD-caller-sync.js",
  "OFFGRD-caller-analysis.js",
  "OFFGRD-caller-sit.js",
  "OFFGRD-caller-summary-llm.js",
  "offgrd-sw.js",
  "OFFGRD-account.js",
  "OFFGRD-redesign.js",
  "OFFGRD-cloud.js",
  "OFFGRD.html",
];

let missing = 0;
for (const f of REQUIRED) {
  const p = path.join(root, f);
  if (!fs.existsSync(p) || !fs.statSync(p).size) {
    console.error("MISSING required deploy asset:", f);
    missing++;
  } else {
    console.log("ok asset:", f, fs.statSync(p).size);
  }
}
if (missing) {
  console.error(
    "\nRefusing deploy: " +
      missing +
      " required file(s) missing. Do not vercel-deploy from an incomplete mirror (e.g. offgrd-web without Capture/SW)."
  );
  process.exit(1);
}
console.log("ok: deploy asset gate passed");
