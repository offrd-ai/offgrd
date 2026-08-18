/* OFFGRD formation mapping — Phase B write + Phase C resolution-time read.
   The map is COACH-STATED. Resolver looks up exact raw_tag_norm only.
   No contains-token, fuzzy, or suggestion auto-apply in the resolver.
   Group identity stays the raw tag; the map changes structure/picture/badge.
   Known edge (do not fix): a drawn card saved against a group whose tag is
   later mapped/unmapped may orphan its shell_key. Zero such rows today. */
(function (root) {
  "use strict";

  var STRUCTURES = ["2x2", "3x1", "2x1", "1x1", "4x1", "3x2"];
  var STRUCTURE_IDS = {
    "2x2": "DOUBLES_2X2",
    "3x1": "TRIPS_RT",
    "2x1": "WING_2X1",
    "1x1": "GOAL_LINE_JUMBO",
    "4x1": "EMPTY_4X1",
    "3x2": "EMPTY_3X2",
  };
  var PERSONNEL = ["10", "11", "12", "21", "20", "22"];

  function normTag(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function isBlankTag(s) {
    return !String(s == null ? "" : s).trim();
  }

  function legalStructure(s) {
    return STRUCTURES.indexOf(s) >= 0;
  }

  function normalizeOffStructure(raw) {
    var A = root.OFFGRD_ASSIST_IMPORT;
    if (A && typeof A.normalizeOffStructure === "function") {
      return A.normalizeOffStructure(raw);
    }
    if (raw == null) return null;
    var v = String(raw).trim().toLowerCase();
    if (!v) return null;
    if (v === "2x2" || v === "doubles" || v === "twins") return "2x2";
    if (v === "3x1" || v === "trips" || v === "bunch" || v === "trips_bunch" || v === "tight_bunch") return "3x1";
    if (v === "2x1" || v === "trey" || v === "wing") return "2x1";
    if (v === "1x1") return "1x1";
    if (v === "4x1" || v === "quads") return "4x1";
    if (v === "3x2") return "3x2";
    return null;
  }

  /** Pre-fill only when the tag CONTAINS exactly one structure token. "trey" is not a token. */
  function suggestStructure(raw) {
    if (isBlankTag(raw)) return null;
    var n = normTag(raw);
    var hits = [];
    STRUCTURES.forEach(function (tok) {
      if (n.indexOf(tok) >= 0) hits.push(tok);
    });
    return hits.length === 1 ? hits[0] : null;
  }

  function isAutoRecognized(raw) {
    return !!normalizeOffStructure(raw);
  }

  function inventoryTags(rows, maps) {
    var byNorm = Object.create(null);
    (maps || []).forEach(function (m) {
      if (!m || !m.raw_tag_norm) return;
      byNorm[normTag(m.raw_tag_norm)] = m;
    });
    var counts = Object.create(null);
    (rows || []).forEach(function (r) {
      var t = String((r && r.formation) || "").trim();
      if (!t) return;
      counts[t] = (counts[t] || 0) + 1;
    });
    var items = Object.keys(counts)
      .map(function (raw) {
        var auto = normalizeOffStructure(raw);
        var mapped = byNorm[normTag(raw)] || null;
        return {
          raw: raw,
          n: counts[raw],
          auto: auto,
          mapped: mapped,
          suggested: auto || mapped ? null : suggestStructure(raw),
        };
      })
      .sort(function (a, b) {
        return b.n - a.n || a.raw.localeCompare(b.raw);
      });
    return {
      unmapped: items.filter(function (i) { return !i.auto && !i.mapped; }),
      mapped: items.filter(function (i) { return !i.auto && i.mapped; }),
      auto: items.filter(function (i) { return !!i.auto; }),
    };
  }

  function buildUpsertPayload(opts) {
    opts = opts || {};
    var raw = String(opts.raw_tag == null ? "" : opts.raw_tag).trim();
    if (!raw) throw new Error("blank tag");
    var struct = opts.off_structure;
    if (!legalStructure(struct)) throw new Error("illegal structure");
    var bc = opts.off_back_count;
    if (bc === "" || bc == null) bc = null;
    else {
      bc = parseInt(bc, 10);
      if (isNaN(bc) || bc < 0 || bc > 2) bc = null;
    }
    var pers = opts.off_personnel;
    if (pers != null) pers = String(pers).trim() || null;
    return {
      team_id: opts.team_id || null,
      raw_tag: raw,
      raw_tag_norm: normTag(raw),
      off_structure: struct,
      off_back_count: bc,
      off_personnel: pers,
      side_scope: "both",
      created_by: opts.created_by || null,
    };
  }

  function previewShell(structure, backCount) {
    var id = STRUCTURE_IDS[structure];
    var FC = root.OFFGRD_FORMATION_CANON;
    var f = FC && typeof FC.getById === "function" ? FC.getById(id) : null;
    var display = (f && f.display) || structure;
    var S = root.OFFGRD_OPP_SHELLS;
    if (!S || typeof S.buildShell !== "function") return { players: [] };
    return S.buildShell({
      formation: display,
      play: "",
      playType: "",
      offBackCount: backCount,
      shellKey: "form-preview:" + structure,
      skipMap: true,
    });
  }

  /* ---------- Phase C: team-scoped cache + exact lookup (drawn-card pattern) ---------- */
  var MAP_CACHE_KEY = "offgrd_formation_map_cache";
  var _mapRows = [];
  var _mapTeamId = "";

  function storage() {
    try {
      if (root && root.localStorage) return root.localStorage;
      if (typeof localStorage !== "undefined") return localStorage;
    } catch (e) {}
    return null;
  }

  function readStore(teamId) {
    try {
      var store = storage();
      if (!store) return [];
      var raw = JSON.parse(store.getItem(MAP_CACHE_KEY) || "{}");
      if (!raw || (teamId && raw.teamId && raw.teamId !== teamId)) return [];
      return Array.isArray(raw.rows) ? raw.rows : [];
    } catch (e) {
      return [];
    }
  }

  function afterHydrate() {
    try {
      var S = root.OFFGRD_OPP_SHELLS;
      if (S && typeof S.clearCache === "function") S.clearCache();
    } catch (e) {}
    try {
      var SC = root.OFFGRD_SCOUTCARDS;
      if (SC && typeof SC.refreshOpen === "function") SC.refreshOpen();
    } catch (e2) {}
    try {
      var rv = root.refreshView;
      if (typeof rv !== "function" && root.window) rv = root.window.refreshView;
      if (typeof rv === "function") rv();
    } catch (e3) {}
  }

  function setCache(teamId, rows) {
    _mapRows = rows || [];
    _mapTeamId = teamId || "";
    try {
      var store = storage();
      if (store) {
        store.setItem(
          MAP_CACHE_KEY,
          JSON.stringify({ teamId: teamId || "", rows: _mapRows, updatedAt: Date.now() })
        );
      }
    } catch (e) {}
    afterHydrate();
    return _mapRows;
  }

  function loadCache(teamId) {
    var rows = readStore(teamId);
    _mapRows = rows;
    _mapTeamId = teamId || "";
    afterHydrate();
    return _mapRows;
  }

  function getCached() {
    return _mapRows;
  }

  function cachedTeamId() {
    return _mapTeamId;
  }

  function scopeMatches(scope, side) {
    var sc = String(scope == null ? "both" : scope).toLowerCase().trim();
    if (!sc || sc === "both") return true;
    var s = String(side == null ? "" : side).toLowerCase().trim();
    if (!s) return true;
    if (s === "ours" || s === "our") return sc === "ours" || sc === "off";
    if (s === "off" || s === "offense" || s === "o") return sc === "off";
    if (s === "def" || s === "defense" || s === "d") return sc === "def";
    return sc === s;
  }

  function resolveMapped(raw, side) {
    var n = normTag(raw);
    if (!n) return null;
    var i;
    var row;
    for (i = 0; i < _mapRows.length; i++) {
      row = _mapRows[i];
      if (!row) continue;
      if (normTag(row.raw_tag_norm || row.raw_tag) !== n) continue;
      if (!scopeMatches(row.side_scope, side)) continue;
      if (!legalStructure(row.off_structure)) continue;
      return row;
    }
    return null;
  }

  function formationForStructure(struct) {
    var id = STRUCTURE_IDS[String(struct || "").toLowerCase()];
    var FC = root.OFFGRD_FORMATION_CANON;
    if (!id || !FC || typeof FC.getById !== "function") return null;
    return FC.getById(id);
  }

  function pullMap(teamId) {
    var local = loadCache(teamId);
    var Cloud = root.Cloud;
    if (!Cloud || typeof Cloud.listFormationMap !== "function" || !teamId) {
      return Promise.resolve(local);
    }
    return Cloud.listFormationMap(teamId)
      .then(function (cloud) {
        setCache(teamId, cloud || []);
        return _mapRows;
      })
      .catch(function () {
        return local;
      });
  }

  root.OFFGRD_FORMATION_MAP = {
    STRUCTURES: STRUCTURES,
    STRUCTURE_IDS: STRUCTURE_IDS,
    PERSONNEL: PERSONNEL,
    MAP_CACHE_KEY: MAP_CACHE_KEY,
    normTag: normTag,
    isBlankTag: isBlankTag,
    legalStructure: legalStructure,
    normalizeOffStructure: normalizeOffStructure,
    suggestStructure: suggestStructure,
    isAutoRecognized: isAutoRecognized,
    inventoryTags: inventoryTags,
    buildUpsertPayload: buildUpsertPayload,
    previewShell: previewShell,
    setCache: setCache,
    loadCache: loadCache,
    getCached: getCached,
    cachedTeamId: cachedTeamId,
    resolveMapped: resolveMapped,
    formationForStructure: formationForStructure,
    pullMap: pullMap,
    afterHydrate: afterHydrate,
  };
})(typeof window !== "undefined" ? window : globalThis);
