/**
 * Recover OFFGRD-QB.html after a CP1252/system-default save:
 * lone high bytes (0x97 em-dash, 0xB7 middot, 0xD7 times, …) decode as U+FFFD in UTF-8.
 *
 *   node scripts/fix-qb-fffd-cp1252.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TARGETS = [
  path.join(ROOT, "OFFGRD-QB.html"),
  path.join(ROOT, "offgrd-web", "OFFGRD-QB.html"),
];

/** Windows-1252 → Unicode for bytes that are not valid UTF-8 lead/continuation alone. */
const CP1252 = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178,
};

function isValidUtf8Seq(buf, i) {
  const c = buf[i];
  let need = 0;
  if ((c & 0xe0) === 0xc0) need = 1;
  else if ((c & 0xf0) === 0xe0) need = 2;
  else if ((c & 0xf8) === 0xf0) need = 3;
  else return 0;
  for (let j = 1; j <= need; j++) {
    if (i + j >= buf.length || (buf[i + j] & 0xc0) !== 0x80) return 0;
  }
  return need + 1;
}

function recoverBuffer(buf) {
  const out = [];
  let fixed = 0;
  let i = 0;
  while (i < buf.length) {
    const c = buf[i];
    if (c <= 0x7f) {
      out.push(c);
      i++;
      continue;
    }
    const n = isValidUtf8Seq(buf, i);
    if (n > 0) {
      for (let j = 0; j < n; j++) out.push(buf[i + j]);
      i += n;
      continue;
    }
    const u = CP1252[c] != null ? CP1252[c] : c;
    const enc = Buffer.from(String.fromCharCode(u), "utf8");
    for (let j = 0; j < enc.length; j++) out.push(enc[j]);
    fixed++;
    i++;
  }
  return { buf: Buffer.from(out), fixed };
}

/** Intent restores where the glyph was replaced with ASCII '?' (true loss). */
const INTENT = [
  [/>\?\s*Replay</g, ">\u21BB Replay<"],
  [/>\?\s*Snap</g, ">\u25B6 Snap<"],
  [/(\s)\?\s*Replay/g, "$1\u21BB Replay"],
  [/(\s)\?\s*Snap(?=[<\s])/g, "$1\u25B6 Snap"],
];

function applyIntent(text) {
  let t = text;
  let n = 0;
  for (const [re, rep] of INTENT) {
    const before = t;
    t = t.replace(re, rep);
    if (t !== before) n++;
  }
  /* Common result icons if flattened to ? in known spans */
  t = t.replace(/class="ok"[^>]*>\?<\/span>/g, (m) => {
    n++;
    return m.replace(">?</span>", ">\u2713</span>");
  });
  t = t.replace(/class="bad"[^>]*>\?<\/span>/g, (m) => {
    n++;
    return m.replace(">?</span>", ">\u2717</span>");
  });
  return { text: t, intentFixes: n };
}

function countFffd(buf) {
  return (buf.toString("utf8").match(/\uFFFD/g) || []).length;
}

for (const p of TARGETS) {
  if (!fs.existsSync(p)) {
    console.warn("skip missing", p);
    continue;
  }
  const raw = fs.readFileSync(p);
  const before = countFffd(raw);
  const { buf, fixed } = recoverBuffer(raw);
  let text = buf.toString("utf8");
  const intent = applyIntent(text);
  text = intent.text;
  /* bump cache so clients drop the corrupted bytes */
  text = text.replace(/<!-- v136:[^>]*-->/, "<!-- v137: UTF-8 recover (CP1252 FFFD scrub) + U+FFFD smoke -->");
  text = text.replace(/\?v=136/g, "?v=137");
  text = text.replace(/data-align-zones="v136"/g, 'data-align-zones="v137"');
  const out = Buffer.from(text, "utf8");
  const after = countFffd(out);
  if (after) throw new Error(p + " still has U+FFFD count=" + after);
  fs.writeFileSync(p, out);
  console.log(
    path.relative(ROOT, p),
    "FFFD",
    before,
    "→",
    after,
    "cp1252Fixes",
    fixed,
    "intent",
    intent.intentFixes,
    "bytes",
    out.length
  );
}

console.log("OK fix-qb-fffd-cp1252");
