/* ============================================================
   OFFGRD-tendencies.js — Steal B: Auto Tendency Reports
   Heat-mapped tables from charted scouting_games rows.
   Reuses the Scout predictor's D&D buckets + % math (same formulas).
   Flag: ?tendency=0|1 | localStorage.offgrd_tendency_reports | OFFGRD_CONFIG.tendencyReports
   ============================================================ */
(function (root) {
  "use strict";

  const DOWNS = [1, 2, 3, 4];
  const DISTS = ["1-3", "4-6", "7-9", "10+"];
  const COV_ORDER = ["Cover 0", "Cover 1", "Cover 2", "Cover 3", "Cover 4", "Cover 6", "2-Man", "Tampa 2", "2 Man", "Tampa"];

  function isTendency() {
    try {
      const q = location.search || "";
      if (/[?&]tendency=0(?:&|$)/.test(q)) return false;
      if (/[?&]tendency=1(?:&|$)/.test(q)) return true;
      const ls = localStorage.getItem("offgrd_tendency_reports");
      if (ls === "0") return false;
      if (ls === "1") return true;
      if (root.OFFGRD_CONFIG && root.OFFGRD_CONFIG.tendencyReports === false) return false;
      if (root.OFFGRD_CONFIG && root.OFFGRD_CONFIG.tendencyReports) return true;
    } catch (e) {}
    return true;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[m]));
  }
  function ordinal(d) { return ({ 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" })[d] || d; }
  function distBucket(n) {
    n = +n;
    if (n <= 3) return "1-3";
    if (n <= 6) return "4-6";
    if (n <= 9) return "7-9";
    return "10+";
  }
  function pct(x) { return Math.round((+x || 0) * 100) + "%"; }
  function fmtPct(x) { return pct(x); }

  /* Same unweighted share the predictor uses for report tables (reconcile to raw counts). */
  function fieldDist(rows, field) {
    const tally = {};
    let tot = 0;
    rows.forEach(rw => {
      const k = rw[field];
      if (k == null || k === "" || k === "—") return;
      tally[k] = (tally[k] || 0) + 1;
      tot++;
    });
    const arr = Object.keys(tally).map(k => ({ k, n: tally[k], pct: tot ? tally[k] / tot : 0 }));
    arr.sort((a, b) => b.n - a.n);
    return { arr, tot };
  }

  function pressureRate(rows) {
    if (!rows.length) return 0;
    return rows.filter(r => +r.pressure === 1).length / rows.length;
  }

  function blitzRate(rows) {
    if (!rows.length) return 0;
    return rows.filter(r => +r.pressure === 1 && r.blitz && r.blitz !== "DL stunt").length / rows.length;
  }

  function runShare(rows) {
    if (!rows.length) return 0;
    return rows.filter(r => /run/i.test(r.playType || "")).length / rows.length;
  }

  function isSuccess(down, distance, gain) {
    const g = +gain, d = +distance;
    if (isNaN(g) || isNaN(d) || d <= 0) return null;
    if (down === 1) return g >= d * 0.4;
    if (down === 2) return g >= d * 0.5;
    return g >= d;
  }

  function isExplosive(gain) { return +gain >= 12; }

  /* Heat: frequency 0–1 → red wash (matches Scout gridtbl feel). */
  function heatStyle(rate) {
    const a = Math.min(0.85, Math.max(0.04, +rate || 0));
    return "background:rgba(168,17,43," + (a * 0.55).toFixed(3) + ");";
  }

  function defPersGroup(r) {
    const raw = String(r.personnel || r.front || "").toLowerCase();
    if (/7\s*db|quarter|prevent/.test(raw)) return "7-DBs";
    if (/dime|6\s*db/.test(raw)) return "Dime";
    if (/nickel|5\s*db|4-2-5|3-3-5|42 nick/.test(raw)) return "Nickel";
    if (r.personnel && String(r.personnel).trim()) return String(r.personnel).trim();
    return "Base";
  }

  function hashLane(r) {
    const h = String(r.hash || "M").toUpperCase().charAt(0);
    if (h === "M") return "MOF";
    return "Boundary";
  }

  function filterRows(rows, opts) {
    opts = opts || {};
    return (rows || []).filter(r => {
      if (opts.opponent && opts.opponent !== "ANY" && r.opponent !== opts.opponent) return false;
      if (opts.week && r.gameWeek && r.gameWeek !== opts.week) return false;
      if (opts.pers && opts.pers !== "ANY" && r.personnel !== opts.pers) return false;
      if (opts.form && opts.form !== "ANY" && r.formation !== opts.form) return false;
      if (opts.down && opts.down !== "ANY" && +r.down !== +opts.down) return false;
      if (opts.dist && opts.dist !== "ANY" && distBucket(r.distance) !== opts.dist) return false;
      if (opts.hash && opts.hash !== "ANY") {
        if (opts.hash === "MOF" && hashLane(r) !== "MOF") return false;
        if (opts.hash === "Boundary" && hashLane(r) !== "Boundary") return false;
        if (opts.hash !== "MOF" && opts.hash !== "Boundary" && String(r.hash || "").toUpperCase().charAt(0) !== opts.hash) return false;
      }
      return true;
    });
  }

  /* ---------- matrices ---------- */
  function ddMatrix(rows, field, opts) {
    opts = opts || {};
    const keys = {};
    const cells = {};
    DOWNS.forEach(dn => {
      DISTS.forEach(ds => {
        const cell = rows.filter(r => +r.down === dn && distBucket(r.distance) === ds);
        const tagged = field === "_blitz"
          ? cell
          : cell.filter(r => r[field] && r[field] !== "—");
        const id = dn + "|" + ds;
        if (field === "_blitz") {
          const rate = blitzRate(cell);
          cells[id] = { n: cell.length, rate, top: cell.length ? (pct(rate) + " blitz") : "—", dist: [] };
        } else {
          const dist = fieldDist(tagged, field);
          dist.arr.forEach(a => { keys[a.k] = true; });
          cells[id] = {
            n: cell.length,
            tagged: tagged.length,
            rate: dist.arr[0] ? dist.arr[0].pct : 0,
            top: dist.arr[0] ? dist.arr[0].k : "—",
            topPct: dist.arr[0] ? dist.arr[0].pct : 0,
            dist: dist.arr
          };
        }
      });
    });
    let keyList = Object.keys(keys);
    if (field === "coverage") {
      keyList = COV_ORDER.filter(k => keys[k]).concat(keyList.filter(k => COV_ORDER.indexOf(k) < 0));
    } else {
      keyList.sort();
    }
    return { keys: keyList, cells, downs: DOWNS, dists: DISTS };
  }

  function blitzByPersDd(rows) {
    const groups = {};
    rows.forEach(r => {
      const g = defPersGroup(r);
      (groups[g] = groups[g] || []).push(r);
    });
    const order = ["Base", "Nickel", "Dime", "7-DBs"].concat(
      Object.keys(groups).filter(k => ["Base", "Nickel", "Dime", "7-DBs"].indexOf(k) < 0).sort()
    ).filter(k => groups[k] && groups[k].length);
    const table = order.map(g => {
      const row = { g, n: groups[g].length, cells: {} };
      DISTS.forEach(ds => {
        DOWNS.forEach(dn => {
          const cell = groups[g].filter(r => +r.down === dn && distBucket(r.distance) === ds);
          row.cells[dn + "|" + ds] = { n: cell.length, rate: blitzRate(cell) };
        });
      });
      row.overall = blitzRate(groups[g]);
      return row;
    });
    return { groups: table, downs: DOWNS, dists: DISTS };
  }

  function runPassByFormation(rows) {
    const forms = {};
    rows.forEach(r => {
      const f = r.formation || "—";
      (forms[f] = forms[f] || []).push(r);
    });
    return Object.keys(forms).map(f => {
      const g = forms[f];
      const run = g.filter(r => /run/i.test(r.playType || ""));
      const pass = g.filter(r => /pass/i.test(r.playType || ""));
      const field = g.filter(r => hashLane(r) === "Boundary");
      const mof = g.filter(r => hashLane(r) === "MOF");
      return {
        formation: f,
        n: g.length,
        runPct: runShare(g),
        passPct: 1 - runShare(g),
        fieldRun: field.length ? runShare(field) : null,
        mofRun: mof.length ? runShare(mof) : null,
        fieldN: field.length,
        mofN: mof.length
      };
    }).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
  }

  function runPassByDd(rows) {
    const out = [];
    DOWNS.forEach(dn => {
      DISTS.forEach(ds => {
        const cell = rows.filter(r => +r.down === dn && distBucket(r.distance) === ds);
        if (!cell.length) return;
        out.push({
          label: ordinal(dn) + " & " + ds,
          n: cell.length,
          runPct: runShare(cell),
          passPct: 1 - runShare(cell)
        });
      });
    });
    return out;
  }

  function runByDirection(rows) {
    const withDir = rows.filter(r => /run/i.test(r.playType || "") && r.direction);
    if (!withDir.length) return null;
    const dirs = {};
    withDir.forEach(r => {
      const d = String(r.direction).toUpperCase().charAt(0) || "?";
      (dirs[d] = dirs[d] || []).push(r);
    });
    return Object.keys(dirs).sort().map(d => {
      const g = dirs[d];
      const gains = g.map(r => +r.gain).filter(x => !isNaN(x));
      const yds = gains.length ? gains.reduce((a, b) => a + b, 0) / gains.length : null;
      let ok = 0, known = 0, tfl = 0;
      g.forEach(r => {
        const s = isSuccess(r.down, r.distance, r.gain);
        if (s != null) { known++; if (s) ok++; }
        if (+r.gain < 0) tfl++;
      });
      return {
        direction: d === "R" ? "Right" : d === "L" ? "Left" : d === "M" ? "Middle" : d,
        n: g.length,
        success: known ? ok / known : null,
        ydsPer: yds,
        tflPct: g.length ? tfl / g.length : 0
      };
    });
  }

  function summaryTile(defRows, offRows) {
    const plays = (defRows || []).length + (offRows || []).length;
    const off = offRows || [];
    const def = defRows || [];
    const run = off.length ? runShare(off) : null;
    const pass = run == null ? null : 1 - run;
    let expl = null, succ = null;
    if (off.length) {
      const withGain = off.filter(r => r.gain != null && !isNaN(+r.gain));
      if (withGain.length) {
        expl = withGain.filter(r => isExplosive(r.gain)).length / withGain.length;
        let ok = 0, known = 0;
        withGain.forEach(r => {
          const s = isSuccess(r.down, r.distance, r.gain);
          if (s != null) { known++; if (s) ok++; }
        });
        succ = known ? ok / known : null;
      }
    }
    const topCov = fieldDist(def.filter(r => r.coverage && r.coverage !== "—"), "coverage").arr[0];
    const topFront = fieldDist(def.filter(r => r.front), "front").arr[0];
    const topPers = fieldDist(
      (off.length ? off : def).filter(r => r.personnel),
      "personnel"
    ).arr[0];
    const gains = off.map(r => +r.gain).filter(x => !isNaN(x));
    const avgYds = gains.length ? gains.reduce((a, b) => a + b, 0) / gains.length : null;
    return {
      plays,
      defN: def.length,
      offN: off.length,
      runPct: run,
      passPct: pass,
      explosivePct: expl,
      successPct: succ,
      topCoverage: topCov ? topCov.k : null,
      topCoveragePct: topCov ? topCov.pct : null,
      topFront: topFront ? topFront.k : null,
      topFrontPct: topFront ? topFront.pct : null,
      topPersonnel: topPers ? topPers.k : null,
      avgYds
    };
  }

  /* ---------- HTML ---------- */
  function css() {
    return "<style id=\"tn-css\">"
      + ".tn-wrap{font-family:system-ui,Segoe UI,sans-serif;color:#13294B}"
      + ".tn-tile{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin:10px 0 14px}"
      + ".tn-stat{background:#f4f7fb;border:1px solid #d8dee6;border-radius:10px;padding:10px 12px}"
      + ".tn-stat b{display:block;font-size:18px;color:#13294B;line-height:1.1}"
      + ".tn-stat span{font-size:11px;color:#5a6575;font-weight:700;letter-spacing:.3px;text-transform:uppercase}"
      + ".tn-h{font-size:15px;font-weight:800;margin:18px 0 6px;color:#13294B}"
      + ".tn-note{font-size:12px;color:#5a6575;margin:0 0 8px}"
      + ".tn-tbl{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px}"
      + ".tn-tbl th,.tn-tbl td{border:1px solid #d0d7e0;padding:6px 7px;text-align:center}"
      + ".tn-tbl th{background:#13294B;color:#fff;font-weight:800}"
      + ".tn-tbl td.rh{background:#eef2f6;font-weight:800;text-align:left;white-space:nowrap}"
      + ".tn-tbl .sub{display:block;font-size:10px;color:#5a6575;font-weight:600}"
      + ".tn-tbl .hot{font-weight:800}"
      + ".tn-legend{font-size:11px;color:#5a6575;margin:4px 0 12px}"
      + "@media print{.tn-no-print{display:none!important}}"
      + "</style>";
  }

  function renderDdHeatTable(matrix, title, mode) {
    /* mode: 'top' shows top call + %; 'blitz' shows blitz % */
    let h = '<div class="tn-h">' + esc(title) + "</div>";
    h += '<table class="tn-tbl"><thead><tr><th></th>' + matrix.dists.map(d => "<th>" + esc(d) + "</th>").join("") + "</tr></thead><tbody>";
    matrix.downs.forEach(dn => {
      h += '<tr><td class="rh">' + ordinal(dn) + "</td>";
      matrix.dists.forEach(ds => {
        const c = matrix.cells[dn + "|" + ds] || { n: 0, rate: 0, top: "—" };
        if (c.n < 1) {
          h += '<td style="color:#9aa4b2">—</td>';
          return;
        }
        const rate = mode === "blitz" ? c.rate : (c.topPct != null ? c.topPct : c.rate);
        const label = mode === "blitz" ? pct(c.rate) : (esc(c.top) + '<span class="sub">' + pct(c.topPct || 0) + " · n=" + c.n + "</span>");
        h += '<td class="hot" style="' + heatStyle(rate) + '" title="n=' + c.n + '">' + label + "</td>";
      });
      h += "</tr>";
    });
    h += "</tbody></table>";
    h += '<p class="tn-legend">Heat = ' + (mode === "blitz" ? "blitz rate" : "top-call share") + ". Empty = no snaps. Counts reconcile to filtered scout rows.</p>";
    return h;
  }

  function renderFullCoverageStack(matrix) {
    /* Optional deep table: each coverage % per cell — ship top-call heat as primary; this is a compact key legend */
    if (!matrix.keys.length) return "";
    let h = '<div class="tn-h">Coverage mix (overall, filtered)</div><table class="tn-tbl"><tr><th>Coverage</th><th>%</th><th>Snaps</th></tr>';
    const all = [];
    Object.keys(matrix.cells).forEach(id => {
      (matrix.cells[id].dist || []).forEach(d => {
        const hit = all.find(x => x.k === d.k);
        if (hit) { hit.n += d.n; } else all.push({ k: d.k, n: d.n });
      });
    });
    /* Better: recompute from flat — caller should pass overall dist. Skip if empty. */
    return "";
  }

  function renderBlitzPersTable(bz) {
    let h = '<div class="tn-h">Blitz % by personnel grouping × distance</div>';
    h += '<p class="tn-note">Personnel grouped Base / Nickel / Dime / 7-DBs from charted personnel or front tags (program labels preserved when present).</p>';
    h += '<table class="tn-tbl"><thead><tr><th>Group</th><th>Overall</th>';
    bz.dists.forEach(d => { h += "<th>" + esc(d) + "</th>"; });
    h += "<th>Snaps</th></tr></thead><tbody>";
    bz.groups.forEach(row => {
      h += '<tr><td class="rh">' + esc(row.g) + '</td><td class="hot" style="' + heatStyle(row.overall) + '">' + pct(row.overall) + "</td>";
      bz.dists.forEach(ds => {
        /* collapse downs into dist for Telemetry-style Blitz-% density */
        let n = 0, b = 0;
        bz.downs.forEach(dn => {
          const c = row.cells[dn + "|" + ds];
          if (!c) return;
          n += c.n;
          b += c.rate * c.n;
        });
        const rate = n ? b / n : 0;
        h += n
          ? '<td class="hot" style="' + heatStyle(rate) + '">' + pct(rate) + '<span class="sub">n=' + n + "</span></td>"
          : "<td>—</td>";
      });
      h += "<td>" + row.n + "</td></tr>";
    });
    h += "</tbody></table>";
    return h;
  }

  function renderOffTables(offRows) {
    if (!(offRows && offRows.length)) {
      return '<div class="tn-h">Offensive tendencies</div><p class="tn-note">No opponent-offense rows in scope. Import opponent offense charting to unlock.</p>';
    }
    let h = "";
    const byForm = runPassByFormation(offRows);
    h += '<div class="tn-h">Run / pass by formation</div>';
    h += '<table class="tn-tbl"><tr><th>Formation</th><th>Run%</th><th>Pass%</th><th>Boundary run%</th><th>MOF run%</th><th>Snaps</th></tr>';
      byForm.slice(0, 16).forEach(r => {
      h += "<tr><td class=\"rh\">" + esc(r.formation) + "</td>"
        + '<td class="hot" style="' + heatStyle(r.runPct) + '">' + pct(r.runPct) + "</td>"
        + '<td class="hot" style="' + heatStyle(r.passPct) + '">' + pct(r.passPct) + "</td>"
        + "<td>" + (r.fieldRun == null ? "—" : pct(r.fieldRun)) + "</td>"
        + "<td>" + (r.mofRun == null ? "—" : pct(r.mofRun)) + "</td>"
        + "<td>" + r.n + "</td></tr>";
    });
    h += "</table>";
    h += '<p class="tn-legend">Boundary = hash L/R; MOF = hash M (hash stand-in until MFC/MFO is charted).</p>';

    const byDd = runPassByDd(offRows);
    h += '<div class="tn-h">Run / pass by down &amp; distance</div>';
    h += '<table class="tn-tbl"><tr><th>Situation</th><th>Run%</th><th>Pass%</th><th>Snaps</th></tr>';
    byDd.forEach(r => {
      h += "<tr><td class=\"rh\">" + esc(r.label) + "</td>"
        + '<td class="hot" style="' + heatStyle(r.runPct) + '">' + pct(r.runPct) + "</td>"
        + '<td class="hot" style="' + heatStyle(r.passPct) + '">' + pct(r.passPct) + "</td>"
        + "<td>" + r.n + "</td></tr>";
    });
    h += "</table>";

    const byPers = {};
    offRows.forEach(r => {
      const p = r.personnel || "—";
      (byPers[p] = byPers[p] || []).push(r);
    });
    const persRows = Object.keys(byPers).map(p => ({
      p, n: byPers[p].length, runPct: runShare(byPers[p])
    })).sort((a, b) => b.n - a.n);
    if (persRows.length) {
      h += '<div class="tn-h">Tendencies by personnel</div><table class="tn-tbl"><tr><th>Personnel</th><th>Run%</th><th>Snaps</th></tr>';
      persRows.slice(0, 12).forEach(r => {
        h += "<tr><td class=\"rh\">" + esc(r.p) + "</td><td class=\"hot\" style=\"" + heatStyle(r.runPct) + "\">" + pct(r.runPct) + "</td><td>" + r.n + "</td></tr>";
      });
      h += "</table>";
    }

    const zones = {};
    offRows.forEach(r => {
      const z = r.fieldZone || "—";
      (zones[z] = zones[z] || []).push(r);
    });
    const zoneRows = Object.keys(zones).map(z => ({ z, n: zones[z].length, runPct: runShare(zones[z]) })).sort((a, b) => b.n - a.n);
    if (zoneRows.length) {
      h += '<div class="tn-h">Tendencies by field zone</div><table class="tn-tbl"><tr><th>Zone</th><th>Run%</th><th>Snaps</th></tr>';
      zoneRows.forEach(r => {
        h += "<tr><td class=\"rh\">" + esc(r.z) + "</td><td class=\"hot\" style=\"" + heatStyle(r.runPct) + "\">" + pct(r.runPct) + "</td><td>" + r.n + "</td></tr>";
      });
      h += "</table>";
    }

    const dir = runByDirection(offRows);
    if (dir && dir.length) {
      h += '<div class="tn-h">Run success by direction</div>';
      h += '<table class="tn-tbl"><tr><th>Direction</th><th>Success%</th><th>Yds/rush</th><th>TFL%</th><th>Snaps</th></tr>';
      dir.forEach(r => {
        h += "<tr><td class=\"rh\">" + esc(r.direction) + "</td>"
          + "<td>" + (r.success == null ? "—" : pct(r.success)) + "</td>"
          + "<td>" + (r.ydsPer == null ? "—" : r.ydsPer.toFixed(1)) + "</td>"
          + "<td>" + pct(r.tflPct) + "</td><td>" + r.n + "</td></tr>";
      });
      h += "</table>";
    } else {
      h += '<p class="tn-note">Run success by direction — deferred until direction + gain/result are charted on enough snaps.</p>';
    }
    return h;
  }

  function renderSummary(sum, opts) {
    opts = opts || {};
    const cell = (v, lab) => '<div class="tn-stat"><b>' + esc(v) + "</b><span>" + esc(lab) + "</span></div>";
    let h = '<div class="tn-tile">';
    /* Split def/off — never a single union count that no table uses */
    h += cell((sum.defN || 0) + " defensive · " + (sum.offN || 0) + " offensive", "In scope");
    if (opts.scopeLabel) h += cell(opts.scopeLabel, "Games scope");
    if (sum.runPct != null) h += cell(pct(sum.runPct) + " / " + pct(sum.passPct), "Run / Pass");
    if (sum.explosivePct != null) h += cell(pct(sum.explosivePct), "Explosive");
    if (sum.successPct != null) h += cell(pct(sum.successPct), "Success");
    if (sum.topCoverage) h += cell(sum.topCoverage + (sum.topCoveragePct != null ? " " + pct(sum.topCoveragePct) : ""), "Top coverage");
    if (sum.topFront) h += cell(sum.topFront + (sum.topFrontPct != null ? " " + pct(sum.topFrontPct) : ""), "Top front");
    if (sum.topPersonnel) h += cell(sum.topPersonnel, "Top personnel");
    if (sum.avgYds != null) h += cell(sum.avgYds.toFixed(1), "Avg yds");
    h += "</div>";
    return h;
  }

  function buildReportHtml(defRows, offRows, opts) {
    opts = opts || {};
    const title = opts.title || ((opts.opponent && opts.opponent !== "ANY") ? (opts.opponent + " — tendency report") : "Tendency report");
    const sum = summaryTile(defRows, offRows);
    const covM = ddMatrix(defRows, "coverage");
    const frM = ddMatrix(defRows, "front");
    const blitzM = ddMatrix(defRows, "_blitz");
    const bzPers = blitzByPersDd(defRows);

    /* Overall coverage mix for reconcile */
    const covAll = fieldDist(defRows.filter(r => r.coverage && r.coverage !== "—"), "coverage");

    let h = css() + '<div class="tn-wrap" id="tnReport">';
    h += '<div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">';
    h += '<b style="font-size:18px;color:#13294B">' + esc(title) + "</b>";
    h += '<span class="tn-no-print"><button type="button" class="btn ghost" id="tnPrintBtn">Print / PDF</button></span>';
    h += "</div>";
    if (opts.subtitle) h += '<p class="tn-note">' + esc(opts.subtitle) + "</p>";
    h += renderSummary(sum, opts);

    if (defRows.length) {
      h += renderDdHeatTable(covM, "Coverage by down & distance", "top");
      /* MOF / Boundary split (hash stand-in for MFC/MFO) */
      const mof = filterRows(defRows, { hash: "MOF" });
      const bnd = filterRows(defRows, { hash: "Boundary" });
      if (mof.length >= 4) h += renderDdHeatTable(ddMatrix(mof, "coverage"), "Coverage by D&D — MOF (hash M)", "top");
      if (bnd.length >= 4) h += renderDdHeatTable(ddMatrix(bnd, "coverage"), "Coverage by D&D — Boundary (hash L/R)", "top");
      h += renderDdHeatTable(frM, "Front by down & distance", "top");
      h += renderDdHeatTable(blitzM, "Blitz / pressure rate by D&D", "blitz");
      h += renderBlitzPersTable(bzPers);
      if (covAll.arr.length) {
        h += '<div class="tn-h">Coverage distribution (scope total)</div><table class="tn-tbl"><tr><th>Coverage</th><th>%</th><th>Snaps</th></tr>';
        covAll.arr.forEach(a => {
          h += "<tr><td class=\"rh\">" + esc(a.k) + '</td><td class="hot" style="' + heatStyle(a.pct) + '">' + pct(a.pct) + "</td><td>" + a.n + "</td></tr>";
        });
        h += "</table>";
      }
    } else {
      h += '<p class="tn-note">No opponent-defense rows in scope — import defense charting (coverage / front / pressure) for defensive tendency tables.</p>';
    }

    h += renderOffTables(offRows);
    h += '<p class="tn-note tn-no-print">Numbers are unweighted shares of filtered <code>scouting_games</code> rows (same D&amp;D buckets as the Scout predictor). Spot-check any cell against raw snaps.</p>';
    h += "</div>";
    return { html: h, summary: sum, deferred: ["MFC/MFO as native chart fields (hash MOF/Boundary used as stand-in)"] };
  }

  function publishSnapshot(opponent, summary, defN, offN, meta) {
    const snap = {
      v: 2,
      generatedAt: new Date().toISOString(),
      opponent: opponent || null,
      summary: summary,
      defSnaps: defN,
      offSnaps: offN,
      scopeLabel: (meta && meta.scopeLabel) || null
    };
    try { root.OFFGRD_LAST_TENDENCIES = snap; } catch (e) {}
    try { localStorage.setItem("offgrd_last_tendencies", JSON.stringify(snap)); } catch (e) {}
    return snap;
  }

  function printReport(host) {
    if (!host) return;
    const finish = () => {};
    window.addEventListener("afterprint", finish, { once: true });
    window.print();
  }

  function injectInto(host, defRows, offRows, opts) {
    if (!host) return null;
    const built = buildReportHtml(defRows || [], offRows || [], opts);
    host.innerHTML = built.html;
    const btn = host.querySelector("#tnPrintBtn");
    if (btn) btn.onclick = () => printReport(host);
    publishSnapshot(opts && opts.opponent, built.summary, (defRows || []).length, (offRows || []).length, {
      scopeLabel: opts && opts.scopeLabel
    });
    return built;
  }

  root.OFFGRD_TENDENCIES = {
    isTendency, distBucket, filterRows, fieldDist, pressureRate, blitzRate, runShare,
    ddMatrix, blitzByPersDd, runPassByFormation, runPassByDd, runByDirection, summaryTile,
    buildReportHtml, injectInto, printReport, publishSnapshot, defPersGroup, hashLane
  };
})(typeof window !== "undefined" ? window : globalThis);
