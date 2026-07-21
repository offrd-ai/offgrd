/**
 * Assert Reps Lab chrome has no encoding corruption.
 *   node scripts/smoke-mojibake-chrome.cjs
 *
 * 1) U+FFFD — lossy replacement (bad save / wrong decode). Fail hard.
 * 2) Lone ASCII "?" separators — default-encoding save mapped ·/— to "?"
 *    (FFFD gate alone misses this). Pattern: [\w%)]\s\?\s[\w(]
 *    plus template form \s\?\s\${  — JS ternaries excluded.
 * 3) â€* signature — UTF-8-as-cp1252 mojibake.
 * 4) Known chrome glyphs still present (Snap / Reps Lab tag).
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
  "OFFGRD-caller-outcome.js",
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

/**
 * Whether idx sits inside a ", ', or ` string / template (code `?` ternaries are outside).
 * Template `${ … }` expressions are treated as code (not string).
 */
function stringStateAt(s, idx) {
  let inStr = null;
  let tplDepth = 0; /* >0 means inside ${ } of a template */
  for (let i = 0; i < idx; i++) {
    const c = s[i];
    const next = s[i + 1];
    if (inStr === "`") {
      if (c === "\\" ) {
        i++;
        continue;
      }
      if (c === "$" && next === "{") {
        tplDepth++;
        inStr = null;
        i++;
        continue;
      }
      if (c === "`") inStr = null;
      continue;
    }
    if (inStr) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    /* code */
    if (tplDepth > 0) {
      if (c === "{") tplDepth++;
      else if (c === "}") {
        tplDepth--;
        if (tplDepth === 0) inStr = "`";
      } else if (c === '"' || c === "'" || c === "`") inStr = c;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") inStr = c;
  }
  return inStr; /* null = code */
}

/**
 * JS ternary `cond ? then : else` — not a corrupted separator.
 * Finds `:` at paren/brace depth 0 (handles multi-line + `;` inside then-branch).
 * Never treats `?` inside string/HTML literals as a ternary operator.
 */
function isJsTernaryQuestion(s, qIdx) {
  if (stringStateAt(s, qIdx)) return false;
  const afterStart = qIdx + 1;
  if (/^\s*\$\{/.test(s.slice(afterStart, afterStart + 8))) {
    const close = s.indexOf("}", afterStart);
    if (close < 0) return false;
    return /^\s*:/.test(s.slice(close + 1, close + 8));
  }
  let depth = 0;
  let inStr = null;
  for (let i = afterStart; i < Math.min(s.length, qIdx + 500); i++) {
    const c = s[i];
    if (inStr) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
    else if (c === ";" && depth === 0) return false;
    else if (c === ":" && depth === 0 && s[i + 1] !== ":") return true;
  }
  return false;
}

/** Skip `?` inside line or block comments (often document ternaries). */
function isInsideJsComment(s, idx) {
  /* line comment */
  let i = idx;
  while (i >= 0 && s[i] !== "\n") {
    if (s[i] === "/" && s[i + 1] === "/") return true;
    i--;
  }
  /* block comment — last /* before idx with no closing */
  const before = s.lastIndexOf("/*", idx);
  if (before < 0) return false;
  const close = s.indexOf("*/", before + 2);
  return close < 0 || close > idx;
}

/** Code tokens that use `?` in prose about ternaries / nullish — not UI separators. */
function looksLikeCodeQuestion(s, m) {
  const left = m[1];
  const right = m[4] || "";
  const ctx = s.slice(Math.max(0, m.index - 24), m.index + m[0].length + 24);
  if (/^(null|undefined|true|false|NaN)$/.test(left)) return true;
  if (/^(null|undefined|true|false|NaN|TypeError)/.test(right)) return true;
  if (/\b(no_call|TypeError|typeof|instanceof)\b/.test(ctx)) return true;
  return false;
}

/** Odd count of unescaped quoteChar before idx on its line ⇒ inside that string. */
function inQuotesOnLine(s, idx, quoteChar) {
  const lineStart = s.lastIndexOf("\n", idx - 1) + 1;
  let n = 0;
  for (let i = lineStart; i < idx; i++) {
    if (s[i] === "\\") {
      i++;
      continue;
    }
    if (s[i] === quoteChar) n++;
  }
  return n % 2 === 1;
}

/**
 * Code ternary on this line (`? … :`) — not a UI separator.
 * Require a ternary-looking colon (`) :` / ` : ` / `" :`), not prose `word:`.
 * `?` inside "…" or '…' on the line is UI copy, never a ternary operator.
 */
function sameLineCodeTernary(s, qIdx) {
  if (inQuotesOnLine(s, qIdx, '"') || inQuotesOnLine(s, qIdx, "'")) return false;
  const lineEnd = s.indexOf("\n", qIdx);
  const after = s.slice(qIdx + 1, lineEnd < 0 ? qIdx + 200 : lineEnd);
  return /(?:\)|\]|\}|"|'|`)\s*:/.test(after) || /\s:\s/.test(after);
}

/**
 * Flag lone ASCII "?" used as ·/— separators (encoding loss without U+FFFD).
 * Pattern: [\w%)]\s\?\s[\w(] plus template `\s\?\s${`.
 * Runs on OFFGRD.html + OFFGRD-QB.html (both HTML+embedded-JS gameday surfaces).
 * FFFD gate remains global. JS ternaries excluded via same-line `? … :` when not
 * inside a quoted string.
 */
function assertNoLoneQuestionSeparators(p) {
  if (!/OFFGRD(?:-QB)?\.html$/i.test(p)) return;
  const s = fs.readFileSync(p, "utf8");
  const hits = [];
  const re = /([\w%)])(\s)\?(\s)([\w(])/g;
  let m;
  while ((m = re.exec(s))) {
    const qIdx = m.index + m[1].length + m[2].length;
    if (isInsideJsComment(s, qIdx)) continue;
    if (looksLikeCodeQuestion(s, m)) continue;
    if (sameLineCodeTernary(s, qIdx)) continue;
    if (
      isJsTernaryQuestion(s, qIdx) &&
      !inQuotesOnLine(s, qIdx, '"') &&
      !inQuotesOnLine(s, qIdx, "'")
    ) {
      continue;
    }
    hits.push({
      at: qIdx,
      ctx: s.slice(Math.max(0, m.index - 18), m.index + m[0].length + 18).replace(/\s+/g, " "),
    });
  }
  const reTpl = /([\w%)]|`)(\s)\?(\s)(\$\{)/g;
  while ((m = reTpl.exec(s))) {
    const qIdx = m.index + m[1].length + m[2].length;
    if (isInsideJsComment(s, qIdx)) continue;
    if (hits.some((h) => h.at === qIdx)) continue;
    hits.push({
      at: qIdx,
      ctx: s.slice(Math.max(0, m.index - 18), m.index + m[0].length + 18).replace(/\s+/g, " "),
    });
  }
  if (hits.length) {
    const sample = hits
      .slice(0, 8)
      .map((h) => "  @" + h.at + " " + JSON.stringify(h.ctx))
      .join("\n");
    throw new Error(
      path.relative(ROOT, p) +
        ": suspicious lone '?' separator(s) x" +
        hits.length +
        " (encoding loss of ·/—; FFFD gate misses this)\n" +
        sample
    );
  }
}

/**
 * Prove the lone-? gate fires: temporarily corrupt a known separator in OFFGRD.html
 * and assert smoke logic rejects it. Restores the file afterward.
 */
function assertLoneQuestionGateRegression() {
  const file = path.join(ROOT, "OFFGRD.html");
  if (!fs.existsSync(file)) return;
  const bak = fs.readFileSync(file);
  const needle = "pressure \u00b7 ${g.length} snaps";
  const poison = "pressure ? ${g.length} snaps";
  let s = bak.toString("utf8");
  if (!s.includes(needle)) {
    throw new Error("lone-? regression: missing expect middot line in OFFGRD.html");
  }
  try {
    fs.writeFileSync(file, Buffer.from(s.split(needle).join(poison), "utf8"));
    let threw = false;
    try {
      assertNoLoneQuestionSeparators(file);
    } catch (e) {
      threw = /suspicious lone '\?'|suspicious lone \?/.test(String(e && e.message));
      if (!threw) throw e;
    }
    if (!threw) {
      throw new Error("lone-? regression: gate did not flag poisoned pressure ? ${…}");
    }
  } finally {
    fs.writeFileSync(file, bak);
  }
  console.log("OK lone-'?' regression (poisoned pressure ? ${ caught)");
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

for (const p of sources) assertNoLoneQuestionSeparators(p);
console.log("OK lone-'?' separator gate:", sources.length, "files");
assertLoneQuestionGateRegression();

for (const p of [
  path.join(ROOT, "OFFGRD-QB.html"),
  path.join(ROOT, "offgrd-web", "OFFGRD-QB.html"),
]) {
  if (fs.existsSync(p)) assertQbChrome(p);
}
console.log("OK mojibake chrome + U+FFFD + lone-'?' smoke");
