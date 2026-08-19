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

  /* Special teams — separate result sets. One required tap. ST never feeds offensive learning. */
  var FG_RESULTS = [
    { id: "fg_good", label: "Good", made: true },
    { id: "fg_no", label: "No good", made: false },
    { id: "fg_block", label: "Blocked", made: false },
  ];

  var PUNT_RESULTS = [
    { id: "punt_i20", label: "Downed in 20", inside20: true },
    { id: "punt_fc", label: "Fair catch" },
    { id: "punt_tb", label: "Touchback" },
    { id: "punt_ret", label: "Returned" },
    { id: "punt_block", label: "Blocked" },
    { id: "punt_fake_conv", label: "Fake conv", fakeConverted: true },
    { id: "punt_fake_fail", label: "Fake fail", fakeFailed: true },
  ];

  var LEGACY = { hit: true, miss: true };

  function isSpecialType(pt) {
    return pt === "fg" || pt === "punt";
  }

  function stSetFor(kind) {
    if (kind === "fg") return FG_RESULTS;
    if (kind === "punt") return PUNT_RESULTS;
    return null;
  }

  function stResultInfo(id) {
    var i;
    for (i = 0; i < FG_RESULTS.length; i++) {
      if (FG_RESULTS[i].id === id) return { kind: "fg", spec: FG_RESULTS[i] };
    }
    for (i = 0; i < PUNT_RESULTS.length; i++) {
      if (PUNT_RESULTS[i].id === id) return { kind: "punt", spec: PUNT_RESULTS[i] };
    }
    return null;
  }

  /** ST if the play was called as fg/punt OR graded with an ST result id. */
  function isSpecialEntry(entry) {
    if (!entry) return false;
    if (isSpecialType(entry.playType)) return true;
    return !!stResultInfo(entry.result);
  }

  function dbToNum(db) {
    if (db === "GOAL") return 3;
    if (db === "1-3") return 2;
    if (db === "4-6") return 5;
    if (db === "7-9") return 8;
    if (db === "10+") return 10;
    return null;
  }

  /**
   * Numeric yards-to-go for chain estimates / chip edits.
   * "10+" seeds at 10 (standard 1st & 10). Same as dbToNum.
   * GOAL seeds at 3 (short goal-to-go midpoint) unless an exact estYards is kept.
   */
  function estYardsForBucket(db) {
    if (db === "GOAL") return 3;
    if (db === "1-3") return 2;
    if (db === "4-6") return 5;
    if (db === "7-9") return 8;
    if (db === "10+") return 10;
    return 10;
  }

  /** Prefer persisted estYards; else seed from bucket (10+ → 10). */
  function seedEstYards(sit) {
    sit = sit || {};
    if (sit.estYards != null && !isNaN(+sit.estYards)) {
      return Math.max(1, Math.round(+sit.estYards));
    }
    return estYardsForBucket(sit.db);
  }

  /** GOAL / red-zone first downs — yards-to-goal stays in [1, 10]. */
  function clampGoalYards(y) {
    var n = Math.round(+y);
    if (isNaN(n)) n = 10;
    if (n < 1) n = 1;
    if (n > 10) n = 10;
    return n;
  }

  /** True when next first down should be 1st & GOAL (not 1st & 10). */
  function isGoalSituation(sit) {
    sit = sit || {};
    if (sit.db === "GOAL") return true;
    if (sit.zone === "REDZONE") return true;
    return false;
  }

  /**
   * Manual chip/reset write-back: exact estYards when known, else band midpoint.
   * Keeps subsequent advances derived from the corrected number.
   */
  function writebackEstYards(sit, patch) {
    sit = sit || {};
    patch = patch || {};
    var next = {
      dn: patch.dn != null ? +patch.dn : +sit.dn || 1,
      db: patch.db != null ? patch.db : sit.db || "10+",
      hash: patch.hash != null ? patch.hash : sit.hash != null ? sit.hash : "ANY",
      zone: patch.zone != null ? patch.zone : sit.zone != null ? sit.zone : "ANY",
    };
    var yards;
    if (patch.estYards != null && !isNaN(+patch.estYards)) {
      yards = Math.round(+patch.estYards);
    } else {
      yards = estYardsForBucket(next.db);
    }
    if (next.db === "GOAL") yards = clampGoalYards(yards);
    else if (yards < 1) yards = 1;
    next.estYards = yards;
    return next;
  }

  /**
   * Fresh first down after conversion / 1ST & 10 reset.
   * REDZONE or GOAL → 1st & GOAL (estYards clamped); else 1st & 10.
   */
  function firstDownSituation(sit, opts) {
    sit = sit || {};
    opts = opts || {};
    var hash = sit.hash != null ? sit.hash : "ANY";
    var zone = sit.zone != null ? sit.zone : "ANY";
    var reason = opts.reason || "first_down";
    if (isGoalSituation(sit)) {
      var gYards =
        opts.estYards != null && !isNaN(+opts.estYards)
          ? clampGoalYards(opts.estYards)
          : clampGoalYards(sit.estYards != null ? sit.estYards : 10);
      return {
        dn: 1,
        db: "GOAL",
        estYards: gYards,
        hash: hash,
        zone: zone === "ANY" ? "REDZONE" : zone,
        inferred: true,
        reason: reason,
      };
    }
    return {
      dn: 1,
      db: "10+",
      estYards: 10,
      hash: hash,
      zone: zone,
      inferred: true,
      reason: reason,
    };
  }

  /**
   * O Caller: suggest "Moved the chains" when need ≤ logged gain-band midpoint.
   * D Caller shows the chip ungated — pass force=true.
   */
  function shouldSuggestMovedChains(sit, outcome, force) {
    if (force) return true;
    outcome = outcome || {};
    if (outcome.gain == null || isNaN(+outcome.gain)) return false;
    return seedEstYards(sit) <= +outcome.gain;
  }

  /** Explicit conversion exit ramp — overrides estYards via firstDownSituation. */
  function movedChainsSituation(sit) {
    return firstDownSituation(sit, { reason: "moved_chains" });
  }

  /**
   * Drive-over exit: punt / downs / takeaway / score.
   * Resets to a clean next-series 1st & 10 (score opens try flow).
   */
  function driveOverSituation(kind, sit) {
    sit = sit || {};
    var reason =
      kind === "punt"
        ? "change_of_possession"
        : kind === "downs"
          ? "turnover_on_downs"
          : kind === "takeaway"
            ? "turnover"
            : kind === "score"
              ? "td"
              : null;
    if (!reason) return { skip: true, reason: "bad_drive_over" };
    var next = {
      dn: 1,
      db: "10+",
      estYards: 10,
      hash: "ANY",
      zone: "ANY",
      inferred: true,
      needsInput: kind !== "score",
      needsTry: kind === "score",
      reason: reason,
      driveOver: kind,
    };
    return next;
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

  /** Human label for any result id — offensive bucket, ST result, or legacy hit/miss. */
  function resultLabel(id) {
    var b = bucketById(id);
    if (b) return b.label;
    var st = stResultInfo(id);
    if (st) return st.spec.label;
    if (id === "hit") return "Hit";
    if (id === "miss") return "Miss";
    return id || "";
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
  function finalizeOutcome(payload, sit, playType) {
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

    /* Special teams — FG/Punt have their own result model; no offensive yards/concept/success. */
    var stKind = isSpecialType(playType)
      ? playType
      : isSpecialType(sit.playType)
      ? sit.playType
      : null;
    var stInfo = stResultInfo(raw);
    if (stInfo && !stKind) stKind = stInfo.kind;
    if (stKind) {
      var spec = stInfo ? stInfo.spec : null;
      return {
        result: raw,
        gain: null,
        flag: null,
        negated: false,
        success: null,
        concept: null,
        conceptOverride: null,
        playType: stKind,
        made: spec ? !!spec.made : false,
        inside20: spec ? !!spec.inside20 : false,
        fakeConverted: spec ? !!spec.fakeConverted : false,
        fakeFailed: spec ? !!spec.fakeFailed : false,
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
    /* Prefer chain estimate when present; success ≠ zero gain — concept is separate from advance. */
    var dist =
      sit.estYards != null && !isNaN(+sit.estYards)
        ? Math.max(1, Math.round(+sit.estYards))
        : dbToNum(sit.db);
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
    /* Special teams never move the offensive suggester. */
    if (isSpecialEntry(entry)) return null;
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
   * Tracks internal estYards (1st & 10 → 10; subtract gain-band midpoint; clamp ≥1;
   * new 1st resets to 10). Display/filter bucket is derived from that number.
   * Concept (worked / didn't work) never moves the chains — only the gain band does.
   * Turnovers / negated penalties / TD / turnover-on-downs → no infer, needsInput.
   */
  function inferNextSituation(sit, outcome, playType) {
    sit = sit || {};
    outcome = outcome || {};
    if (!outcome.result) return { skip: true, reason: "ungraded" };

    /* Special teams → change of possession (no offensive auto-advance), unless a fake converts. */
    var stKind = isSpecialType(playType) ? playType : null;
    var stInfo = stResultInfo(outcome.result);
    if (stInfo && !stKind) stKind = stInfo.kind;
    if (stKind) {
      var stSpec = stInfo ? stInfo.spec : null;
      if (stSpec && stSpec.fakeConverted) {
        var fakeNext = firstDownSituation(sit, { reason: "fake_converted" });
        return fakeNext;
      }
      return { skip: true, needsInput: true, reason: "change_of_possession" };
    }

    if (outcome.result === "turnover") {
      return { skip: true, needsInput: true, reason: "turnover" };
    }
    if (outcome.negated || isPenaltyFlag(outcome.flag)) {
      return { skip: true, needsInput: true, reason: "penalty" };
    }
    if (outcome.result === "td") {
      return { skip: true, needsInput: true, reason: "td" };
    }
    /* Explicit conversion exit ramp (Moved the chains) — overrides gain math. */
    if (outcome.movedChains) {
      return movedChainsSituation(sit);
    }
    var gain = outcome.gain;
    if (gain == null || isNaN(+gain)) return { skip: true, reason: "no_gain" };
    gain = +gain;
    var dist = seedEstYards(sit);
    var dn = +sit.dn || 1;
    var hash = sit.hash != null ? sit.hash : "ANY";
    var zone = sit.zone != null ? sit.zone : "ANY";

    if (gain >= dist) {
      return firstDownSituation(sit, { reason: "first_down" });
    }
    var left = dist - gain;
    if (left < 1) left = 1;
    var nextDn = dn + 1;
    if (nextDn > 4) {
      return { skip: true, needsInput: true, reason: "turnover_on_downs" };
    }
    var nextDb =
      (sit.db === "GOAL" || zone === "REDZONE") && left <= 10
        ? "GOAL"
        : yardsToDb(left);
    return {
      dn: nextDn,
      db: nextDb,
      estYards: nextDb === "GOAL" ? clampGoalYards(left) : left,
      hash: hash,
      zone: zone,
      inferred: true,
      reason: "advance",
    };
  }

  /** Field-goal accuracy over graded FG attempts. */
  function fgStats(log) {
    log = log || [];
    var atts = log.filter(function (e) {
      var st = stResultInfo(e.result);
      return isGraded(e) && (e.playType === "fg" || (st && st.kind === "fg"));
    });
    var made = atts.filter(function (e) {
      return e.result === "fg_good";
    }).length;
    return { attempts: atts.length, made: made, pct: atts.length ? made / atts.length : null };
  }

  /** Punt outcomes over graded punts: inside-20 rate + converted fakes. */
  function puntStats(log) {
    log = log || [];
    var punts = log.filter(function (e) {
      var st = stResultInfo(e.result);
      return isGraded(e) && (e.playType === "punt" || (st && st.kind === "punt"));
    });
    var inside20 = punts.filter(function (e) {
      return e.result === "punt_i20";
    }).length;
    var fakes = punts.filter(function (e) {
      return e.result === "punt_fake_conv";
    }).length;
    return {
      punts: punts.length,
      inside20: inside20,
      inside20Rate: punts.length ? inside20 / punts.length : null,
      fakesConverted: fakes,
    };
  }

  function liveRates(log) {
    log = log || [];
    /* Offensive headline only — special teams are excluded from success/explosive. */
    var graded = log.filter(function (e) {
      return isGraded(e) && !isSpecialEntry(e);
    });
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
    FG_RESULTS: FG_RESULTS,
    PUNT_RESULTS: PUNT_RESULTS,
    dbToNum: dbToNum,
    estYardsForBucket: estYardsForBucket,
    seedEstYards: seedEstYards,
    clampGoalYards: clampGoalYards,
    isGoalSituation: isGoalSituation,
    writebackEstYards: writebackEstYards,
    firstDownSituation: firstDownSituation,
    shouldSuggestMovedChains: shouldSuggestMovedChains,
    movedChainsSituation: movedChainsSituation,
    driveOverSituation: driveOverSituation,
    isSuccessVal: isSuccessVal,
    bucketToGain: bucketToGain,
    resultLabel: resultLabel,
    isPenaltyFlag: isPenaltyFlag,
    isExecFlag: isExecFlag,
    isSpecialType: isSpecialType,
    isSpecialEntry: isSpecialEntry,
    stSetFor: stSetFor,
    stResultInfo: stResultInfo,
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
    fgStats: fgStats,
    puntStats: puntStats,
    yardsToDb: yardsToDb,
    inferNextSituation: inferNextSituation,
  };
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
