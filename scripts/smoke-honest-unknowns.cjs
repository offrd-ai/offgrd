/**
 * Honest unknowns: COMP THIN on attempt n, display-only "?" labels, askConfirm.
 *   node scripts/smoke-honest-unknowns.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "OFFGRD.html"), "utf8");
const pkg = fs.readFileSync(path.join(ROOT, "OFFGRD-weeklypackage.js"), "utf8");
const mapSrc = fs.readFileSync(path.join(ROOT, "OFFGRD-play-map.js"), "utf8");

const sandbox = {
  window: {},
  globalThis: {},
  console: console,
  localStorage: {
    getItem: function () { return null; },
    setItem: function () {},
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "OFFGRD-caller-outcome.js"), "utf8"), sandbox);
vm.runInNewContext(mapSrc, sandbox);

const M = sandbox.OFFGRD_PLAY_MAP;
if (!M) throw new Error("OFFGRD_PLAY_MAP missing");

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

const maps = [{ raw_call: "CALI", raw_call_norm: "cali", family: "Quick Game" }];

function familyRollup(rows) {
  return M.rollup(rows, { maps: maps, playbook: [], axis: "family" }).buckets.filter(function (b) {
    return b.key === "Quick Game";
  })[0];
}

const thin1 = familyRollup([
  { play: "CALI", playType: "Pass", down: 1, distance: 10, gain: 12, result: "Complete" },
]);
check("COMP n=1 is THIN", !!(thin1 && thin1.comp === 1 && thin1.compN === 1 && thin1.compThin === true));
check("COMP n=1 still shows the number", thin1 && thin1.comp != null);

const fat = [];
for (let i = 0; i < 12; i++) {
  fat.push({ play: "CALI", playType: "Pass", down: 1, distance: 10, gain: i % 2 ? 8 : 0, result: i % 2 ? "Complete" : "Incomplete" });
}
const fatB = familyRollup(fat);
check("COMP n=12 is not THIN", !!(fatB && fatB.compN === 12 && fatB.compThin === false && fatB.comp === 0.5));

const blank = familyRollup([
  { play: "CALI", playType: "Pass", down: 1, distance: 10, gain: 5 },
]);
check("zero COMP attempts stay blank", !!(blank && blank.comp == null && blank.compN === 0 && blank.compThin === false));

const rollFn = (html.match(/function callerPlayRollupHtml\(\)\{[\s\S]*?\nfunction /) || [])[0] || "";
check("COMP THIN uses row visual", /b\.compThin\?' <span class="rd-gd-thin">THIN<\/span>'/.test(rollFn));
check("COMP blank is em-dash, unflagged", /b\.comp==null\?"—"/.test(rollFn) && !/b\.comp==null[\s\S]{0,40}THIN/.test(rollFn));
check("COMP THIN is not on the family name", /b\.thin\?' <span class="rd-gd-thin">THIN<\/span>'/.test(rollFn) && !/b\.label\)\$\{b\.compThin/.test(rollFn));

const labFn = (html.match(/function honestChartLabel\(k\)\{[\s\S]*?\n\}/) || [])[0] || "";
check("honestChartLabel exists", /function honestChartLabel\(k\)/.test(labFn));
const labBox = {};
vm.runInNewContext(labFn + "; this.honestChartLabel = honestChartLabel;", labBox);
check('"" → unspecified', labBox.honestChartLabel("") === "unspecified");
check('? → unspecified', labBox.honestChartLabel("?") === "unspecified");
check("named key unchanged", labBox.honestChartLabel("FIRE") === "FIRE");
check("weightedDist sentinel unchanged", /const k=rw\[field\]\|\|"\?"/.test(html));
check("pressure card uses honest label", /top: '\+esc\(honestChartLabel\(blitz\.arr\[0\]\.k\)\)/.test(html));
check("pressure dist bars use honest label", /function bar\(name,pct,count,cls\)\{[\s\S]*?esc\(honestChartLabel\(name\)\)/.test(html));
check("exact-tags Press glyph stays ?", /\+rw\.pressure===1\?"\?"/.test(html));

function site(label, startRe, endRe) {
  const a = html.search(startRe);
  const b = html.search(endRe);
  if (a < 0 || b < 0 || b <= a) return "";
  return html.slice(a, b);
}
const pm = site("pm", /\.pm-unmap/, /try\{ window\.openPlayMap/);
const fm = site("fm", /\.fm-unmap/, /function openPlayMap/);
const wk = site("wk", /async function schedPlanWeek/, /function schedUploadLogo/);
check("pm-unmap routes through askConfirm", /await askConfirm\("Unmap /.test(pm) && !/\bconfirm\(/.test(pm));
check("fm-unmap routes through askConfirm", /await askConfirm\("Unmap /.test(fm) && !/\bconfirm\(/.test(fm));
check("Plan this week routes through askConfirm", /await askConfirm\("Start a new week plan vs /.test(wk) && !/\bconfirm\(/.test(wk));
check("cancel returns before unmap/start", /if\(!\(await askConfirm/.test(pm) && /if\(!\(await askConfirm/.test(fm) && /if\(!ok\) return/.test(wk));
check("askConfirm exported", /askConfirm,/.test(pkg));
check("askConfirm Escape cancels", /e\.key === "Escape"/.test(pkg) && /removeEventListener\("keydown", onKey\)/.test(pkg));
check("three sites do not call window.confirm", !/window\.confirm/.test(pm + fm + wk));

if (fails) {
  console.error(fails + " FAIL");
  process.exit(1);
}
console.log("ok  smoke-honest-unknowns");
