/**
 * Own-offense tells: baseline, 15pt/8n flag, ours-only, & normalization, empty state.
 *   node scripts/smoke-self-tells.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

function load(name, sandbox) {
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, name), "utf8"), sandbox, { filename: name });
  return sandbox;
}

const box = {
  console: console,
  localStorage: { getItem: function () { return null; }, setItem: function () {} },
};
load("OFFGRD-caller-outcome.js", box);
load("OFFGRD-tendencies.js", box);
load("OFFGRD-play-map.js", box);
load("OFFGRD-self-tells.js", box);
const S = box.OFFGRD_SELF_TELLS;

if (!S.tellFires(0.65, 0.5, 8)) throw new Error("flag must fire at exactly 15pts and n=8");
if (S.tellFires(0.649, 0.5, 8)) throw new Error("14.9pts must not flag");
if (S.tellFires(1, 0.5, 7)) throw new Error("n=7 must not flag");
if (!S.tellFires(0.35, 0.5, 8)) throw new Error("15pts the other way must flag");

if (S.normPlay("HITCH & PITCH") !== S.normPlay("HITCH AND PITCH")) {
  throw new Error("& and AND must collide");
}

function row(form, play, type) {
  return { formation: form, play: play, playType: type, gain: type === "Run" ? 4 : 6, down: 1, distance: 10, qtr: 1, play_index: 1 };
}
const rows = [];
for (let i = 0; i < 10; i++) rows.push(row("TREY", "HITCH & PITCH", "Run"));
for (let i = 0; i < 10; i++) rows.push(row("TREY", "HITCH AND PITCH", "Run"));
for (let i = 0; i < 20; i++) rows.push(row("SPREAD", "SCREEN", "Pass"));
for (let i = 0; i < 7; i++) rows.push(row("BUNCH", "POWER", "Run"));
const rep = S.compute(rows);
if (Math.abs(rep.baselineRun - 27 / 47) > 1e-9) throw new Error("baseline " + rep.baselineRun);
const trey = rep.formations.filter(function (f) { return f.formation === "TREY"; })[0];
if (!trey || !trey.tell) throw new Error("TREY should be a tell");
if (!trey.topCalls.length || trey.topCalls[0].n !== 20) {
  throw new Error("HITCH pair should be one call, got " + JSON.stringify(trey.topCalls));
}
const bunch = rep.formations.filter(function (f) { return f.formation === "BUNCH"; })[0];
if (!bunch || !bunch.muted || bunch.tell) throw new Error("n<8 stays muted with no flag");
const htmlMuted = S.renderHtml(rows);
if (htmlMuted.indexOf("BUNCH · 7 plays") < 0) throw new Error("muted row should show n without a percent lead");
if (/BUNCH · \d+%/.test(htmlMuted)) throw new Error("muted formation must not emphasize a percentage");
if (htmlMuted.indexOf("Run tell") < 0) throw new Error("a run-heavy formation should wear a Run tell chip");
if (htmlMuted.indexOf("is-run") < 0 || htmlMuted.indexOf("is-pass") < 0) throw new Error("run and pass tells need different color classes");
if (htmlMuted.indexOf("yt-big") < 0) throw new Error("enough-sample cards should show a rate");

let threw = false;
try { S.compute([{ side: "off", formation: "TREY", playType: "Run" }]); }
catch (e) { threw = true; }
if (!threw) throw new Error("side off must throw");

const empty = S.renderHtml([]);
if (empty.indexOf(S.EMPTY_COPY) < 0) throw new Error("empty corpus must use the import line");
if (/\b0%/.test(empty) || /too few/.test(empty)) throw new Error("empty corpus must not render zeros or partial cards");

const src = fs.readFileSync(path.join(ROOT, "OFFGRD-self-tells.js"), "utf8");
if (/scout_snaps|PBOOK/.test(src)) throw new Error("self-tells must not read scout_snaps or PBOOK");

console.log("ok  tells baseline, flag, hitch, empty");
