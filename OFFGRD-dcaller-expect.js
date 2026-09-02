/**
 * D Caller Expect grain — run/pass parent, then the deepest honest split.
 *
 * Tiers (shallow → deep): parent → PLAY DIR → formation → GAP lane / PASS ZONE depth.
 * A split renders only when its slice n ≥ DIRECTIONAL_SPLIT_MIN (same gate as O Caller).
 * One line. Never stack parent + dir + form. Empty GAP / PASS ZONE = dormant (no UI).
 * Middle (M) is ignored until a real export carries it.
 *
 *   window.OFFGRD_DCALLER_EXPECT
 */
(function (global) {
  "use strict";

  var FALLBACK_SPLIT_MIN = 8;
  var FALLBACK_MIN_SNAPS = 4;

  function cfgOf(opts) {
    opts = opts || {};
    var SL = global.OFFGRD_CALLER_SHORTLIST;
    var c = opts.cfg;
    if (!c && SL && typeof SL.cfgFor === "function") {
      try {
        c = SL.cfgFor(opts);
      } catch (e) {
        c = null;
      }
    }
    var split = c && +c.DIRECTIONAL_SPLIT_MIN;
    var min = c && +c.MIN_SNAPS;
    return {
      DIRECTIONAL_SPLIT_MIN:
        split >= 1 && split <= 40 ? Math.round(split) : FALLBACK_SPLIT_MIN,
      MIN_SNAPS: min >= 1 && min <= 20 ? Math.round(min) : FALLBACK_MIN_SNAPS,
    };
  }

  function fm() {
    return global.OFFGRD_FORMATION_MAP || null;
  }

  function formNorm(raw) {
    var M = fm();
    if (M && typeof M.normTag === "function") return M.normTag(raw);
    return String(raw == null ? "" : raw)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function formStructure(raw) {
    var M = fm();
    var mapped = M && typeof M.resolveMapped === "function" ? M.resolveMapped(raw, "off") : null;
    if (mapped && mapped.off_structure) return String(mapped.off_structure);
    if (M && typeof M.normalizeOffStructure === "function") {
      return M.normalizeOffStructure(raw) || null;
    }
    return null;
  }

  function formDisplay(raw, maps) {
    var n = formNorm(raw);
    if (!n) return "";
    var M = fm();
    var mapped = M && typeof M.resolveMapped === "function" ? M.resolveMapped(raw, "off") : null;
    if (mapped && mapped.raw_tag) return String(mapped.raw_tag).trim();
    if (Array.isArray(maps)) {
      var i;
      for (i = 0; i < maps.length; i++) {
        var row = maps[i];
        if (!row) continue;
        if (formNorm(row.raw_tag_norm || row.raw_tag) === n && row.raw_tag) {
          return String(row.raw_tag).trim();
        }
      }
    }
    return String(raw || "").replace(/\s+/g, " ").trim();
  }

  function playTypeOf(row) {
    if (!row) return "";
    var t = String(row.playType || row.play_type || "").toLowerCase();
    if (/pass/.test(t)) return "pass";
    if (/run|rush/.test(t)) return "run";
    return "";
  }

  /** L/R only. M is not a lean until a real export carries it. */
  function playDirOf(row) {
    if (!row) return "";
    var raw =
      row.direction ||
      row.playDir ||
      row.play_dir ||
      row.dir ||
      "";
    var d = String(raw).trim().toUpperCase().charAt(0);
    if (d === "L" || d === "R") return d;
    if (playTypeOf(row) === "pass") return passZoneDir(row);
    return "";
  }

  function gapRaw(row) {
    if (!row) return "";
    return String(row.gap || row.GAP || "").trim();
  }

  function passZoneRaw(row) {
    if (!row) return "";
    return String(row.passZone || row.pass_zone || row.PASS_ZONE || "").trim();
  }

  /** A/B → inside. C/D/edge → outside. Unknown → null (never guess). */
  function runLaneOf(row) {
    var g = gapRaw(row).toUpperCase();
    if (!g) return "";
    if (/^A\b|^B\b|^A-|^B-|INSIDE|A GAP|B GAP/.test(g) || g === "A" || g === "B") {
      return "inside";
    }
    if (/^C\b|^D\b|^C-|^D-|EDGE|OUTSIDE|C GAP|D GAP/.test(g) || g === "C" || g === "D") {
      return "outside";
    }
    return "";
  }

  /**
   * Hudl PASS ZONE is depth × direction ("Short Left", "Deep Middle").
   * Short → Quick. Intermediate/Int → Intermediate. Deep → Deep.
   */
  function passDepthOf(row) {
    var s = passZoneRaw(row).toLowerCase();
    if (!s) return "";
    if (/\bdeep\b/.test(s) || /^deep\b/.test(s)) return "deep";
    if (/\bintermed|\bmedium\b|^int\b|^int\s/.test(s)) return "intermediate";
    if (/\bshort\b|\bquick\b/.test(s) || /^short\b/.test(s)) return "quick";
    return "";
  }

  function passZoneDir(row) {
    var s = passZoneRaw(row).toLowerCase();
    if (!s) return "";
    if (/\bleft\b|\blt\b/.test(s)) return "L";
    if (/\bright\b|\brt\b/.test(s)) return "R";
    return "";
  }

  function offStrengthOf(row) {
    if (!row) return "";
    var v = String(row.offStrength || row.off_strength || "").trim().toLowerCase();
    if (v === "left" || v === "l" || v === "lt") return "L";
    if (v === "right" || v === "r" || v === "rt") return "R";
    return "";
  }

  function strengthFromName(raw) {
    var s = String(raw || "").toLowerCase();
    if (/\b(rt|right)\b/.test(s)) return "R";
    if (/\b(lt|left)\b/.test(s)) return "L";
    return "";
  }

  function sliceStrength(rows, formRaw) {
    var counts = { L: 0, R: 0 };
    (rows || []).forEach(function (r) {
      var s = offStrengthOf(r);
      if (s) counts[s] += 1;
    });
    if (counts.L >= 2 || counts.R >= 2) {
      if (counts.L === counts.R) return "";
      return counts.L > counts.R ? "L" : "R";
    }
    return strengthFromName(formRaw);
  }

  function attachmentLabel(formRaw) {
    var struct = formStructure(formRaw);
    var n = formNorm(formRaw);
    if (struct === "2x1" || /\bwing\b/.test(n)) return "wing";
    if (struct === "3x1" || /\btrips\b/.test(n)) return "trips";
    return "";
  }

  function fmtPct(p) {
    return Math.round((+p || 0) * 100) + "%";
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  /** Markup the D Caller Expect panel must paint. Smoke asserts this, not just build(). */
  function paint(grain) {
    if (!grain || grain.empty || !grain.text) {
      return { text: "", low: false, html: "" };
    }
    return {
      text: grain.text,
      foot: grain.foot || "",
      low: !!grain.low,
      html: '<div class="rd-dc-expect-grain">' + esc(grain.text) + "</div>",
    };
  }

  function runPass(rows) {
    var typed = 0;
    var pass = 0;
    (rows || []).forEach(function (r) {
      var t = playTypeOf(r);
      if (!t) return;
      typed += 1;
      if (t === "pass") pass += 1;
    });
    if (!typed) return { n: 0, passShare: null, lean: "", leanPct: null };
    var share = pass / typed;
    var isPass = share >= 0.5;
    return {
      n: typed,
      passShare: share,
      lean: isPass ? "pass" : "run",
      leanPct: isPass ? share : 1 - share,
    };
  }

  function typedRows(rows, lean) {
    return (rows || []).filter(function (r) {
      return playTypeOf(r) === lean;
    });
  }

  function countBy(rows, keyFn) {
    var counts = Object.create(null);
    var n = 0;
    (rows || []).forEach(function (r) {
      var k = keyFn(r);
      if (!k) return;
      counts[k] = (counts[k] || 0) + 1;
      n += 1;
    });
    var arr = Object.keys(counts)
      .map(function (k) {
        return { k: k, n: counts[k], pct: counts[k] / n };
      })
      .sort(function (a, b) {
        return b.n - a.n || a.k.localeCompare(b.k);
      });
    return { n: n, arr: arr, top: arr[0] || null };
  }

  function gatedTop(dist, min) {
    if (!dist || !dist.top || dist.n < min) return null;
    return dist.top;
  }

  function formCounts(rows) {
    var by = Object.create(null);
    (rows || []).forEach(function (r) {
      var raw = r && r.formation ? String(r.formation).trim() : "";
      var k = formNorm(raw);
      if (!k) return;
      if (!by[k]) by[k] = { key: k, raws: [], n: 0 };
      by[k].n += 1;
      by[k].raws.push(raw);
    });
    return Object.keys(by)
      .map(function (k) {
        var item = by[k];
        var seen = Object.create(null);
        var best = item.raws[0];
        var bestN = 0;
        item.raws.forEach(function (raw) {
          seen[raw] = (seen[raw] || 0) + 1;
          if (seen[raw] > bestN) {
            bestN = seen[raw];
            best = raw;
          }
        });
        return {
          key: k,
          n: item.n,
          raw: best,
          display: formDisplay(best),
        };
      })
      .sort(function (a, b) {
        return b.n - a.n || a.key.localeCompare(b.key);
      });
  }

  function impliedFormation(rows, min) {
    var arr = formCounts(rows);
    if (!arr.length || arr[0].n < min) return null;
    return arr[0];
  }

  function dirClause(top, lean, formRaw, ctxRows) {
    if (!top) return "";
    var attach = formRaw ? attachmentLabel(formRaw) : "";
    var str = formRaw ? sliceStrength(ctxRows, formRaw) : "";
    if (attach && str) {
      return (top.k === str ? "to the " + attach : "away from the " + attach) + " " + fmtPct(top.pct);
    }
    if (lean === "run") return "runs go " + top.k + " " + fmtPct(top.pct);
    return "go " + top.k + " " + fmtPct(top.pct);
  }

  /** Grain token on a side clause: `L 70%` or `to the wing 80%`. */
  function attachGrain(top, formRaw, ctxRows) {
    if (!top) return "";
    var attach = formRaw ? attachmentLabel(formRaw) : "";
    var str = formRaw ? sliceStrength(ctxRows, formRaw) : "";
    if (attach && str) {
      return (top.k === str ? "to the " : "away from the ") + attach + " " + fmtPct(top.pct);
    }
    return top.k + " " + fmtPct(top.pct);
  }

  function dirWentWord(top, formRaw, ctxRows) {
    if (!top) return "";
    var attach = formRaw ? attachmentLabel(formRaw) : "";
    var str = formRaw ? sliceStrength(ctxRows, formRaw) : "";
    if (attach && str) {
      return (top.k === str ? "to the " : "away from the ") + attach;
    }
    if (top.k === "L") return "left";
    if (top.k === "R") return "right";
    return top.k;
  }

  function clauseOf(label, share, grains) {
    var s = label + " " + fmtPct(share);
    if (grains && grains.length) s += " → " + grains.join(", ");
    return s;
  }

  function depthLabel(k) {
    if (k === "quick") return "Quick";
    if (k === "intermediate") return "Intermediate";
    if (k === "deep") return "Deep";
    return k;
  }

  /**
   * One Expect grain line for a sit sample.
   * opts.formation — operator-logged / sit-implied raw tag (optional).
   * opts.maps — formation-map rows for display (optional; module cache used if present).
   */
  function build(rows, opts) {
    opts = opts || {};
    var cfg = cfgOf(opts);
    var min = cfg.DIRECTIONAL_SPLIT_MIN;
    var minSnaps = cfg.MIN_SNAPS;
    var all = Array.isArray(rows) ? rows : [];
    var parent = runPass(all);

    if (!all.length || !parent.n) {
      return {
        empty: true,
        tier: "empty",
        text: "",
        n: 0,
        lean: "",
        leanPct: null,
        formation: null,
        dir: null,
        lane: null,
        depth: null,
        low: false,
        cfg: cfg,
      };
    }

    var asked = opts.formation ? formNorm(opts.formation) : "";
    var form = null;
    if (asked) {
      var hit = formCounts(all).filter(function (f) {
        return f.key === asked;
      })[0];
      if (hit && hit.n >= min) form = hit;
    }
    if (!form) form = impliedFormation(all, min);

    var ctx = form
      ? all.filter(function (r) {
          return formNorm(r.formation) === form.key;
        })
      : all;
    var ctxRp = form ? runPass(ctx) : parent;
    var lean = ctxRp.lean || parent.lean;
    var typed = typedRows(ctx, lean);
    var runRows = typedRows(ctx, "run");
    var passRows = typedRows(ctx, "pass");

    /* Run-direction is independent of parent lean. South is pass-lean
     * everywhere; the run-dir slice still has to show when n ≥ gate. */
    var runDirDist = countBy(runRows, playDirOf);
    var runDir = gatedTop(runDirDist, min);
    var passDirDist = countBy(passRows, playDirOf);
    var passDir = gatedTop(passDirDist, min);
    var dir = runDir || passDir;
    var dirKind = runDir ? "run" : dir ? "pass" : "";
    var dirDist = runDir ? runDirDist : passDirDist;

    var lane = null;
    var depth = null;
    if (lean === "run") {
      var laneDist = countBy(typed, runLaneOf);
      lane = gatedTop(laneDist, min);
    } else if (lean === "pass") {
      var depthDist = countBy(typed, passDepthOf);
      depth = gatedTop(depthDist, min);
    }

    var formRaw = form ? form.raw : "";
    var passGrains = [];
    if (depth) passGrains.push(depthLabel(depth.k).toLowerCase() + " " + fmtPct(depth.pct));
    if (passDir) passGrains.push(attachGrain(passDir, formRaw, passRows));
    var runGrains = [];
    if (lane) runGrains.push(lane.k + " " + fmtPct(lane.pct));
    if (runDir) runGrains.push(attachGrain(runDir, formRaw, runRows));

    var passShare = ctxRp.passShare != null ? ctxRp.passShare : parent.passShare;
    if (passShare == null) passShare = lean === "pass" ? 1 : 0;
    var passClause = clauseOf("Pass", passShare, passGrains);
    var runClause = clauseOf("Run", 1 - passShare, runGrains);
    var clauses = lean === "run" ? [runClause, passClause] : [passClause, runClause];
    var line = (form ? form.display + ": " : "") + clauses.join(" · ");

    var tier = "parent";
    if (form) tier = "formation";
    else if (lane) tier = "lane";
    else if (depth) tier = "depth";
    else if (dir) tier = "direction";

    var sliceN = form ? ctx.length : dir ? dirDist.n : parent.n;
    var shownN = form ? ctx.length : all.length;
    var low = shownN >= minSnaps && shownN < min;

    var footDir = runDir ? runDir : passDir;
    var footDist = runDir ? runDirDist : passDirDist;
    var footKind = runDir ? "runs" : passDir ? "passes" : "";
    var foot = shownN + " snap" + (shownN === 1 ? "" : "s");
    if (footDir && footDist && footDist.n) {
      foot +=
        " · " +
        footDir.n +
        " of " +
        footDist.n +
        " " +
        footKind +
        " went " +
        dirWentWord(footDir, formRaw, runDir ? runRows : passRows);
    }

    return {
      empty: false,
      tier: tier,
      text: line,
      foot: foot,
      n: shownN,
      sliceN: sliceN,
      lean: lean,
      leanPct: form ? ctxRp.leanPct : parent.leanPct,
      passShare: form ? ctxRp.passShare : parent.passShare,
      formation: form,
      dir: dir,
      lane: lane,
      depth: depth,
      low: low,
      cfg: cfg,
    };
  }

  var API = {
    FALLBACK_SPLIT_MIN: FALLBACK_SPLIT_MIN,
    FALLBACK_MIN_SNAPS: FALLBACK_MIN_SNAPS,
    cfgOf: cfgOf,
    formNorm: formNorm,
    formStructure: formStructure,
    formDisplay: formDisplay,
    playTypeOf: playTypeOf,
    playDirOf: playDirOf,
    runLaneOf: runLaneOf,
    passDepthOf: passDepthOf,
    passZoneDir: passZoneDir,
    runPass: runPass,
    formCounts: formCounts,
    impliedFormation: impliedFormation,
    build: build,
    paint: paint,
    fmtPct: fmtPct,
  };

  global.OFFGRD_DCALLER_EXPECT = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
