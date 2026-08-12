/**
 * OFFGRD-boothpack.js — Booth AI B1 context-pack serializer.
 *
 * Assembly only over existing engine outputs. No new computation.
 * Name-free (4c): positions + jersey numbers only — never player names.
 * Precomputes deltas/sums into the pack so digit validation stays exact-match.
 *
 *   window.OFFGRD_BOOTHPACK
 */
(function (global) {
  "use strict";

  var MAX_BYTES = 15 * 1024;
  var cache = null; /* { snapCount, side, gameId, pack, json, atoms, builtAt } */

  function A() {
    return global.OFFGRD_CALLER_ANALYSIS || null;
  }
  function M() {
    return global.OFFGRD_MATCHUP || null;
  }
  function Llm() {
    return global.OFFGRD_CALLER_SUMMARY_LLM || null;
  }
  function Gloss() {
    return global.OFFGRD_POS_GLOSSARY || null;
  }

  function pct(n) {
    if (n == null || isNaN(+n)) return null;
    return Math.round(+n * 100);
  }

  function ypa(g) {
    if (!g || !g.yardsN) return null;
    return +(g.yards / g.yardsN).toFixed(1);
  }

  function ratePct(g, kind) {
    if (!g || !g.n) return 0;
    if (kind === "success") return pct(g.success / g.n);
    if (kind === "chunks") return pct(g.chunks / g.n);
    return 0;
  }

  /** Compact snap for pack — scheme/sit/result only; no identity. */
  function slimSnap(e) {
    if (!e) return null;
    var o = {
      i: e.playIndex != null ? e.playIndex : null,
      dn: e.dn != null ? +e.dn : null,
      db: e.db || null,
      zone: e.zone && e.zone !== "ANY" ? e.zone : null,
      hash: e.hash && e.hash !== "ANY" ? e.hash : null,
      call: e.play || e.coverage || null,
      look: e.coverage || e.front || null,
      front: e.front || null,
      press: e.pressure || null,
      ptype: e.playType || null,
      gain: e.gain != null && !isNaN(+e.gain) ? +e.gain : null,
      ok: e.success === 1 || e.isStop ? 1 : e.success === 0 ? 0 : null,
      res: e.result || null,
      tag: e.flag || null,
    };
    Object.keys(o).forEach(function (k) {
      if (o[k] == null || o[k] === "") delete o[k];
    });
    return o;
  }

  function familyRows(log, side, mode, limit) {
    var anal = A();
    if (!anal || !anal.groupRates || !anal.rankCallFamilies) return [];
    var ranked = anal.rankCallFamilies(anal.groupRates(log || [], side), mode || "volume");
    return ranked.slice(0, limit || 6).map(function (g) {
      var row = {
        k: g.key,
        n: g.n,
        ok: g.success,
        chunk: g.chunks,
        okPct: ratePct(g, "success"),
        chunkPct: ratePct(g, "chunks"),
      };
      var y = ypa(g);
      if (y != null) row.ypa = y;
      return row;
    });
  }

  function shiftLines(shifts) {
    return (shifts || [])
      .slice(0, 8)
      .map(function (r) {
        var s = r && r.shift ? r.shift : r;
        if (!s) return null;
        var liveP = pct(s.livePass);
        var seasP = pct(s.seasonPass);
        var delta =
          liveP != null && seasP != null ? liveP - seasP : s.delta != null ? Math.round(+s.delta * 100) : null;
        return {
          bucket: (r && r.bucket) || s.bucket || "sit",
          livePassPct: liveP,
          seasonPassPct: seasP,
          deltaPp: delta,
          liveN: s.liveN || 0,
          seasonN: s.seasonN || 0,
          tonightLean: s.tonightLean || null,
          seasonLean: s.seasonLean || null,
        };
      })
      .filter(Boolean);
  }

  function driveRows(log, breaks) {
    var anal = A();
    if (!anal || !anal.deriveDrives) return [];
    var drives = anal.deriveDrives(log || [], { breaks: breaks || [] }) || [];
    return drives.slice(-12).map(function (d, idx) {
      var yds = 0;
      var n = (d.snaps || []).length;
      (d.snaps || []).forEach(function (s) {
        if (s && s.gain != null && !isNaN(+s.gain)) yds += +s.gain;
      });
      return {
        i: idx + 1,
        n: n,
        yds: yds,
        open: !!d.open,
        end: d.endLabel || d.end || null,
      };
    });
  }

  function matchupEv(opts) {
    var mu = M();
    if (!mu || typeof mu.rankPlaysByEv !== "function") return [];
    var plays = opts.plays || [];
    var covDist = opts.covDist || null;
    var rows = opts.scoutRows || [];
    if (!plays.length || !covDist) return [];
    try {
      return (mu.rankPlaysByEv(plays, covDist, rows, { limit: 8 }) || []).map(function (r) {
        return {
          play: r.play || r.name || r.id || "?",
          ev: r.ev != null ? +(+r.ev).toFixed(2) : null,
          n: r.n || 0,
          basis: r.basisLabel || r.basis || null,
        };
      });
    } catch (e) {
      return [];
    }
  }

  /** Program terminology — labels only, never roster names. */
  function glossarySlice() {
    var g = Gloss();
    var out = { off: {}, def: {} };
    try {
      var local = g && typeof g.loadLocal === "function" ? g.loadLocal() : null;
      var map = local || (global.TEAM && global.TEAM.position_glossary) || null;
      if (!map || typeof map !== "object") return out;
      ["off", "offense", "def", "defense"].forEach(function (side) {
        var src = map[side] || map[side === "off" ? "offense" : side === "def" ? "defense" : side];
        if (!src || typeof src !== "object") return;
        var dest = side.indexOf("o") === 0 && side !== "def" && side !== "defense" ? out.off : out.def;
        Object.keys(src).slice(0, 24).forEach(function (pos) {
          var label = src[pos];
          if (typeof label === "string" && label.trim()) dest[pos] = label.trim().slice(0, 24);
        });
      });
    } catch (e) {}
    return out;
  }

  /**
   * Fact lines that seed the digit allow-set (precomputed deltas/sums).
   * Every number the model may cite must appear here or in pack JSON atoms.
   */
  function factLines(pack) {
    var lines = [];
    var m = pack.meta || {};
    lines.push("as of snap " + (m.snapCount || 0));
    if (m.oSnaps != null) lines.push("O snaps " + m.oSnaps);
    if (m.dSnaps != null) lines.push("D snaps " + m.dSnaps);
    (pack.working || []).forEach(function (r) {
      lines.push(r.k + " n=" + r.n + " okPct=" + r.okPct + (r.ypa != null ? " ypa=" + r.ypa : ""));
    });
    (pack.beating || []).forEach(function (r) {
      lines.push("cold " + r.k + " n=" + r.n + " okPct=" + r.okPct + " chunkPct=" + r.chunkPct);
    });
    (pack.shifts || []).forEach(function (s) {
      lines.push(
        "shift " +
          s.bucket +
          " tonight " +
          s.livePassPct +
          "% pass n=" +
          s.liveN +
          " season " +
          s.seasonPassPct +
          "% deltaPp=" +
          s.deltaPp
      );
    });
    (pack.drives || []).forEach(function (d) {
      lines.push("drive " + d.i + " n=" + d.n + " yds=" + d.yds);
    });
    if (pack.sums) {
      Object.keys(pack.sums).forEach(function (k) {
        lines.push(k + "=" + pack.sums[k]);
      });
    }
    (pack.ev || []).forEach(function (r) {
      if (r.ev != null) lines.push(String(r.play) + " ev=" + r.ev + " n=" + (r.n || 0));
    });
    return lines;
  }

  function buildSums(oLog, dLog, working, beating, shifts, drives) {
    var sums = {};
    sums.o_snap_n = (oLog || []).length;
    sums.d_snap_n = (dLog || []).length;
    var oY = 0,
      oYN = 0;
    (oLog || []).forEach(function (e) {
      if (e && e.gain != null && !isNaN(+e.gain)) {
        oY += +e.gain;
        oYN++;
      }
    });
    sums.o_yards_sum = oY;
    sums.o_yards_n = oYN;
    if (oYN) sums.o_ypa = +((oY / oYN).toFixed(1));
    var dChunk = 0,
      dN = 0;
    (dLog || []).forEach(function (e) {
      if (!e) return;
      dN++;
      if (e.isChunk || e.result === "chunk" || e.result === "explosive") dChunk++;
    });
    sums.d_snap_graded_n = dN;
    sums.d_chunk_n = dChunk;
    var wN = 0;
    (working || []).forEach(function (r) {
      wN += r.n || 0;
    });
    sums.working_top_n_sum = wN;
    var bN = 0;
    (beating || []).forEach(function (r) {
      bN += r.n || 0;
    });
    sums.beating_top_n_sum = bN;
    var driveY = 0;
    (drives || []).forEach(function (d) {
      driveY += d.yds || 0;
    });
    sums.drive_yards_sum = driveY;
    sums.drive_count = (drives || []).length;
    (shifts || []).forEach(function (s, i) {
      if (s.deltaPp != null) sums["shift_" + i + "_delta_pp"] = s.deltaPp;
      if (s.livePassPct != null) sums["shift_" + i + "_live_pass_pct"] = s.livePassPct;
      if (s.seasonPassPct != null) sums["shift_" + i + "_season_pass_pct"] = s.seasonPassPct;
    });
    return sums;
  }

  function trimToBudget(pack) {
    var json = JSON.stringify(pack);
    if (json.length <= MAX_BYTES) return { pack: pack, json: json };
    /* Drop oldest snaps first, then trim EV, then drives. */
    var snaps = (pack.snaps || []).slice();
    while (json.length > MAX_BYTES && snaps.length > 40) {
      snaps = snaps.slice(Math.floor(snaps.length * 0.15));
      pack.snaps = snaps;
      pack.meta = pack.meta || {};
      pack.meta.snapTrimmed = 1;
      json = JSON.stringify(pack);
    }
    while (json.length > MAX_BYTES && (pack.ev || []).length > 3) {
      pack.ev = pack.ev.slice(0, pack.ev.length - 1);
      json = JSON.stringify(pack);
    }
    while (json.length > MAX_BYTES && (pack.drives || []).length > 4) {
      pack.drives = pack.drives.slice(1);
      json = JSON.stringify(pack);
    }
    if (json.length > MAX_BYTES) {
      pack.snaps = (pack.snaps || []).slice(-30);
      json = JSON.stringify(pack);
    }
    return { pack: pack, json: json };
  }

  function atomsFromPack(pack) {
    var llm = Llm();
    var lines = factLines(pack || {});
    var blob = lines.join("\n") + "\n" + JSON.stringify(pack || {});
    if (llm && typeof llm.extractNumericAtoms === "function") {
      return llm.extractNumericAtoms(blob);
    }
    /* Minimal fallback if summary-llm not loaded. */
    var atoms = Object.create(null);
    var re = /\d+(?:\.\d+)?/g;
    var m;
    while ((m = re.exec(blob))) atoms[m[0]] = 1;
    return atoms;
  }

  /**
   * opts: {
   *   side, offenseLog, defenseLog, shifts, breaks,
   *   session, sit, plays, covDist, scoutRows, callSheet, scoutSummary, gamePlanFocus
   * }
   */
  function build(opts) {
    opts = opts || {};
    var oLog = opts.offenseLog || [];
    var dLog = opts.defenseLog || [];
    var side = opts.side === "offense" ? "offense" : "defense";
    var snapCount = oLog.length + dLog.length;
    var gameId = (opts.session && opts.session.gameId) || opts.gameId || "local";

    if (
      cache &&
      cache.snapCount === snapCount &&
      cache.side === side &&
      cache.gameId === gameId &&
      cache.pack
    ) {
      return cache;
    }

    var working =
      side === "offense"
        ? familyRows(oLog, "offense", "working_o", 5)
        : familyRows(dLog, "defense", "working_d", 5);
    var beating =
      side === "offense"
        ? familyRows(oLog, "offense", "beating_o", 5)
        : familyRows(dLog, "defense", "beating_d", 5);
    var shifts = shiftLines(opts.shifts);
    var drives = driveRows(side === "offense" ? oLog : dLog, opts.breaks);
    var sums = buildSums(oLog, dLog, working, beating, shifts, drives);
    var sit = opts.sit || {};

    var pack = {
      v: 1,
      meta: {
        opp: (opts.session && opts.session.opp) || sit.opp || null,
        week: (opts.session && opts.session.week) || null,
        gameId: gameId,
        side: side,
        snapCount: snapCount,
        oSnaps: oLog.length,
        dSnaps: dLog.length,
        dn: sit.dn != null ? +sit.dn : null,
        db: sit.db || null,
        zone: sit.zone || null,
        hash: sit.hash || null,
      },
      snaps: (side === "offense" ? oLog : dLog).map(slimSnap).filter(Boolean),
      working: working,
      beating: beating,
      shifts: shifts,
      drives: drives,
      sums: sums,
      ev: matchupEv(opts),
      callSheet: Array.isArray(opts.callSheet) ? opts.callSheet.slice(0, 12) : [],
      focus: opts.gamePlanFocus ? String(opts.gamePlanFocus).slice(0, 240) : null,
      scout: opts.scoutSummary ? String(opts.scoutSummary).slice(0, 400) : null,
      glossary: glossarySlice(),
      facts: [],
    };
    pack.facts = factLines(pack);

    var trimmed = trimToBudget(pack);
    var atoms = atomsFromPack(trimmed.pack);
    cache = {
      snapCount: snapCount,
      side: side,
      gameId: gameId,
      pack: trimmed.pack,
      json: trimmed.json,
      atoms: atoms,
      bytes: trimmed.json.length,
      builtAt: Date.now(),
    };
    return cache;
  }

  function invalidate() {
    cache = null;
  }

  function getCached() {
    return cache;
  }

  var api = {
    MAX_BYTES: MAX_BYTES,
    build: build,
    invalidate: invalidate,
    getCached: getCached,
    atomsFromPack: atomsFromPack,
    factLines: factLines,
  };

  global.OFFGRD_BOOTHPACK = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
