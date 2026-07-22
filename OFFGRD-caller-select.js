/**
 * OFFGRD-caller-select.js — play selection helpers for the live caller.
 *
 * Pure, DOM-free, testable. Turns the coach's already-authored call sheet
 * (WEEK.buckets) and playbook (WEEK.gen.plays / PBOOK) into the three-tier
 * selection surface: match the current situation to a bucket (Tier 1),
 * resolve id:null library plays by name (Tier 4 of acceptance), and search
 * the full playbook (Tier 3). Ranking (Tier 2) stays in OFFGRD.html because it
 * reads live app state — this module only shapes what the ranking marks.
 *
 * No schema change. Consumes existing data; never writes.
 */
(function (global) {
  "use strict";

  function norm(s) {
    return String(s == null ? "" : s).trim().toLowerCase();
  }
  function isWild(v) {
    return v == null || String(v) === "" || String(v).toUpperCase() === "ANY";
  }

  /**
   * Does a bucket cover this situation? Fields compared: dn (numeric),
   * db (string bucket), zone (string). An 'ANY'/empty bucket field is a
   * wildcard that always matches. A specific bucket field must equal the
   * situation's value.
   */
  function bucketMatches(b, sit) {
    if (!b) return false;
    sit = sit || {};
    if (!isWild(b.dn) && +b.dn !== +sit.dn) return false;
    if (!isWild(b.db) && String(b.db) !== String(sit.db)) return false;
    if (!isWild(b.zone) && String(b.zone) !== String(isWild(sit.zone) ? "ANY" : sit.zone)) return false;
    return true;
  }

  /** How specific a bucket is (count of non-wildcard fields). Higher = tighter. */
  function bucketSpecificity(b) {
    if (!b) return 0;
    var n = 0;
    if (!isWild(b.dn)) n++;
    if (!isWild(b.db)) n++;
    if (!isWild(b.zone)) n++;
    return n;
  }

  /**
   * Pick the single best bucket for a situation.
   * Tie-break: (1) highest specificity, then (2) earliest in the coach's
   * order (buckets array index) — his laminated sheet order wins ties.
   * Returns { bucket, index, specificity } or null.
   */
  function matchBucket(buckets, sit) {
    buckets = Array.isArray(buckets) ? buckets : [];
    var best = null, bestIdx = -1, bestSpec = -1;
    for (var i = 0; i < buckets.length; i++) {
      var b = buckets[i];
      if (!bucketMatches(b, sit)) continue;
      var spec = bucketSpecificity(b);
      if (spec > bestSpec) { best = b; bestIdx = i; bestSpec = spec; }
    }
    return best ? { bucket: best, index: bestIdx, specificity: bestSpec } : null;
  }

  /** Every bucket that covers the situation (for "widen" affordances), coach order. */
  function allMatches(buckets, sit) {
    buckets = Array.isArray(buckets) ? buckets : [];
    var out = [];
    for (var i = 0; i < buckets.length; i++) {
      if (bucketMatches(buckets[i], sit)) out.push({ bucket: buckets[i], index: i, specificity: bucketSpecificity(buckets[i]) });
    }
    return out;
  }

  /**
   * Resolve a bucket play {id,name} to its playbook definition.
   * Authored plays carry a real id (match by id first). Built-in/library plays
   * carry id:null — resolve by name (case-insensitive). Returns the def or null
   * (null just means "no drawn def" — the name alone is enough to call it).
   */
  function resolvePlayDef(play, pbook) {
    pbook = Array.isArray(pbook) ? pbook : [];
    if (!play) return null;
    if (play.id != null) {
      for (var i = 0; i < pbook.length; i++) {
        if (pbook[i] && pbook[i].id != null && String(pbook[i].id) === String(play.id)) return pbook[i];
      }
    }
    var nm = norm(play.name);
    if (!nm) return null;
    for (var j = 0; j < pbook.length; j++) {
      if (pbook[j] && norm(pbook[j].name) === nm) return pbook[j];
    }
    return null;
  }

  /** Family/type for a bucket or playbook play (falls back through the def). */
  function playFamily(play, pbook) {
    var def = resolvePlayDef(play, pbook);
    return (def && (def.family || def.type)) || (play && (play.family || play.type)) || "";
  }

  /** Is a play (by name) on this bucket's sheet? */
  function playInBucket(bucket, name) {
    if (!bucket || !Array.isArray(bucket.plays)) return false;
    var nm = norm(name);
    return bucket.plays.some(function (p) { return p && norm(p.name) === nm; });
  }

  /** Tier 3 search — substring over name / family / formation. Empty query = all. */
  function searchPlaybook(pbook, query) {
    pbook = Array.isArray(pbook) ? pbook : [];
    var s = norm(query);
    if (!s) return pbook.slice();
    return pbook.filter(function (p) {
      if (!p) return false;
      return ((p.name || "") + " " + (p.family || p.type || "") + " " + (p.formation || "")).toLowerCase().indexOf(s) >= 0;
    });
  }

  /** Distinct families/types present in the playbook (for filter chips). */
  function families(pbook) {
    pbook = Array.isArray(pbook) ? pbook : [];
    var seen = {}, out = [];
    for (var i = 0; i < pbook.length; i++) {
      var f = pbook[i] && (pbook[i].family || pbook[i].type);
      if (f && !seen[norm(f)]) { seen[norm(f)] = 1; out.push(String(f)); }
    }
    return out;
  }

  var API = {
    norm: norm,
    isWild: isWild,
    bucketMatches: bucketMatches,
    bucketSpecificity: bucketSpecificity,
    matchBucket: matchBucket,
    allMatches: allMatches,
    resolvePlayDef: resolvePlayDef,
    playFamily: playFamily,
    playInBucket: playInBucket,
    searchPlaybook: searchPlaybook,
    families: families,
  };

  global.OFFGRD_CALLER_SELECT = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
