/**
 * Phone tab bar must pin to the document, not the sticky shell.
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
console.log("OK iphone tab bar dock + visualViewport + dvh");
