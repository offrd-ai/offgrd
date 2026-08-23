/**
 * OFFGRD Playbook selection-aware dock — mapping only.
 * Default ON. Escape hatch: localStorage.offgrd_pb_classic=1 restores the
 * old global palette for one release. ?dock=1 and offgrd_pb_dock are no-ops.
 * Every group id is a re-home of an existing editor verb. No new storage fields.
 */
(function (root) {
  "use strict";

  function isClassicOn() {
    try {
      if (typeof localStorage !== "undefined" && localStorage.getItem("offgrd_pb_classic") === "1") return true;
    } catch (e) {}
    return false;
  }

  function isDockOn() {
    return !isClassicOn();
  }

  function kindOfSel(sel) {
    if (!sel) return null;
    if (sel.group) {
      var g = String(sel.group).toUpperCase();
      if (g === "DL") return "dl";
      if (g === "DB" || g === "CB" || g === "S" || g === "FS" || g === "SS" || g === "NB" || g === "NICKEL") return "db";
      return "lb";
    }
    if (sel.ol) return "ol";
    var lab = String(sel.lab || "").toUpperCase();
    var role = String(sel.role || "").toUpperCase();
    var type = String(sel.type || "").toLowerCase();
    if (type === "qb" || role === "QB" || lab === "QB") return "qb";
    if (type === "rb" || role === "RB" || role === "FB" || lab === "RB" || lab === "FB") return "rb";
    if (role === "OL" || /^(LT|LG|C|RG|RT)$/.test(lab)) return "ol";
    return "wr";
  }

  var GROUPS = {
    play: ["side", "formation", "personnel", "protection", "concepts", "defense-look"],
    defensePlay: ["side", "front", "coverage", "blitz-group", "offense-look"],
    wr: ["routes-quick", "routes-inter", "routes-deep", "motion", "block-perim"],
    rb: ["routes-back", "run-path", "motion", "pass-pro"],
    qb: ["qb-drop", "qb-boot", "qb-notes"],
    ol: ["run-blocks", "pass-set"],
    dl: ["dl-slant", "dl-contain", "dl-two-gap", "zone-drop"],
    lb: ["blitz", "zone-drop", "spy", "man"],
    db: ["man", "zone-drop", "blitz", "press"]
  };

  function groupsForSelection(sel, opts) {
    opts = opts || {};
    var k = kindOfSel(sel);
    if (!k) return (opts.side === "defense" ? GROUPS.defensePlay : GROUPS.play).slice();
    return (GROUPS[k] || GROUPS.play).slice();
  }

  /**
   * Tap grammar: drag always moves the player you hit.
   * Annotate modes and a pending man-assign (tap the receiver) are the exceptions.
   */
  function tapDrags(hit, opts) {
    opts = opts || {};
    var mode = String(opts.mode || "");
    if (mode === "text" || mode === "draw" || mode === "erase") return false;
    if (!hit) return false;
    if (opts.pending === "man" && opts.sel && opts.sel.group && !hit.group && hit !== opts.sel) return false;
    return true;
  }

  var api = {
    isDockOn: isDockOn,
    isClassicOn: isClassicOn,
    kindOfSel: kindOfSel,
    groupsForSelection: groupsForSelection,
    tapDrags: tapDrags,
    GROUPS: GROUPS
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.OFFGRD_PB_DOCK = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
