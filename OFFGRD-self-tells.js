/* OFFGRD-self-tells.js — own-offense formation tells.
   Consumes OFFGRD-tendencies sequence math. No storage, no opponent rows. */
(function (root) {
  "use strict";

  var TELL_DEVIATION = 0.15;
  var TELL_MIN_N = 8;
  var MIN_CORPUS = 20;
  var EMPTY_COPY = "Import your own offense to see your tells";

  function tellFires(runPct, baseline, n) {
    return n >= TELL_MIN_N && Math.abs(runPct - baseline) >= TELL_DEVIATION;
  }

  function assertOurs(rows) {
    (rows || []).forEach(function (r) {
      if (r && r.side === "off") throw new Error("self-tells: opponent offense row");
    });
  }

  function normPlay(s) {
    var PM = root.OFFGRD_PLAY_MAP;
    if (PM && typeof PM.normCall === "function") return PM.normCall(s);
    return String(s == null ? "" : s).trim().toLowerCase();
  }

  function isRun(r) {
    return /run|rush/i.test(String((r && r.playType) || ""));
  }

  function runPctOf(rows) {
    var n = (rows || []).length;
    if (!n) return 0;
    var run = 0;
    rows.forEach(function (r) { if (isRun(r)) run++; });
    return run / n;
  }

  function structureOf(row, raw) {
    var OS = root.OFFGRD_OPP_SHELLS;
    if (OS && typeof OS.resolveFormation === "function") {
      var resolved = OS.resolveFormation(raw, {
        offStructure: row && (row.offStructure || row.off_structure),
        side: "ours"
      });
      if (resolved && resolved.structure) return String(resolved.structure);
      if (resolved && resolved.source === "canon" && resolved.formation) {
        return String(resolved.formation.id || resolved.formation.structure || "builtin");
      }
      if (resolved && resolved.formation && resolved.formation.id && !resolved.unresolved) {
        return String(resolved.formation.id);
      }
      return "unresolved";
    }
    var rowStruct = String((row && (row.offStructure || row.off_structure)) || "").trim();
    return rowStruct || "unresolved";
  }

  function topCalls(rows) {
    var by = {};
    var label = {};
    (rows || []).forEach(function (r) {
      var raw = String((r && r.play) || "").trim();
      if (!raw) return;
      var key = normPlay(raw);
      if (!key) return;
      if (!by[key]) { by[key] = 0; label[key] = {}; }
      by[key]++;
      label[key][raw] = (label[key][raw] || 0) + 1;
    });
    return Object.keys(by).map(function (k) {
      var best = "";
      var bestN = -1;
      Object.keys(label[k]).forEach(function (raw) {
        if (label[k][raw] > bestN) { bestN = label[k][raw]; best = raw; }
      });
      return { key: k, name: best, n: by[k] };
    }).sort(function (a, b) { return b.n - a.n || (a.name < b.name ? -1 : 1); }).slice(0, 3);
  }

  function bucket(rows, keyFn) {
    var map = {};
    var order = [];
    (rows || []).forEach(function (r) {
      var k = keyFn(r);
      if (!k) return;
      if (!map[k]) { map[k] = []; order.push(k); }
      map[k].push(r);
    });
    return { map: map, order: order };
  }

  function summarize(key, rows, baseline) {
    var n = rows.length;
    var runPct = runPctOf(rows);
    var fires = tellFires(runPct, baseline, n);
    var muted = n < TELL_MIN_N;
    return {
      key: key,
      n: n,
      runPct: muted ? null : runPct,
      delta: muted ? null : runPct - baseline,
      tell: fires,
      muted: muted,
      topCalls: topCalls(rows)
    };
  }

  function oursRows() {
    if (typeof root.gamesRows === "function") return root.gamesRows("ours") || [];
    if (Array.isArray(root.OFF_DATA)) return root.OFF_DATA.slice();
    return [];
  }

  function compute(rows) {
    assertOurs(rows);
    var list = rows || [];
    if (list.length < MIN_CORPUS) {
      return { empty: true, corpus: list.length, copy: EMPTY_COPY, formations: [], structures: [], sequences: null };
    }
    var baseline = runPctOf(list);
    var forms = bucket(list, function (r) {
      var raw = String((r && r.formation) || "").trim();
      return raw;
    });
    var formations = forms.order.map(function (k) {
      var row0 = forms.map[k][0];
      var s = summarize(k, forms.map[k], baseline);
      s.formation = k;
      s.structure = structureOf(row0, k);
      return s;
    });
    formations.sort(function (a, b) {
      if (a.tell !== b.tell) return a.tell ? -1 : 1;
      if (a.muted !== b.muted) return a.muted ? 1 : -1;
      if (a.tell && b.tell) {
        var da = Math.abs(a.delta || 0), db = Math.abs(b.delta || 0);
        if (da !== db) return db - da;
      }
      return b.n - a.n;
    });
    var structs = {};
    list.forEach(function (r) {
      var raw = String((r && r.formation) || "").trim();
      var st = structureOf(r, raw);
      if (!structs[st]) structs[st] = [];
      structs[st].push(r);
    });
    var structures = Object.keys(structs).map(function (k) {
      var s = summarize(k, structs[k], baseline);
      s.structure = k;
      return s;
    });
    var sequences = null;
    var T = root.OFFGRD_TENDENCIES;
    if (T && typeof T.computeSequences === "function") sequences = T.computeSequences(list);
    return {
      empty: false,
      corpus: list.length,
      baselineRun: baseline,
      formations: formations,
      structures: structures,
      sequences: sequences
    };
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[m];
    });
  }

  function pct(x) {
    return Math.round((x || 0) * 100);
  }

  function callListHtml(calls, n) {
    if (!calls || !calls.length || !n) return "";
    var h = '<div class="yt-kicker">Top calls</div><ol class="yt-calls">';
    calls.forEach(function (c, i) {
      h += '<li><span class="yt-rank">' + (i + 1) + '</span><span class="yt-call">' + esc(c.name) + '</span><span class="yt-share">' + Math.round(100 * c.n / n) + "%</span></li>";
    });
    return h + "</ol>";
  }

  function formationCard(name, f, baseline, compact) {
    var run = pct(f.runPct);
    var pass = pct(1 - f.runPct);
    var passTell = f.tell && f.runPct < baseline;
    var side = f.tell ? (passTell ? "pass" : "run") : "";
    var h = '<article class="yt-card' + (side ? (" is-tell is-" + side) : "") + '">';
    h += '<header class="yt-card-h"><span class="yt-title">' + esc(name) + "</span>";
    if (f.tell) h += '<span class="yt-flag is-' + side + '">' + (passTell ? "Pass tell" : "Run tell") + "</span>";
    h += '<span class="yt-n">' + f.n + " plays</span></header>";
    h += '<div class="yt-big">' + (passTell ? pass : run) + "<span>%</span></div>";
    h += '<div class="yt-sub">' + (passTell ? ("pass · " + run + "% run") : ("run · " + pass + "% pass")) + "</div>";
    if (!compact) h += callListHtml(f.topCalls, f.n);
    h += "</article>";
    return h;
  }

  function groupHtml(list, baseline, nameOf, compact) {
    var ready = [];
    var small = [];
    (list || []).forEach(function (f) { (f.muted ? small : ready).push(f); });
    var h = "";
    if (ready.length) {
      h += '<div class="yt-grid">';
      ready.forEach(function (f) { h += formationCard(nameOf(f), f, baseline, compact); });
      h += "</div>";
    }
    if (small.length) {
      h += '<p class="yt-note">Under 8 plays: ' + small.map(function (f) {
        return esc(nameOf(f) + " · " + f.n + " plays");
      }).join(" · ") + "</p>";
    }
    return h;
  }

  function renderHtml(rows) {
    var rep = compute(rows);
    if (rep.empty) {
      return '<div class="lbl">Your tells</div><p class="foot">' + esc(rep.copy) + "</p>";
    }
    var base = pct(rep.baselineRun);
    var flagged = rep.formations.filter(function (f) { return f.tell; }).length;
    var h = '<div class="lbl">Your tells</div>';
    h += '<p class="yt-lead">Your run rate is <b>' + base + "%</b> across " + rep.corpus + " plays. ";
    h += flagged
      ? (flagged + (flagged === 1 ? " formation sits" : " formations sit") + " 15 or more points off that rate. The big number is that lean.")
      : "Nothing sits 15 or more points off that rate yet. The big number is run%.";
    h += "</p>";
    if (!rep.formations.length) {
      h += '<p class="yt-lead">No formation tags on these plays.</p>';
    } else {
      h += groupHtml(rep.formations, rep.baselineRun, function (f) { return f.formation; }, false);
    }
    if (rep.structures.length) {
      h += '<div class="lbl" style="margin-top:16px">By structure</div>';
      h += groupHtml(rep.structures.slice().sort(function (a, b) {
        if (a.tell !== b.tell) return a.tell ? -1 : 1;
        if (a.muted !== b.muted) return a.muted ? 1 : -1;
        return b.n - a.n;
      }), rep.baselineRun, function (s) { return s.structure; }, true);
    }
    if (rep.sequences && root.OFFGRD_TENDENCIES && typeof root.OFFGRD_TENDENCIES.sequenceHtml === "function") {
      h += '<div class="yt-own-seq">' + root.OFFGRD_TENDENCIES.sequenceHtml(rep.sequences, "Your sequence") + "</div>";
    }
    return h;
  }

  function mount(host, rows) {
    if (!host) return null;
    var list = rows || oursRows();
    host.innerHTML = renderHtml(list);
    return compute(list);
  }

  root.OFFGRD_SELF_TELLS = {
    TELL_DEVIATION: TELL_DEVIATION,
    TELL_MIN_N: TELL_MIN_N,
    MIN_CORPUS: MIN_CORPUS,
    EMPTY_COPY: EMPTY_COPY,
    tellFires: tellFires,
    normPlay: normPlay,
    compute: compute,
    renderHtml: renderHtml,
    mount: mount,
    oursRows: oursRows
  };
})(typeof window !== "undefined" ? window : globalThis);
