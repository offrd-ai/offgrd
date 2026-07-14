/* ============================================================
   OFFGRD-weeklypackage.js — AI-GM Weekly Package (roadmap finale)
   Assembly + orchestration: tendencies + game-plan draft + scout cards
   + install + briefing on one screen. No new engines.
   Flag: ?weeklypackage=0|1 | localStorage.offgrd_weekly_package | OFFGRD_CONFIG.weeklyPackage

   Assemble reliability (v59+): progressive section fill, busy watchdog,
   snapshot self-computes with timeout, install derives chunked+yielded.
   ============================================================ */
(function (root) {
  "use strict";

  const BUSY_TTL_MS = 90000;
  const SNAP_BUDGET_MS = 2500;
  const SECTION_YIELD_MS = 0;

  let _busy = false;
  let _busyAt = 0;
  let _busyTimer = null;
  let _genAbort = null;
  let _fillToken = 0;
  let _suppressInjectUntil = 0;

  function flagParam(name) {
    try {
      const blob = String((location && (location.search || "") + "&" + ((location.hash || "").replace(/^#/, ""))) || "");
      if (new RegExp("[?&#]" + name + "=0(?:&|#|$)").test(blob)) return "0";
      if (new RegExp("[?&#]" + name + "=1(?:&|#|$)").test(blob)) return "1";
    } catch (e) {}
    return null;
  }

  function isWeeklyPackage() {
    try {
      const url = flagParam("weeklypackage");
      if (url === "0") return false;
      if (url === "1") return true;
      const ls = localStorage.getItem("offgrd_weekly_package");
      if (ls === "0") return false;
      if (ls === "1") return true;
      if (root.OFFGRD_CONFIG && root.OFFGRD_CONFIG.weeklyPackage === false) return false;
      if (root.OFFGRD_CONFIG && root.OFFGRD_CONFIG.weeklyPackage) return true;
    } catch (e) {}
    return true;
  }

  function applyWeeklyPackageGate() {
    const on = isWeeklyPackage();
    try { if (root.OFFGRD_CONFIG) root.OFFGRD_CONFIG.weeklyPackage = on; } catch (e) {}
    try {
      const nav = document.getElementById("navPackage");
      if (nav) nav.style.display = on ? "" : "none";
    } catch (e) {}
    try {
      if (!on && typeof root.setView === "function") {
        const pkg = document.getElementById("view-package");
        if (pkg && pkg.style.display !== "none") root.setView("plan");
      }
    } catch (e) {}
    return on;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[m]));
  }

  function yieldPaint() {
    return new Promise(function (resolve) {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(function () { setTimeout(resolve, SECTION_YIELD_MS); });
      } else setTimeout(resolve, SECTION_YIELD_MS);
    });
  }

  function clearBusyWatch() {
    if (_busyTimer) {
      try { clearTimeout(_busyTimer); } catch (e) {}
      _busyTimer = null;
    }
  }

  function endBusy() {
    _busy = false;
    _busyAt = 0;
    clearBusyWatch();
    _genAbort = null;
  }

  function resetBusy(reason) {
    if (_busy) {
      try { console.warn("[weekly-package] force-clear busy", reason || ""); } catch (e) {}
    }
    try { if (_genAbort) _genAbort.abort(); } catch (e) {}
    endBusy();
  }

  function beginBusy() {
    _busy = true;
    _busyAt = Date.now();
    clearBusyWatch();
    _busyTimer = setTimeout(function () {
      resetBusy("watchdog " + BUSY_TTL_MS + "ms");
      try {
        const host = document.getElementById("view-package");
        const regen = host && host.querySelector("#wkpkgRegen");
        if (regen) { regen.disabled = false; regen.textContent = "Regenerate"; }
        setStatus(host, "Assemble timed out — tap Regenerate to retry. Sections below may still show prior content.");
      } catch (e) {}
    }, BUSY_TTL_MS);
  }

  function shouldSuppressInject() {
    return Date.now() < (_suppressInjectUntil || 0);
  }

  function isBusy() {
    if (_busy && _busyAt && (Date.now() - _busyAt) > BUSY_TTL_MS) {
      resetBusy("stale isBusy()");
      return false;
    }
    return !!_busy;
  }

  function loadTendenciesSnap() {
    try {
      if (root.OFFGRD_LAST_TENDENCIES) return root.OFFGRD_LAST_TENDENCIES;
      const raw = localStorage.getItem("offgrd_last_tendencies");
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  function collectPayload(ctx) {
    ctx = ctx || {};
    const snap = loadTendenciesSnap();
    const pb = ctx.playbook || root.PBOOK || [];
    const week = ctx.week || root.WEEK;
    const names = {};
    (pb || []).forEach(p => { if (p && p.name) names[p.name] = p; });
    ((week && week.buckets) || []).forEach(b => (b.plays || []).forEach(p => {
      if (p && p.name && !names[p.name]) names[p.name] = { name: p.name };
    }));
    return {
      tendencies: snap,
      playbook_plays: Object.keys(names).map(n => {
        const p = names[n];
        return {
          name: n,
          formation: p.formation || "",
          family: p.family || "",
          has_reads: !!(p.qb_reads && Object.keys(p.qb_reads).length)
        };
      }),
      past_opponents: ctx.pastOpponents || []
    };
  }

  function gamePlanDraft(week) {
    const g = week && week.gen;
    return (g && g.game_plan_draft) || null;
  }

  function packageApproved(week) {
    const g = week && week.gen;
    return !!(g && (g.package_status === "approved" || g.package_approved));
  }

  function errBox(msg) {
    return '<p class="foot" style="background:#fff0f0;border:1px solid #e8a8a8;border-radius:8px;padding:10px">' + esc(msg) + "</p>";
  }

  /* Snapshot: always self-computes from scoped rows; never perpetual loading. */
  function renderTendencySection(defRows, offRows, opponent, oppName, scopeLabel) {
    const lab = scopeLabel || "season library scope";
    if (!root.OFFGRD_TENDENCIES || !root.OFFGRD_TENDENCIES.isTendency()) {
      return '<p class="foot">Tendency reports flag off. Snapshot unavailable.</p>';
    }
    const def = defRows || [];
    const off = offRows || [];
    try {
      const t0 = Date.now();
      const sum = root.OFFGRD_TENDENCIES.summaryTile(def, off);
      if (Date.now() - t0 > SNAP_BUDGET_MS) {
        return errBox("Snapshot took too long — open Tendencies report for full tables. (" + def.length + " D / " + off.length + " O rows)");
      }
      try {
        root.OFFGRD_TENDENCIES.publishSnapshot(opponent, sum, def.length, off.length, { scopeLabel: lab });
      } catch (e) {}
      if (!def.length && !off.length) {
        const cached = loadTendenciesSnap();
        if (cached && cached.summary) {
          const s = cached.summary;
          let h = '<p class="foot" style="margin:0 0 8px">Scope: ' + esc(lab) + ' · using last published snapshot (no rows in current scope). <button type="button" class="ghost" id="wkpkgOpenReport" style="padding:2px 8px">Tendencies report</button></p>';
          h += '<div class="tn-tile" style="display:flex;flex-wrap:wrap;gap:10px">';
          h += '<div class="tn-stat"><b>' + (s.defN || 0) + " defensive · " + (s.offN || 0) + ' offensive</b><span>Last snapshot</span></div>';
          if (s.topCoverage) h += '<div class="tn-stat"><b>' + esc(s.topCoverage) + '</b><span>Top coverage</span></div>';
          h += "</div>";
          return h;
        }
        return '<p class="foot">No charted plays in scope for this opponent. Import scout data or widen Games(scope). <button type="button" class="ghost" id="wkpkgOpenReport" style="padding:2px 8px">Tendencies report</button></p>';
      }
      let h = '<p class="foot" style="margin:0 0 8px">Scope: ' + esc(lab) + ' · self-scout excluded. Full heat tables: <button type="button" class="ghost" id="wkpkgOpenReport" style="padding:2px 8px">Tendencies report</button></p>';
      h += '<div class="tn-tile" style="display:flex;flex-wrap:wrap;gap:10px">';
      h += '<div class="tn-stat"><b>' + (sum.defN || 0) + " defensive · " + (sum.offN || 0) + ' offensive</b><span>In scope</span></div>';
      if (sum.topCoverage) h += '<div class="tn-stat"><b>' + esc(sum.topCoverage) + (sum.topCoveragePct != null ? " " + Math.round(sum.topCoveragePct * 100) + "%" : "") + '</b><span>Top coverage</span></div>';
      if (sum.topFront) h += '<div class="tn-stat"><b>' + esc(sum.topFront) + (sum.topFrontPct != null ? " " + Math.round(sum.topFrontPct * 100) + "%" : "") + '</b><span>Top front</span></div>';
      if (sum.runPct != null) h += '<div class="tn-stat"><b>' + Math.round(sum.runPct * 100) + "% / " + Math.round(sum.passPct * 100) + '%</b><span>Run / Pass</span></div>';
      h += "</div>";
      return h;
    } catch (e) {
      return errBox("Snapshot error: " + ((e && e.message) || e) + " — open Tendencies report.");
    }
  }

  function renderGamePlanSection(draft, week, canEdit, status) {
    status = status || {};
    if (status.loading) {
      return '<p class="foot" id="wkpkgPlanStatus" style="background:#eef6ff;border:1px solid #b8d4f0;border-radius:8px;padding:10px">✦ ' + esc(status.loading) + "</p>";
    }
    if (status.error) {
      return '<p class="foot" style="background:#fff0f0;border:1px solid #e8a8a8;border-radius:8px;padding:10px"><b>Draft error:</b> ' + esc(status.error) + " — tap Regenerate to retry. Briefing below may still be current.</p>";
    }
    const err = week && week.gen && week.gen.draft_error;
    if ((!draft || !draft.sections || !draft.sections.length) && err) {
      return '<p class="foot" style="background:#fff0f0;border:1px solid #e8a8a8;border-radius:8px;padding:10px"><b>Draft error:</b> ' + esc(err) + " — tap Regenerate to retry.</p>";
    }
    if (!draft || !draft.sections || !draft.sections.length) {
      return '<p class="foot">No game-plan draft yet — tap <b>Regenerate</b> while online (requires plays on the week plan).</p>';
    }
    const approved = packageApproved(week);
    let h = '<div class="wkpkg-trust">' + esc(draft.trust_note || "AI draft — coach approves before sharing.") + "</div>";
    if (approved) h += '<p class="foot wkpkg-approved-msg" style="color:#1d7a45;font-weight:800">✓ Approved for sharing — player share checkboxes unlocked below.</p>';
    draft.sections.forEach((sec, si) => {
      h += '<div class="wkpkg-sec" data-sec="' + si + '">';
      h += "<h3>" + esc(sec.title || sec.id || "Situation") + "</h3>";
      if (sec.notes) h += '<p class="foot">' + esc(sec.notes) + "</p>";
      if (Array.isArray(sec.calls) && sec.calls.length) {
        h += "<ul>";
        sec.calls.forEach((c, ci) => {
          h += "<li><b>" + esc(c.play || "") + "</b>";
          if (canEdit) {
            h += ' <textarea class="wkpkg-why no-print" data-si="' + si + '" data-ci="' + ci + '" rows="2" style="width:100%;margin-top:4px;font-size:13px">' + esc(c.why || "") + "</textarea>";
          } else if (c.why) h += " — " + esc(c.why);
          h += "</li>";
        });
        h += "</ul>";
      } else h += '<p class="foot">—</p>';
      h += "</div>";
    });
    if (canEdit) {
      h += '<div class="no-print" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">';
      h += '<button type="button" class="ghost" id="wkpkgSaveEdits">Save edits</button>';
      if (!approved) h += '<button type="button" class="go" id="wkpkgApprove" style="font-weight:800">'
        + ((root.OFFGRD_REDESIGN && OFFGRD_REDESIGN.isRedesign && OFFGRD_REDESIGN.isRedesign()) ? "Approve &amp; share" : "Approve for sharing")
        + "</button>";
      h += "</div>";
    }
    return h;
  }

  function playHasDiagram(play) {
    if (!play) return false;
    if (root.OFFGRD_SCOUTCARDS && OFFGRD_SCOUTCARDS.hasDiagram) return !!OFFGRD_SCOUTCARDS.hasDiagram(play);
    if (play.thumbSvg) return true;
    const st = play.players ? play : (play.data && play.data.players ? play.data : null);
    return !!(st && st.players && st.players.length);
  }

  function matchPlaybookPlay(call, playbook) {
    const pb = playbook || [];
    const cid = call && call.id != null ? String(call.id) : "";
    if (cid) {
      const byId = pb.find(p => p && String(p.id) === cid);
      if (byId) return byId;
    }
    const nm = String((call && call.name) || "").trim().toLowerCase();
    if (!nm) return null;
    return pb.find(p => p && String(p.name || "").trim().toLowerCase() === nm) || null;
  }

  function resolveInstallReads(play) {
    let reads = (play && play.qb_reads && typeof play.qb_reads === "object") ? play.qb_reads : null;
    if (reads && Object.keys(reads).length) return { reads: reads, source: "authored" };
    if (root.OFFGRD_AUTODERIVE && OFFGRD_AUTODERIVE.isAutoderive && OFFGRD_AUTODERIVE.isAutoderive()
        && OFFGRD_AUTODERIVE.deriveReads && playHasDiagram(play)) {
      try {
        const d = OFFGRD_AUTODERIVE.deriveReads(play.data || play, { playName: play.name });
        if (d && d.reads && Object.keys(d.reads).length) return { reads: d.reads, source: "auto" };
      } catch (e) {}
    }
    return null;
  }

  function resolveInstallOl(play) {
    let ol = (play && play.ol_keys && play.ol_keys.keys) ? play.ol_keys : null;
    if (ol && Object.keys(ol.keys || {}).length) return { ol: ol, source: "authored" };
    if (root.OFFGRD_AUTODERIVE && OFFGRD_AUTODERIVE.isAutoderive && OFFGRD_AUTODERIVE.isAutoderive()
        && OFFGRD_AUTODERIVE.deriveOlKeys && playHasDiagram(play)) {
      try {
        const d = OFFGRD_AUTODERIVE.deriveOlKeys(play.data || play);
        if (d && d.keys && Object.keys(d.keys).length) return { ol: d, source: "auto" };
      } catch (e) {}
    }
    return null;
  }

  function formatReadsCell(resolved) {
    if (!resolved || !resolved.reads) return "";
    const parts = [];
    Object.keys(resolved.reads).forEach(cov => {
      const r = resolved.reads[cov];
      const t = r && (r.t || r.target);
      if (t) parts.push(cov + "→" + t);
    });
    if (!parts.length) return "";
    const tag = resolved.source === "auto" ? "auto" : "taught";
    return '<span title="' + esc(parts.join(" · ")) + '"><b class="wkpkg-tag-ok" style="color:#1d7a45">✓ ' + tag + "</b> "
      + '<span class="foot">' + esc(parts.slice(0, 4).join(" · ")) + (parts.length > 4 ? "…" : "") + "</span></span>";
  }

  function formatOlCell(resolved) {
    if (!resolved || !resolved.ol || !resolved.ol.keys) return '<span class="foot">—</span>';
    const n = Object.keys(resolved.ol.keys).length;
    if (!n) return '<span class="foot">—</span>';
    const tag = resolved.source === "auto" ? "auto" : "keyed";
    return '<b class="wkpkg-tag-ok" style="color:#1d7a45">✓ ' + tag + '</b> <span class="foot">' + n + " blockers</span>";
  }

  function collectUniqueInstallPlays(week) {
    const order = [];
    const byKey = {};
    ((week && week.buckets) || []).forEach(b => {
      const bucketLabel = String((b && b.name) || "").trim() || "situation";
      (b.plays || []).forEach(p => {
        if (!p || !p.name) return;
        const key = (p.id != null && String(p.id)) ? ("id:" + p.id) : ("nm:" + String(p.name).trim().toLowerCase());
        if (!byKey[key]) {
          byKey[key] = { name: p.name, id: p.id || null, situations: [] };
          order.push(key);
        }
        if (byKey[key].situations.indexOf(bucketLabel) < 0) byKey[key].situations.push(bucketLabel);
      });
    });
    return order.map(k => byKey[k]);
  }

  /* Fast first paint: names + situations only (no deriveReads). */
  function renderInstallSkeleton(week) {
    const unique = collectUniqueInstallPlays(week);
    if (!unique.length) return '<p class="foot">Commit plays to the week plan first — Step 3 auto-reads flow to Reps when shared.</p>';
    let h = '<table class="plan-tbl" id="wkpkgInstallTbl"><tr><th>Play</th><th>Auto-reads</th><th>OL keys</th></tr>';
    unique.forEach((call, i) => {
      const sit = (call.situations && call.situations.length)
        ? (' <span class="foot">· used in ' + call.situations.length + " situation" + (call.situations.length === 1 ? "" : "s")
          + ' (' + esc(call.situations.slice(0, 3).join(", ")) + (call.situations.length > 3 ? "…" : "") + ")</span>")
        : "";
      h += '<tr data-inst="' + i + '"><td><b>' + esc(call.name) + "</b>" + sit
        + '</td><td class="wkpkg-reads"><span class="foot">Resolving…</span></td><td class="wkpkg-ol"><span class="foot">…</span></td></tr>';
    });
    h += "</table>";
    h += '<p class="foot" id="wkpkgInstallFoot">' + unique.length + " unique play" + (unique.length === 1 ? "" : "s")
      + " on this week’s install.</p>";
    return h;
  }

  async function enrichInstallRows(host, week, playbook, token) {
    const unique = collectUniqueInstallPlays(week);
    const tbl = host && host.querySelector("#wkpkgInstallTbl");
    if (!tbl || !unique.length) return;
    for (let i = 0; i < unique.length; i++) {
      if (token !== _fillToken) return;
      const call = unique[i];
      const tr = tbl.querySelector('tr[data-inst="' + i + '"]');
      if (!tr) continue;
      const readsTd = tr.querySelector(".wkpkg-reads");
      const olTd = tr.querySelector(".wkpkg-ol");
      try {
        const row = matchPlaybookPlay(call, playbook);
        const drawn = playHasDiagram(row);
        if (!row || !drawn) {
          if (readsTd) {
            const rd = root.OFFGRD_REDESIGN && OFFGRD_REDESIGN.isRedesign && OFFGRD_REDESIGN.isRedesign();
            readsTd.innerHTML = rd
              ? '<span class="wkpkg-tag-neutral">not drawn yet</span>'
              : '<span class="foot">Not drawn yet — draw to enable reads.</span>';
          }
          if (olTd) olTd.innerHTML = '<span class="foot">—</span>';
        } else {
          const rr = resolveInstallReads(row);
          const oo = resolveInstallOl(row);
          if (readsTd) readsTd.innerHTML = formatReadsCell(rr) || '<span class="foot">Drawn — open Reps Lab to author reads.</span>';
          if (olTd) olTd.innerHTML = formatOlCell(oo);
        }
      } catch (e) {
        if (readsTd) readsTd.innerHTML = errBox("Reads error");
        if (olTd) olTd.innerHTML = '<span class="foot">—</span>';
      }
      await yieldPaint();
    }
    const foot = host.querySelector("#wkpkgInstallFoot");
    if (foot) {
      foot.textContent = unique.length + " unique play" + (unique.length === 1 ? "" : "s")
        + " on this week’s install. Drill-ready when you share to players (This Week → Reps).";
    }
  }

  function renderBriefingSection(week) {
    const g = week && week.gen;
    if (!g || !g.narrative) return '<p class="foot">Briefing generates with the package (generate-week). Offline: committed plan + tendencies still render.</p>';
    const rd = root.OFFGRD_REDESIGN && OFFGRD_REDESIGN.isRedesign && OFFGRD_REDESIGN.isRedesign();
    let body = '<div style="white-space:pre-wrap;font-size:14px;line-height:1.55">' + esc(g.narrative) + "</div>";
    if (Array.isArray(g.keys) && g.keys.length) {
      body += '<div class="lbl" style="margin-top:10px">Keys</div>';
      g.keys.forEach((k, i) => { body += '<div style="font-weight:700;margin:2px 0">' + (i + 1) + ". " + esc(k) + "</div>"; });
    }
    return rd ? ('<div class="wkpkg-brief">' + body + "</div>") : body;
  }

  function renderScoutActions() {
    if (!root.OFFGRD_SCOUTCARDS || !root.OFFGRD_SCOUTCARDS.isScoutcards()) {
      return '<p class="foot">Scout cards flag off.</p>';
    }
    return '<div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">'
      + '<button type="button" class="ghost" id="wkpkgScoutOpp">Opponent scout cards</button>'
      + '<button type="button" class="ghost" id="wkpkgScoutInstall">Install cards</button>'
      + '<span class="foot">Print/PDF via scout-card sheet (Steal A).</span></div>';
  }

  function setStatus(host, msg) {
    const el = host && host.querySelector("#wkpkgStatus");
    if (el) el.innerHTML = msg ? ('<p class="foot" style="background:#eef6ff;border:1px solid #b8d4f0;border-radius:8px;padding:8px 10px;margin:0 0 10px">' + esc(msg) + "</p>") : "";
  }

  function buildPackageShell(ctx) {
    ctx = ctx || {};
    const week = ctx.week || root.WEEK;
    const opp = ctx.opponent || (week && week.opponent) || "";
    const oppName = opp || "This week";
    const canEdit = !!ctx.canEdit;
    const rd = root.OFFGRD_REDESIGN && OFFGRD_REDESIGN.isRedesign && OFFGRD_REDESIGN.isRedesign();
    const approved = packageApproved(week);
    const genAt = week && week.gen && week.gen.package_generated_at
      ? String(week.gen.package_generated_at).slice(0, 16).replace("T", " ")
      : (week && week.gen && week.gen.generated_at ? String(week.gen.generated_at).slice(0, 10) : "");
    let h = '<div class="panel wkpkg-root" id="wkpkgRoot">';
    h += '<div class="persp wkpkg-head" style="border:none;padding:0;margin-bottom:8px">';
    h += '<span class="pl" style="font-size:18px"><b>' + esc(oppName) + "</b> — weekly package</span>";
    if (rd) {
      h += approved
        ? '<span class="wkpkg-ok-pill">Approved</span>'
        : '<span class="wkpkg-draft-pill">DRAFT</span>';
      if (genAt) h += '<span class="foot">generated ' + esc(genAt) + "</span>";
    }
    if (rd) {
      h += '<span style="flex:1"></span>';
      if (canEdit && root.OFFGRD_WEEKLY_PACKAGE_GEN) {
        h += ' <button type="button" class="ghost no-print" id="wkpkgRegen">Regenerate</button>';
      }
      h += '<button class="ghost no-print" onclick="printActive()">Print / PDF</button>';
    } else {
      h += '<button class="ghost no-print" style="margin-left:auto" onclick="printActive()">Print / PDF</button>';
      if (canEdit && root.OFFGRD_WEEKLY_PACKAGE_GEN) {
        h += ' <button type="button" class="ghost no-print" id="wkpkgRegen">Regenerate</button>';
      }
    }
    h += "</div>";
    if (rd && !approved) {
      h += '<p class="wkpkg-gate-note no-print">Sharing is locked until you approve — your edits win.</p>';
    }
    h += '<div id="wkpkgStatus"></div>';
    if (rd) {
      h += '<section class="wkpkg-block"><div class="lbl wkpkg-sec-lbl"><span class="wkpkg-num">1</span><span class="wkpkg-sec-title">Opponent snapshot</span></div><div id="wkpkgTend"><p class="foot">Preparing snapshot…</p></div></section>';
      h += '<section class="wkpkg-block"><div class="lbl wkpkg-sec-lbl"><span class="wkpkg-num">2</span><span class="wkpkg-sec-title">Game plan draft</span><span class="wkpkg-sec-sub">AI suggests · you approve</span></div><div id="wkpkgPlan"><p class="foot">Preparing…</p></div></section>';
      h += '<section class="wkpkg-block"><div class="lbl wkpkg-sec-lbl"><span class="wkpkg-num">3</span><span class="wkpkg-sec-title">Scout cards</span></div><div id="wkpkgScout"><p class="foot">Preparing…</p></div></section>';
      h += '<section class="wkpkg-block"><div class="lbl wkpkg-sec-lbl"><span class="wkpkg-num">4</span><span class="wkpkg-sec-title">Install / teaching</span></div><div id="wkpkgInstall"><p class="foot">Preparing…</p></div></section>';
      h += '<section class="wkpkg-block"><div class="lbl wkpkg-sec-lbl"><span class="wkpkg-num">5</span><span class="wkpkg-sec-title">Weekly briefing</span></div><div id="wkpkgBrief"><p class="foot">Preparing…</p></div></section>';
    } else {
      /* Empty placeholders — progressive fill replaces within one frame budget; never leave "Loading…" forever. */
      h += '<section class="wkpkg-block"><div class="lbl">1 · Opponent snapshot</div><div id="wkpkgTend"><p class="foot">Preparing snapshot…</p></div></section>';
      h += '<section class="wkpkg-block"><div class="lbl">2 · Game plan draft <span class="foot">(AI suggests — you approve)</span></div><div id="wkpkgPlan"><p class="foot">Preparing…</p></div></section>';
      h += '<section class="wkpkg-block"><div class="lbl">3 · Scout cards</div><div id="wkpkgScout"><p class="foot">Preparing…</p></div></section>';
      h += '<section class="wkpkg-block"><div class="lbl">4 · Install / teaching</div><div id="wkpkgInstall"><p class="foot">Preparing…</p></div></section>';
      h += '<section class="wkpkg-block"><div class="lbl">5 · Weekly briefing</div><div id="wkpkgBrief"><p class="foot">Preparing…</p></div></section>';
    }
    h += "</div>";
    return h;
  }

  async function fillSectionsProgressive(host, ctx, opts) {
    opts = opts || {};
    const token = ++_fillToken;
    const week = ctx.week || root.WEEK;
    const opp = ctx.opponent || (week && week.opponent) || "";
    const oppName = opp || "This week";
    const draft = gamePlanDraft(week);
    const playbook = ctx.playbook || root.PBOOK;

    const tend = host.querySelector("#wkpkgTend");
    const plan = host.querySelector("#wkpkgPlan");
    const scout = host.querySelector("#wkpkgScout");
    const install = host.querySelector("#wkpkgInstall");
    const brief = host.querySelector("#wkpkgBrief");

    /* Section 1 — snapshot (must resolve quickly) */
    if (tend && !opts.skipTend) {
      try {
        tend.innerHTML = renderTendencySection(ctx.defRows, ctx.offRows, opp, oppName, ctx.scopeLabel);
      } catch (e) {
        tend.innerHTML = errBox("Snapshot failed: " + ((e && e.message) || e));
      }
    }
    await yieldPaint();
    if (token !== _fillToken) return;

    /* Section 2 — draft */
    if (plan && !opts.skipPlan) {
      try {
        plan.innerHTML = renderGamePlanSection(draft, week, !!ctx.canEdit, opts.planStatus);
      } catch (e) {
        plan.innerHTML = errBox("Draft section failed: " + ((e && e.message) || e));
      }
    }
    await yieldPaint();
    if (token !== _fillToken) return;

    /* Section 3 — scout */
    if (scout) {
      try { scout.innerHTML = renderScoutActions(); }
      catch (e) { scout.innerHTML = errBox("Scout cards failed."); }
    }
    await yieldPaint();
    if (token !== _fillToken) return;

    /* Section 4 — install skeleton then enrich */
    if (install && !opts.skipInstall) {
      try {
        install.innerHTML = renderInstallSkeleton(week);
        wirePackageUI(host, ctx);
        await enrichInstallRows(host, week, playbook, token);
      } catch (e) {
        install.innerHTML = errBox("Install list failed: " + ((e && e.message) || e));
      }
    }
    await yieldPaint();
    if (token !== _fillToken) return;

    /* Section 5 — briefing */
    if (brief) {
      try { brief.innerHTML = renderBriefingSection(week); }
      catch (e) { brief.innerHTML = errBox("Briefing failed: " + ((e && e.message) || e)); }
    }
    wirePackageUI(host, ctx);
  }

  async function injectPackage(host, ctx) {
    if (!host) return;
    ctx = ctx || {};
    /* Recover from a stuck prior assemble before painting. */
    if (isBusy() && _busyAt && (Date.now() - _busyAt) > 2000 && !_genAbort) {
      resetBusy("injectPackage recover");
    }
    host.innerHTML = buildPackageShell(ctx);
    wirePackageUI(host, ctx);
    await yieldPaint();
    await fillSectionsProgressive(host, ctx, {});
    return host;
  }

  function saveDraftEdits(week, draft) {
    if (!week || !draft) return;
    [].forEach.call(document.querySelectorAll(".wkpkg-why"), ta => {
      const si = +ta.dataset.si, ci = +ta.dataset.ci;
      if (draft.sections[si] && draft.sections[si].calls && draft.sections[si].calls[ci]) {
        draft.sections[si].calls[ci].why = ta.value;
      }
    });
    week.gen = week.gen || {};
    week.gen.game_plan_draft = draft;
    try { localStorage.setItem("offgrd_week_v1", JSON.stringify(week)); } catch (e) {}
    if (root.OFFGRD_WEEK_PUSH) root.OFFGRD_WEEK_PUSH({ gen: week.gen });
  }

  function approvePackage(week, draft) {
    if (!week) return;
    saveDraftEdits(week, draft);
    week.gen = week.gen || {};
    week.gen.package_status = "approved";
    week.gen.package_approved = true;
    week.gen.package_approved_at = new Date().toISOString();
    try { localStorage.setItem("offgrd_week_v1", JSON.stringify(week)); } catch (e) {}
    if (root.OFFGRD_WEEK_PUSH) root.OFFGRD_WEEK_PUSH({ gen: week.gen });
  }

  function mergeGenFromResult(res) {
    if (!root.WEEK) return;
    root.WEEK.gen = (res && res.gen) || root.WEEK.gen || {};
    if (res && res.game_plan_draft) root.WEEK.gen.game_plan_draft = res.game_plan_draft;
    if (res && res.draft_error != null) root.WEEK.gen.draft_error = res.draft_error;
    /* Defer localStorage — never block the assemble paint path on stringify. */
    const snap = root.WEEK;
    setTimeout(function () {
      try { localStorage.setItem("offgrd_week_v1", JSON.stringify(snap)); } catch (e) {}
    }, 0);
  }

  function schedulePullWeek() {
    setTimeout(function () {
      try {
        if (typeof root.OFFGRD_WEEK_PULL === "function") root.OFFGRD_WEEK_PULL();
        else if (typeof root.pullWeek === "function") root.pullWeek();
      } catch (e) {}
    }, 50);
  }

  /**
   * Fire-and-forget entry for Regenerate / Generate clicks.
   * MUST return void immediately so the click stack never awaits the network or fill.
   */
  function askConfirm(message) {
    /* Non-blocking confirm — window.confirm freezes the main thread (breaks automation + watchdog). */
    return new Promise(function (resolve) {
      try {
        let ov = document.getElementById("wkpkgConfirmOv");
        if (!ov) {
          ov = document.createElement("div");
          ov.id = "wkpkgConfirmOv";
          ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px";
          document.body.appendChild(ov);
        }
        ov.innerHTML = '<div style="background:var(--panel,#fff);color:var(--ink,#13294B);border-radius:12px;padding:16px 18px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.35)">'
          + '<p style="margin:0 0 14px;font-weight:700;line-height:1.4">' + esc(message) + "</p>"
          + '<div style="display:flex;gap:8px;justify-content:flex-end">'
          + '<button type="button" class="ghost" id="wkpkgConfirmNo" style="padding:8px 12px">Cancel</button>'
          + '<button type="button" class="go" id="wkpkgConfirmYes" style="padding:8px 12px;font-weight:800">Regenerate</button>'
          + "</div></div>";
        ov.style.display = "flex";
        const done = function (val) {
          ov.style.display = "none";
          ov.innerHTML = "";
          resolve(!!val);
        };
        ov.querySelector("#wkpkgConfirmYes").onclick = function () { done(true); };
        ov.querySelector("#wkpkgConfirmNo").onclick = function () { done(false); };
        ov.onclick = function (e) { if (e.target === ov) done(false); };
      } catch (e) {
        resolve(false);
      }
    });
  }

  function showGenError(msg) {
    const host = document.getElementById("view-package");
    if (host) {
      setStatus(host, "Error: " + msg);
      const plan = host.querySelector("#wkpkgPlan");
      if (plan) {
        plan.innerHTML = '<p class="foot" style="background:#fff0f0;border:1px solid #e8a8a8;border-radius:8px;padding:10px"><b>Draft error:</b> '
          + esc(msg) + " — tap Regenerate to retry.</p>";
      }
    } else {
      try { console.warn("[weekly-package]", msg); } catch (e) {}
    }
  }

  /**
   * Fire-and-forget entry for Regenerate / Generate clicks.
   * MUST return void immediately — never window.confirm / alert on this path.
   */
  function scheduleGenerate(ctx, force, opts) {
    opts = opts || {};
    setTimeout(function () {
      const go = function () {
        setTimeout(function () {
          runGenerate(ctx, force).catch(function (e) {
            showGenError((e && e.message) || "Package generation failed.");
          });
        }, 0);
      };
      if (opts.confirm === false) {
        go();
        return;
      }
      askConfirm(opts.confirmMsg || "Regenerate the weekly package? Replaces the AI game-plan draft and refreshes the briefing.")
        .then(function (ok) { if (ok) go(); })
        .catch(function () {});
    }, 0);
  }

  async function runGenerate(ctx, force) {
    if (isBusy()) {
      throw new Error("A package assemble is already running — wait a moment or reload if it is stuck.");
    }
    if (!root.OFFGRD_WEEKLY_PACKAGE_GEN) throw new Error("Sign in as a coach to generate the weekly package.");

    await yieldPaint();

    beginBusy();
    _suppressInjectUntil = Date.now() + 8000;
    const host = document.getElementById("view-package");
    const ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    _genAbort = ctrl;

    try {
      await yieldPaint();
      if (host) {
        setStatus(host, "Generating weekly package… briefing + game-plan draft (usually 20–45s). Tab stays usable.");
        const plan = host.querySelector("#wkpkgPlan");
        if (plan) {
          plan.innerHTML = renderGamePlanSection(null, root.WEEK, !!ctx.canEdit, {
            loading: "Drafting game plan vs their tendencies…"
          });
        }
        const regen = host.querySelector("#wkpkgRegen");
        if (regen) { regen.disabled = true; regen.textContent = "Generating…"; }
      }
      await yieldPaint();

      const payload = collectPayload(ctx);
      await yieldPaint();

      const res = await root.OFFGRD_WEEKLY_PACKAGE_GEN(!!force, payload, ctrl ? ctrl.signal : undefined);
      if (ctrl && ctrl.signal.aborted) throw new Error("Assemble aborted.");

      mergeGenFromResult(res);
      await yieldPaint();

      if (host) {
        setStatus(host, "");
        /* Update draft + briefing only — do NOT re-run install deriveReads (cold open already did). */
        await fillSectionsProgressive(host, Object.assign({}, ctx, { week: root.WEEK }), {
          skipTend: true,
          skipInstall: true,
          planStatus: (res && res.draft_error) ? { error: res.draft_error } : null
        });
      }
      _suppressInjectUntil = Date.now() + 5000;
      return res;
    } catch (e) {
      if (host) {
        setStatus(host, "");
        const plan = host.querySelector("#wkpkgPlan");
        if (plan) {
          plan.innerHTML = renderGamePlanSection(gamePlanDraft(root.WEEK), root.WEEK, !!ctx.canEdit, {
            error: (e && e.message) || "Package generation failed"
          });
        }
        wirePackageUI(host, ctx);
      }
      throw e;
    } finally {
      endBusy();
      const regen = host && host.querySelector("#wkpkgRegen");
      if (regen) { regen.disabled = false; regen.textContent = "Regenerate"; }
      schedulePullWeek();
    }
  }

  function wirePackageUI(host, ctx) {
    if (!host) return;
    ctx = ctx || {};

    const saveBtn = host.querySelector("#wkpkgSaveEdits");
    if (saveBtn) saveBtn.onclick = () => {
      const draft = gamePlanDraft(root.WEEK);
      if (draft) { saveDraftEdits(root.WEEK, draft); alert("Edits saved."); }
    };

    const appr = host.querySelector("#wkpkgApprove");
    if (appr) appr.onclick = async () => {
      const draft = gamePlanDraft(root.WEEK);
      if (!draft || !draft.sections || !draft.sections.length) return;
      if (!confirm("Approve this game-plan draft for sharing with players? You can still edit afterward.")) return;
      approvePackage(root.WEEK, draft);
      await injectPackage(host, ctx);
      if (typeof root.refreshView === "function") root.refreshView();
    };

    const so = host.querySelector("#wkpkgScoutOpp");
    if (so && root.OFFGRD_SCOUTCARDS) so.onclick = () => {
      root.OFFGRD_SCOUTCARDS.openModal({
        installLib: ctx.playbook || root.PBOOK || [],
        games: ctx.games || root.GAMES || [],
        opponent: ctx.opponent || (root.WEEK && root.WEEK.opponent) || null,
        format: "opponent"
      });
    };

    const si = host.querySelector("#wkpkgScoutInstall");
    if (si && root.OFFGRD_SCOUTCARDS) si.onclick = () => {
      root.OFFGRD_SCOUTCARDS.openModal({
        installLib: ctx.playbook || root.PBOOK || [],
        games: ctx.games || root.GAMES || [],
        opponent: null,
        format: "install"
      });
    };

    const reportBtn = host.querySelector("#wkpkgOpenReport");
    if (reportBtn && typeof root.setView === "function") {
      reportBtn.onclick = () => root.setView("report");
    }

    const regen = host.querySelector("#wkpkgRegen");
    if (regen && ctx.canEdit && root.OFFGRD_WEEKLY_PACKAGE_GEN) {
      /* Click must return immediately — never await runGenerate on the event stack. */
      regen.onclick = function (ev) {
        try { if (ev) { ev.preventDefault(); ev.stopPropagation(); } } catch (e) {}
        if (isBusy()) {
          try { alert("A package assemble is already running — wait a moment."); } catch (e) {}
          return;
        }
        scheduleGenerate(ctx, true, {
          confirm: true,
          confirmMsg: "Regenerate the weekly package? Replaces the AI game-plan draft and refreshes the briefing."
        });
      };
    } else if (regen && ctx.onRegenerate) {
      /* Legacy callback — still defer so click never blocks. */
      regen.onclick = function () { scheduleGenerate(ctx, true, { confirm: true }); };
    }
  }

  function packageBarHTML() {
    if (!isWeeklyPackage() || !root.WEEK) return "";
    const rd = root.OFFGRD_REDESIGN && OFFGRD_REDESIGN.isRedesign && OFFGRD_REDESIGN.isRedesign();
    const hasDraft = !!(root.WEEK.gen && root.WEEK.gen.game_plan_draft && root.WEEK.gen.game_plan_draft.sections && root.WEEK.gen.game_plan_draft.sections.length);
    const btn = root.WEEK_EDIT && root.OFFGRD_WEEKLY_PACKAGE
      ? ('<button class="ghost no-print" id="wkPkgBtn" style="font-weight:800">📦 ' + (hasDraft ? "Open weekly package" : "Generate weekly package") + "</button>")
      : (hasDraft ? '<button class="ghost no-print" id="wkPkgBtn">📦 Weekly package</button>' : "");
    if (!btn) return "";
    return rd
      ? ('<div class="no-print rd-pkg-bar">' + btn
        + '<span class="foot">One screen: tendencies + game-plan draft + scout cards + install + briefing. AI drafts; you approve before sharing.</span></div>')
      : ('<div class="no-print" style="background:#eef6ff;border:1px solid #b8d4f0;border-radius:12px;padding:9px 12px;margin-bottom:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">'
      + btn
      + '<span class="foot">One screen: tendencies + game-plan draft + scout cards + install + briefing. AI drafts; you approve before sharing.</span></div>');
  }

  function consumeGmHandoff() {
    try {
      const raw = sessionStorage.getItem("offrd_gm_week_plan_draft");
      if (!raw) return null;
      sessionStorage.removeItem("offrd_gm_week_plan_draft");
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function css() {
    return ".wkpkg-block{margin:14px 0;padding-top:8px;border-top:1px solid var(--line)}.wkpkg-trust{background:#fff8e8;border:1px solid #e8c96a;border-radius:8px;padding:8px 10px;font-size:13px;font-weight:700;margin-bottom:8px}.wkpkg-sec{margin:10px 0}.wkpkg-sec h3{font-size:15px;margin:0 0 6px;color:var(--ink)}.wkpkg-sec ul{margin:4px 0 0 18px;padding:0;font-size:14px}.tn-tile .tn-stat{background:#f4f6f9;border-radius:8px;padding:8px 10px;min-width:120px}.tn-tile .tn-stat b{display:block;font-size:14px}.tn-tile .tn-stat span{font-size:11px;color:#5b626e}.wkpkg-tag-ok{color:#1d7a45;font-weight:800}@media print{.wkpkg-why{display:none!important}.no-print{display:none!important}}";
  }

  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { applyWeeklyPackageGate(); });
    } else {
      applyWeeklyPackageGate();
    }
  } catch (e) {}

  root.OFFGRD_WEEKLY_PACKAGE = {
    isWeeklyPackage,
    applyWeeklyPackageGate,
    collectPayload,
    gamePlanDraft,
    packageApproved,
    injectPackage,
    packageBarHTML,
    wirePackageUI,
    saveDraftEdits,
    approvePackage,
    consumeGmHandoff,
    runGenerate,
    scheduleGenerate,
    mergeGenFromResult,
    isBusy,
    resetBusy,
    css
  };
})(typeof window !== "undefined" ? window : globalThis);
