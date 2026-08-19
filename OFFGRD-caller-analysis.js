/**
 * OFFGRD caller analysis — shared stats engine for O + D Caller.
 *
 * Numbers from the engine. Words from templates (LLM later).
 * Fold stays a flat snap log; drives are a pure view over it (derive, don't stamp).
 *
 *   window.OFFGRD_CALLER_ANALYSIS
 */
(function (global) {
  "use strict";

  function Out() {
    return global.OFFGRD_CALLER_OUTCOME || null;
  }

  function dbToNum(db) {
    var O = Out();
    if (O && O.dbToNum) return O.dbToNum(db);
    if (db === "GOAL") return 3;
    if (db === "1-3") return 2;
    if (db === "4-6") return 5;
    if (db === "7-9") return 8;
    if (db === "10+") return 10;
    return null;
  }

  function stResultInfo(id) {
    var O = Out();
    if (O && O.stResultInfo) return O.stResultInfo(id);
    return null;
  }

  function isTwoptResult(id) {
    var O = Out();
    if (O && O.isTwoptResult) return O.isTwoptResult(id);
    return id === "twopt_good" || id === "twopt_no";
  }

  function isSpecialType(pt) {
    var O = Out();
    if (O && O.isSpecialType) return O.isSpecialType(pt);
    return pt === "fg" || pt === "punt" || pt === "xp";
  }

  function isGraded(e) {
    return !!(e && e.result != null && e.result !== "");
  }

  /** Negated / penalty — must not end a drive (called-back TD). */
  function isNegated(e) {
    if (!e) return false;
    if (e.negated) return true;
    var O = Out();
    if (O && O.isPenaltyFlag && O.isPenaltyFlag(e.flag)) return true;
    return false;
  }

  function isTrySnap(e) {
    if (!e) return false;
    if (e.forTwo) return true;
    if (e.playType === "xp") return true;
    if (isTwoptResult(e.result)) return true;
    var sit = String(e.sitTxt || "").toLowerCase();
    if (sit === "2-pt" || sit === "after td") return true;
    return false;
  }

  function isFakeConverted(e) {
    var st = stResultInfo(e && e.result);
    return !!(st && st.spec && st.spec.fakeConverted);
  }

  /**
   * Does this graded, non-negated snap end the current possession?
   * Reuses the same possession semantics as inferNextSituation.
   */
  function possessionEnd(e) {
    if (!isGraded(e) || isNegated(e)) return null;

    if (e.result === "safety") return "safety";
    if (e.result === "turnover") return "turnover";
    if (e.result === "def_td") return "def_td";

    if (isTwoptResult(e.result)) return "after_try";
    if (e.playType === "xp" || (stResultInfo(e.result) && stResultInfo(e.result).kind === "xp")) {
      return "after_try";
    }

    if (e.result === "td") return "td"; /* caller keeps drive open for try */

    var st = stResultInfo(e.result);
    var stKind = isSpecialType(e.playType)
      ? e.playType
      : st && st.kind !== "twopt"
        ? st.kind
        : null;
    if (stKind === "punt" || stKind === "fg") {
      if (isFakeConverted(e)) return null; /* keep possession */
      return "change_of_possession";
    }

    /* Turnover on downs: 4th down, did not convert, not a score/TO/ST. */
    if (+e.dn === 4) {
      var gain = e.gain;
      var O4 = Out();
      var dist =
        O4 && O4.seedEstYards
          ? O4.seedEstYards(e)
          : dbToNum(e.db);
      if (gain != null && !isNaN(+gain) && +gain < dist) {
        return "turnover_on_downs";
      }
    }

    return null;
  }

  function newDrive(index) {
    return {
      index: index,
      snaps: [],
      endReason: null,
      truncated: false,
      open: true,
      label: null,
    };
  }

  /**
   * Pure drive view over a folded caller log.
   * @param {Array} log — fold entries (either side)
   * @param {Object} [opts]
   * @param {Array<{kind:string, afterPlayIndex:number}>} [opts.breaks] — coach marks
   */
  function deriveDrives(log, opts) {
    opts = opts || {};
    var breaks = Array.isArray(opts.breaks) ? opts.breaks.slice() : [];
    breaks.sort(function (a, b) {
      return (+a.afterPlayIndex || 0) - (+b.afterPlayIndex || 0);
    });

    var entries = (log || [])
      .filter(function (e) {
        return e && e.playIndex != null;
      })
      .slice()
      .sort(function (a, b) {
        return a.playIndex - b.playIndex;
      });

    var drives = [];
    var open = null;
    var pendingTry = false;
    var driveIx = 0;

    function close(reason, truncated, label) {
      if (!open) return;
      open.endReason = reason || null;
      open.truncated = !!truncated;
      open.open = false;
      open.label = label || null;
      if (truncated && !open.label) {
        open.label =
          reason === "half"
            ? "drive in progress at half"
            : reason === "quarter"
              ? "drive in progress at quarter"
              : "drive in progress";
      }
      drives.push(open);
      open = null;
      pendingTry = false;
    }

    function applyBreaksAfter(playIndex) {
      var i;
      for (i = 0; i < breaks.length; i++) {
        var br = breaks[i];
        if (br._done) continue;
        if (+br.afterPlayIndex === +playIndex) {
          br._done = true;
          if (open) {
            close(br.kind || "break", true, null);
          }
        }
      }
    }

    var ei;
    for (ei = 0; ei < entries.length; ei++) {
      var e = entries[ei];

      /* Skip-try: next non-try snap starts a new drive; close score drive first. */
      if (open && pendingTry && !isTrySnap(e)) {
        close("after_td", false, null);
      }

      if (!open) {
        open = newDrive(driveIx++);
      }
      open.snaps.push(e);

      if (isGraded(e) && !isNegated(e)) {
        if (e.result === "td") {
          pendingTry = true;
        } else if (pendingTry && isTrySnap(e)) {
          close("after_try", false, null);
        } else {
          var end = possessionEnd(e);
          if (end === "td") {
            pendingTry = true;
          } else if (end) {
            close(end, false, null);
          }
        }
      }

      applyBreaksAfter(e.playIndex);
    }

    if (open) {
      open.open = true;
      open.endReason = null;
      drives.push(open);
    }

    return drives;
  }

  /* ---------- Shared tendency shift (same function as live D Expect strip) ---------- */

  function passShare(rows) {
    if (!rows || !rows.length) return null;
    var known = rows.filter(function (r) {
      var pt = String(r.playType || r.ptype || "").toLowerCase();
      return pt.indexOf("pass") >= 0 || pt.indexOf("run") >= 0;
    });
    if (!known.length) return null;
    var passes = known.filter(function (r) {
      return String(r.playType || r.ptype || "")
        .toLowerCase()
        .indexOf("pass") >= 0;
    }).length;
    return passes / known.length;
  }

  /**
   * Tendency shift: tonight vs season in this bucket.
   * Requires ≥3 live & ≥3 season; surfaces when |delta| ≥ 25pp.
   * MUST stay identical to the live Expect strip (D Caller).
   */
  function tendencyShift(sample) {
    sample = sample || {};
    var live = sample.live || [];
    var season = sample.season || [];
    if (live.length < 3 || season.length < 3) return null;
    var livePass = passShare(live);
    var seasonPass = passShare(season);
    if (livePass == null || seasonPass == null) return null;
    var delta = livePass - seasonPass;
    if (Math.abs(delta) < 0.25) return null;
    return {
      livePass: livePass,
      seasonPass: seasonPass,
      liveN: live.length,
      seasonN: season.length,
      tonightLean: livePass >= 0.5 ? "pass" : "run",
      seasonLean: seasonPass >= 0.5 ? "pass" : "run",
      delta: delta,
    };
  }

  /* ---------- Deterministic templates (no LLM) ---------- */

  function fmtPct(p) {
    if (p == null || isNaN(+p)) return "—";
    return Math.round(+p * 100) + "%";
  }

  function yardsSum(snaps) {
    var t = 0;
    var n = 0;
    (snaps || []).forEach(function (s) {
      if (s.gain != null && !isNaN(+s.gain) && !isNegated(s)) {
        t += +s.gain;
        n++;
      }
    });
    return { yards: t, n: n };
  }

  function topPlay(snaps) {
    var counts = {};
    (snaps || []).forEach(function (s) {
      if (!s.play || isTrySnap(s) || isSpecialType(s.playType)) return;
      counts[s.play] = (counts[s.play] || 0) + 1;
    });
    var best = null;
    var bestN = 0;
    Object.keys(counts).forEach(function (k) {
      if (counts[k] > bestN) {
        bestN = counts[k];
        best = k;
      }
    });
    return best ? { play: best, n: bestN } : null;
  }

  function endLabel(drive) {
    if (!drive) return "";
    if (drive.truncated && drive.label) return drive.label;
    var r = drive.endReason;
    if (r === "after_try" || r === "after_td") return "score";
    if (r === "turnover_on_downs") return "turnover on downs";
    if (r === "change_of_possession") return "punt/FG";
    if (r === "turnover") return "turnover";
    if (r === "safety") return "safety";
    if (r === "def_td") return "defensive score";
    if (drive.open) return "in progress";
    return r || "end";
  }

  /**
   * Drive summary — ≤3 lines, template-only (attention budget ~40s).
   * side: 'offense' | 'defense'
   */
  function driveTemplate(drive, side) {
    if (!drive || !drive.snaps || !drive.snaps.length) {
      return { lines: [], facts: {} };
    }
    side = side || drive.snaps[0].side || "offense";
    var snaps = drive.snaps;
    var y = yardsSum(snaps);
    var top = topPlay(snaps);
    var result = endLabel(drive);
    var plays = snaps.length;
    var facts = {
      plays: plays,
      yards: y.yards,
      yardsN: y.n,
      result: result,
      topPlay: top ? top.play : null,
      topPlayN: top ? top.n : 0,
      truncated: !!drive.truncated,
      side: side,
    };

    var line1 =
      (side === "defense" ? "Their drive" : "Drive") +
      ": " +
      plays +
      " play" +
      (plays === 1 ? "" : "s") +
      (y.n ? " · " + y.yards + " yd" + (side === "defense" ? " allowed" : "") : "") +
      " · " +
      result;

    var line2 = "";
    if (top) {
      line2 =
        side === "defense"
          ? "They leaned " + top.play + " (" + top.n + ")"
          : "Moved it with " + top.play + " (" + top.n + ")";
    } else if (drive.truncated) {
      line2 = "Truncated at break — still open when marked.";
    }

    var line3 = "";
    if (drive.truncated) {
      line3 = drive.label || "drive in progress at break";
    }

    var lines = [line1];
    if (line2) lines.push(line2);
    if (line3 && line3 !== line2) lines.push(line3);
    return { lines: lines.slice(0, 3), facts: facts };
  }

  /**
   * Quarter summary — 5–6 lines from an offense log + optional defense log.
   * v1: playType + concept (O); coverage/front/pressure (D). No family taxonomy.
   * Formations: season-only note when live formation absent.
   */
  function quarterTemplate(opts) {
    opts = opts || {};
    var oLog = opts.offenseLog || [];
    var dLog = opts.defenseLog || [];
    var quarter = opts.quarter != null ? opts.quarter : "?";
    var shift = opts.shift || null;
    var lines = [];
    var facts = { quarter: quarter, offenseN: oLog.length, defenseN: dLog.length };

    lines.push("Q" + quarter + " · " + oLog.length + " O snaps · " + dLog.length + " D snaps");

    var oPass = passShare(oLog);
    var dPass = passShare(dLog);
    if (oPass != null) {
      facts.oPass = oPass;
      facts.oPassN = oLog.length;
      lines.push("O run/pass: " + fmtPct(1 - oPass) + " / " + fmtPct(oPass) + " (n=" + oLog.length + ")");
    }
    if (dPass != null) {
      facts.dPass = dPass;
      facts.dPassN = dLog.length;
      lines.push(
        "They run/pass: " + fmtPct(1 - dPass) + " / " + fmtPct(dPass) + " (n=" + dLog.length + ")"
      );
    }

    var o3 = oLog.filter(function (e) {
      return +e.dn === 3 && isGraded(e) && !isNegated(e);
    });
    if (o3.length) {
      var o3ok = o3.filter(function (e) {
        return e.success === 1 || (e.gain != null && +e.gain >= dbToNum(e.db));
      }).length;
      facts.o3 = { ok: o3ok, n: o3.length };
      lines.push("O 3rd down: " + o3ok + "/" + o3.length);
    }

    var chunks = dLog.filter(function (e) {
      return e.isChunk || e.result === "chunk" || e.result === "explosive";
    });
    if (dLog.length) {
      facts.chunksAgainst = chunks.length;
      lines.push("Chunks allowed: " + chunks.length + " (n=" + dLog.length + ")");
    }

    if (shift) {
      facts.shift = {
        tonightLean: shift.tonightLean,
        livePass: shift.livePass,
        seasonPass: shift.seasonPass,
        liveN: shift.liveN,
        seasonN: shift.seasonN,
      };
      lines.push(
        "Shift: tonight " +
          fmtPct(shift.livePass) +
          " pass (n=" +
          shift.liveN +
          ") · season " +
          fmtPct(shift.seasonPass) +
          " (n=" +
          shift.seasonN +
          ")"
      );
    }

    lines.push("Formations: season data (live snaps have no formation tags)");

    return { lines: lines.slice(0, 6), facts: facts };
  }

  function conceptLabel(c) {
    var O = Out();
    if (O && O.conceptLabel) {
      var lab = O.conceptLabel(c);
      if (lab) return lab;
    }
    if (c === "didnt_work") return "didn't work";
    if (c === "worked_untested") return "worked, untested";
    if (c === "worked") return "worked";
    return c ? String(c).replace(/_/g, " ") : "";
  }

  function playTypeLabel(pt) {
    if (!pt) return "?";
    var s = String(pt);
    if (/^twopt$/i.test(s) || /^2[- ]?pt$/i.test(s)) return "2-pt";
    if (/^pass$/i.test(s)) return "Pass";
    if (/^run$/i.test(s)) return "Run";
    return s;
  }

  /**
   * Group O snaps by playType + concept (v1 — no family taxonomy).
   * Group D snaps by coverage / front / pressure.
   */
  function groupRates(log, side) {
    var groups = {};
    (log || []).forEach(function (e) {
      if (!isGraded(e) || isNegated(e) || isTrySnap(e)) return;
      if (isSpecialType(e.playType)) return;
      var key;
      if (side === "defense") {
        key = [e.coverage || "?", e.front || "?", e.pressure || "none"].join(" · ");
      } else {
        var conceptRaw = e.conceptOverride || e.concept || "";
        var concept = conceptLabel(conceptRaw) || "—";
        key = [playTypeLabel(e.playType), concept].join(" · ");
      }
      if (!groups[key]) groups[key] = { key: key, n: 0, success: 0, chunks: 0, yards: 0, yardsN: 0 };
      groups[key].n++;
      if (e.success === 1 || (side === "defense" && e.isStop)) groups[key].success++;
      if (e.isChunk || e.result === "chunk" || e.result === "explosive") groups[key].chunks++;
      if (e.gain != null && !isNaN(+e.gain)) {
        groups[key].yards += +e.gain;
        groups[key].yardsN++;
      }
    });
    return Object.keys(groups)
      .map(function (k) {
        return groups[k];
      })
      .sort(function (a, b) {
        return b.n - a.n;
      });
  }

  /**
   * Reorder the same groupRates rows — never re-aggregate.
   * mode: volume | working_o | working_d | held | beating_o | beating_d
   */
  function rankCallFamilies(groups, mode) {
    var rows = (groups || []).slice();
    function rate(g, kind) {
      if (!g || !g.n) return 0;
      if (kind === "success") return g.success / g.n;
      if (kind === "chunks") return g.chunks / g.n;
      return 0;
    }
    rows.sort(function (a, b) {
      var d = 0;
      if (mode === "working_o") d = rate(b, "success") - rate(a, "success");
      else if (mode === "working_d" || mode === "held") d = rate(a, "chunks") - rate(b, "chunks");
      else if (mode === "beating_o") d = rate(a, "success") - rate(b, "success");
      else if (mode === "beating_d") d = rate(b, "chunks") - rate(a, "chunks");
      else d = (b.n || 0) - (a.n || 0); /* volume — panel default */
      if (d !== 0) return d;
      return (b.n || 0) - (a.n || 0);
    });
    return rows;
  }

  function ypaOf(g) {
    if (!g || !g.yardsN) return null;
    return +(g.yards / g.yardsN).toFixed(1);
  }

  function thinN(n) {
    return !n || n < 3;
  }

  /**
   * Booth Tier-1 chip → 2–4 template lines from the same facts the panel uses.
   * payload: { side:"offense"|"defense", offenseLog, defenseLog, shifts, topForm?:{label,pct,n} }
   */
  function boothChipAnswer(chipId, payload) {
    payload = payload || {};
    var side = payload.side === "offense" ? "offense" : "defense";
    var oLog = payload.offenseLog || [];
    var dLog = payload.defenseLog || [];
    var shifts = payload.shifts || [];
    var lines = [];
    var thinFlags = [];

    function pushLine(text, n) {
      lines.push(String(text));
      thinFlags.push(thinN(n));
    }

    if (chipId === "working") {
      if (side === "offense") {
        var oRank = rankCallFamilies(groupRates(oLog, "offense"), "working_o").slice(0, 3);
        if (!oRank.length) pushLine("Not enough graded O snaps yet.", 0);
        oRank.forEach(function (g) {
          pushLine(g.key + ": " + g.success + "/" + g.n + " success (n=" + g.n + ")", g.n);
        });
      } else {
        var dRank = rankCallFamilies(groupRates(dLog, "defense"), "working_d").slice(0, 3);
        if (!dRank.length) pushLine("Not enough graded D snaps yet.", 0);
        dRank.forEach(function (g) {
          var y = ypaOf(g);
          pushLine(
            g.key +
              " held them" +
              (y != null ? " to " + y + " yds/att" : "") +
              " · " +
              g.chunks +
              "/" +
              g.n +
              " chunks (n=" +
              g.n +
              ")",
            g.n
          );
        });
      }
    } else if (chipId === "beating") {
      if (side === "offense") {
        var oBad = rankCallFamilies(groupRates(oLog, "offense"), "beating_o").slice(0, 3);
        if (!oBad.length) pushLine("Not enough graded O snaps yet.", 0);
        oBad.forEach(function (g) {
          pushLine(g.key + ": " + g.success + "/" + g.n + " success — cold (n=" + g.n + ")", g.n);
        });
      } else {
        var dBad = rankCallFamilies(groupRates(dLog, "defense"), "beating_d").slice(0, 3);
        if (!dBad.length) pushLine("Not enough graded D snaps yet.", 0);
        dBad.forEach(function (g) {
          pushLine(
            g.key + ": " + g.chunks + "/" + g.n + " chunks allowed (n=" + g.n + ")",
            g.n
          );
        });
      }
    } else if (chipId === "third") {
      var o3 = oLog.filter(function (e) {
        return +e.dn === 3 && isGraded(e) && !isNegated(e);
      });
      var d3 = dLog.filter(function (e) {
        return +e.dn === 3 && isGraded(e) && !isNegated(e);
      });
      if (o3.length) {
        var o3ok = o3.filter(function (e) {
          return e.success === 1 || (e.gain != null && +e.gain >= dbToNum(e.db));
        }).length;
        pushLine("O 3rd down: " + o3ok + "/" + o3.length + " (n=" + o3.length + ")", o3.length);
      }
      if (d3.length) {
        var d3stop = d3.filter(function (e) {
          return e.isStop || e.success === 1 || (e.gain != null && +e.gain < dbToNum(e.db));
        }).length;
        pushLine("D 3rd down stops: " + d3stop + "/" + d3.length + " (n=" + d3.length + ")", d3.length);
      }
      var thirdShift = null;
      shifts.forEach(function (row) {
        if (row && /3rd/i.test(String(row.bucket || "")) && row.shift) thirdShift = row;
      });
      if (thirdShift && thirdShift.shift) {
        var s = thirdShift.shift;
        pushLine(
          "3rd tonight " +
            fmtPct(s.livePass) +
            " pass (n=" +
            s.liveN +
            ") · season " +
            fmtPct(s.seasonPass) +
            " (n=" +
            s.seasonN +
            ") — lean " +
            s.tonightLean,
          s.liveN
        );
      }
      if (!lines.length) pushLine("No 3rd-down snaps logged yet.", 0);
    } else if (chipId === "best_look") {
      /* Option A: stacked season form + unfiltered held — not a fake join. */
      var tf = payload.topForm || null;
      if (tf && tf.label) {
        pushLine(
          "Their top look (season): " +
            tf.label +
            (tf.pct != null ? " " + Math.round(tf.pct * 100) + "%" : "") +
            (tf.n != null ? " (n=" + tf.n + ")" : ""),
          tf.n
        );
      } else {
        pushLine("Their top look (season): no formation tags in scout yet.", 0);
      }
      var heldRows = rankCallFamilies(
        groupRates(dLog, "defense").filter(function (g) {
          return g.n >= 1;
        }),
        "held"
      ).slice(0, 2);
      if (!heldRows.length) {
        pushLine("Tonight's held calls: need graded D snaps.", 0);
      } else {
        heldRows.forEach(function (g) {
          var y = ypaOf(g);
          pushLine(
            "Tonight's held calls: " +
              g.key +
              (y != null ? " — " + y + " yds/att" : "") +
              " (n=" +
              g.n +
              ")",
            g.n
          );
        });
      }
    } else if (chipId === "leaning") {
      /* Unweighted — match panel what_they (recency = Sept). */
      var dPass = passShare(dLog);
      if (dPass != null) {
        pushLine(
          "They run/pass: " + fmtPct(1 - dPass) + " / " + fmtPct(dPass) + " (n=" + dLog.length + ")",
          dLog.length
        );
      }
      ["1st", "2nd short", "2nd long", "3rd"].forEach(function (bucket) {
        if (lines.length >= 4) return;
        var snaps = dLog.filter(function (e) {
          return isGraded(e) && !isNegated(e) && !isTrySnap(e) && downBucket(e) === bucket;
        });
        var ps = passShare(snaps);
        if (ps != null && snaps.length >= 2) {
          pushLine(bucket + ": " + fmtPct(1 - ps) + " / " + fmtPct(ps) + " (n=" + snaps.length + ")", snaps.length);
        }
      });
      var dirCounts = {};
      dLog.forEach(function (e) {
        if (!e.theirDirection || isNegated(e)) return;
        dirCounts[e.theirDirection] = (dirCounts[e.theirDirection] || 0) + 1;
      });
      var topDir = Object.keys(dirCounts).sort(function (a, b) {
        return dirCounts[b] - dirCounts[a];
      })[0];
      if (topDir && lines.length < 4) {
        pushLine("Direction lean: " + topDir + " (n=" + dirCounts[topDir] + ")", dirCounts[topDir]);
      }
      if (!lines.length) pushLine("No graded D snaps yet.", 0);
    } else if (chipId === "redzone") {
      var rz = function (e) {
        return e.zone === "RZ" || e.zone === "red" || /red/i.test(String(e.zone || ""));
      };
      var oRz = oLog.filter(function (e) {
        return rz(e) && isGraded(e) && !isNegated(e);
      });
      var dRz = dLog.filter(function (e) {
        return rz(e) && isGraded(e) && !isNegated(e);
      });
      if (!oRz.length && !dRz.length) {
        pushLine("No red-zone snaps logged yet.", 0);
      } else {
        pushLine("Red zone: O " + oRz.length + " snaps · D " + dRz.length + " snaps", oRz.length + dRz.length);
      }
    } else if (chipId === "drives") {
      /* Tier-3 Final — drive chart facts (same deriveDrives as finalTemplate). */
      var br = payload.breaks || [];
      var oBr = payload.offenseBreaks || br;
      var oDr = oLog.length ? driveChart(oLog, oBr) : [];
      var dDr = dLog.length ? driveChart(dLog, br) : [];
      if (!oDr.length && !dDr.length) {
        pushLine("No drives derived yet.", 0);
      } else {
        if (oDr.length) {
          var oYd = 0;
          oDr.forEach(function (d) {
            oYd += d.yards || 0;
          });
          pushLine("O drives: " + oDr.length + " · " + oYd + " yd (n=" + oDr.length + ")", oDr.length);
          oDr.slice(0, 2).forEach(function (d, i) {
            if (lines.length >= 4) return;
            pushLine(
              "  O" +
                (i + 1) +
                ": " +
                d.plays +
                " plays · " +
                d.yards +
                " yd · " +
                (d.label || d.endReason || "end"),
              d.plays
            );
          });
        }
        if (dDr.length && lines.length < 4) {
          var dYd = 0;
          dDr.forEach(function (d) {
            dYd += d.yards || 0;
          });
          pushLine("D series: " + dDr.length + " · " + dYd + " yd allowed (n=" + dDr.length + ")", dDr.length);
        }
      }
    } else if (chipId === "turnovers") {
      var turns = turnoverSummary(oLog, dLog);
      if (!turns.total) {
        pushLine("No turnovers / TOD / safeties logged.", 0);
      } else {
        Object.keys(turns.byKind || {}).forEach(function (k) {
          if (lines.length >= 4) return;
          pushLine(k.replace(/_/g, " ") + ": " + turns.byKind[k], turns.byKind[k]);
        });
        if (lines.length < 4) {
          pushLine("Total possession changes: " + turns.total + " (n=" + turns.total + ")", turns.total);
        }
      }
    } else {
      pushLine("Unknown chip.", 0);
    }

    /* Final context: if room, append one drive-count line (same numbers as Final chart). */
    if (payload.context === "final" && lines.length < 4 && chipId !== "drives" && chipId !== "turnovers") {
      var ff = payload.finalFacts || {};
      var fd = (ff.drives && ff.drives.defense) || [];
      var fo = (ff.drives && ff.drives.offense) || [];
      if (fo.length || fd.length) {
        pushLine(
          "Game: " +
            (fo.length ? fo.length + " O drives" : "") +
            (fo.length && fd.length ? " · " : "") +
            (fd.length ? fd.length + " D series" : "") +
            " (n=" +
            (fo.length + fd.length) +
            ")",
          fo.length + fd.length
        );
      }
    }

    return {
      chipId: chipId,
      lines: lines.slice(0, 4),
      thin: thinFlags.slice(0, 4),
    };
  }

  /** Chip catalog — six live intents; Final adds drive/turnover chips. */
  function boothChipDefs(side, opts) {
    opts = opts || {};
    var isO = side === "offense";
    var defs = [
      { id: "working", label: isO ? "What's working?" : "What's working?" },
      { id: "beating", label: isO ? "What's cold?" : "What's beating us?" },
      { id: "third", label: "3rd down tonight?" },
      { id: "best_look", label: isO ? "Best look vs their top" : "Best look vs their top" },
      { id: "leaning", label: isO ? "What are they leaning on?" : "What are they leaning on?" },
      { id: "redzone", label: "Red zone?" },
    ];
    if (opts.context === "final") {
      defs.push({ id: "drives", label: "Drive chart?" });
      defs.push({ id: "turnovers", label: "Turnovers?" });
    }
    return defs;
  }

  function downBucket(e) {
    if (!e) return "other";
    var dn = +e.dn;
    var dist = dbToNum(e.db);
    if (dn === 1) return "1st";
    if (dn === 2) return dist >= 7 ? "2nd long" : "2nd short";
    if (dn === 3) return "3rd";
    if (dn === 4) return "4th";
    return "other";
  }

  function flagLabel(id) {
    var O = Out();
    if (O && O.flagLabel) return O.flagLabel(id);
    return id || "";
  }

  function tagRollup(log) {
    var counts = {};
    (log || []).forEach(function (e) {
      if (!e || isNegated(e)) return;
      var flags = Array.isArray(e.flags) ? e.flags : e.flag ? [e.flag] : [];
      flags.forEach(function (f) {
        if (!f) return;
        counts[f] = (counts[f] || 0) + 1;
      });
    });
    return Object.keys(counts)
      .map(function (id) {
        return { id: id, label: flagLabel(id), n: counts[id] };
      })
      .sort(function (a, b) {
        return b.n - a.n;
      });
  }

  function shiftLine(bucket, shift) {
    if (!shift) return "";
    var head = bucket ? bucket + " — " : "";
    return (
      head +
      "tonight " +
      fmtPct(shift.livePass) +
      " pass (n=" +
      shift.liveN +
      ") · season " +
      fmtPct(shift.seasonPass) +
      " (n=" +
      shift.seasonN +
      ")"
    );
  }

  /** Live panel line — string or {text,badge,low,n}. LOW when n<3. */
  function liveLine(text, nOrOpts) {
    var opts =
      nOrOpts != null && typeof nOrOpts === "object" && !Array.isArray(nOrOpts)
        ? nOrOpts
        : { n: nOrOpts };
    var n = opts.n;
    var low = !!opts.low || (n != null && n < 3);
    var o = { text: String(text == null ? "" : text) };
    if (n != null) o.n = n;
    if (low) {
      o.low = true;
      o.badge = "LOW";
    }
    return o;
  }

  function lineText(ln) {
    if (ln == null) return "";
    if (typeof ln === "string") return ln;
    return ln.text != null ? String(ln.text) : "";
  }

  function normalizeSectionLines(sec) {
    if (!sec || !sec.lines) return sec;
    sec.lines = sec.lines.map(function (ln) {
      if (typeof ln === "string") return liveLine(ln);
      if (ln && typeof ln === "object" && ln.text != null) return ln;
      return liveLine(String(ln));
    });
    return sec;
  }

  function coverFamilyOf(cov) {
    var M = global.OFFGRD_MATCHUP;
    if (M && typeof M.familyOf === "function") {
      try {
        return M.familyOf(cov);
      } catch (e) {}
    }
    if (cov == null || cov === "") return null;
    var l = String(cov).toLowerCase();
    var m = l.match(/cover\s*([0-6])|cov\s*([0-6])|\bc\s*([0-6])\b/);
    if (m) {
      var n = m[1] || m[2] || m[3];
      if (n === "0") return "C0";
      if (n === "1") return "C1";
      if (n === "2") return "C2";
      if (n === "3" || n === "5") return "C3";
      if (n === "4" || n === "6") return "C4";
    }
    if (/quarter/.test(l)) return "C4";
    if (/\bman\b/.test(l)) return "C1";
    return null;
  }

  /** Histogram of coverage / front / pressure on graded O snaps. */
  function lookFieldMix(log, field) {
    var counts = {};
    var tagged = 0;
    var graded = 0;
    (log || []).forEach(function (e) {
      if (!isGraded(e) || isNegated(e) || isTrySnap(e) || isSpecialType(e.playType)) return;
      graded++;
      var v = e[field];
      if (v == null || v === "" || v === "?") return;
      if (field === "pressure" && (v === "none" || v === 0 || v === "0")) return;
      tagged++;
      var key = String(v);
      counts[key] = (counts[key] || 0) + 1;
    });
    var rows = Object.keys(counts)
      .map(function (k) {
        return { k: k, n: counts[k], pct: tagged ? counts[k] / tagged : 0, fam: coverFamilyOf(k) };
      })
      .sort(function (a, b) {
        return b.n - a.n;
      });
    return {
      rows: rows,
      tagged: tagged,
      graded: graded,
      rate: graded ? tagged / graded : 0,
    };
  }

  /** tonight covDist shape for matchup.rankPlaysByEv / normalizeCovDist. */
  function tonightCovDistFromLog(log) {
    var mix = lookFieldMix(log, "coverage");
    if (!mix.tagged) return { arr: [] };
    var byFam = {};
    mix.rows.forEach(function (r) {
      var fam = r.fam || r.k;
      if (!fam) return;
      byFam[fam] = (byFam[fam] || 0) + r.pct;
    });
    var arr = Object.keys(byFam).map(function (fam) {
      return { k: fam, fam: fam, pct: byFam[fam] };
    });
    var tot = arr.reduce(function (s, a) {
      return s + a.pct;
    }, 0);
    if (tot > 0) {
      arr.forEach(function (a) {
        a.pct = a.pct / tot;
      });
    }
    return { arr: arr };
  }

  function seasonPctForFam(seasonCovDist, fam, label) {
    if (!seasonCovDist || !fam) return null;
    var arr = Array.isArray(seasonCovDist)
      ? seasonCovDist
      : seasonCovDist.arr || [];
    for (var i = 0; i < arr.length; i++) {
      var a = arr[i];
      if (!a) continue;
      var af = a.fam || coverFamilyOf(a.k) || a.k;
      if (af === fam || a.k === label || a.k === fam) return +a.pct;
    }
    return null;
  }

  function groupRatesByPlay(log) {
    var groups = {};
    (log || []).forEach(function (e) {
      if (!isGraded(e) || isNegated(e) || isTrySnap(e)) return;
      if (isSpecialType(e.playType)) return;
      var key = e.play ? String(e.play) : "?";
      if (!groups[key]) groups[key] = { key: key, n: 0, success: 0, yards: 0, yardsN: 0 };
      groups[key].n++;
      if (e.success === 1 || (e.gain != null && +e.gain >= dbToNum(e.db))) groups[key].success++;
      if (e.gain != null && !isNaN(+e.gain)) {
        groups[key].yards += +e.gain;
        groups[key].yardsN++;
      }
    });
    return Object.keys(groups)
      .map(function (k) {
        return groups[k];
      })
      .sort(function (a, b) {
        return b.n - a.n;
      });
  }

  function playRateLine(g) {
    var sr = g.n ? g.success / g.n : 0;
    var ypa = g.yardsN > 0 ? (g.yards / g.yardsN).toFixed(1) : "—";
    return liveLine(
      g.key + " · " + fmtPct(sr) + " success · " + ypa + " yds · n=" + g.n,
      g.n
    );
  }

  /**
   * Strong drive-end signals for feed inference (deterministic).
   * Returns { kind: score|takeaway|downs, label, playIndex } or null.
   */
  function inferDriveEndFromSnap(e) {
    if (!e || !isGraded(e) || isNegated(e)) return null;
    var pi = e.playIndex != null ? e.playIndex : null;
    if (e.result === "td" || e.result === "safety") {
      return { kind: "score", label: e.result === "safety" ? "Safety" : "Score", playIndex: pi };
    }
    if (e.result === "turnover" || e.result === "def_td") {
      return {
        kind: "takeaway",
        label: e.result === "def_td" ? "Def TD" : "Takeaway",
        playIndex: pi,
      };
    }
    var pe = possessionEnd(e);
    if (pe === "turnover_on_downs") {
      return { kind: "downs", label: "Failed 4th", playIndex: pi };
    }
    return null;
  }

  /** Coverage look-shift when tonight mix vs season crosses ≥3 and ≥25pp. */
  function lookCoverageShift(oLog, seasonCovDist) {
    var mix = lookFieldMix(oLog, "coverage");
    if (mix.tagged < 3) return null;
    var top = mix.rows[0];
    if (!top) return null;
    var fam = top.fam || top.k;
    var seasonPct = seasonPctForFam(seasonCovDist, fam, top.k);
    if (seasonPct == null) return null;
    var delta = top.pct - seasonPct;
    if (Math.abs(delta) < 0.25) return null;
    return {
      label: top.k,
      fam: fam,
      livePct: top.pct,
      seasonPct: seasonPct,
      liveN: top.n,
      delta: delta,
      line:
        top.k +
        " " +
        fmtPct(top.pct) +
        " tonight · " +
        fmtPct(seasonPct) +
        " season (n=" +
        top.n +
        ")",
    };
  }

  function defenseLiveSections(opts) {
    opts = opts || {};
    var oLog = opts.offenseLog || [];
    var dLog = opts.defenseLog || [];
    var shifts = Array.isArray(opts.shifts)
      ? opts.shifts
      : opts.shift
        ? [{ bucket: "current sit", shift: opts.shift }]
        : [];
    var sections = [];
    var facts = {
      offenseN: oLog.length,
      defenseN: dLog.length,
      shifts: [],
      side: "defense",
    };

    var whatLines = [];
    var whatFacts = { defenseN: dLog.length };
    var dPass = passShare(dLog);
    if (dPass != null) {
      whatFacts.dPass = dPass;
      whatLines.push(
        liveLine(
          "They run/pass: " + fmtPct(1 - dPass) + " / " + fmtPct(dPass) + " (n=" + dLog.length + ")",
          dLog.length
        )
      );
    }
    ["1st", "2nd short", "2nd long", "3rd"].forEach(function (bucket) {
      var snaps = dLog.filter(function (e) {
        return isGraded(e) && !isNegated(e) && !isTrySnap(e) && downBucket(e) === bucket;
      });
      var ps = passShare(snaps);
      if (ps != null && snaps.length >= 1) {
        whatLines.push(
          liveLine(
            bucket + ": " + fmtPct(1 - ps) + " / " + fmtPct(ps) + " (n=" + snaps.length + ")",
            snaps.length
          )
        );
        whatFacts[bucket] = { pass: ps, n: snaps.length };
      }
    });
    var dirCounts = {};
    dLog.forEach(function (e) {
      if (!e.theirDirection || isNegated(e)) return;
      dirCounts[e.theirDirection] = (dirCounts[e.theirDirection] || 0) + 1;
    });
    var topDir = Object.keys(dirCounts).sort(function (a, b) {
      return dirCounts[b] - dirCounts[a];
    })[0];
    if (topDir) {
      whatLines.push(liveLine("Direction lean: " + topDir + " (" + dirCounts[topDir] + ")", dirCounts[topDir]));
      whatFacts.topDir = { dir: topDir, n: dirCounts[topDir] };
    }
    shifts.forEach(function (row) {
      if (!row || !row.shift) return;
      var line = shiftLine(row.bucket || "", row.shift);
      if (line) {
        whatLines.push(liveLine(line, row.shift.liveN));
        facts.shifts.push({
          bucket: row.bucket || "",
          livePass: row.shift.livePass,
          seasonPass: row.shift.seasonPass,
          liveN: row.shift.liveN,
          seasonN: row.shift.seasonN,
          tonightLean: row.shift.tonightLean,
        });
      }
    });
    whatLines.push(liveLine("Formations: season data (live snaps have no formation tags)", { low: false }));
    if (!whatLines.length) whatLines.push(liveLine("No graded D snaps yet.", 0));
    sections.push({
      id: "what_they",
      title: "What they're doing",
      lines: whatLines,
      facts: whatFacts,
    });

    var workLines = [];
    var workFacts = {};
    var dGroups = groupRates(dLog, "defense").slice(0, 6);
    workFacts.dGroups = dGroups.map(function (g) {
      return { key: g.key, n: g.n, chunks: g.chunks, success: g.success };
    });
    dGroups.forEach(function (g) {
      workLines.push(
        liveLine(
          g.key + ": " + g.n + " snaps, " + g.chunks + " chunk" + (g.chunks === 1 ? "" : "s") + " allowed",
          g.n
        )
      );
    });
    var oGroups = groupRates(oLog, "offense").slice(0, 4);
    workFacts.oGroups = oGroups.map(function (g) {
      return { key: g.key, n: g.n, success: g.success };
    });
    oGroups.forEach(function (g) {
      workLines.push(liveLine("O " + g.key + ": " + g.success + "/" + g.n + " success", g.n));
    });
    var o3 = oLog.filter(function (e) {
      return +e.dn === 3 && isGraded(e) && !isNegated(e);
    });
    if (o3.length) {
      var o3ok = o3.filter(function (e) {
        return e.success === 1 || (e.gain != null && +e.gain >= dbToNum(e.db));
      }).length;
      workFacts.o3 = { ok: o3ok, n: o3.length };
      workLines.push(liveLine("O 3rd down: " + o3ok + "/" + o3.length, o3.length));
    }
    var d3 = dLog.filter(function (e) {
      return +e.dn === 3 && isGraded(e) && !isNegated(e);
    });
    if (d3.length) {
      var d3stop = d3.filter(function (e) {
        return e.isStop || e.success === 1 || (e.gain != null && +e.gain < dbToNum(e.db));
      }).length;
      workFacts.d3 = { stop: d3stop, n: d3.length };
      workLines.push(liveLine("D 3rd down stops: " + d3stop + "/" + d3.length, d3.length));
    }
    var rz = function (e) {
      return e.zone === "RZ" || e.zone === "red" || /red/i.test(String(e.zone || ""));
    };
    var oRz = oLog.filter(function (e) {
      return rz(e) && isGraded(e) && !isNegated(e);
    });
    var dRz = dLog.filter(function (e) {
      return rz(e) && isGraded(e) && !isNegated(e);
    });
    if (oRz.length || dRz.length) {
      workLines.push(
        liveLine("Red zone: O " + oRz.length + " snaps · D " + dRz.length + " snaps", oRz.length + dRz.length)
      );
      workFacts.redZone = { o: oRz.length, d: dRz.length };
    }
    if (!workLines.length) workLines.push(liveLine("Not enough graded snaps for call rates yet.", 0));
    sections.push({
      id: "working",
      title: "What's working / failing",
      lines: workLines,
      facts: workFacts,
    });

    var looks = [];
    shifts.forEach(function (row) {
      if (!row || !row.shift) return;
      var s = row.shift;
      looks.push({
        text:
          (row.bucket ? row.bucket + ": " : "") +
          "expect " +
          s.tonightLean +
          " — tonight " +
          fmtPct(s.livePass) +
          " pass vs season " +
          fmtPct(s.seasonPass),
        n: s.liveN,
        low: s.liveN < 3,
        badge: s.liveN < 3 ? "LOW" : undefined,
        facts: {
          kind: "shift",
          bucket: row.bucket || "",
          tonightLean: s.tonightLean,
          livePass: s.livePass,
          seasonPass: s.seasonPass,
          liveN: s.liveN,
          seasonN: s.seasonN,
        },
      });
    });
    var secondLong = dLog.filter(function (e) {
      return isGraded(e) && !isNegated(e) && !isTrySnap(e) && downBucket(e) === "2nd long";
    });
    if (secondLong.length >= 1) {
      var slPass = passShare(secondLong);
      var slY = yardsSum(secondLong);
      var ypa = slY.n ? (slY.yards / slY.n).toFixed(1) : null;
      looks.push({
        text:
          "Their 2nd-&-long pass rate tonight is " +
          fmtPct(slPass) +
          " (n=" +
          secondLong.length +
          ")" +
          (ypa != null ? " · " + ypa + " yds/att" : ""),
        n: secondLong.length,
        low: secondLong.length < 3,
        badge: secondLong.length < 3 ? "LOW" : undefined,
        facts: {
          kind: "2nd_long",
          pass: slPass,
          n: secondLong.length,
          ypa: ypa != null ? +ypa : null,
        },
      });
    }
    var held = rankCallFamilies(groupRates(dLog, "defense"), "held").slice(0, 3);
    held.forEach(function (g) {
      var yHeld = g.yardsN > 0 ? (g.yards / g.yardsN).toFixed(1) : null;
      looks.push({
        text:
          g.key +
          " held them" +
          (yHeld != null ? " to " + yHeld + " yds/att" : "") +
          " · " +
          g.chunks +
          "/" +
          g.n +
          " chunks",
        n: g.n,
        low: g.n < 3,
        badge: g.n < 3 ? "LOW" : undefined,
        facts: {
          kind: "held_call",
          key: g.key,
          n: g.n,
          chunks: g.chunks,
          ypa: yHeld != null ? +yHeld : null,
        },
      });
    });
    if (!looks.length) {
      looks.push({
        text: "No rule-based looks yet — waiting on snaps or a shift line.",
        facts: { kind: "empty" },
        low: true,
        badge: "LOW",
        n: 0,
      });
    }
    sections.push({
      id: "suggested",
      title: "Suggested looks",
      lines: looks.map(function (l) {
        return liveLine(l.text, { n: l.n, low: l.low });
      }),
      looks: looks,
      facts: { lookN: looks.length },
    });

    var tags = tagRollup(dLog);
    var tagLines = tags.length
      ? tags.map(function (t) {
          return liveLine(t.label + ": " + t.n, t.n);
        })
      : [liveLine("No scheme tags yet — Monday pipeline empty at half.", 0)];
    sections.push({
      id: "tags",
      title: "Tag rollup",
      lines: tagLines,
      facts: { tags: tags },
    });

    return { sections: sections, facts: facts };
  }

  function offenseLiveSections(opts) {
    opts = opts || {};
    var oLog = opts.offenseLog || [];
    var seasonCov = opts.seasonCovDist || null;
    var plays = opts.plays || [];
    var scoutRows = opts.scoutRows || [];
    var sections = [];
    var facts = {
      offenseN: oLog.length,
      defenseN: (opts.defenseLog || []).length,
      side: "offense",
      shifts: [],
    };

    /* ---- 1. What they're showing ---- */
    var covMix = lookFieldMix(oLog, "coverage");
    var frontMix = lookFieldMix(oLog, "front");
    var pressMix = lookFieldMix(oLog, "pressure");
    var showLines = [];
    var showFacts = {
      tagRate: covMix.rate,
      coverageTagged: covMix.tagged,
      graded: covMix.graded,
    };
    var thinTags = covMix.graded > 0 && covMix.rate < 0.3;

    if (!thinTags && covMix.rows.length) {
      covMix.rows.slice(0, 4).forEach(function (r) {
        var fam = r.fam || r.k;
        var seasonPct = seasonPctForFam(seasonCov, fam, r.k);
        var txt = r.k + " " + fmtPct(r.pct) + " tonight";
        if (seasonPct != null) txt += " · " + fmtPct(seasonPct) + " season";
        txt += " (n=" + r.n + ")";
        showLines.push(liveLine(txt, r.n));
      });
      if (frontMix.rows[0]) {
        showLines.push(
          liveLine(
            "Front lean: " + frontMix.rows[0].k + " " + fmtPct(frontMix.rows[0].pct) + " (n=" + frontMix.rows[0].n + ")",
            frontMix.rows[0].n
          )
        );
      }
      if (pressMix.rows[0]) {
        showLines.push(
          liveLine(
            "Pressure: " + pressMix.rows[0].k + " " + fmtPct(pressMix.rows[0].pct) + " (n=" + pressMix.rows[0].n + ")",
            pressMix.rows[0].n
          )
        );
      }
    } else {
      /* Scout-led fallback when tags are thin */
      var sArr = seasonCov && (Array.isArray(seasonCov) ? seasonCov : seasonCov.arr);
      if (sArr && sArr.length) {
        showLines.push(liveLine("Look tags thin tonight — season profile:", { low: true }));
        sArr.slice(0, 3).forEach(function (a) {
          showLines.push(
            liveLine((a.k || a.fam || "?") + " " + fmtPct(a.pct) + " season", { low: true })
          );
        });
      } else if (covMix.rows.length) {
        covMix.rows.slice(0, 3).forEach(function (r) {
          showLines.push(liveLine(r.k + " " + fmtPct(r.pct) + " tonight (n=" + r.n + ")", r.n));
        });
      } else {
        showLines.push(liveLine("No look tags yet — chip Front / Coverage after the snap.", 0));
      }
      if (thinTags && covMix.tagged) {
        showLines.push(
          liveLine(
            "Tagged " + covMix.tagged + "/" + covMix.graded + " snaps — season lines lead until tags thicken.",
            covMix.tagged
          )
        );
      }
    }
    showFacts.rows = covMix.rows.slice(0, 6);
    sections.push({
      id: "what_showing",
      title: "What they're showing",
      lines: showLines,
      facts: showFacts,
    });

    /* ---- 2. What's working / failing (by play name) ---- */
    var byPlay = groupRatesByPlay(oLog);
    var workLines = [];
    var workFacts = { plays: byPlay.length };
    var rankedHot = byPlay.slice().sort(function (a, b) {
      var d = b.n ? b.success / b.n : 0;
      var c = a.n ? a.success / a.n : 0;
      if (d !== c) return d - c;
      return b.n - a.n;
    });
    var rankedCold = byPlay.slice().sort(function (a, b) {
      var d = a.n ? a.success / a.n : 1;
      var c = b.n ? b.success / b.n : 1;
      if (d !== c) return d - c;
      return b.n - a.n;
    });
    if (rankedHot.length) {
      workLines.push(liveLine("Working", { low: false }));
      rankedHot.slice(0, 3).forEach(function (g) {
        workLines.push(playRateLine(g));
      });
    }
    if (rankedCold.length) {
      workLines.push(liveLine("Failing", { low: false }));
      rankedCold.slice(0, 3).forEach(function (g) {
        workLines.push(playRateLine(g));
      });
    }
    var o3b = oLog.filter(function (e) {
      return +e.dn === 3 && isGraded(e) && !isNegated(e);
    });
    if (o3b.length) {
      var o3okb = o3b.filter(function (e) {
        return e.success === 1 || (e.gain != null && +e.gain >= dbToNum(e.db));
      }).length;
      workFacts.o3 = { ok: o3okb, n: o3b.length };
      workLines.push(liveLine("3rd down: " + o3okb + "/" + o3b.length + " converted", o3b.length));
    } else {
      var rzO = oLog.filter(function (e) {
        return (
          (e.zone === "RZ" || e.zone === "red" || /red/i.test(String(e.zone || ""))) &&
          isGraded(e) &&
          !isNegated(e)
        );
      });
      if (rzO.length) {
        workLines.push(liveLine("Red zone: " + rzO.length + " snaps", rzO.length));
        workFacts.redZone = { o: rzO.length };
      }
    }
    if (!byPlay.length) workLines.push(liveLine("No graded plays yet for call rates.", 0));
    sections.push({
      id: "working",
      title: "What's working / failing",
      lines: workLines,
      facts: workFacts,
    });

    /* ---- 3. Call ideas (EV reweighted by tonight looks) ---- */
    var ideaLines = [];
    var ideaFacts = { source: "fallback" };
    var tonightDist = tonightCovDistFromLog(oLog);
    var M = global.OFFGRD_MATCHUP;
    var called = {};
    oLog.forEach(function (e) {
      if (e && e.play) called[String(e.play)] = (called[String(e.play)] || 0) + 1;
    });
    var rankedEv = [];
    if (M && typeof M.rankPlaysByEv === "function" && plays.length && tonightDist.arr.length) {
      try {
        rankedEv = M.rankPlaysByEv(plays, tonightDist, scoutRows, { limit: 8 }) || [];
        ideaFacts.source = "matchup_ev";
      } catch (eEv) {
        rankedEv = [];
      }
    }
    if (rankedEv.length) {
      rankedEv.slice(0, 3).forEach(function (r) {
        var nm = r.name || (r.play && r.play.name) || "?";
        var lab = r.basisLabel || "SCHEME MATCH";
        var evPct = r.ev != null ? Math.round(+r.ev * 100) + "%" : "—";
        ideaLines.push(
          liveLine(nm + " · EV " + evPct + " · " + lab, r.n != null ? r.n : 0)
        );
      });
      var unused = null;
      for (var ui = 0; ui < rankedEv.length; ui++) {
        var cand = rankedEv[ui];
        var cname = cand.name || (cand.play && cand.play.name) || "";
        if (cname && !called[cname]) {
          unused = cand;
          break;
        }
      }
      if (unused) {
        var un = unused.name || (unused.play && unused.play.name) || "?";
        var uev = unused.ev != null ? Math.round(+unused.ev * 100) + "%" : "—";
        ideaLines.push(
          liveLine(
            "Unused high-EV: " + un + " · EV " + uev + " · " + (unused.basisLabel || "SCHEME MATCH"),
            unused.n != null ? unused.n : 0
          )
        );
      }
    } else {
      /* Deterministic fallback from working / failing ranks */
      ideaFacts.source = "play_rates";
      rankedHot.slice(0, 2).forEach(function (g) {
        ideaLines.push(liveLine("Lean on " + g.key + " — " + fmtPct(g.n ? g.success / g.n : 0) + " tonight", g.n));
      });
      rankedCold.slice(0, 1).forEach(function (g) {
        ideaLines.push(liveLine("Park " + g.key + " — cold at " + fmtPct(g.n ? g.success / g.n : 0), g.n));
      });
      var rareHot = rankedHot.filter(function (g) {
        return (called[g.key] || 0) <= 1;
      })[0];
      if (rareHot) {
        ideaLines.push(liveLine("Unused / rare: " + rareHot.key + " still grading well", rareHot.n));
      }
      if (!ideaLines.length) ideaLines.push(liveLine("Call ideas fill as snaps and look tags land.", 0));
    }
    sections.push({
      id: "call_ideas",
      title: "Call ideas",
      lines: ideaLines,
      facts: ideaFacts,
    });

    /* ---- 4. Tag rollup (O flags) for skeleton parity ---- */
    var oTags = tagRollup(oLog);
    var oTagLines = oTags.length
      ? oTags.map(function (t) {
          return liveLine(t.label + ": " + t.n, t.n);
        })
      : [liveLine("No outcome flags yet — optional after the grade.", 0)];
    sections.push({
      id: "tags",
      title: "Flag rollup",
      lines: oTagLines,
      facts: { tags: oTags },
    });

    return { sections: sections, facts: facts };
  }

  /**
   * Live / halftime skeleton — picks offense or defense content provider.
   * opts.side: "offense" | "defense" (default defense for Final / legacy smokes).
   * Never blends O+D into one provider.
   */
  function halftimeTemplate(opts) {
    opts = opts || {};
    var side = opts.side === "offense" ? "offense" : "defense";
    var packed = side === "offense" ? offenseLiveSections(opts) : defenseLiveSections(opts);
    var sections = (packed.sections || []).map(normalizeSectionLines);
    var facts = packed.facts || {};
    facts.side = side;

    var flat = [];
    sections.forEach(function (sec) {
      flat.push(sec.title);
      (sec.lines || []).forEach(function (ln) {
        flat.push(lineText(ln));
      });
    });

    return {
      sections: sections,
      facts: facts,
      lines: flat,
      side: side,
      renderedAt: Date.now(),
    };
  }

  /** Tags × scheme × situation — Monday cell evidence (no player names). */
  function tagsBySchemeSituation(log) {
    var counts = {};
    (log || []).forEach(function (e) {
      if (!e || isNegated(e) || !isGraded(e)) return;
      var flags = Array.isArray(e.flags) ? e.flags : e.flag ? [e.flag] : [];
      if (!flags.length) return;
      var scheme = e.coverage || e.front || "?";
      var situation = downBucket(e);
      if (+e.dn === 3 && dbToNum(e.db) >= 7) situation = "3rd-long";
      flags.forEach(function (tag) {
        if (!tag) return;
        var key = tag + "\0" + scheme + "\0" + situation;
        if (!counts[key]) {
          counts[key] = { tag: tag, label: flagLabel(tag), scheme: scheme, situation: situation, n: 0 };
        }
        counts[key].n++;
      });
    });
    return Object.keys(counts)
      .map(function (k) {
        return counts[k];
      })
      .sort(function (a, b) {
        return b.n - a.n;
      });
  }

  function turnoverSummary(oLog, dLog) {
    function collect(log, side) {
      var rows = [];
      (log || []).forEach(function (e) {
        if (!isGraded(e) || isNegated(e)) return;
        var r = e.result;
        var kind = null;
        if (r === "turnover") kind = "turnover";
        else if (r === "def_td") kind = "def_td";
        else if (r === "safety") kind = "safety";
        else if (+e.dn === 4 && e.gain != null && +e.gain < dbToNum(e.db) && r !== "td") {
          kind = "turnover_on_downs";
        }
        if (!kind) return;
        rows.push({
          side: side,
          kind: kind,
          playIndex: e.playIndex != null ? e.playIndex : null,
          sit: e.sitTxt || downBucket(e),
          play: e.play || e.playType || null,
        });
      });
      return rows;
    }
    var offense = collect(oLog, "offense");
    var defense = collect(dLog, "defense");
    var byKind = {};
    offense.concat(defense).forEach(function (t) {
      byKind[t.kind] = (byKind[t.kind] || 0) + 1;
    });
    return { offense: offense, defense: defense, byKind: byKind, total: offense.length + defense.length };
  }

  function driveChart(log, breaks) {
    var drives = deriveDrives(log || [], { breaks: breaks || [] });
    return drives.map(function (d, i) {
      var y = yardsSum(d.snaps);
      return {
        index: d.index != null ? d.index : i,
        plays: (d.snaps || []).length,
        yards: y.yards,
        yardsN: y.n,
        endReason: d.endReason || (d.open ? "open" : null),
        truncated: !!d.truncated,
        open: !!d.open,
        label: d.label || endLabel(d),
      };
    });
  }

  /**
   * Final — halftime sections + drive chart + turnover summary.
   * Template-only, offline, same <2s bar. No LLM.
   */
  function finalTemplate(opts) {
    opts = opts || {};
    var ht = halftimeTemplate(opts);
    var oLog = opts.offenseLog || [];
    var dLog = opts.defenseLog || [];
    var breaks = opts.breaks || [];
    var chart = driveChart(dLog.length ? dLog : oLog, breaks);
    var oChart = oLog.length ? driveChart(oLog, opts.offenseBreaks || breaks) : [];
    var turns = turnoverSummary(oLog, dLog);
    var sections = (ht.sections || []).slice();

    var driveLines = [];
    if (oChart.length) {
      driveLines.push("O drives (" + oChart.length + "):");
      oChart.forEach(function (d, i) {
        driveLines.push(
          "  " +
            (i + 1) +
            ". " +
            d.plays +
            " plays · " +
            d.yards +
            " yd · " +
            (d.label || d.endReason || "end")
        );
      });
    }
    if (chart.length && dLog.length) {
      driveLines.push("D series (" + chart.length + "):");
      chart.forEach(function (d, i) {
        driveLines.push(
          "  " +
            (i + 1) +
            ". " +
            d.plays +
            " plays · " +
            d.yards +
            " yd allowed · " +
            (d.label || d.endReason || "end")
        );
      });
    }
    if (!driveLines.length) driveLines.push("No drives derived yet.");
    sections.push({
      id: "drives",
      title: "Drive chart",
      lines: driveLines,
      facts: { offenseDrives: oChart, defenseDrives: chart },
    });

    var turnLines = [];
    if (turns.total) {
      Object.keys(turns.byKind).forEach(function (k) {
        turnLines.push(k.replace(/_/g, " ") + ": " + turns.byKind[k]);
      });
      turnLines.push("Total possession changes: " + turns.total);
    } else {
      turnLines.push("No turnovers / TOD / safeties logged.");
    }
    sections.push({
      id: "turnovers",
      title: "Turnover summary",
      lines: turnLines,
      facts: turns,
    });

    var flat = [];
    sections.forEach(function (sec) {
      flat.push(sec.title);
      (sec.lines || []).forEach(function (ln) {
        flat.push(ln);
      });
    });

    return {
      sections: sections,
      facts: Object.assign({}, ht.facts || {}, {
        drives: { offense: oChart, defense: chart },
        turnovers: turns,
      }),
      lines: flat,
      renderedAt: Date.now(),
      tier: "final",
    };
  }

  /** Tag weights for Monday ranking — bust/missed_fit lead the flywheel. */
  var MONDAY_TAG_WEIGHT = {
    bust: 5,
    missed_fit: 4,
    bad_call: 3,
    untested: 2,
    late: 2,
    call_right: 0,
  };

  function schemeTypeOf(scheme) {
    var s = String(scheme || "").toLowerCase();
    if (/cover|tampa|2-man|man /.test(s)) return "coverage";
    if (/^\d-\d|odd|even|bear|okey/.test(s)) return "defensive_call";
    return "coverage";
  }

  /** Focus kind valid for start_tracked_focus — never "game_tag" / never tag names. */
  function focusKindOf(schemeType) {
    return schemeType === "defensive_call" ? "blitz" : "coverage";
  }

  /**
   * A+B default position group: Cover* → DB, fronts → LB. Coach may override at confirm.
   * Tag/situation stay in evidence — never in p_dimension (RPC only allows depth|leverage|relationship).
   */
  function defaultPositionGroup(schemeType, schemeValue) {
    var st = schemeType || schemeTypeOf(schemeValue);
    if (st === "defensive_call") return "LB";
    return "DB";
  }

  /** Stable candidate id (group editable separately). Staging accept key adds position_group. */
  function mondayCandidateKey(c) {
    if (!c) return "";
    return String(c.tag || "") + "|" + String(c.schemeValue || c.scheme || "") + "|" + String(c.situation || "");
  }

  /**
   * Merge engine candidates with prior payload — preserve accepted / approved_pending
   * and coach-chosen positionGroup. Staging idempotent per game.
   */
  function mergeMondayFocusPayload(prev, next) {
    if (!next || typeof next !== "object") return prev || null;
    if (!prev || !prev.candidates) return next;
    var byKey = {};
    (prev.candidates || []).forEach(function (c) {
      var k = mondayCandidateKey(c);
      if (k) byKey[k] = c;
    });
    var merged = (next.candidates || []).map(function (c) {
      var k = mondayCandidateKey(c);
      var old = byKey[k];
      if (!old) return c;
      var out = Object.assign({}, c);
      if (old.positionGroup) out.positionGroup = old.positionGroup;
      if (old.status === "accepted" || old.status === "approved_pending" || old.status === "dismissed") {
        out.status = old.status;
      }
      if (old.trackedFocusId) out.trackedFocusId = old.trackedFocusId;
      if (old.acceptedAt) out.acceptedAt = old.acceptedAt;
      if (old.focusHint && out.focusHint && old.positionGroup) {
        out.focusHint = Object.assign({}, out.focusHint, {
          position_group: old.positionGroup,
        });
      }
      return out;
    });
    /* Keep accepted rows the engine dropped (n collapsed) so re-sync cannot re-propose */
    (prev.candidates || []).forEach(function (old) {
      if (old.status !== "accepted" && old.status !== "approved_pending") return;
      var k = mondayCandidateKey(old);
      if (!k) return;
      if (merged.some(function (c) { return mondayCandidateKey(c) === k; })) return;
      merged.push(old);
    });
    return Object.assign({}, next, { candidates: merged, schemaVersion: Math.max(+next.schemaVersion || 0, 3) });
  }

  /** focus_tracked active-cell key (situation is evidence only — not part of the cell). */
  function trackedCellKey(c) {
    if (!c) return "";
    var hint = c.focusHint || {};
    var group = String(c.positionGroup || hint.position_group || "DB").toUpperCase();
    var kind = hint.kind || c.kind || "coverage";
    var st = hint.scheme_type || c.schemeType || "";
    var sv = hint.scheme_value || c.schemeValue || "";
    var dim = hint.dimension != null ? hint.dimension : c.dimension;
    return group + "|" + kind + "|" + st + "|" + sv + "|" + (dim || "");
  }

  /**
   * Collapse situation-split candidates that map to one focus_tracked cell.
   * Sums baseline_attempts / n so Cover3×1st (2) + Cover3×2nd (1) → one RPC with 3.
   */
  function collapseMondayCandidatesForAccept(candidates) {
    var map = Object.create(null);
    var order = [];
    (candidates || []).forEach(function (c) {
      if (!c) return;
      var k = trackedCellKey(c);
      if (!k) return;
      var hint = c.focusHint || {};
      var n = +c.n || +hint.baseline_attempts || 0;
      var cor = hint.baseline_correct != null ? +hint.baseline_correct : 0;
      if (!map[k]) {
        map[k] = {
          cellKey: k,
          sources: [],
          positionGroup: String(c.positionGroup || hint.position_group || "DB").toUpperCase(),
          kind: hint.kind || c.kind || "coverage",
          schemeType: hint.scheme_type || c.schemeType || "coverage",
          schemeValue: hint.scheme_value || c.schemeValue || null,
          dimension: hint.dimension != null ? hint.dimension : c.dimension != null ? c.dimension : null,
          sourceTag: hint.source_tag || "livetag_monday",
          n: 0,
          baseline_correct: 0,
          baseline_attempts: 0,
          evidence: [],
        };
        order.push(k);
      }
      var row = map[k];
      row.sources.push(c);
      row.n += n;
      row.baseline_attempts += n;
      row.baseline_correct += cor;
      if (c.evidence) row.evidence.push(c.evidence);
    });
    return order.map(function (k) {
      var row = map[k];
      row.evidence = row.evidence.join(" · ");
      return row;
    });
  }

  /**
   * Ranked Monday Focus candidates from tag × scheme × situation cells.
   * focusHint matches start_tracked_focus — coach confirms; never auto-apply.
   * Zero player attribution.
   */
  function rankMondayFocusCandidates(payload) {
    var tags = (payload && payload.tagsBySchemeSituation) || [];
    var rows = [];
    tags.forEach(function (t) {
      if (!t || !t.tag) return;
      var w = MONDAY_TAG_WEIGHT[t.tag];
      if (w == null) w = 1;
      if (w <= 0) return;
      var n = +t.n || 0;
      if (n < 1) return;
      var score = n * w;
      var schemeType = schemeTypeOf(t.scheme);
      var schemeValue = t.scheme || null;
      var kind = focusKindOf(schemeType);
      var positionGroup = defaultPositionGroup(schemeType, schemeValue);
      var evidence =
        t.evidence || t.tag + " × " + (t.scheme || "?") + " × " + (t.situation || "?") + ": " + n;
      rows.push({
        status: "proposed",
        candidateKey: t.tag + "|" + (schemeValue || "") + "|" + (t.situation || ""),
        tag: t.tag,
        schemeType: schemeType,
        schemeValue: schemeValue,
        situation: t.situation || "",
        /* Focus dimension is depth|leverage|relationship only — tags stay on evidence */
        dimension: null,
        kind: kind,
        positionGroup: positionGroup,
        n: n,
        score: score,
        confidence: n >= 4 ? "solid" : n >= 2 ? "thin" : "anecdote",
        evidence: evidence,
        focusHint: {
          kind: kind,
          scheme_type: schemeType,
          scheme_value: schemeValue,
          dimension: null,
          position_group: positionGroup,
          baseline_correct: 0,
          baseline_attempts: n,
          source_tag: "livetag_monday",
        },
      });
    });
    rows.sort(function (a, b) {
      return b.score - a.score || b.n - a.n;
    });
    return rows.slice(0, 12);
  }

  /**
   * Structured Monday Focus input — aggregates only.
   * Zero player names / jersey / player_id (4c). Attribution is server-side later.
   * Does NOT write game_plays; rides Upload as mondayFocus sidecar.
   * schemaVersion 3: candidates.valid for start_tracked_focus (kind/scheme/group;
   * dimension null — tag is evidence only). Coach confirms; never auto-apply.
   */
  function buildMondayFocusPayload(opts) {
    opts = opts || {};
    var oLog = opts.offenseLog || [];
    var dLog = opts.defenseLog || [];
    var shifts = Array.isArray(opts.shifts)
      ? opts.shifts
      : opts.shift
        ? [{ bucket: "current sit", shift: opts.shift }]
        : [];
    var shiftRows = [];
    shifts.forEach(function (row) {
      if (!row || !row.shift) return;
      var s = row.shift;
      shiftRows.push({
        bucket: row.bucket || "",
        livePass: s.livePass,
        seasonPass: s.seasonPass,
        liveN: s.liveN,
        seasonN: s.seasonN,
        tonightLean: s.tonightLean,
        seasonLean: s.seasonLean,
        delta: s.delta != null ? s.delta : s.livePass - s.seasonPass,
      });
    });
    var tagCells = tagsBySchemeSituation(dLog);
    var oFamilies = groupRates(oLog, "offense").map(function (g) {
      return {
        key: g.key,
        side: "offense",
        n: g.n,
        success: g.success,
        chunks: g.chunks,
        yards: g.yards,
        yardsN: g.yardsN,
      };
    });
    var dFamilies = groupRates(dLog, "defense").map(function (g) {
      return {
        key: g.key,
        side: "defense",
        n: g.n,
        success: g.success,
        chunks: g.chunks,
        yards: g.yards,
        yardsN: g.yardsN,
      };
    });
    var oDrives = driveChart(oLog, opts.offenseBreaks || opts.breaks || []);
    var dDrives = driveChart(dLog, opts.breaks || []);
    var turns = turnoverSummary(oLog, dLog);
    var sess = opts.session || {};

    var tagRows = tagCells.map(function (t) {
      return {
        tag: t.tag,
        scheme: t.scheme,
        situation: t.situation,
        n: t.n,
        /* evidence string for Monday UI — no names */
        evidence: t.label + " × " + t.scheme + " × " + t.situation + ": " + t.n,
      };
    });

    var payload = {
      kind: "offgrd_monday_focus_input",
      schemaVersion: 3,
      source: "livetag_caller",
      exportedAt: new Date().toISOString(),
      session: {
        gameId: sess.gameId || null,
        opp: sess.opp || null,
        week: sess.week || null,
        side: sess.side || "both",
      },
      sample: { offenseN: oLog.length, defenseN: dLog.length },
      shifts: shiftRows,
      tagsBySchemeSituation: tagRows,
      candidates: [],
      callFamilies: oFamilies.concat(dFamilies),
      driveEfficiency: {
        offense: oDrives,
        defense: dDrives,
      },
      turnovers: {
        byKind: turns.byKind,
        total: turns.total,
        /* kinds only — strip play labels that could carry names later */
        offenseN: turns.offense.length,
        defenseN: turns.defense.length,
      },
    };
    payload.candidates = rankMondayFocusCandidates(payload);
    if (opts.priorMondayFocus) {
      payload = mergeMondayFocusPayload(opts.priorMondayFocus, payload);
    }

    /* 4c: reject if any string looks like a player-name field leaked from opts */
    var banned = ["playerName", "player_id", "playerId", "jersey", "athleteName"];
    var json = JSON.stringify(payload);
    banned.forEach(function (k) {
      if (json.indexOf('"' + k + '"') >= 0) {
        throw new Error("mondayFocus payload must not include " + k);
      }
    });

    return payload;
  }

  var api = {
    deriveDrives: deriveDrives,
    possessionEnd: possessionEnd,
    isTrySnap: isTrySnap,
    isNegated: isNegated,
    tendencyShift: tendencyShift,
    passShare: passShare,
    driveTemplate: driveTemplate,
    quarterTemplate: quarterTemplate,
    halftimeTemplate: halftimeTemplate,
    finalTemplate: finalTemplate,
    buildMondayFocusPayload: buildMondayFocusPayload,
    rankMondayFocusCandidates: rankMondayFocusCandidates,
    mergeMondayFocusPayload: mergeMondayFocusPayload,
    mondayCandidateKey: mondayCandidateKey,
    trackedCellKey: trackedCellKey,
    collapseMondayCandidatesForAccept: collapseMondayCandidatesForAccept,
    defaultPositionGroup: defaultPositionGroup,
    focusKindOf: focusKindOf,
    schemeTypeOf: schemeTypeOf,
    tagsBySchemeSituation: tagsBySchemeSituation,
    turnoverSummary: turnoverSummary,
    driveChart: driveChart,
    groupRates: groupRates,
    groupRatesByPlay: groupRatesByPlay,
    rankCallFamilies: rankCallFamilies,
    boothChipAnswer: boothChipAnswer,
    boothChipDefs: boothChipDefs,
    tagRollup: tagRollup,
    downBucket: downBucket,
    yardsSum: yardsSum,
    endLabel: endLabel,
    liveLine: liveLine,
    lineText: lineText,
    lookFieldMix: lookFieldMix,
    tonightCovDistFromLog: tonightCovDistFromLog,
    lookCoverageShift: lookCoverageShift,
    inferDriveEndFromSnap: inferDriveEndFromSnap,
    offenseLiveSections: offenseLiveSections,
    defenseLiveSections: defenseLiveSections,
    /* Step 3 note: LLM number validation must normalize 8/11 ≡ 8 of 11 ≡ 73% before compare. */
    LLM_NUMBER_NORMALIZE_NOTE:
      "Normalize digit facts before LLM validation (8/11 === 8 of 11 === pct forms).",
  };

  global.OFFGRD_CALLER_ANALYSIS = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
