/**
 * Caller situational fallback ladder — never-blank expect resolution.
 * Shared by O Caller + D Caller (one resolver, two UIs).
 *
 * Extends the Scout gather()/RELAX idea into the caller's hash+field path
 * with caller-specific sticky rules (RZ, money downs, GOAL).
 *
 *   window.OFFGRD_CALLER_SIT
 */
(function (global) {
  "use strict";

  /** First rung with n ≥ THIN_FLOOR wins. */
  var THIN_FLOOR = 5;

  var DIST_ORDER = ["1-3", "4-6", "7-9", "10+"];

  function distBucket(n) {
    if (n == null || n === "") return null;
    n = +n;
    if (!isFinite(n)) return null;
    if (n <= 3) return "1-3";
    if (n <= 6) return "4-6";
    if (n <= 9) return "7-9";
    return "10+";
  }

  function ordinal(d) {
    return ({ 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" })[+d] || String(d);
  }

  function upperSit(dn, db) {
    return (ordinal(dn) + "").toUpperCase() + " & " + db;
  }

  /**
   * Medium↔long adjacency only. Short / GOAL never borrow bands.
   * 7-9 ↔ 10+; 4-6 may borrow 7-9 (medium toward long); 1-3 / GOAL → [].
   */
  function distanceNeighbors(db) {
    if (!db || db === "GOAL" || db === "1-3") return [];
    if (db === "10+") return ["7-9"];
    if (db === "7-9") return ["10+"];
    if (db === "4-6") return ["7-9"];
    return [];
  }

  function isRedZone(zone) {
    return zone === "REDZONE";
  }

  function isMoneyDown(dn) {
    return +dn === 3 || +dn === 4;
  }

  function isGoalDb(db) {
    return db === "GOAL";
  }

  function normalizeSit(sit, opts) {
    sit = sit || {};
    opts = opts || {};
    var db = sit.db || "10+";
    /* GOAL keeps its own bucket; optional filterDb maps estYards → band for matching. */
    var filterDb = opts.filterDb || sit.filterDb || null;
    if (isGoalDb(db) && !filterDb) filterDb = "1-3";
    return {
      dn: +sit.dn || 1,
      db: db,
      filterDb: filterDb || db,
      hash: sit.hash != null && sit.hash !== "" ? sit.hash : "ANY",
      zone: sit.zone != null && sit.zone !== "" ? sit.zone : "ANY",
    };
  }

  function rowDist(row) {
    if (row == null) return null;
    if (row.distance != null && row.distance !== "") return distBucket(row.distance);
    if (row.db) return isGoalDb(row.db) ? "1-3" : String(row.db);
    return null;
  }

  function rowZone(row) {
    return row.fieldZone || row.zone || "";
  }

  function rowHash(row) {
    return row.hash || "";
  }

  /**
   * filter: { dn, dbSet|db, hash, zone, rzSticky }
   * dbSet = array of allowed distance buckets (for neighbor widen).
   */
  function rowMatches(row, filter) {
    if (!row) return false;
    if (filter.dn != null && +row.down !== +filter.dn) return false;

    if (filter.dbSet && filter.dbSet.length) {
      var rd = rowDist(row);
      if (!rd || filter.dbSet.indexOf(rd) < 0) return false;
    } else if (filter.db && filter.db !== "ANY") {
      var rd2 = rowDist(row);
      if (rd2 !== filter.db) return false;
    }

    if (filter.rzSticky) {
      /* Never blend RZ with open-field. Empty zone on row: exclude from RZ-only. */
      if (rowZone(row) !== "REDZONE") return false;
    } else if (filter.zone && filter.zone !== "ANY") {
      var rz = rowZone(row);
      if (rz && rz !== filter.zone) return false;
      if (!rz) return false;
    }

    if (filter.hash && filter.hash !== "ANY") {
      var rh = rowHash(row);
      if (rh && rh !== filter.hash) return false;
      if (!rh) return false;
    }
    return true;
  }

  function filterPool(pool, filter) {
    pool = pool || [];
    var out = [];
    for (var i = 0; i < pool.length; i++) {
      if (rowMatches(pool[i], filter)) out.push(pool[i]);
    }
    return out;
  }

  function confLevel(n) {
    n = +n || 0;
    if (n >= 15) return { level: "HIGH", tone: "good", n: n };
    if (n >= 8) return { level: "MEDIUM", tone: "warn", n: n };
    if (n >= THIN_FLOOR) return { level: "LOW", tone: "bad", n: n };
    return { level: "THIN", tone: "bad", n: n };
  }

  function describeWiden(base, filter, rung) {
    var dropHash = filter.hash === "ANY" && base.hash !== "ANY";
    var dropField = !filter.rzSticky && filter.zone === "ANY" && base.zone !== "ANY";
    if (rung === 4) return "down only";
    if (rung === 3 && filter.dbSet && filter.dbSet.length > 1) {
      var bits3 = [];
      if (dropHash && dropField) bits3.push("any hash/field");
      else {
        if (dropHash) bits3.push("any hash");
        if (dropField) bits3.push("any field");
      }
      bits3.push("distance " + filter.dbSet.join("/"));
      return bits3.join(" · ");
    }
    if (dropHash && dropField) return "any hash/field";
    if (dropHash) return "any hash";
    if (dropField) return "any field";
    return "";
  }

  function badgeFor(base, filter, rung, n) {
    var sitTxt = upperSit(filter.dn, filter.displayDb || filter.db || base.filterDb);
    if (rung === 0) {
      return "Best from " + sitTxt + " exact (" + n + ")";
    }
    if (rung === 5) {
      return terminalMessage(base);
    }
    var widen = describeWiden(base, filter, rung);
    var where = sitTxt;
    if (rung === 4) where = (ordinal(filter.dn) + "").toUpperCase() + " down";
    if (filter.rzSticky && rung >= 1) where += " · RZ";
    if (widen) {
      return "Best from " + where + " · " + widen + " (" + n + ")";
    }
    return "Best from " + where + " (" + n + ")";
  }

  function terminalMessage(base) {
    if (isRedZone(base.zone)) {
      return "No red-zone looks logged yet — from your call sheet, not their tendencies.";
    }
    return "No reps logged — from your call sheet, not their tendencies.";
  }

  /**
   * Build rung filters top→down. Fixed order (not adaptive).
   * RZ sticky: never set zone to ANY when sit is REDZONE.
   * Money downs: down never changes (rungs keep dn).
   * GOAL: no distance-neighbor widen.
   */
  function buildRungs(base) {
    var rz = isRedZone(base.zone);
    var goal = isGoalDb(base.db);
    var matchDb = goal ? base.filterDb || "1-3" : base.filterDb || base.db;
    var rungs = [];

    /* 0 — exact */
    rungs.push({
      rung: 0,
      filter: {
        dn: base.dn,
        db: matchDb,
        displayDb: base.db,
        hash: base.hash,
        zone: base.zone,
        rzSticky: rz,
      },
    });

    /* 1 — drop hash */
    rungs.push({
      rung: 1,
      filter: {
        dn: base.dn,
        db: matchDb,
        displayDb: base.db,
        hash: "ANY",
        zone: base.zone,
        rzSticky: rz,
      },
    });

    /* 2 — drop field (open-field only; RZ skips blend) */
    if (!rz) {
      rungs.push({
        rung: 2,
        filter: {
          dn: base.dn,
          db: matchDb,
          displayDb: base.db,
          hash: "ANY",
          zone: "ANY",
          rzSticky: false,
        },
      });
    }

    /* 3 — distance-group neighbor (not GOAL / short) */
    var neighbors = goal ? [] : distanceNeighbors(matchDb);
    if (neighbors.length) {
      rungs.push({
        rung: 3,
        filter: {
          dn: base.dn,
          db: "ANY",
          dbSet: [matchDb].concat(neighbors),
          displayDb: base.db,
          hash: "ANY",
          zone: rz ? "REDZONE" : "ANY",
          rzSticky: rz,
        },
      });
    }

    /* 4 — down only (still RZ-sticky / money-down keeps dn) */
    rungs.push({
      rung: 4,
      filter: {
        dn: base.dn,
        db: "ANY",
        displayDb: base.db,
        hash: "ANY",
        zone: rz ? "REDZONE" : "ANY",
        rzSticky: rz,
      },
    });

    /* 5 — playbook terminal */
    rungs.push({
      rung: 5,
      filter: {
        dn: base.dn,
        db: matchDb,
        displayDb: base.db,
        hash: base.hash,
        zone: base.zone,
        rzSticky: rz,
      },
      terminal: true,
    });

    return rungs;
  }

  /**
   * Resolve the best sample for a sit from a snap pool.
   * opts.filterDb — band used when sit.db is GOAL
   * opts.min — override THIN_FLOOR (default 5)
   *
   * Returns:
   *   { rows, n, rung, filter, sit, widened, badge, widenLabel, conf, terminal, reason }
   */
  function resolveSituation(pool, sit, opts) {
    opts = opts || {};
    var min = opts.min != null ? +opts.min : THIN_FLOOR;
    var base = normalizeSit(sit, opts);
    var rungs = buildRungs(base);
    var i;
    for (i = 0; i < rungs.length; i++) {
      var step = rungs[i];
      if (step.terminal) {
        return {
          rows: [],
          n: 0,
          rung: 5,
          filter: step.filter,
          sit: base,
          widened: true,
          badge: terminalMessage(base),
          widenLabel: "playbook",
          conf: confLevel(0),
          terminal: true,
          reason: isRedZone(base.zone) ? "no_rz_sample" : "no_sample",
        };
      }
      var rows = filterPool(pool, step.filter);
      if (rows.length >= min) {
        var widenLabel = describeWiden(base, step.filter, step.rung);
        return {
          rows: rows,
          n: rows.length,
          rung: step.rung,
          filter: step.filter,
          sit: base,
          widened: step.rung > 0,
          badge: badgeFor(base, step.filter, step.rung, rows.length),
          widenLabel: widenLabel || (step.rung === 0 ? "exact" : ""),
          conf: confLevel(rows.length),
          terminal: false,
          reason: step.rung === 0 ? "exact" : "widened",
        };
      }
    }
    /* unreachable — terminal always last */
    return {
      rows: [],
      n: 0,
      rung: 5,
      filter: rungs[rungs.length - 1].filter,
      sit: base,
      widened: true,
      badge: terminalMessage(base),
      widenLabel: "playbook",
      conf: confLevel(0),
      terminal: true,
      reason: "no_sample",
    };
  }

  var API = {
    THIN_FLOOR: THIN_FLOOR,
    DIST_ORDER: DIST_ORDER,
    distBucket: distBucket,
    ordinal: ordinal,
    distanceNeighbors: distanceNeighbors,
    isRedZone: isRedZone,
    isMoneyDown: isMoneyDown,
    isGoalDb: isGoalDb,
    normalizeSit: normalizeSit,
    rowMatches: rowMatches,
    filterPool: filterPool,
    confLevel: confLevel,
    buildRungs: buildRungs,
    resolveSituation: resolveSituation,
    badgeFor: badgeFor,
    terminalMessage: terminalMessage,
  };

  global.OFFGRD_CALLER_SIT = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
