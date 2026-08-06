/* ============================================================
   OFFGRD-scout-report.js — Scout Report v1
   Presentation layer over SNAP_CORPUS (same reader as Predict).
   Cheat cards · Pre-snap read sheet · Provenance badges · Readiness.
   Reuses OFFGRD_TENDENCIES.distBucket / fieldDist / pressureRate / runShare.
   Zero new aggregation RPC — two-readers rule.
   ============================================================ */
(function (root) {
  "use strict";

  var FAMILY_ORDER = ["2x2", "2x1", "3x1", "heavy", "empty", "3x2"];
  var SPIKE_PCT = 0.2;
  var SPIKE_N = 3;

  /* Fixed sideline grid — compose with distBucket (Predict), do not re-implement. */
  var CHEAT_BUCKETS = [
    { id: "1st10", label: "1st & 10", kind: "dd", down: 1, dist: "10+" },
    { id: "2ndS", label: "2nd & short (1-3)", kind: "dd", down: 2, dist: "1-3" },
    { id: "2ndM", label: "2nd & medium (4-6)", kind: "dd", down: 2, dist: "4-6" },
    { id: "2ndL", label: "2nd & long (7+)", kind: "dd", down: 2, dist: "7+" },
    { id: "3rdS", label: "3rd & short (1-3)", kind: "dd", down: 3, dist: "1-3" },
    { id: "3rdM", label: "3rd & medium (4-6)", kind: "dd", down: 3, dist: "4-6" },
    { id: "3rdL", label: "3rd & long (7+)", kind: "dd", down: 3, dist: "7+" },
    { id: "4thS", label: "4th & short", kind: "dd", down: 4, dist: "1-3" },
    { id: "rz", label: "Red zone", kind: "zone", zone: "REDZONE" }
    /* Backed-up (own ≤10) dropped: corpus only retains OWN|PLUS|REDZONE after
       yard-line derivation — OWN means own half, not ≤10. Keeping the ≤10 label
       without ≤10 data would reprint season averages as a situational tell. */
  ];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m];
    });
  }

  function snapWord(n) {
    return (+n === 1 ? "snap" : "snaps");
  }

  function T() {
    return root.OFFGRD_TENDENCIES || null;
  }

  function distBucket(n) {
    var tn = T();
    if (tn && typeof tn.distBucket === "function") return tn.distBucket(n);
    n = +n;
    if (n <= 3) return "1-3";
    if (n <= 6) return "4-6";
    if (n <= 9) return "7-9";
    return "10+";
  }

  function fieldDist(rows, field) {
    var tn = T();
    if (tn && typeof tn.fieldDist === "function") return tn.fieldDist(rows, field);
    var tally = {}, tot = 0;
    (rows || []).forEach(function (rw) {
      var k = rw[field];
      if (k == null || k === "" || k === "—") return;
      tally[k] = (tally[k] || 0) + 1;
      tot++;
    });
    var arr = Object.keys(tally).map(function (k) {
      return { k: k, n: tally[k], pct: tot ? tally[k] / tot : 0 };
    });
    arr.sort(function (a, b) { return b.n - a.n; });
    return { arr: arr, tot: tot };
  }

  function pressureRate(rows) {
    var tn = T();
    if (tn && typeof tn.pressureRate === "function") return tn.pressureRate(rows);
    if (!(rows || []).length) return 0;
    return rows.filter(function (r) { return +r.pressure === 1; }).length / rows.length;
  }

  function runShare(rows) {
    var tn = T();
    if (tn && typeof tn.runShare === "function") return tn.runShare(rows);
    if (!(rows || []).length) return 0;
    return rows.filter(function (r) { return /run/i.test(r.playType || ""); }).length / rows.length;
  }

  /* ---- §5 Confidence (sample-based only) ---- */
  function confLevel(n) {
    n = +n || 0;
    if (n >= 15) return { key: "HIGH", label: "HIGH", thin: false };
    if (n >= 8) return { key: "MED", label: "MED", thin: false };
    if (n >= 5) return { key: "LOW", label: "LOW", thin: false };
    return { key: "THIN", label: "THIN", thin: true };
  }

  function fmtPctN(n, tot) {
    if (!tot) return "—";
    var pct = Math.round((100 * n) / tot);
    return pct + "% (" + n + "/" + tot + ")";
  }

  /* Match SQL view round(100.0 * n / tot, 1) for read-sheet spot-check */
  function pct1(n, tot) {
    if (!tot) return 0;
    return Math.round((1000 * n) / tot) / 10;
  }

  function distMatches(bucketDist, distance) {
    var db = distBucket(distance);
    if (bucketDist === "7+") return db === "7-9" || db === "10+";
    return db === bucketDist;
  }

  function rowInBucket(r, b) {
    if (b.kind === "zone") {
      return String(r.fieldZone || "").toUpperCase() === b.zone;
    }
    if (+r.down !== +b.down) return false;
    return distMatches(b.dist, r.distance);
  }

  /* ---- §3 Provenance ---- */
  function tierOf(r) {
    if (r.reviewed_by) return "coach";
    if (r.prompt_version || r.confidence != null) return "ai";
    if (r.import_batch_id) return "import";
    if (r.tag_source === "import") return "import";
    if (r.tag_source === "cv") return "ai";
    if (r.tag_source === "coach" || r.tag_source === "human") return "coach";
    return "other";
  }

  function provenanceMix(rows) {
    var mix = { total: 0, coach: 0, ai: 0, import: 0, other: 0 };
    (rows || []).forEach(function (r) {
      mix.total++;
      var t = tierOf(r);
      mix[t] = (mix[t] || 0) + 1;
    });
    return mix;
  }

  function badgeHtml(mix, opts) {
    opts = opts || {};
    if (!mix || !mix.total) {
      return '<span class="sr-badge sr-badge-empty" title="No review-passed snaps in scope">No corpus</span>';
    }
    var parts = [];
    if (mix.coach) parts.push(mix.coach + " coach-verified");
    if (mix.ai) parts.push(mix.ai + " AI-tagged");
    if (mix.import) parts.push(mix.import + " imported");
    if (mix.other) parts.push(mix.other + " other");
    var tip =
      "IMPORTED · Hudl = import_batch_id, no CV · AI-TAGGED = CV provenance + reviewed · COACH-VERIFIED = reviewed_by set. Unreviewed CV never reaches this corpus.";
    var dominant =
      mix.coach >= mix.ai && mix.coach >= mix.import
        ? "coach"
        : mix.ai >= mix.import
          ? "ai"
          : "import";
    var label =
      dominant === "coach"
        ? "COACH-VERIFIED"
        : dominant === "ai"
          ? "AI-TAGGED"
          : "IMPORTED · Hudl";
    return (
      '<span class="sr-badge sr-badge-' +
      dominant +
      '" title="' +
      esc(tip) +
      '"><b>' +
      esc(label) +
      "</b> · " +
      mix.total +
      " " +
      snapWord(mix.total) +
      " · " +
      esc(parts.join(" · ")) +
      "</span>"
    );
  }

  /* ---- §2 Read sheet (def_tendency_by_family semantics) ---- */
  function defTendencyByFamily(rows) {
    var byFam = {};
    (rows || []).forEach(function (r) {
      var fam = r.formation_family;
      var cov = r.coverage;
      if (!fam || !cov || cov === "?" || cov === "—") return;
      if (!byFam[fam]) byFam[fam] = { n: 0, cov: {}, rows: [] };
      byFam[fam].n++;
      byFam[fam].cov[cov] = (byFam[fam].cov[cov] || 0) + 1;
      byFam[fam].rows.push(r);
    });
    var order = FAMILY_ORDER.concat(
      Object.keys(byFam).filter(function (k) { return FAMILY_ORDER.indexOf(k) < 0; }).sort()
    );
    return order
      .filter(function (f) { return byFam[f] && byFam[f].n; })
      .map(function (f) {
        var g = byFam[f];
        var covArr = Object.keys(g.cov)
          .map(function (k) {
            return { k: k, n: g.cov[k], pct: g.cov[k] / g.n, pct1: pct1(g.cov[k], g.n) };
          })
          .sort(function (a, b) { return b.n - a.n; });
        var fr = fieldDist(g.rows.filter(function (r) { return r.front; }), "front");
        var prN = g.rows.filter(function (r) { return +r.pressure === 1; }).length;
        /* Hot-answer callout: Cover 0 clearing ≥20% with ≥3 snaps (ticket example). */
        var zero = covArr.filter(function (c) {
          return /^cover\s*0$/i.test(String(c.k || "").trim()) && c.pct >= SPIKE_PCT && c.n >= SPIKE_N;
        })[0];
        var spike = zero
          ? { coverage: zero.k, pct: zero.pct, n: zero.n }
          : null;
        return {
          family: f,
          n: g.n,
          coverage: covArr,
          front: fr.arr[0] || null,
          pressureN: prN,
          pressurePct: g.n ? prN / g.n : 0,
          spike: spike
        };
      });
  }

  /* ---- §1 Cheat cards ---- */
  function topConcepts(rows, limit) {
    var d = fieldDist(
      (rows || []).filter(function (r) { return r.play && String(r.play).trim(); }),
      "play"
    );
    return d.arr.slice(0, limit || 3);
  }

  function buildCheatCard(bucket, rows, flavor) {
    var conf = confLevel(rows.length);
    var card = {
      id: bucket.id,
      label: bucket.label,
      n: rows.length,
      conf: conf,
      thin: conf.thin,
      flavor: flavor
    };
    if (flavor === "off") {
      var passN = rows.filter(function (r) { return /pass/i.test(r.playType || ""); }).length;
      var runN = rows.filter(function (r) { return /run/i.test(r.playType || ""); }).length;
      var typed = passN + runN;
      var passPct = typed ? passN / typed : 0;
      card.headline =
        typed
          ? Math.round(passPct * 100) +
            "% PASS · " +
            Math.round((1 - passPct) * 100) +
            "% RUN"
          : "No run/pass tags";
      card.headlineDetail = typed ? fmtPctN(passN, typed) + " pass" : "";
      card.concepts = topConcepts(rows, 3);
      card.sub = card.concepts.length
        ? "top concepts " +
          card.concepts
            .map(function (c) { return "[" + c.k + "]"; })
            .join(" ")
        : "";
      card.pressure = null;
    } else {
      var covRows = rows.filter(function (r) {
        return r.coverage && r.coverage !== "?" && r.coverage !== "—";
      });
      var cov = fieldDist(covRows, "coverage");
      var fr = fieldDist(
        rows.filter(function (r) { return r.front; }),
        "front"
      );
      var top = cov.arr[0];
      var second = cov.arr[1];
      card.headline = top
        ? String(top.k).toUpperCase() + " " + Math.round(top.pct * 100) + "%"
        : "No coverage tags";
      card.headlineDetail = top ? fmtPctN(top.n, cov.tot) : "";
      card.second = second
        ? String(second.k) + " " + fmtPctN(second.n, cov.tot)
        : "";
      card.sub = fr.arr[0]
        ? "Front lean: " + fr.arr[0].k + " " + fmtPctN(fr.arr[0].n, fr.tot)
        : "";
      var pN = rows.filter(function (r) { return +r.pressure === 1; }).length;
      card.pressure =
        rows.length
          ? {
              n: pN,
              m: rows.length,
              pct: pN / rows.length,
              line:
                "Pressure on " +
                pN +
                " of " +
                rows.length +
                " " +
                snapWord(rows.length) +
                " (" +
                Math.round((100 * pN) / rows.length) +
                "%)"
            }
          : null;
    }
    return card;
  }

  function cheatCardsFor(rows, flavor) {
    return CHEAT_BUCKETS.map(function (b) {
      var g = (rows || []).filter(function (r) { return rowInBucket(r, b); });
      return buildCheatCard(b, g, flavor);
    });
  }

  function cardsToCsv(cards, flavor) {
    var lines =
      flavor === "off"
        ? ["bucket,snaps,conf,pass_run,top_concepts"]
        : ["bucket,snaps,conf,top_coverage,second,front,pressure"];
    cards.forEach(function (c) {
      if (flavor === "off") {
        lines.push(
          [
            csvCell(c.label),
            c.n,
            c.conf.label,
            csvCell(c.headline),
            csvCell(
              (c.concepts || [])
                .map(function (x) { return x.k + " " + Math.round(x.pct * 100) + "%"; })
                .join("; ")
            )
          ].join(",")
        );
      } else {
        lines.push(
          [
            csvCell(c.label),
            c.n,
            c.conf.label,
            csvCell(c.headline + (c.headlineDetail ? " " + c.headlineDetail : "")),
            csvCell(c.second || ""),
            csvCell(c.sub || ""),
            csvCell(c.pressure ? c.pressure.line : "")
          ].join(",")
        );
      }
    });
    return lines.join("\n");
  }

  function csvCell(s) {
    s = String(s == null ? "" : s);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function downloadCsv(filename, text) {
    try {
      var blob = new Blob([text], { type: "text/csv;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {}
  }

  /* ---- §4 Readiness ---- */
  function teamId() {
    try {
      if (root.OFFGRD_CALLER_BRIDGE && root.OFFGRD_CALLER_BRIDGE.getTeamId) {
        return root.OFFGRD_CALLER_BRIDGE.getTeamId();
      }
    } catch (e) {}
    try {
      if (root.OFFGRD_PROGRAM && root.OFFGRD_PROGRAM.teamId) return root.OFFGRD_PROGRAM.teamId;
    } catch (e2) {}
    return null;
  }

  function cloud() {
    try {
      if (root.OFFGRD_CALLER_BRIDGE && root.OFFGRD_CALLER_BRIDGE.cloud) {
        return root.OFFGRD_CALLER_BRIDGE.cloud;
      }
    } catch (e) {}
    return root.Cloud || null;
  }

  function aggregateBatches(batches) {
    var n = 0, nF1 = 0, nRev = 0, nCv = 0, nSkip = 0;
    (batches || []).forEach(function (b) {
      n += b.n || 0;
      nF1 += b.n_f1 || 0;
      nRev += b.n_review || 0;
      nCv += b.n_cv || 0;
      nSkip += b.n_skip || 0;
    });
    return { n: n, n_f1: nF1, n_review: nRev, n_cv: nCv, n_skip: nSkip, batches: batches || [] };
  }

  function jobDone(jobs) {
    return (jobs || []).some(function (j) {
      var st = String(j.status || "").toLowerCase();
      return st === "done" || st === "complete" || st === "completed";
    });
  }

  function jobQueued(jobs) {
    return (jobs || []).some(function (j) {
      var st = String(j.status || "").toLowerCase();
      return st === "queued" || st === "running" || st === "processing";
    });
  }

  function buildReadiness(opp, batchAgg, jobs, corpusN) {
    var imported = batchAgg.n > 0;
    var frames = batchAgg.n_f1 > 0;
    var framesDone = imported && batchAgg.n_f1 + batchAgg.n_skip >= batchAgg.n && batchAgg.n_f1 > 0;
    var autoDone = jobDone(jobs) || batchAgg.n_cv > 0;
    var autoRunning = !autoDone && jobQueued(jobs);
    var reviewDone = autoDone && batchAgg.n_review === 0;
    var reportReady = corpusN > 0;

    var pickBatch = function (pred) {
      var list = batchAgg.batches || [];
      for (var i = 0; i < list.length; i++) {
        if (pred(list[i])) return list[i];
      }
      return list[0] || null;
    };

    return {
      opponent: opp,
      steps: [
        {
          id: 1,
          label: "Breakdown imported",
          done: imported,
          detail: imported ? batchAgg.n + " " + snapWord(batchAgg.n) : "No Hudl import yet",
          action: imported ? null : { kind: "import", label: "Import" }
        },
        {
          id: 2,
          label: "Frames captured",
          done: framesDone || (frames && autoDone),
          detail: imported
            ? batchAgg.n_f1 + "/" + batchAgg.n + " F1"
            : "—",
          action:
            imported && !(framesDone || autoDone)
              ? {
                  kind: "capture",
                  label: "Capture frames",
                  batch: pickBatch(function (b) {
                    return (b.n_f1 || 0) < (b.n || 0);
                  })
                }
              : null
        },
        {
          id: 3,
          label: "Auto-Scout run",
          done: autoDone,
          detail: autoDone
            ? batchAgg.n_cv
              ? batchAgg.n_cv + " CV-tagged"
              : "Job done"
            : autoRunning
              ? "Job running…"
              : frames
                ? "Ready to run"
                : "Needs frames",
          action:
            !autoDone && frames
              ? {
                  kind: "autoscout",
                  label: "Run Auto-Scout",
                  batch: pickBatch(function (b) {
                    return (b.n_f1 || 0) > 0 && !(b.n_cv > 0);
                  })
                }
              : null
        },
        {
          id: 4,
          label: "Reviewed",
          done: reviewDone || (reportReady && batchAgg.n_review === 0 && autoDone),
          detail: autoDone
            ? batchAgg.n_review
              ? batchAgg.n_review + " flagged remaining"
              : "Queue clear"
            : "—",
          action:
            batchAgg.n_review > 0
              ? {
                  kind: "review",
                  label: "Review " + batchAgg.n_review + " flagged",
                  batch: pickBatch(function (b) {
                    return (b.n_review || 0) > 0;
                  })
                }
              : null
        },
        {
          id: 5,
          label: "Report ready",
          done: reportReady,
          detail: reportReady
            ? corpusN + " review-passed " + snapWord(corpusN)
            : "Waiting on clear corpus",
          action: null
        }
      ]
    };
  }

  function runAction(action) {
    if (!action) return;
    if (action.kind === "import") {
      if (typeof root.openImport === "function") root.openImport("autoscout");
      return;
    }
    var b = action.batch;
    if (!b) {
      if (action.kind === "import" && typeof root.openImport === "function") {
        root.openImport("autoscout");
      }
      return;
    }
    var fakeBtn = {
      getAttribute: function (k) {
        if (k === "data-batch") return b.import_batch_id || "";
        if (k === "data-opp") return b.opponent || "";
        if (k === "data-week") return b.week || "";
        if (k === "data-side") return b.side || "";
        return "";
      }
    };
    if (action.kind === "capture" || action.kind === "autoscout") {
      if (typeof root.openFrameCaptureForBatch === "function") {
        root.openFrameCaptureForBatch(fakeBtn);
      }
      return;
    }
    if (action.kind === "review") {
      if (typeof root.openCvReviewForBatch === "function") {
        root.openCvReviewForBatch(fakeBtn);
      }
    }
  }

  /* ---- CSS ---- */
  function css() {
    return (
      '<style id="sr-css">' +
      ".sr-wrap{color:var(--ink,var(--rd-text,#13294B))}" +
      ".sr-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}" +
      ".sr-head .pl{font-size:18px}" +
      ".sr-sec{margin:16px 0 10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}" +
      ".sr-sec h3{margin:0;font-size:15px;font-weight:800}" +
      ".sr-badge{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:3px 8px;border-radius:6px;border:1px solid var(--line,var(--rd-border,#d0d7e0));background:var(--chip,var(--rd-surface-2,#f4f7fb));cursor:help}" +
      ".sr-badge b{letter-spacing:.03em}" +
      ".sr-badge-coach{border-color:#2d8a4e;color:#1d7a45}" +
      ".sr-badge-ai{border-color:#3a6ea8;color:#2a5a8a}" +
      ".sr-badge-import{border-color:#8a7a3a;color:#6a5a1a}" +
      ".sr-ready{display:flex;gap:0;flex-wrap:wrap;margin:8px 0 14px;border:1px solid var(--line,var(--rd-border,#d0d7e0));border-radius:10px;overflow:hidden;background:var(--panel,var(--rd-surface,#fff))}" +
      ".sr-step{flex:1 1 120px;min-width:110px;padding:10px 12px;border-right:1px solid var(--line,var(--rd-border,#d0d7e0));position:relative}" +
      ".sr-step:last-child{border-right:0}" +
      ".sr-step.done{background:rgba(45,138,78,.08)}" +
      ".sr-step .sr-n{font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;opacity:.55}" +
      ".sr-step .sr-lbl{font-size:13px;font-weight:800;margin:2px 0}" +
      ".sr-step .sr-det{font-size:11px;opacity:.7;margin-bottom:6px}" +
      ".sr-step .sr-check{color:#1d7a45;font-weight:800;margin-right:4px}" +
      ".sr-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin:8px 0}" +
      ".sr-card{border:1px solid var(--line,var(--rd-border,#d0d7e0));border-radius:8px;padding:10px 12px;background:var(--panel,var(--rd-surface,#fff));min-height:120px}" +
      ".sr-card.thin{opacity:.48;background:var(--chip,var(--rd-surface-2,#f0f2f5))}" +
      ".sr-card .sr-sit{font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;opacity:.65;margin-bottom:4px}" +
      ".sr-card .sr-hl{font-size:16px;font-weight:900;line-height:1.15;margin:0 0 2px}" +
      ".sr-card .sr-2nd{font-size:12px;opacity:.75;margin:0 0 4px}" +
      ".sr-card .sr-sub{font-size:12px;margin:0 0 4px}" +
      ".sr-card .sr-pr{font-size:11px;margin:0 0 6px}" +
      ".sr-card .sr-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px}" +
      ".sr-chip{font-size:10px;font-weight:800;padding:2px 6px;border-radius:4px;border:1px solid var(--line,#ccc)}" +
      ".sr-chip-HIGH{background:#e5f6eb;border-color:#2d8a4e;color:#1d7a45}" +
      ".sr-chip-MED{background:#eef3f9;border-color:#3a6ea8;color:#2a5a8a}" +
      ".sr-chip-LOW{background:#fbf3e0;border-color:#b8860b;color:#8a5a05}" +
      ".sr-chip-THIN{background:#eee;border-color:#999;color:#666}" +
      ".sr-thin-note{font-size:10px;font-style:italic;opacity:.75;margin-top:4px}" +
      ".sr-read-tbl{width:100%;border-collapse:collapse;font-size:13px;margin:6px 0 10px}" +
      ".sr-read-tbl th,.sr-read-tbl td{border:1px solid var(--line,var(--rd-border,#d0d7e0));padding:8px 10px;text-align:left;vertical-align:top}" +
      ".sr-read-tbl th{background:var(--chip,var(--rd-surface-2,#eef2f6));font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:.04em}" +
      ".sr-bars{display:flex;flex-wrap:wrap;gap:4px 10px}" +
      ".sr-bar-item{font-weight:700}" +
      ".sr-spike{font-size:12px;margin-top:4px;font-weight:700;color:var(--accent,#a8112b)}" +
      ".sr-actions{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 8px}" +
      ".sr-empty{font-size:13px;opacity:.7;margin:8px 0}" +
      ".sr-mgr-ready{margin:8px 0 4px}" +
      "@media print{" +
      ".sr-no-print{display:none!important}" +
      ".sr-ready{display:none!important}" +
      ".sr-cards{grid-template-columns:repeat(5,1fr);gap:6px}" +
      ".sr-card{break-inside:avoid;min-height:90px;padding:8px;font-size:11px}" +
      ".sr-card .sr-hl{font-size:13px}" +
      ".sr-card.thin{opacity:.7}" +
      ".sr-wrap{color:#111}" +
      ".panel{break-inside:avoid}" +
      "}" +
      "</style>"
    );
  }

  function renderCardHtml(c) {
    var h =
      '<div class="sr-card' +
      (c.thin ? " thin" : "") +
      '">' +
      '<div class="sr-sit">' +
      esc(c.label) +
      "</div>" +
      '<div class="sr-hl">' +
      esc(c.headline) +
      "</div>";
    if (c.headlineDetail) {
      h += '<div class="sr-2nd">' + esc(c.headlineDetail);
      if (c.second) h += " · " + esc(c.second);
      h += "</div>";
    } else if (c.second) {
      h += '<div class="sr-2nd">' + esc(c.second) + "</div>";
    }
    if (c.sub) h += '<div class="sr-sub">' + esc(c.sub) + "</div>";
    if (c.pressure && c.pressure.n > 0) {
      h += '<div class="sr-pr">' + esc(c.pressure.line) + "</div>";
    }
    h +=
      '<div class="sr-meta"><span>' +
      c.n +
      " " +
      snapWord(c.n) +
      '</span><span class="sr-chip sr-chip-' +
      c.conf.key +
      '">' +
      esc(c.conf.label) +
      "</span></div>";
    if (c.thin) {
      h +=
        '<div class="sr-thin-note">thin sample — treat as lean, not law</div>';
    }
    h += "</div>";
    return h;
  }

  function renderReadSheetHtml(families) {
    if (!families.length) {
      return '<p class="sr-empty">No formation-family × coverage rows yet (need review-passed snaps with family + coverage).</p>';
    }
    var h =
      '<table class="sr-read-tbl"><thead><tr><th>Our look</th><th>Their coverage</th><th>Front lean</th><th>Pressure</th><th>n</th></tr></thead><tbody>';
    families.forEach(function (f) {
      var bars = f.coverage
        .slice(0, 4)
        .map(function (c) {
          return (
            '<span class="sr-bar-item">' +
            esc(c.k) +
            " " +
            c.pct1 +
            "%</span>"
          );
        })
        .join(" · ");
      var fr = f.front
        ? esc(f.front.k) + " " + fmtPctN(f.front.n, f.n)
        : "—";
      var pr = fmtPctN(f.pressureN, f.n);
      var callout = "";
      if (f.spike) {
        callout =
          '<div class="sr-spike">⚡ ' +
          esc(f.spike.coverage) +
          " spike vs " +
          esc(f.family) +
          " — have a hot answer</div>";
      }
      h +=
        "<tr><td><b>" +
        esc(f.family) +
        "</b>" +
        callout +
        '</td><td><div class="sr-bars">' +
        bars +
        "</div></td><td>" +
        fr +
        "</td><td>" +
        pr +
        "</td><td>" +
        f.n +
        "</td></tr>";
    });
    h += "</tbody></table>";
    h +=
      '<p class="foot">Same gate as <code>def_tendency_by_family</code> — review-passed corpus only. % = round(100 × n / family total, 1).</p>';
    return h;
  }

  function renderReadinessHtml(ready) {
    if (!ready) return "";
    var h = '<div class="sr-ready" role="list" aria-label="Scouting readiness">';
    ready.steps.forEach(function (s) {
      h +=
        '<div class="sr-step' +
        (s.done ? " done" : "") +
        '" role="listitem">' +
        '<div class="sr-n">' +
        (s.done ? '<span class="sr-check">✓</span>' : "") +
        "Step " +
        s.id +
        "</div>" +
        '<div class="sr-lbl">' +
        esc(s.label) +
        "</div>" +
        '<div class="sr-det">' +
        esc(s.detail) +
        "</div>";
      if (s.action) {
        h +=
          '<button type="button" class="ghost sr-no-print sr-act" data-sr-act="' +
          esc(s.action.kind) +
          '" style="padding:3px 9px;font-size:12px;font-weight:800;border-color:var(--accent);color:var(--accent)">' +
          esc(s.action.label) +
          "</button>";
      }
      h += "</div>";
    });
    h += "</div>";
    return h;
  }

  function sectionHead(title, mix, extraActions) {
    return (
      '<div class="sr-sec"><h3>' +
      esc(title) +
      "</h3>" +
      badgeHtml(mix) +
      (extraActions || "") +
      "</div>"
    );
  }

  function buildReportHtml(defRows, offRows, opts) {
    opts = opts || {};
    var oppName = opts.oppName || opts.opponent || "Opponent";
    var corpus = (defRows || []).concat(offRows || []);
    var mixAll = provenanceMix(corpus);
    var flavor = (defRows || []).length ? "def" : (offRows || []).length ? "off" : "def";
    var cardRows = flavor === "def" ? defRows : offRows;
    var cards = cheatCardsFor(cardRows || [], flavor);
    var families = flavor === "def" ? defTendencyByFamily(defRows || []) : [];
    var mixCards = provenanceMix(cardRows || []);
    var mixRead = provenanceMix(defRows || []);

    var h = css();
    h += '<div class="sr-wrap panel">';
    h +=
      '<div class="sr-head">' +
      (typeof root.crest === "function" && opts.opponent && opts.opponent !== "ANY"
        ? root.crest(opts.opponent, 34)
        : "") +
      '<span class="pl"><b>' +
      esc(oppName) +
      "</b> — scout report</span>" +
      badgeHtml(mixAll) +
      '<button type="button" class="ghost sr-no-print" style="margin-left:auto" data-sr-print="all">Print</button>' +
      "</div>";

    h +=
      '<div class="sr-sec"><h3>Scouting readiness</h3></div>' +
      '<div id="srReadyHost"><p class="foot sr-no-print">Loading pipeline state…</p></div>';

    if (!(corpus || []).length) {
      h +=
        '<p class="sr-empty">No review-passed snaps for this opponent in scope. Import a breakdown and clear the Auto-Scout review queue — the report reads the same corpus as Predict.</p></div>';
      return { html: h, cards: cards, flavor: flavor, families: families };
    }

    /* Read sheet first when defense (most game-useful); cards after */
    if (flavor === "def") {
      h += sectionHead(
        "Pre-snap read sheet",
        mixRead,
        '<span class="sr-actions sr-no-print"><button type="button" class="ghost" data-sr-print="read" style="padding:3px 9px">Print</button></span>'
      );
      h +=
        '<p class="foot">When you show this formation family, here is what to expect from their coverage.</p>';
      h += '<div data-sr-section="read">' + renderReadSheetHtml(families) + "</div>";
    }

    h += sectionHead(
      "Situational tendency cheat cards",
      mixCards,
      '<span class="sr-actions sr-no-print">' +
        '<button type="button" class="ghost" data-sr-print="cards" style="padding:3px 9px">Print</button>' +
        '<button type="button" class="ghost" data-sr-csv="cards" style="padding:3px 9px">CSV</button>' +
        "</span>"
    );
    h +=
      '<p class="foot">' +
      (flavor === "off"
        ? "Offense-scout corpus — run/pass flavor by situation."
        : "Defense-scout corpus — coverage / front / pressure by situation.") +
      " Confidence is sample size only. Every % shows (n).</p>";
    h += '<div class="sr-cards" data-sr-section="cards">';
    cards.forEach(function (c) {
      h += renderCardHtml(c);
    });
    h += "</div>";

    /* If both sides present, append the other flavor cards lightly */
    if ((defRows || []).length && (offRows || []).length && flavor === "def") {
      var offCards = cheatCardsFor(offRows, "off");
      var mixOff = provenanceMix(offRows);
      h += sectionHead(
        "Their offense — situational run/pass",
        mixOff,
        '<span class="sr-actions sr-no-print"><button type="button" class="ghost" data-sr-csv="offcards" style="padding:3px 9px">CSV</button></span>'
      );
      h += '<div class="sr-cards" data-sr-section="offcards">';
      offCards.forEach(function (c) {
        h += renderCardHtml(c);
      });
      h += "</div>";
    }

    h += "</div>";
    return {
      html: h,
      cards: cards,
      offCards: (defRows || []).length && (offRows || []).length ? cheatCardsFor(offRows, "off") : null,
      flavor: flavor,
      families: families,
      mix: mixAll
    };
  }

  function wireHost(host, built, opts) {
    if (!host || !built) return;
    var opp = (opts && opts.opponent) || "opp";
    var safeOpp = String(opp).replace(/[^\w\-]+/g, "_").slice(0, 40);

    host.querySelectorAll("[data-sr-print]").forEach(function (btn) {
      btn.onclick = function () {
        window.print();
      };
    });
    host.querySelectorAll("[data-sr-csv]").forEach(function (btn) {
      btn.onclick = function () {
        var which = btn.getAttribute("data-sr-csv");
        if (which === "offcards" && built.offCards) {
          downloadCsv(
            "offgrd-cheat-cards-off-" + safeOpp + ".csv",
            cardsToCsv(built.offCards, "off")
          );
        } else {
          downloadCsv(
            "offgrd-cheat-cards-" + safeOpp + ".csv",
            cardsToCsv(built.cards, built.flavor)
          );
        }
      };
    });

    /* Store actions on host for readiness buttons after async fill */
    host._srOpts = opts;
    host._srBuilt = built;
  }

  async function fillReadiness(host, opts) {
    var readyHost = host && host.querySelector("#srReadyHost");
    if (!readyHost) return null;
    var opp = opts && opts.opponent;
    if (!opp || opp === "ANY") {
      readyHost.innerHTML =
        '<p class="foot sr-no-print">Select an opponent to see the import → frames → Auto-Scout → review → report chain.</p>';
      return null;
    }
    var C = cloud();
    var tid = teamId();
    var corpusN = ((opts.defRows || []).length || 0) + ((opts.offRows || []).length || 0);
    if (!C || !tid || typeof C.listImportBatches !== "function") {
      readyHost.innerHTML =
        '<p class="foot sr-no-print">Sign in to track scouting readiness for ' +
        esc(opp) +
        ".</p>";
      return null;
    }
    try {
      var batches = await C.listImportBatches(tid);
      var forOpp = (batches || []).filter(function (b) {
        return b.opponent === opp;
      });
      var jobs = [];
      if (typeof C.listAutoScoutJobs === "function") {
        try {
          jobs = await C.listAutoScoutJobs(tid, { opponent: opp });
        } catch (eJ) {
          jobs = [];
        }
      }
      var ready = buildReadiness(opp, aggregateBatches(forOpp), jobs, corpusN);
      readyHost.innerHTML = renderReadinessHtml(ready);
      readyHost.querySelectorAll(".sr-act").forEach(function (btn, idx) {
        btn.onclick = function () {
          var step = ready.steps.filter(function (s) { return s.action; })[
            [].indexOf.call(readyHost.querySelectorAll(".sr-act"), btn)
          ];
          /* Re-find by kind */
          var kind = btn.getAttribute("data-sr-act");
          var match = ready.steps.filter(function (s) {
            return s.action && s.action.kind === kind;
          })[0];
          if (match) runAction(match.action);
        };
      });
      return ready;
    } catch (e) {
      readyHost.innerHTML =
        '<p class="foot" style="color:var(--bad)">Could not load readiness: ' +
        esc(e && e.message ? e.message : e) +
        "</p>";
      return null;
    }
  }

  function injectInto(host, defRows, offRows, opts) {
    if (!host) return null;
    opts = opts || {};
    opts.defRows = defRows || [];
    opts.offRows = offRows || [];
    var built = buildReportHtml(defRows || [], offRows || [], opts);
    host.innerHTML = built.html;
    wireHost(host, built, opts);
    fillReadiness(host, opts);
    try {
      root.OFFGRD_LAST_SCOUT_REPORT = {
        v: 1,
        generatedAt: new Date().toISOString(),
        opponent: opts.opponent || null,
        mix: built.mix,
        flavor: built.flavor,
        families: (built.families || []).map(function (f) {
          return { family: f.family, n: f.n, coverage: f.coverage };
        })
      };
    } catch (e) {}
    return built;
  }

  /** Compact readiness strip for Auto-Scout import manager (per opponent). */
  async function renderManagerReadiness(host, opponent) {
    if (!host || !opponent) return;
    var C = cloud();
    var tid = teamId();
    if (!C || !tid || typeof C.listImportBatches !== "function") return;
    try {
      var batches = await C.listImportBatches(tid);
      var forOpp = (batches || []).filter(function (b) {
        return b.opponent === opponent;
      });
      var jobs = [];
      if (typeof C.listAutoScoutJobs === "function") {
        try {
          jobs = await C.listAutoScoutJobs(tid, { opponent: opponent });
        } catch (eJ) {
          jobs = [];
        }
      }
      var corpusN = 0;
      try {
        var snaps = root.SNAP_CORPUS || [];
        corpusN = snaps.filter(function (r) {
          return r.opponent === opponent;
        }).length;
      } catch (eC) {}
      var ready = buildReadiness(opponent, aggregateBatches(forOpp), jobs, corpusN);
      var wrap = document.createElement("div");
      wrap.className = "sr-mgr-ready sr-no-print";
      wrap.innerHTML = css() + renderReadinessHtml(ready);
      host.appendChild(wrap);
      wrap.querySelectorAll(".sr-act").forEach(function (btn) {
        btn.onclick = function () {
          var kind = btn.getAttribute("data-sr-act");
          var match = ready.steps.filter(function (s) {
            return s.action && s.action.kind === kind;
          })[0];
          if (match) runAction(match.action);
        };
      });
    } catch (e) {}
  }

  root.OFFGRD_SCOUT_REPORT = {
    injectInto: injectInto,
    buildReportHtml: buildReportHtml,
    cheatCardsFor: cheatCardsFor,
    defTendencyByFamily: defTendencyByFamily,
    provenanceMix: provenanceMix,
    badgeHtml: badgeHtml,
    confLevel: confLevel,
    buildReadiness: buildReadiness,
    fillReadiness: fillReadiness,
    renderManagerReadiness: renderManagerReadiness,
    CHEAT_BUCKETS: CHEAT_BUCKETS,
    distBucket: distBucket
  };
})(typeof window !== "undefined" ? window : globalThis);
