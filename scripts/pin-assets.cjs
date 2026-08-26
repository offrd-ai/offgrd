/**
 * Single deploy pin: unify every HTML entrypoint + JS meta + SW cache key.
 * Mechanical — never leave SW one version behind.
 *
 *   node scripts/pin-assets.cjs 196
 *   node scripts/check-asset-v.cjs
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const V = String(process.argv[2] || "").trim();
if (!/^\d+$/.test(V)) {
  console.error("Usage: node scripts/pin-assets.cjs <N>");
  process.exit(1);
}

const ENTRY_HTML = [
  "OFFGRD.html",
  "OFFGRD-QB.html",
  "OFFGRD-Playbook.html",
  "index.html",
];

function unifyHtml(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return;
  let h = fs.readFileSync(p, "utf8");
  const before = [...new Set([...h.matchAll(/[?&]v=(\d+)/g)].map((m) => m[1]))];
  h = h.replace(
    /(<(?:script|link)\b[^>]*(?:src|href)=["'])([^"']+)(["'][^>]*>)/gi,
    function (full, a, url, c) {
      if (/^https?:/i.test(url)) return full;
      return a + url.replace(/([?&])v=\d+/g, "$1v=" + V) + c;
    }
  );
  h = h.replace(/tryLoad\(\s*["']([^"']+\.js)\?v=\d+["']/g, function (full, file) {
    if (/^https?:/i.test(file)) return full;
    return 'tryLoad("' + file + "?v=" + V + '"';
  });
  /* Inline ES module imports */
  h = h.replace(
    /(from\s+["'])(\.\/[^"']+\.js)\?v=\d+(["'])/g,
    "$1$2?v=" + V + "$3"
  );
  /* SW registration is part of the release token */
  h = h.replace(/(["'])offgrd-sw\.js(?:\?v=\d+)?\1/g, "$1offgrd-sw.js?v=" + V + "$1");
  h = h.replace(/<!-- v\d+:/, "<!-- v" + V + ":");
  fs.writeFileSync(p, h);
  const after = [...new Set([...h.matchAll(/[?&]v=(\d+)/g)].map((m) => m[1]))];
  console.log(rel + ":", before.join(",") || "(none)", "→", after.join(",") || "(none)");
}

function write(rel, fn) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return;
  let s = fs.readFileSync(p, "utf8");
  const n = fn(s);
  fs.writeFileSync(p, n);
  console.log(rel, s === n ? "NOCHANGE" : "ok");
}

ENTRY_HTML.forEach(unifyHtml);

write("OFFGRD-redesign.js", (s) =>
  s.replace(/const ASSET_V = "\d+"/, 'const ASSET_V = "' + V + '"')
);
write("OFFGRD-config.js", (s) =>
  s
    .replace(/OFFGRD_ASSET_V = "\d+"/, 'OFFGRD_ASSET_V = "' + V + '"')
    .replace(/assetV: "\d+"/, 'assetV: "' + V + '"')
    .replace(/currently \?v=\d+/g, "currently ?v=" + V)
);
write("OFFGRD-account.js", (s) => s.replace(/\?v=\d+/g, "?v=" + V));
write("OFFGRD-auth.js", (s) => s.replace(/\?v=\d+/g, "?v=" + V));
write("OFFGRD-qb-cloud.js", (s) => s.replace(/\?v=\d+/g, "?v=" + V));
/* SW re-key is mandatory every pin — CACHE + ASSET_V + every ?v= in PRECACHE strings */
write("offgrd-sw.js", (s) =>
  s
    .replace(/offgrd-gameday-v\d+(?:\.\d+)*/g, "offgrd-gameday-v" + V)
    .replace(/ASSET_V = "\d+"/g, 'ASSET_V = "' + V + '"')
    .replace(/\?v=\d+/g, "?v=" + V)
);

write("OFFGRD.html", (s) =>
  s.replace(
    /<!-- v\d+:[^>]+-->/,
    "<!-- v" +
      V +
      ": pin-assets — all HTML + SW keyed; qb queue duplicate=success -->"
  )
);

console.log("pinned v=" + V);
execFileSync(process.execPath, [path.join(__dirname, "check-asset-v.cjs")], {
  stdio: "inherit",
  cwd: root,
});
