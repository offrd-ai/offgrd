/**
 * Guard: every served HTML entrypoint must pin one shared ?v= for first-party assets.
 * Per-file drift caused GoTrueClient / wrong-brand class bugs.
 * SW CACHE / ASSET_V must match that token (stale SW = offline version mix).
 *
 *   node scripts/check-asset-v.cjs
 */
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const ENTRY_HTML = [
  "OFFGRD.html",
  "OFFGRD-QB.html",
  "OFFGRD-Playbook.html",
  "index.html",
];

function collectVersions(html, label) {
  const versions = new Map(); /* v -> [urls] */
  function add(v, url) {
    if (!versions.has(v)) versions.set(v, []);
    versions.get(v).push(url);
  }

  const tagRe = /<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = tagRe.exec(html))) {
    const url = m[1];
    if (/^https?:\/\//i.test(url)) continue;
    if (/cdnjs\.cloudflare/i.test(url)) continue;
    const vm = String(url).match(/[?&]v=(\d+)/);
    if (!vm) continue;
    add(vm[1], url);
  }

  const tryRe = /tryLoad\(\s*["']([^"']+)["']/g;
  while ((m = tryRe.exec(html))) {
    const url = m[1];
    if (/^https?:\/\//i.test(url)) continue;
    const vm = String(url).match(/[?&]v=(\d+)/);
    if (!vm) continue;
    add(vm[1], "tryLoad:" + url);
  }

  /* ES module imports inside inline <script type="module"> */
  const importRe = /from\s+["']([^"']+)["']/g;
  while ((m = importRe.exec(html))) {
    const url = m[1];
    if (/^https?:\/\//i.test(url)) continue;
    const vm = String(url).match(/[?&]v=(\d+)/);
    if (!vm) continue;
    add(vm[1], "import:" + url);
  }

  return versions;
}

let failed = false;
const filePins = [];

for (const rel of ENTRY_HTML) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    console.warn("skip missing:", rel);
    continue;
  }
  const html = fs.readFileSync(p, "utf8");
  const versions = collectVersions(html, rel);

  if (versions.size === 0) {
    console.error("FAIL:", rel, "— no first-party ?v= pins found");
    failed = true;
    continue;
  }

  if (versions.size > 1) {
    console.error("FAIL:", rel, "has", versions.size, "distinct ?v= pins — must be one shared token:");
    for (const [v, urls] of versions) {
      console.error("  v=" + v + " (" + urls.length + ")");
      urls.slice(0, 8).forEach(function (u) {
        console.error("    -", u);
      });
      if (urls.length > 8) console.error("    … +" + (urls.length - 8) + " more");
    }
    failed = true;
    continue;
  }

  const only = [...versions.keys()][0];
  filePins.push({ file: rel, v: only, n: versions.get(only).length });
  console.log("ok:", rel, "single asset pin v=" + only + " (" + versions.get(only).length + " first-party refs)");
}

if (filePins.length) {
  const tokens = [...new Set(filePins.map((f) => f.v))];
  if (tokens.length > 1) {
    console.error("FAIL: entrypoints disagree on asset token:");
    filePins.forEach(function (f) {
      console.error("  ", f.file, "→ v=" + f.v);
    });
    console.error("All HTML entrypoints must share one ?v= (prevents cross-page GoTrueClient skew).");
    failed = true;
  }
}

/* SW must be keyed to the same token */
const shared = filePins.length ? filePins[0].v : null;
if (shared) {
  const swPath = path.join(root, "offgrd-sw.js");
  if (fs.existsSync(swPath)) {
    const sw = fs.readFileSync(swPath, "utf8");
    const assetV = (sw.match(/ASSET_V\s*=\s*"(\d+)"/) || [])[1];
    const cacheV = (sw.match(/offgrd-gameday-v(\d+)/) || [])[1];
    if (assetV !== shared || cacheV !== shared) {
      console.error(
        "FAIL: offgrd-sw.js not keyed to v=" +
          shared +
          " (ASSET_V=" +
          assetV +
          ", CACHE=offgrd-gameday-v" +
          cacheV +
          ")"
      );
      console.error("Run: node scripts/pin-assets.cjs " + shared);
      failed = true;
    } else {
      console.log("ok: offgrd-sw.js keyed to v=" + shared);
    }
  }
}

if (failed) {
  console.error("\nFix: node scripts/pin-assets.cjs <N>");
  process.exit(1);
}

console.log("ok: all entrypoints + SW share v=" + shared);
