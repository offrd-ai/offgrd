/**
 * Smoke: paste-to-import season schedule (v295).
 *   node scripts/smoke-schedule-import.cjs
 *
 * Legal contract: the module must never fetch, XHR, or point an image
 * at an external host. Coach pastes text; we only parse.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const modPath = path.join(root, "OFFGRD-schedule-import.js");
const htmlPath = path.join(root, "OFFGRD.html");

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

function extractBalanced(src, needle) {
  const start = src.indexOf(needle);
  if (start < 0) throw new Error("missing " + needle);
  const brace = src.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unbalanced " + needle);
}

function extractFn(src, name) {
  return extractBalanced(src, "function " + name + "(");
}

const html = fs.readFileSync(htmlPath, "utf8");
const modSrc = fs.readFileSync(modPath, "utf8");

/* ---- GUARD: no fetch / XHR / external image. This is the legal contract. ---- */
check("guard no fetch(", !/\bfetch\s*\(/.test(modSrc));
check("guard no XMLHttpRequest", !/\bXMLHttpRequest\b/.test(modSrc));
check("guard no XHR open GET", !/\.open\s*\(\s*["']GET["']/i.test(modSrc));
check("guard no new Image", !/\bnew\s+Image\b/.test(modSrc));
check("guard no img.src assign", !/\.src\s*=/.test(modSrc));
check(
  "guard no external host literal",
  !/https?:\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/i.test(modSrc) &&
    !/\bmaxpreps\b/i.test(modSrc)
);
check("guard no URL input hint", !/\bfetch schedule\b/i.test(modSrc));

const sandbox = {
  console: console,
  Date: Date,
  Math: Math,
  String: String,
  Number: Number,
  Array: Array,
  Object: Object,
  parseInt: parseInt,
  isNaN: isNaN,
  window: null,
  globalThis: null
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.runInNewContext(
  extractBalanced(html, "const ALIASES=") +
    ";\n" +
    extractFn(html, "colResolve") +
    ";\n" +
    extractFn(html, "splitCSVLine") +
    ";\n" +
    "this.ALIASES=ALIASES;this.colResolve=colResolve;this.splitCSVLine=splitCSVLine;\n" +
    modSrc,
  sandbox
);

const SI = sandbox.OFFGRD_SCHEDULE_IMPORT;
check("module exported", !!(SI && typeof SI.parseSchedule === "function"));
check("reuses host colResolve", typeof sandbox.colResolve === "function");
check("reuses host ALIASES", !!(sandbox.ALIASES && sandbox.ALIASES.date && sandbox.ALIASES.opponent));
check("ALIASES gained schedule fields", !!(sandbox.ALIASES.ha && sandbox.ALIASES.site && sandbox.ALIASES.time));

function fieldsOf(row) {
  return {
    date: row.date || "",
    opponent: row.opponent || "",
    ha: row.ha || "",
    site: row.site || "",
    time: row.time || "",
    us: row.us == null ? "" : String(row.us),
    them: row.them == null ? "" : String(row.them)
  };
}

/* ---- .ics fixture ---- */
const ics = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "DTSTART:20260827T190000",
  "SUMMARY:vs Parkway North",
  "LOCATION:West Stadium",
  "END:VEVENT",
  "END:VCALENDAR"
].join("\n");
const icsGot = SI.parseSchedule(ics, { season: "2026" });
check("ics kind", icsGot.kind === "ics", icsGot.kind);
check("ics one row", icsGot.rows.length === 1, String(icsGot.rows.length));
if (icsGot.rows[0]) {
  const r = fieldsOf(icsGot.rows[0]);
  check("ics date", r.date === "2026-08-27", r.date);
  check("ics time", r.time === "7:00PM", r.time);
  check("ics opponent", r.opponent === "Parkway North", r.opponent);
  check("ics ha H", r.ha === "H", r.ha);
  check("ics site", r.site === "West Stadium", r.site);
  check("ics no invented score", r.us === "" && r.them === "");
}

/* ---- CSV headers in a different order ---- */
const csv = [
  "Kickoff,Site,Opponent,Date,H/A,Us,Them",
  "6:00PM,South Field,Parkway South,9/3,Away,,"
].join("\n");
const csvGot = SI.parseSchedule(csv, { season: "2026" });
check("csv kind", csvGot.kind === "csv", csvGot.kind);
check("csv one row", csvGot.rows.length === 1, String(csvGot.rows.length));
if (csvGot.rows[0]) {
  const r = fieldsOf(csvGot.rows[0]);
  check("csv mapped date", r.date === "2026-09-03", r.date);
  check("csv mapped opponent", r.opponent === "Parkway South", r.opponent);
  check("csv mapped ha A", r.ha === "A", r.ha);
  check("csv mapped site", r.site === "South Field", r.site);
  check("csv mapped time", r.time === "6:00PM", r.time);
}

/* ---- loose lines ---- */
const loose = [
  "8/27 vs Parkway North 7:00PM",
  "9/3 @ Parkway South 6:00PM",
  "1/9 vs Conference",
  "8/29 Neutral Central"
].join("\n");
const looseGot = SI.parseSchedule(loose, { season: "2026" });
check("loose kind", looseGot.kind === "loose", looseGot.kind);
check("loose four rows", looseGot.rows.length === 4, String(looseGot.rows.length));
const byOpp = {};
looseGot.rows.forEach(function (r) { byOpp[r.opponent] = r; });
check("loose vs → H", byOpp["Parkway North"] && byOpp["Parkway North"].ha === "H");
check("loose @ → A", byOpp["Parkway South"] && byOpp["Parkway South"].ha === "A");
check("loose 8/27 → 2026-08-27", byOpp["Parkway North"] && byOpp["Parkway North"].date === "2026-08-27", byOpp["Parkway North"] && byOpp["Parkway North"].date);
check("loose 1/9 rollover → 2027-01-09", byOpp["Conference"] && byOpp["Conference"].date === "2027-01-09", byOpp["Conference"] && byOpp["Conference"].date);
check("year anchor stated", /2026/.test(looseGot.yearAnchor || "") && /2027/.test(looseGot.yearAnchor || ""), looseGot.yearAnchor);

const neu = byOpp["Central"];
check("neutral opponent kept", !!(neu && neu.opponent === "Central"));
check("neutral ha left default H", !!(neu && neu.ha === "H"), neu && neu.ha);
check(
  "neutral flagged not guessed",
  (looseGot.flagged || []).some(function (f) { return f.row && f.row.opponent === "Central"; })
);

/* ---- URL paste ---- */
const urlGot = SI.parseSchedule("https://example.invalid/schedule", { season: "2026" });
check("url kind", urlGot.kind === "url", urlGot.kind);
check("url zero rows", urlGot.rows.length === 0, String(urlGot.rows.length));
check(
  "url message",
  /paste the schedule text, not a link/i.test(urlGot.error || ""),
  urlGot.error
);

/* ---- merge ---- */
const existing = [
  { id: "g1", date: "2026-08-27", opponent: "Parkway North", ha: "H", site: "West", time: "7:00PM", us: "21", them: "14" },
  { id: "g2", date: "2026-09-10", opponent: "Lafayette", ha: "H", site: "", time: "", us: "", them: "" }
];
const incoming = [
  { date: "2026-08-27", opponent: "Parkway North", ha: "H", site: "West", time: "7:00PM", us: "", them: "" },
  { date: "2026-09-03", opponent: "Parkway South", ha: "A", site: "South Field", time: "6:00PM", us: "", them: "" }
];
const merged = SI.mergeSchedule(existing, incoming, {
  uid: (function () { let n = 0; return function () { n += 1; return "n" + n; }; })()
});
check("merge nothing deleted", merged.rows.length === 3, String(merged.rows.length));
check("merge 1 new", merged.nNew === 1, String(merged.nNew));
check("merge 1 unchanged (score protected)", merged.nUnchanged === 1, "upd=" + merged.nUpdated + " unc=" + merged.nUnchanged);
const kept = merged.rows.find(function (r) { return r.id === "g1"; });
check("merge score not clobbered", !!(kept && kept.us === "21" && kept.them === "14"));
check("merge lafayette still there", merged.rows.some(function (r) { return r.id === "g2"; }));
check("merge appended south", merged.rows.some(function (r) { return r.opponent === "Parkway South" && r.date === "2026-09-03"; }));

/* ---- near-match suggested, never auto-renamed ---- */
const sug = SI.suggestOpponent("Parkway N.", ["Parkway North", "Parkway South"]);
check("suggest Parkway N. → Parkway North", sug === "Parkway North", sug);
check("suggest does not mutate", true);

/* ---- emit shape: no extra fields on a fresh row ---- */
const blank = SI.blankRow();
const keys = Object.keys(blank).sort().join(",");
check("blank row shape", keys === "date,ha,opponent,site,them,time,us", keys);

const schedModal = (html.match(/id="sched"[\s\S]*?<\/div>\s*<\/div>\s*<div class="modalwrap" id="mgr"/) || [])[0] || "";
check("html has Paste schedule", /id="schedPaste"/.test(html) && /Paste schedule/.test(html));
check("html accepts csv/ics only", /id="schedImportFile"[^>]*accept="[^"]*\.csv[^"]*\.ics/.test(html));
check("html has no URL field in #sched", !/<input[^>]*type=["']url["']/i.test(schedModal) && !/fetch schedule/i.test(html));
check("html wires preview then commit", /id="schedPreviewBtn"/.test(html) && /id="schedImportCommit"/.test(html));

if (fails) {
  console.error(fails + " smoke-schedule-import FAIL");
  process.exit(1);
}
console.log("ok  smoke-schedule-import");
