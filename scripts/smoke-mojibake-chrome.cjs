/**
 * Assert Reps Lab chrome has no encoding corruption.
 *   node scripts/smoke-mojibake-chrome.cjs
 *
 * 1) U+FFFD — lossy replacement (bad save / wrong decode). Fail hard.
 * 2) â€* signature — UTF-8-as-cp1252 mojibake.
 * 3) Known chrome glyphs still present (Snap / Reps Lab tag).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

/** Gameday sources that must never ship with U+FFFD (or invalid UTF-8 → FFFD). */
const SOURCE_GLOBS = [
  "OFFGRD-QB.html",
  "OFFGRD.html",
  "OFFGRD-Playbook.html",
  "index.html",
  "OFFGRD-render.js",
  "OFFGRD-redesign.js",
  "OFFGRD-autoderive.js",
  "OFFGRD-align-key.js",
  "OFFGRD-formation-canon.js",
  "OFFGRD-formations-data.js",
  "OFFGRD-caller-log.js",
  "OFFGRD-mobile.js",
  "OFFGRD-shell.js",
  "OFFGRD-week-autotest.js",
  "OFFGRD-account.js",
  "OFFGRD-auth.js",
  "OFFGRD-qb-cloud.js",
  "OFFGRD-cloud.js",
  "OFFGRD-config.js",
  "OFFGRD-cache-gate.js",
  "OFFGRD-pos-glossary.js",
  "OFFGRD-role-gate.js",
];

function listSources() {
  const out = [];
  for (const rel of SOURCE_GLOBS) {
    for (const base of [ROOT, path.join(ROOT, "offgrd-web")]) {
      const p = path.join(base, rel);
      if (fs.existsSync(p)) out.push(p);
    }
  }
  return out;
}

function countFffdBytes(buf) {
  /* Literal UTF-8 replacement sequence */
  let lit = 0;
  for (let i = 0; i < buf.length - 2; i++) {
    if (buf[i] === 0xef && buf[i + 1] === 0xbf && buf[i + 2] === 0xbd) lit++;
  }
  /* Decode as UTF-8 — invalid sequences become U+FFFD in JS */
  const decoded = buf.toString("utf8");
  const decodedN = (decoded.match(/\uFFFD/g) || []).length;
  return { lit, decodedN, text: decoded };
}

function assertNoFffd(p) {
  const buf = fs.readFileSync(p);
  const { lit, decodedN } = countFffdBytes(buf);
  if (lit || decodedN) {
    throw new Error(
      path.relative(ROOT, p) +
        ": U+FFFD present (literalEFBFBD=" +
        lit +
        " decodeFFFD=" +
        decodedN +
        ") — refuse to ship"
    );
  }
}

function assertQbChrome(p) {
  const s = fs.readFileSync(p, "utf8");
  const sig = (s.match(/\u00e2\u20ac/g) || []).length;
  if (sig) throw new Error(path.relative(ROOT, p) + ": â€* signature count=" + sig);
  const aCirc = (s.match(/\u00e2/g) || []).length;
  if (aCirc) throw new Error(path.relative(ROOT, p) + ": U+00E2 count=" + aCirc + " (mojibake residue)");
  const snap = (s.match(/id="snapBtn">([^<]+)</) || [])[1] || "";
  if (snap.codePointAt(0) !== 0x25b6) {
    throw new Error(path.relative(ROOT, p) + ": snapBtn want U+25B6 got " + JSON.stringify(snap));
  }
  const replay = (s.match(/id="replayBtn">([^<]+)</) || [])[1] || "";
  if (replay && replay.codePointAt(0) !== 0x21bb) {
    throw new Error(path.relative(ROOT, p) + ": replayBtn want U+21BB got " + JSON.stringify(replay));
  }
  const tag = (s.match(/<span class="tag">([^<]*Reps Lab)/) || [])[1] || "";
  if (tag.codePointAt(0) !== 0x2014) {
    throw new Error(path.relative(ROOT, p) + ": Reps Lab tag want U+2014 got " + JSON.stringify(tag));
  }
  if (!/relationship\s*\u00d7\s*leverage\s*\u00d7\s*depth/.test(s) && !/relationship → leverage → depth/.test(s)) {
    /* accept either times or arrows form */
    if (!/relationship/.test(s) || !/leverage/.test(s) || !/depth/.test(s)) {
      throw new Error(path.relative(ROOT, p) + ": missing relationship/leverage/depth chrome");
    }
  }
  if (!/Start practice test/.test(s)) throw new Error(path.relative(ROOT, p) + ": missing Start practice test label");
  if (!/data-week-kind/.test(s)) throw new Error(path.relative(ROOT, p) + ": missing tappable week-kind chips");
  if (/asWeek\s*\?\s*"week_test"/.test(s)) {
    throw new Error(path.relative(ROOT, p) + ": builder must NOT auto-promote to week_test");
  }
  console.log("OK chrome", path.relative(ROOT, p));
}

const sources = listSources();
if (!sources.length) throw new Error("no source files found");
for (const p of sources) assertNoFffd(p);
console.log("OK U+FFFD gate:", sources.length, "files");

for (const p of [
  path.join(ROOT, "OFFGRD-QB.html"),
  path.join(ROOT, "offgrd-web", "OFFGRD-QB.html"),
]) {
  if (fs.existsSync(p)) assertQbChrome(p);
}
console.log("OK mojibake chrome + U+FFFD smoke");
