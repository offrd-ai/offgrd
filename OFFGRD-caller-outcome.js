/**
 * Play caller outcome model — yardage buckets, flags, derived success/concept.
 * Required path: one result tap. Flags optional. Concept derived, overridable.
 *
 *   window.OFFGRD_CALLER_OUTCOME
 */
(function (global) {
  "use strict";

  var RESULT_BUCKETS = [
    { id: "loss", label: "Loss", gain: -2 },
    { id: "no_gain", label: "No gain", gain: 0 },
    { id: "short", label: "1–3", gain: 2 },
    { id: "solid", label: "4–7", gain: 6 },
    { id: "chunk", label: "8–14", gain: 11 },
    { id: "explosive", label: "15+", gain: 18 },
    { id: "td", label: "TD", gain: 40 },
    { id: "turnover", label: "TO", gain: 0 },
  ];

  var FLAGS = [
    { id: "drop", label: "Drop" },
    { id: "pen_us", label: "Pen — us" },
    { id: "pen_them", label: "Pen — them" },
    { id: "protection", label: "Protection" },
    { id: "qb_read", label: "QB read" },
    { id: "coverage", label: "Coverage took it" },
  ];

  var LEGACY = { hit: true, miss: true };

  function dbToNum(db) {
    if (db === "1-3") return 2;
    if (db === "4-6") return 5;
    if (db === "7-9") return 8;
    if (db === "10+") return 12;
    return null;
  }

  function isSuccessVal(down, distance, gain) {
    var g = +gain,
      d = +distance;
    if (isNaN(g) || isNaN(d) || d <= 0) return null;
    if (down <= 1) return g >= 0.5 * d ? 1 : 0;
    if (down === 2) return g >= 0.7 * d ? 1 : 0;
    return g >= d ? 1 : 0;
  }

  function bucketById(id) {
    for (var i = 0; i < RESULT_BUCKETS.length; i++) {
      if (RESULT_BUCKETS[i].id === id) return RESULT_BUCKETS[i];
    }
    return null;
  }

  function bucketToGain(id) {
    var b = bucketById(id);
    return b ? b.gain : null;
  }

  function isPenaltyFlag(flag) {
    return flag === "pen_us" || flag === "pen_them";
  }

  function isExecFlag(flag) {
    return flag === "drop" || flag === "qb_read" || flag === "protection";
  }

  /**
   * Derive concept from success + flag + negated.
   * wouldSucceed = success as if the play counted (from yards).
   */
  function deriveConcept(wouldSucceed, flag, negated) {
    if (negated) {
      if (wouldSucceed === 1) return "worked_untested";
      if (wouldSucceed === 0) return "didnt_work";
      return "worked_untested";
    }
    if (wouldSucceed === 1) return "worked";
    if (wouldSucceed === 0) {
      if (isExecFlag(flag)) return "worked";
      if (flag === "coverage") return "didnt_work";
      return "didnt_work";
    }
    return null;
  }

  function conceptLabel(c) {
    if (c === "worked") return "worked";
    if (c === "didnt_work") return "didn't work";
    if (c === "worked_untested") return "worked, untested";
    return "";
  }

  function flagLabel(flag) {
    for (var i = 0; i < FLAGS.length; i++) {
      if (FLAGS[i].id === flag) return FLAGS[i].label;
    }
    return flag || "";
  }

  /**
   * Normalize outcome payload → folded fields.
   * sit: { dn, db }
   */
  function finalizeOutcome(payload, sit) {
    payload = payload || {};
    sit = sit || {};
    var raw = payload.result;
    if (raw == null || raw === "") {
      return {
        result: null,
        gain: null,
        flag: null,
        negated: false,
        success: null,
        concept: null,
        conceptOverride: payload.conceptOverride || null,
      };
    }

    /* Legacy hit/miss — keep readable; don't invent yards */
    if (LEGACY[raw]) {
      var successL = raw === "hit" ? 1 : 0;
      var conceptL =
        payload.conceptOverride || (successL === 1 ? "worked" : "didnt_work");
      return {
        result: raw,
        gain: null,
        flag: payload.flag || null,
        negated: false,
        success: successL,
        concept: conceptL,
        conceptOverride: payload.conceptOverride || null,
      };
    }

    var bucket = bucketById(raw) ? raw : null;
    if (!bucket) {
      return {
        result: raw,
        gain: payload.gain != null ? payload.gain : null,
        flag: payload.flag || null,
        negated: !!payload.negated,
        success: null,
        concept: payload.conceptOverride || null,
        conceptOverride: payload.conceptOverride || null,
      };
    }

    var gain = payload.gain != null ? +payload.gain : bucketToGain(bucket);
    var flag = payload.flag || null;
    var negated = isPenaltyFlag(flag);
    var dist = dbToNum(sit.db);
    var would = isSuccessVal(+sit.dn || 1, dist, gain);
    /* Turnover is never a "success" on yards alone */
    if (bucket === "turnover") would = 0;
    if (bucket === "td") would = 1;

    var success = negated ? would : would; /* keep underlying; learning uses concept */
    var concept =
      payload.conceptOverride || deriveConcept(would, flag, negated);

    return {
      result: bucket,
      gain: gain,
      flag: flag,
      negated: negated,
      success: success,
      concept: concept,
      conceptOverride: payload.conceptOverride || null,
    };
  }

  /** What the suggester should learn: 1 / 0 / null (ungraded or exclude). */
  function learningSuccess(entry) {
    if (!entry) return null;
    var c = entry.conceptOverride || entry.concept;
    if (c === "worked" || c === "worked_untested") return 1;
    if (c === "didnt_work") return 0;
    if (entry.success === 1 || entry.success === 0) return entry.success;
    if (entry.result === "hit") return 1;
    if (entry.result === "miss") return 0;
    return null;
  }

  function isGraded(entry) {
    return !!(entry && entry.result != null && entry.result !== "");
  }

  function isExplosiveResult(entry) {
    if (!entry || entry.negated) return false;
    if (entry.result === "explosive" || entry.result === "td") return true;
    return entry.gain != null && +entry.gain >= 15;
  }

  function pendingEntries(log) {
    log = log || [];
    return log.filter(function (e) {
      return !isGraded(e);
    });
  }

  /** Plays to re-surface: worked_untested or worked+exec flag */
  function comebackEntries(log) {
    log = log || [];
    return log.filter(function (e) {
      if (!isGraded(e)) return false;
      var c = e.conceptOverride || e.concept;
      if (c === "worked_untested") return true;
      if (c === "worked" && isExecFlag(e.flag)) return true;
      return false;
    });
  }

  function comebackReason(e) {
    var c = e.conceptOverride || e.concept;
    var parts = [e.play || "Play"];
    if (c === "worked_untested") {
      parts.push("worked, negated" + (e.flag ? " by " + flagLabel(e.flag) : ""));
      parts.push("Untested.");
    } else if (isExecFlag(e.flag)) {
      parts.push("worked — " + flagLabel(e.flag));
      parts.push("Call it again.");
    } else {
      parts.push(conceptLabel(c));
    }
    return parts.join(" — ");
  }

  function yardsToDb(yardsToGo) {
    var y = Math.max(1, Math.ceil(+yardsToGo || 1));
    if (y <= 3) return "1-3";
    if (y <= 6) return "4-6";
    if (y <= 9) return "7-9";
    return "10+";
  }

  /**
   * Suggest next down/distance after a graded call.
   * Turnovers / negated penalties / TD / turnover-on-downs → no infer, needsInput.
   */
  function inferNextSituation(sit, outcome) {
    sit = sit || {};
    outcome = outcome || {};
    if (!outcome.result) return { skip: true, reason: "ungraded" };
    if (outcome.result === "turnover") {
      return { skip: true, needsInput: true, reason: "turnover" };
    }
    if (outcome.negated || isPenaltyFlag(outcome.flag)) {
      return { skip: true, needsInput: true, reason: "penalty" };
    }
    if (outcome.result === "td") {
      return { skip: true, needsInput: true, reason: "td" };
    }
    var gain = outcome.gain;
    if (gain == null || isNaN(+gain)) return { skip: true, reason: "no_gain" };
    gain = +gain;
    var dist = dbToNum(sit.db);
    if (dist == null) dist = 10;
    var dn = +sit.dn || 1;
    var hash = sit.hash != null ? sit.hash : "ANY";
    var zone = sit.zone != null ? sit.zone : "ANY";

    if (gain >= dist) {
      return { dn: 1, db: "10+", hash: hash, zone: zone, inferred: true, reason: "first_down" };
    }
    var left = dist - gain;
    if (left < 1) left = 1;
    var nextDn = dn + 1;
    if (nextDn > 4) {
      return { skip: true, needsInput: true, reason: "turnover_on_downs" };
    }
    return {
      dn: nextDn,
      db: yardsToDb(left),
      hash: hash,
      zone: zone,
      inferred: true,
      reason: "advance",
    };
  }

  function liveRates(log) {
    log = log || [];
    var graded = log.filter(isGraded);
    var learnable = graded.filter(function (e) {
      return learningSuccess(e) != null && !e.negated;
    });
    /* Include negated in concept learning via learningSuccess; for SR headline use non-negated yards success OR concept */
    var srPool = graded.filter(function (e) {
      return learningSuccess(e) != null;
    });
    var hits = srPool.filter(function (e) {
      return learningSuccess(e) === 1;
    }).length;
    var expl = graded.filter(isExplosiveResult).length;
    return {
      n: graded.length,
      pending: pendingEntries(log).length,
      successRate: srPool.length ? hits / srPool.length : null,
      explosiveRate: graded.length ? expl / graded.length : null,
      successN: srPool.length,
      explosiveN: expl,
    };
  }

  global.OFFGRD_CALLER_OUTCOME = {
    RESULT_BUCKETS: RESULT_BUCKETS,
    FLAGS: FLAGS,
    dbToNum: dbToNum,
    isSuccessVal: isSuccessVal,
    bucketToGain: bucketToGain,
    isPenaltyFlag: isPenaltyFlag,
    isExecFlag: isExecFlag,
    deriveConcept: deriveConcept,
    conceptLabel: conceptLabel,
    flagLabel: flagLabel,
    finalizeOutcome: finalizeOutcome,
    learningSuccess: learningSuccess,
    isGraded: isGraded,
    isExplosiveResult: isExplosiveResult,
    pendingEntries: pendingEntries,
    comebackEntries: comebackEntries,
    comebackReason: comebackReason,
    liveRates: liveRates,
    yardsToDb: yardsToDb,
    inferNextSituation: inferNextSituation,
  };
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
