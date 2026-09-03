/**
 * D Caller perspective — Hudl/offense-canonical storage, defense-own display.
 *
 * Canonical L/R/M stay offense-view (Hudl PLAY DIR / HASH). The DC reads
 * "your left / your right / up the middle." Live taps and defense-tagged
 * imports flip on write so the store stays one convention.
 *
 *   window.OFFGRD_DCALLER_PERSPECTIVE
 */
(function (global) {
  "use strict";

  function sideCode(v) {
    if (v == null) return "";
    var s = String(v).trim().toUpperCase();
    if (!s) return "";
    if (s === "ANY") return "ANY";
    if (s === "L" || s === "LEFT") return "L";
    if (s === "R" || s === "RIGHT") return "R";
    if (s === "M" || s === "MID" || s === "MIDDLE") return "M";
    var c = s.charAt(0);
    if (c === "L" || c === "R" || c === "M") return c;
    return "";
  }

  /** L↔R. M / ANY / unknown pass through. */
  function flipSide(v) {
    var c = sideCode(v);
    if (c === "L") return "R";
    if (c === "R") return "L";
    if (c === "M" || c === "ANY") return c;
    return v == null || v === "" ? v : String(v);
  }

  /** DC tap labeled "your L" / "your R" → canonical offense code. */
  function fromDefenseTap(ui) {
    return flipSide(ui);
  }

  /** Canonical offense L → your right. */
  function speakDir(canonical) {
    var c = sideCode(canonical);
    if (c === "L") return "your right";
    if (c === "R") return "your left";
    if (c === "M") return "up the middle";
    return "";
  }

  /** Hero / chips: `your R` · `your L` · `middle`. */
  function speakDirShort(canonical) {
    var c = sideCode(canonical);
    if (c === "L") return "your R";
    if (c === "R") return "your L";
    if (c === "M") return "middle";
    return "";
  }

  /** Hash chips keep a bare M. */
  function speakHashChip(canonical) {
    var c = sideCode(canonical);
    if (c === "L") return "your R";
    if (c === "R") return "your L";
    if (c === "M") return "M";
    if (c === "ANY") return "ANY";
    return canonical ? String(canonical) : "";
  }

  /** Sit banner / log: `your L hash`. */
  function speakHash(canonical) {
    var c = sideCode(canonical);
    if (c === "L") return "your R hash";
    if (c === "R") return "your L hash";
    if (c === "M") return "middle";
    return "";
  }

  /** Footer grain: `to your right` / `up the middle`. */
  function speakWent(canonical) {
    var c = sideCode(canonical);
    if (c === "L") return "to your right";
    if (c === "R") return "to your left";
    if (c === "M") return "up the middle";
    return canonical ? String(canonical) : "";
  }

  /** `Run L` (canonical) → `Run your R`. */
  function speakPlay(play) {
    var s = String(play == null ? "" : play);
    var m = s.match(/^(.*?)(?:\s+)([LR])$/i);
    if (!m) return s;
    var short = speakDirShort(m[2]);
    return short ? m[1] + " " + short : s;
  }

  /**
   * Film tagged from the defense's view → canonical offense codes in place.
   * Only hash + play direction. Does not touch pass zone / strength.
   */
  function canonicalizeFromDefenseView(row) {
    if (!row || typeof row !== "object") return row;
    if (row.hash != null && row.hash !== "") row.hash = flipSide(row.hash);
    if (row.direction != null && row.direction !== "") row.direction = flipSide(row.direction);
    if (row.play_dir != null && row.play_dir !== "") row.play_dir = flipSide(row.play_dir);
    if (row.playDir != null && row.playDir !== "") row.playDir = flipSide(row.playDir);
    return row;
  }

  function canonicalizeRowsFromDefenseView(rows) {
    (rows || []).forEach(canonicalizeFromDefenseView);
    return rows;
  }

  var API = {
    sideCode: sideCode,
    flipSide: flipSide,
    fromDefenseTap: fromDefenseTap,
    speakDir: speakDir,
    speakDirShort: speakDirShort,
    speakHashChip: speakHashChip,
    speakHash: speakHash,
    speakWent: speakWent,
    speakPlay: speakPlay,
    canonicalizeFromDefenseView: canonicalizeFromDefenseView,
    canonicalizeRowsFromDefenseView: canonicalizeRowsFromDefenseView,
  };

  global.OFFGRD_DCALLER_PERSPECTIVE = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
