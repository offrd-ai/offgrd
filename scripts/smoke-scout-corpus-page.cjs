/**
 * Corpus fetch pages past the PostgREST 1,000-row cap.
 *   node scripts/smoke-scout-corpus-page.cjs
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const cloud = fs.readFileSync(path.join(root, "OFFGRD-cloud.js"), "utf8");

function check(name, cond) {
  if (!cond) {
    console.error("FAIL", name);
    process.exit(1);
  }
  console.log("ok ", name);
}

const start = cloud.indexOf("/* === scout-snap-pages === */");
const end = cloud.indexOf("/* === /scout-snap-pages === */");
check("page helper is marked", start >= 0 && end > start);
const box = {};
vm.runInNewContext(cloud.slice(start, end), box);
const take = box.takeScoutSnapPage;
check("takeScoutSnapPage extracts", typeof take === "function");

function ids(n, prefix) {
  const page = [];
  for (let i = 0; i < n; i++) page.push({ id: prefix + i, week: prefix });
  return page;
}

const rows = [];
const seen = Object.create(null);
check("full page continues", take(rows, seen, ids(1000, "a"), 1000) === false && rows.length === 1000);
check("short page ends", take(rows, seen, ids(137, "b"), 1000) === true && rows.length === 1137);
check("ritenour page is kept", rows.filter((r) => r.week === "b").length === 137);

const again = [];
const seen2 = Object.create(null);
const first = ids(1000, "k");
check("first thousand continues", take(again, seen2, first, 1000) === false);
check("repeated page stops", take(again, seen2, first, 1000) === true && again.length === 1000);

const one = [];
check("under the cap is one page", take(one, Object.create(null), ids(48, "d"), 1000) === true && one.length === 48);
check("empty page ends", take([], Object.create(null), [], 1000) === true);

const fn = cloud.slice(cloud.indexOf("async listScoutSnaps(teamId)"), cloud.indexOf("scoutSnapToRow(s)"));
check("fetch orders by id", /\.order\("id", \{ ascending: true \}\)/.test(fn));
check("fetch ranges a page", /\.range\(from, from \+ pageSize - 1\)/.test(fn));
check("page size is 1000", /const pageSize = 1000;/.test(fn));
const loopAt = fn.indexOf("for (let from = 0");
const doneAt = fn.indexOf("if (rows.length > 0) return stampConfirmedEmpty");
check("pages finish before the corpus is returned", loopAt >= 0 && doneAt > loopAt);

console.log("smoke-scout-corpus-page ok");
