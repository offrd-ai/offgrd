/**
 * Phone tab bar pins to the document; setup menu clamps to the visual viewport.
 *   node scripts/smoke-iphone-tabbar.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "OFFGRD-redesign.js"), "utf8");

function check(cond, msg) {
  if (!cond) throw new Error("iphone-tabbar: " + msg);
}

check(/function dockPhaseBar/.test(src), "dockPhaseBar exists");
check(/rd-phase-dock/.test(src), "dock class");
check(/document\.body\.appendChild\(phases\)/.test(src), "hoists #rdPhases onto body");
check(/visualViewport/.test(src), "visualViewport pin");
check(/100dvh/.test(src), "100dvh fallback");
check(/env\(safe-area-inset-bottom/.test(src), "home-indicator padding");
check(/transform:none!important/.test(src), "no transform containing block on the bar");
check(/z-index:80/.test(src), "bar above content");

check(/function placeSetupMenu/.test(src), "placeSetupMenu exists");
check(/rd-setup-dock/.test(src), "setup dock class");
check(/document\.body\.appendChild\(menu\)/.test(src), "hoists #rdSetupMenu onto body");
check(/Math\.max\(minL,\s*Math\.min\(left,\s*maxL\)\)/.test(src), "clamps menu left to the viewport");
check(/#rdSetupMenu\.rd-setup-dock\{[^}]*position:fixed/.test(src), "setup dock is position:fixed");
check(/rdPhases"\s*,\s*"rdSetupMenu"/.test(src) || /"rdPhases", "rdSetupMenu"/.test(src), "rebuild drops body-hoisted chrome");

console.log("OK iphone tab bar dock + visualViewport + dvh + setup-menu clamp");
