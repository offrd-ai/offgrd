/**
 * OFFGRD-prediction-engine.js — one predict(), one rank().
 *
 * Spec: docs/OFFGRD-prediction-engine-SPEC.md
 * predict(C, B) is what they'll do. rank(C, H, prediction) is what we call.
 * Hero is rank()[0]. No surface ranks on its own.
 * Gates come from OFFGRD_CALLER_SHORTLIST.DEFAULTS. This file does not change them.
 */
(function (global) {
  "use strict";

  var FALLBACK = {
    MIN_SNAPS: 4,
    SUCCESS_FLOOR: 0.6,
    SHORTLIST_MAX: 5,
    DIRECTIONAL_SPLIT_MIN: 8,
    LEAN_FLOOR: 0.6
  };
  var SHORTLIST_MIN = 3;

  function gates() {
    var S = global.OFFGRD_CALLER_SHORTLIST;
    var d = (S && S.DEFAULTS) || {};
    return {
      MIN_SNAPS: d.MIN_SNAPS != null ? d.MIN_SNAPS : FALLBACK.MIN_SNAPS,
      SUCCESS_FLOOR: d.SUCCESS_FLOOR != null ? d.SUCCESS_FLOOR : FALLBACK.SUCCESS_FLOOR,
      SHORTLIST_MAX: d.SHORTLIST_MAX != null ? d.SHORTLIST_MAX : FALLBACK.SHORTLIST_MAX,
      SHORTLIST_MIN: SHORTLIST_MIN,
      DIRECTIONAL_SPLIT_MIN: d.DIRECTIONAL_SPLIT_MIN != null ? d.DIRECTIONAL_SPLIT_MIN : FALLBACK.DIRECTIONAL_SPLIT_MIN,
      LEAN_FLOOR: d.LEAN_FLOOR != null ? d.LEAN_FLOOR : FALLBACK.LEAN_FLOOR
    };
  }

  function norm(s) {
    return String(s == null ? "" : s).trim().toLowerCase();
  }

  function setField(v) {
    var s = norm(v);
    if (!s || s === "any" || s === "*" || s === "?") return "";
    return s;
  }

  function distBucket(distance) {
    var n = +distance;
    if (!isFinite(n)) return "";
    if (n <= 3) return "1-3";
    if (n <= 6) return "4-6";
    if (n <= 9) return "7-9";
    return "10+";
  }

  function rowDist(row) {
    if (!row) return "";
    if (row.distBucket) return String(row.distBucket);
    if (row.db && setField(row.db)) return String(row.db);
    return distBucket(row.distance);
  }

  function downWord(d) {
    d = +d;
    if (d === 1) return "1st";
    if (d === 2) return "2nd";
    if (d === 3) return "3rd";
    if (d === 4) return "4th";
    return d ? String(d) : "";
  }

  function distWord(bucket) {
    if (bucket === "1-3") return "short";
    if (bucket === "4-6") return "medium";
    if (bucket === "7-9") return "long";
    if (bucket === "10+") return "10+";
    return bucket || "";
  }

  function contextNorm(C) {
    C = C || {};
    var margin = C.scoreMargin != null ? +C.scoreMargin : (C.margin != null ? +C.margin : null);
    var score = setField(C.scoreBucket || C.score);
    if (!score && margin != null && isFinite(margin)) {
      if (margin <= -8) score = "trail8";
      else if (margin < 0) score = "trail";
      else if (margin === 0) score = "tied";
      else score = "lead";
    }
    var qtr = C.qtr != null ? +C.qtr : null;
    var clock = setField(C.clock);
    if (!clock && (C.twoMinute || C.twoMin)) clock = "2min";
    else if (!clock && qtr) clock = "q" + qtr;
    return {
      down: C.down != null ? +C.down : (C.dn != null ? +C.dn : null),
      dist: setField(C.dist || C.db || C.distBucket) ? String(C.dist || C.db || C.distBucket) : "",
      hash: setField(C.hash),
      zone: setField(C.zone || C.fieldZone),
      formation: setField(C.formation || C.form),
      formationDisplay: String(C.formation || C.form || "").trim(),
      score: score,
      clock: clock,
      opponent: setField(C.opponent)
    };
  }

  function rowScore(row) {
    if (!row) return "";
    if (row.scoreBucket) return setField(row.scoreBucket);
    var margin = row.scoreMargin != null ? +row.scoreMargin : (row.margin != null ? +row.margin : null);
    if (margin == null || !isFinite(margin)) return "";
    if (margin <= -8) return "trail8";
    if (margin < 0) return "trail";
    if (margin === 0) return "tied";
    return "lead";
  }

  function rowClock(row) {
    if (!row) return "";
    if (row.twoMinute || row.twoMin) return "2min";
    if (row.clockSec != null && +row.clockSec <= 120 && (row.qtr === 2 || row.qtr === 4)) return "2min";
    if (row.clock) return setField(row.clock);
    if (row.qtr != null && +row.qtr) return "q" + (+row.qtr);
    return "";
  }

  function formOf(row) { return setField(row && row.formation); }
  function hashOf(row) { return setField(row && (row.hash || row.fieldHash)); }
  function zoneOf(row) { return setField(row && (row.fieldZone || row.zone)); }

  function rungTest(id, row, c) {
    if (!row) return false;
    if (c.opponent && setField(row.opponent) && setField(row.opponent) !== c.opponent) return false;
    var downOk = c.down == null || +row.down === c.down;
    var distOk = !c.dist || rowDist(row) === c.dist;
    var formOk = !c.formation || formOf(row) === c.formation;
    var hashOk = !c.hash || hashOf(row) === c.hash;
    var zoneOk = !c.zone || zoneOf(row) === c.zone;
    if (id === 1) return downOk && distOk && formOk && hashOk && zoneOk;
    if (id === 2) return downOk && distOk && formOk;
    if (id === 3) return downOk && distOk;
    if (id === 4) return downOk && formOk;
    if (id === 5) return downOk;
    return true;
  }

  function rungWords(id, c) {
    var d = downWord(c.down);
    var dist = distWord(c.dist);
    if (id === 1) return [d && dist ? d + " & " + dist : (d || dist), c.formation, c.hash, c.zone].filter(Boolean).join(" · ");
    if (id === 2) return [d && dist ? d + " & " + dist : (d || dist), c.formation].filter(Boolean).join(" · ");
    if (id === 3) return d && dist ? d + " & " + dist : (d || dist || "situation");
    if (id === 4) return [d ? d + " down" : "", c.formation].filter(Boolean).join(" · ");
    if (id === 5) return d ? d + " down" : "down";
    return "all snaps";
  }

  function chooseSlice(rows, C) {
    var g = gates();
    var c = contextNorm(C);
    var pool = rows || [];
    var chosenId = 6;
    var chosen = pool.filter(function (r) { return rungTest(6, r, c); });
    var i;
    for (i = 1; i <= 6; i++) {
      var hit = pool.filter(function (r) { return rungTest(i, r, c); });
      if (i === 6 || hit.length >= g.MIN_SNAPS) {
        chosenId = i;
        chosen = hit;
        break;
      }
    }
    var modified = applyModifier(chosen, c, g.MIN_SNAPS);
    var from = "";
    if (chosenId > 1) {
      if (c.formation && chosenId > 2) from = c.formationDisplay || c.formation;
      else from = rungWords(1, c);
    }
    var words = rungWords(chosenId, c);
    var rungLabel = words + " · " + modified.rows.length + " snaps";
    if (chosenId > 1 && from) rungLabel = words + " · " + modified.rows.length + " snaps (widened from " + from + ")";
    if (modified.label) rungLabel = modified.label + " · " + rungLabel;
    return {
      rung: chosenId,
      n: modified.rows.length,
      widened: chosenId > 1,
      widenedFrom: from,
      words: words,
      rungLabel: rungLabel,
      modifier: modified.label || null,
      rows: modified.rows,
      context: c
    };
  }

  function applyModifier(rows, c, minSnaps) {
    function sub(pred) {
      return (rows || []).filter(pred);
    }
    var scoreHit = c.score ? sub(function (r) { return rowScore(r) === c.score; }) : [];
    var clockHit = c.clock ? sub(function (r) { return rowClock(r) === c.clock; }) : [];
    var both = (c.score && c.clock) ? sub(function (r) { return rowScore(r) === c.score && rowClock(r) === c.clock; }) : [];
    if (both.length >= minSnaps) return { rows: both, label: c.score + " · " + c.clock };
    if (scoreHit.length >= minSnaps) return { rows: scoreHit, label: c.score };
    if (clockHit.length >= minSnaps) return { rows: clockHit, label: c.clock };
    return { rows: rows || [], label: "" };
  }

  function lookKey(raw) {
    var c = String(raw == null ? "" : raw).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    if (!c || c === "?" || c === "any") return "";
    if (/cover\s*0|\bc\s*0\b|\bzero\b/.test(c)) return "C0";
    if (/cover\s*1|\bc\s*1\b/.test(c)) return "C1";
    if (/cover\s*2|\bc\s*2\b/.test(c)) return "C2";
    if (/cover\s*3|\bc\s*3\b/.test(c)) return "C3";
    if (/cover\s*4|\bc\s*4\b/.test(c)) return "C4";
    if (/2\s*man|two man/.test(c)) return "2MAN";
    return c.toUpperCase();
  }

  function playTypeOf(row) {
    var t = String((row && (row.playType || row.type || row.kind)) || "").toLowerCase();
    if (t === "pass" || t === "p") return "pass";
    if (t === "run" || t === "r") return "run";
    return "";
  }

  function isTonight(row) {
    if (!row) return false;
    if (row.live === true || row.tonight === true) return true;
    if (row.source === "live_call") return true;
    if (/^live\b/i.test(String(row.week || ""))) return true;
    return false;
  }

  function runPassShare(rows) {
    var runN = 0;
    var passN = 0;
    (rows || []).forEach(function (r) {
      var t = playTypeOf(r);
      if (t === "run") runN++;
      else if (t === "pass") passN++;
    });
    var n = runN + passN;
    return {
      n: n,
      runN: runN,
      passN: passN,
      runPct: n ? runN / n : 0,
      passPct: n ? passN / n : 0
    };
  }

  function distOf(rows, keyFn) {
    var counts = Object.create(null);
    var n = 0;
    (rows || []).forEach(function (r) {
      var k = keyFn(r);
      if (!k) return;
      counts[k] = (counts[k] || 0) + 1;
      n++;
    });
    var arr = Object.keys(counts).map(function (k) {
      return { key: k, n: counts[k], pct: n ? counts[k] / n : 0 };
    });
    arr.sort(function (a, b) { return b.n - a.n || (a.key < b.key ? -1 : 1); });
    return arr;
  }

  function confidence(n) {
    var Sit = global.OFFGRD_CALLER_SIT;
    if (Sit && Sit.confLevel) {
      var c = Sit.confLevel(n);
      if (c && c.level) return c.level;
    }
    if (n >= 15) return "HIGH";
    if (n >= 8) return "MEDIUM";
    return n >= 4 ? "LOW" : "THIN";
  }

  function tonightLine(allRows) {
    var g = gates();
    var season = runPassShare(allRows);
    var tonightRows = (allRows || []).filter(isTonight);
    var tonight = runPassShare(tonightRows);
    if (tonight.n < g.MIN_SNAPS || season.n < 1) return null;
    if (Math.abs(tonight.runPct - season.runPct) < 0.20) return null;
    var lean = tonight.runPct >= tonight.passPct ? "run" : "pass";
    var pct = Math.round((lean === "run" ? tonight.runPct : tonight.passPct) * 100);
    return {
      headline: "tonight " + pct + "% " + lean + " · " + tonight.n + " snaps",
      tonightN: tonight.n,
      tonightRunPct: tonight.runPct,
      seasonRunPct: season.runPct
    };
  }

  function predict(C, book, opts) {
    opts = opts || {};
    var slice = chooseSlice(book || [], C);
    var share = runPassShare(slice.rows);
    var coverage = distOf(slice.rows, function (r) { return lookKey(r.coverage || r.cov); });
    var fronts = distOf(slice.rows, function (r) {
      var f = setField(r.front);
      return f ? f.toUpperCase() : "";
    });
    var pressureN = 0;
    var pressureDen = 0;
    slice.rows.forEach(function (r) {
      if (r.pressure == null && r.blitz == null) return;
      pressureDen++;
      var p = r.pressure;
      var lab = String(r.blitz || p || "").toLowerCase();
      if (p === 1 || p === true || (lab && !/^(0|none|no|no blitz|no pressure|-)$/.test(lab))) pressureN++;
    });
    var leader = coverage[0] ? coverage[0].key : "";
    var runner = coverage[1] ? coverage[1].key : "";
    var lean = share.n ? (share.runPct >= share.passPct ? "run" : "pass") : "";
    var tonight = tonightLine(book || []);
    var runpass = {
      runPct: share.runPct,
      passPct: share.passPct,
      runN: share.runN,
      passN: share.passN,
      n: share.n,
      lean: lean,
      leanPct: share.n ? Math.round((lean === "pass" ? share.passPct : share.runPct) * 100) : 0
    };
    return {
      rung: slice.rung,
      n: slice.n,
      widened: slice.widened,
      widenedFrom: slice.widenedFrom,
      words: slice.words,
      rungLabel: tonight ? tonight.headline : slice.rungLabel,
      seasonLabel: slice.rungLabel,
      modifier: slice.modifier,
      slice: slice,
      runpass: runpass,
      coverage: coverage,
      leader: leader,
      runnerUp: runner,
      front: fronts[0] ? fronts[0].key : "",
      pressureRate: pressureDen ? pressureN / pressureDen : 0,
      confidence: confidence(slice.n),
      tonight: tonight
    };
  }

  function successOf(row, getSuccess) {
    if (getSuccess) {
      var v = getSuccess(row);
      if (v == null) return null;
      return +v ? 1 : 0;
    }
    if (!row || row.success == null || row.success === "") return null;
    return +row.success ? 1 : 0;
  }

  function statsOf(rows, getSuccess) {
    var n = 0;
    var hit = 0;
    var gainSum = 0;
    var gainN = 0;
    (rows || []).forEach(function (r) {
      var s = successOf(r, getSuccess);
      if (s == null) return;
      n++;
      hit += s;
      if (r.gain != null && isFinite(+r.gain)) {
        gainSum += +r.gain;
        gainN++;
      }
    });
    return { n: n, sr: n ? hit / n : 0, avg: gainN ? +(gainSum / gainN).toFixed(1) : null };
  }

  function playName(p) {
    if (!p) return "";
    if (typeof p === "string") return p;
    return String(p.name || p.play || "");
  }

  function kindOf(p) {
    var k = "";
    if (p && typeof p !== "string") k = p.kind || p.type || p.playType || "";
    if (/pass/i.test(k)) return "Pass";
    if (/run/i.test(k)) return "Run";
    return "";
  }

  function conceptScoreOf(p) {
    if (!p || typeof p === "string") return 0;
    if (p.conceptScore != null && isFinite(+p.conceptScore)) return +p.conceptScore;
    if (p.ev != null && isFinite(+p.ev)) return +p.ev;
    return 0;
  }

  function fmtAvg(avg) {
    if (avg == null || !isFinite(+avg)) return "";
    return (+avg).toFixed(1) + " avg";
  }

  function pct(sr) {
    return Math.round((+sr || 0) * 100);
  }

  function labelFor(e, slice, prediction, g) {
    if (e.tier >= 4) {
      return "no reps · concept match" + (prediction.leader ? " vs " + prediction.leader : "");
    }
    var avg = fmtAvg(e.tier === 1 ? e.avgLook : e.avgSit);
    var n = e.tier === 1 ? e.nLook : e.nSit;
    var sr = e.tier === 1 ? e.srLook : e.srSit;
    var bits = [pct(sr) + "%"];
    if (avg) bits.push(avg);
    bits.push(n + (n === 1 ? " snap" : " snaps"));
    if (e.tier === 1 && prediction.leader) bits.push("vs " + prediction.leader);
    else if (slice.words) bits.push(slice.words);
    var label = bits.join(" · ");
    if (e.tier !== 1 && e.nLook > 0 && e.nLook < g.MIN_SNAPS && prediction.leader) {
      label = "vs " + prediction.leader + ": " + e.nLook + " snaps · not enough — showing situational · " + label;
    }
    if (slice.widened && slice.widenedFrom) label += " (widened from " + slice.widenedFrom + ")";
    return label;
  }

  function rank(C, ownRows, prediction, plays, opts) {
    opts = opts || {};
    var g = gates();
    var getSuccess = opts.getSuccess || null;
    if (!prediction) prediction = predict(C, opts.book || [], opts);
    var slice = chooseSlice(ownRows || [], C);
    var leader = prediction.leader || "";
    var built = (plays || []).map(function (p) {
      var name = playName(p);
      var mine = (slice.rows || []).filter(function (r) {
        return r && String(r.play || "") === name;
      });
      var looked = leader ? mine.filter(function (r) { return lookKey(r.coverage || r.cov) === leader; }) : [];
      var sit = statsOf(mine, getSuccess);
      var look = statsOf(looked, getSuccess);
      var tier = 4;
      if (look.n >= g.MIN_SNAPS && look.sr >= g.SUCCESS_FLOOR) tier = 1;
      else if (sit.n >= g.MIN_SNAPS && sit.sr >= g.SUCCESS_FLOOR) tier = 2;
      else if (sit.n >= g.MIN_SNAPS) tier = 3;
      else if (sit.n > 0) tier = 3.5;
      return {
        play: name,
        kind: kindOf(p),
        tier: tier,
        nLook: look.n,
        srLook: look.sr,
        avgLook: look.avg,
        nSit: sit.n,
        srSit: sit.sr,
        avgSit: sit.avg,
        conceptScore: conceptScoreOf(p)
      };
    }).filter(function (e) { return e.play; });

    built.sort(function (a, b) {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.tier === 1) {
        return (b.srLook - a.srLook) || (b.nLook - a.nLook) || (a.play < b.play ? -1 : 1);
      }
      if (a.tier >= 4) {
        return (b.conceptScore - a.conceptScore) || (a.play < b.play ? -1 : 1);
      }
      return (b.srSit - a.srSit) || (b.nSit - a.nSit) || (a.play < b.play ? -1 : 1);
    });

    var cleared = built.filter(function (e) { return e.tier <= 3; });
    var thin = built.filter(function (e) { return e.tier === 3.5; });
    var concept = built.filter(function (e) { return e.tier >= 4; });
    var list = cleared.concat(thin);
    if (cleared.length < g.SHORTLIST_MIN) list = list.concat(concept);
    list = guarantee(list, g);

    list.forEach(function (e) {
      e.label = labelFor(e, slice, prediction, g);
      e.explain = e.play + " " + e.label;
      e.rung = slice.rung;
      e.n = e.tier === 1 ? e.nLook : e.nSit;
      e.widened = slice.widened;
    });

    return {
      list: list,
      hero: list[0] || null,
      shortlist: list.slice(0, g.SHORTLIST_MAX),
      slice: slice,
      prediction: prediction
    };
  }

  function guarantee(list, g) {
    var max = g.SHORTLIST_MAX;
    var head = list.slice(0, max);
    var rest = list.slice(max);
    function has(kind) {
      return head.some(function (e) { return e.kind === kind && e.nSit >= g.MIN_SNAPS; });
    }
    function pull(kind) {
      if (has(kind)) return;
      var idx = -1;
      var i;
      for (i = 0; i < rest.length; i++) {
        if (rest[i].kind === kind && rest[i].nSit >= g.MIN_SNAPS) { idx = i; break; }
      }
      if (idx < 0 || !head.length) return;
      var pulled = rest.splice(idx, 1)[0];
      var dropped = head[head.length - 1];
      head[head.length - 1] = pulled;
      rest.unshift(dropped);
    }
    pull("Run");
    pull("Pass");
    return head.concat(rest);
  }

  function orderCallerList(opts) {
    opts = opts || {};
    var entries = opts.entries || [];
    var byPlay = Object.create(null);
    entries.forEach(function (e) {
      if (e && e.play) byPlay[e.play] = e;
    });
    var plays = entries.map(function (e) {
      return {
        name: e.play,
        kind: e.kind,
        conceptScore: e.ev != null ? e.ev : (e.sr || 0)
      };
    });
    var prediction = predict(opts.context || {}, opts.book || [], opts);
    var ranked = rank(opts.context || {}, opts.own || [], prediction, plays, opts);
    var out = [];
    ranked.list.forEach(function (r) {
      var e = byPlay[r.play];
      if (!e) return;
      var copy = {};
      var k;
      for (k in e) if (Object.prototype.hasOwnProperty.call(e, k)) copy[k] = e[k];
      copy.engineTier = r.tier;
      copy.engineLabel = r.label;
      copy.engineExplain = r.explain;
      copy.n = r.n;
      copy.empSr = r.tier === 1 ? r.srLook : r.srSit;
      copy.avg = r.tier === 1 ? r.avgLook : r.avgSit;
      if (r.tier >= 4) {
        copy.basis = "on_paper";
        copy.basisLabel = r.label;
        copy.n = 0;
      } else {
        copy.basis = "empirical";
        copy.basisLabel = r.label;
      }
      out.push(copy);
    });
    var slice = ranked.slice || {};
    return {
      list: out,
      hero: out[0] || null,
      shortlist: out.slice(0, gates().SHORTLIST_MAX),
      prediction: prediction,
      rung: slice.rung,
      widened: !!slice.widened,
      sampleN: slice.n || 0,
      rungLabel: slice.rungLabel || ""
    };
  }

  var API = {
    SHORTLIST_MIN: SHORTLIST_MIN,
    gates: gates,
    distBucket: distBucket,
    lookKey: lookKey,
    chooseSlice: chooseSlice,
    predict: predict,
    rank: rank,
    orderCallerList: orderCallerList
  };

  global.OFFGRD_PREDICT = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
