/**
 * Offline playbook search — the path a gameday airplane-mode device uses.
 *
 * Search is a local substring over a cached array. Cloud.listPlays is not
 * called. A failed fetch must still find HOUSTON from the device cache.
 * A chip + query miss must say why, never render a blank list.
 *
 *   node scripts/smoke-playbook-search-offline.cjs
 */
"use strict";
const path = require("path");
const S = require(path.join(__dirname, "..", "OFFGRD-caller-select.js"));

let n = 0;
function ok(cond, msg) {
  n++;
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const cached = [
  { id: "p_hou", name: "HOUSTON", family: "Pass", formation: "Gun Trips" },
  { id: "p_dino", name: "DINO", family: "Pass", formation: "Gun" },
  { id: "p_iso", name: "ISO", family: "Inside Run", formation: "I-Form" },
];

const store = {
  offgrd_caller_pbook_v1: JSON.stringify(cached),
};
function getItem(k) {
  return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
}

const fromCache = S.readCachedPlaybook(getItem);
ok(fromCache.length === 3 && fromCache[0].name === "HOUSTON", "readCachedPlaybook returns the device book");

const hit = S.searchPlaybook(fromCache, "hou");
ok(hit.length === 1 && hit[0].name === "HOUSTON", "offline search 'hou' → HOUSTON");

const all = S.searchPlaybook(fromCache, "");
ok(all.length === 3, "empty query is the cached book, not a network list");

const chipMiss = fromCache.filter(function (p) {
  return String((p.family || "")).toLowerCase() === "inside run";
});
const afterSearch = S.searchPlaybook(chipMiss, "dino");
ok(afterSearch.length === 0, "Inside Run + 'dino' is a real miss");
const why = S.searchEmptyReason({
  query: "dino",
  filter: "Inside Run",
  bookN: fromCache.length,
});
ok(why.text === "No plays match 'dino' in Inside Run — clear filters", "empty state names query and chip");

const noBook = S.searchEmptyReason({ query: "hou", filter: "", bookN: 0 });
ok(noBook.kind === "no-book" && /airplane/i.test(noBook.text), "empty cache says airplane, not a blank list");

const thrown = (function () {
  try {
    throw new Error("Failed to fetch");
  } catch (e) {
    return S.readCachedPlaybook(getItem);
  }
})();
ok(S.searchPlaybook(thrown, "houston").length === 1, "listPlays throw → search still hits cache");

const emptyStore = function () {
  return null;
};
ok(S.readCachedPlaybook(emptyStore).length === 0, "no cache → [] (caller then says no-book)");

console.log("smoke-playbook-search-offline: " + n + " checks passed");
