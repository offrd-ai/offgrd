/**
 * OFFGRD Playbook selection-aware dock — mapping only.
 * Flag: localStorage.offgrd_pb_dock=1 or ?dock=1 (force on). Default OFF.
 * Every group id is a re-home of an existing editor verb. No new football logic.
 */
(function (root) {
  "use strict";

  function queryDock() {
    try {
      var q = (typeof location !== "undefined" && location.search) || "";
      if (/[?&]dock=0(?:&|$)/.test(q)) return false;
      if (/[?&]dock=1(?:&|$)/.test(q)) return true;
    } catch (e) {}
    return null;
  }

  function isDockOn() {
    var forced = queryDock();
    if (forced !== null) return forced;
    try {
      if (typeof localStorage !== "undefined" && localStorage.getItem("offgrd_pb_dock") === "1") return true;
    } catch (e) {}
    return false;
  }

  function kindOfSel(sel) {
    if (!sel) return null;
    if (sel.group) {
      var g = String(sel.group).toUpperCase();
      return g === "DL" ? "dl" : "lbdb";
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
    play: ["formation", "personnel", "protection", "concepts", "defense-look"],
    wr: ["routes-quick", "routes-inter", "routes-deep", "motion", "move", "block-perim"],
    rb: ["routes-back", "run-path", "move", "motion", "pass-pro"],
    qb: ["qb-notes"],
    ol: ["run-blocks", "pass-set"],
    dl: ["move", "direct"],
    lbdb: ["blitz", "move", "direct"]
  };

  function groupsForSelection(sel) {
    var k = kindOfSel(sel);
    if (!k) return GROUPS.play.slice();
    return (GROUPS[k] || GROUPS.play).slice();
  }

  var api = {
    isDockOn: isDockOn,
    kindOfSel: kindOfSel,
    groupsForSelection: groupsForSelection,
    GROUPS: GROUPS
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.OFFGRD_PB_DOCK = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
