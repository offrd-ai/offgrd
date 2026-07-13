/* ============================================================
   OFFGRD-weeklypackage.js — AI-GM Weekly Package (roadmap finale)
   Assembly + orchestration: tendencies + game-plan draft + scout cards
   + install + briefing on one screen. No new engines.
   Flag: ?weeklypackage=0|1 | localStorage.offgrd_weekly_package | OFFGRD_CONFIG.weeklyPackage
   ============================================================ */
(function (root) {
  "use strict";

  let _busy = false;

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
        requestAnimationFrame(function () { setTimeout(resolve, 0); });
      } else setTimeout(resolve, 0);
    });
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

  function isBusy() { return !!_busy; }

  /* Lightweight snapshot — summary tile only (full heat tables live on Report). Avoids main-thread freeze. */
  function renderTendencySection(defRows, offRows, opponent, oppName, scopeLabel) {
    const lab = scopeLabel || "season library scope";
    if (!root.OFFGRD_TENDENCIES || !root.OFFGRD_TENDENCIES.isTendency()) {
      return '<p class="foot">Tendency reports flag off. Snapshot unavailable.</p>';
    }
    try {
      const sum = root.OFFGRD_TENDENCIES.summaryTile(defRows || [], offRows || []);
      root.OFFGRD_TENDENCIES.publishSnapshot(opponent, sum, (defRows || []).length, (offRows || []).length, { scopeLabel: lab });
      let h = '<p class="foot" style="margin:0 0 8px">Scope: ' + esc(lab) + ' · self-scout excluded. Full heat tables: <button type="button" class="ghost" id="wkpkgOpenReport" style="padding:2px 8px">Tendencies report</button></p>';
      h += '<div class="tn-tile" style="display:flex;flex-wrap:wrap;gap:10px">';
      h += '<div class="tn-stat"><b>' + (sum.defN || 0) + " defensive · " + (sum.offN || 0) + ' offensive</b><span>In scope</span></div>';
      if (sum.topCoverage) h += '<div class="tn-stat"><b>' + esc(sum.topCoverage) + (sum.topCoveragePct != null ? " " + Math.round(sum.topCoveragePct * 100) + "%" : "") + '</b><span>Top coverage</span></div>';
      if (sum.topFront) h += '<div class="tn-stat"><b>' + esc(sum.topFront) + (sum.topFrontPct != null ? " " + Math.round(sum.topFrontPct * 100) + "%" : "") + '</b><span>Top front</span></div>';
      if (sum.runPct != null) h += '<div class="tn-stat"><b>' + Math.round(sum.runPct * 100) + "% / " + Math.round(sum.passPct * 100) + '%</b><span>Run / Pass</span></div>';
      h += "</div>";
      return h;
    } catch (e) {
      return '<p class="foot">Could not build snapshot — open the Tendencies report.</p>';
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
      return '<p class="foot">No game-plan draft yet — generate the weekly package while online (requires plays on the week plan).</p>';
    }
    const approved = packageApproved(week);
    let h = '<div class="wkpkg-trust">' + esc(draft.trust_note || "AI draft — coach approves before sharing.") + "</div>";
    if (approved) h += '<p class="foot" style="color:#1d7a45;font-weight:800">✓ Approved for sharing — player share checkboxes unlocked below.</p>';
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
      if (!approved) h += '<button type="button" class="go" id="wkpkgApprove" style="font-weight:800">Approve for sharing</button>';
      h += "</div>";
    }
    return h;
  }

  function renderInstallSection(week, playbook) {
    const names = [];
    ((week && week.buckets) || []).forEach(b => (b.plays || []).forEach(p => { if (p && p.name) names.push(p.name); }));
    if (!names.length) return '<p class="foot">Commit plays to the week plan first — Step 3 auto-reads flow to Reps when shared.</p>';
    const byName = {};
    (playbook || []).forEach(p => { if (p && p.name) byName[String(p.name).toLowerCase()] = p; });
    let h = '<table class="plan-tbl"><tr><th>Play</th><th>Auto-reads</th><th>OL keys</th></tr>';
    names.forEach(nm => {
      const row = byName[String(nm).toLowerCase()] || {};
      const reads = row.qb_reads && Object.keys(row.qb_reads).length ? "✓ taught" : '<span class="foot">draw in Playbook</span>';
      const ol = row.ol_keys && row.ol_keys.keys && Object.keys(row.ol_keys.keys).length ? "✓ keyed" : '<span class="foot">—</span>';
      h += "<tr><td><b>" + esc(nm) + "</b></td><td>" + reads + "</td><td>" + ol + "</td></tr>";
    });
    h += "</table>";
    h += '<p class="foot">Drill-ready when you share plays to players (This Week → Reps).</p>';
    return h;
  }

  function renderBriefingSection(week) {
    const g = week && week.gen;
    if (!g || !g.narrative) return '<p class="foot">Briefing generates with the package (generate-week). Offline: committed plan + tendencies still render.</p>';
    let h = '<div style="white-space:pre-wrap;font-size:14px;line-height:1.55">' + esc(g.narrative) + "</div>";
    if (Array.isArray(g.keys) && g.keys.length) {
      h += '<div class="lbl" style="margin-top:10px">Keys</div>';
      g.keys.forEach((k, i) => { h += '<div style="font-weight:700;margin:2px 0">' + (i + 1) + ". " + esc(k) + "</div>"; });
    }
    return h;
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
    let h = '<div class="panel wkpkg-root" id="wkpkgRoot">';
    h += '<div class="persp" style="border:none;padding:0;margin-bottom:8px">';
    h += '<span class="pl" style="font-size:18px"><b>' + esc(oppName) + "</b> — weekly package</span>";
    h += '<button class="ghost no-print" style="margin-left:auto" onclick="printActive()">Print / PDF</button>';
    if (canEdit && ctx.onRegenerate) {
      h += ' <button type="button" class="ghost no-print" id="wkpkgRegen">Regenerate</button>';
    }
    h += "</div>";
    h += '<div id="wkpkgStatus"></div>';
    h += '<section class="wkpkg-block"><div class="lbl">1 · Opponent snapshot</div><div id="wkpkgTend"><p class="foot">Loading snapshot…</p></div></section>';
    h += '<section class="wkpkg-block"><div class="lbl">2 · Game plan draft <span class="foot">(AI suggests — you approve)</span></div><div id="wkpkgPlan"></div></section>';
    h += '<section class="wkpkg-block"><div class="lbl">3 · Scout cards</div><div id="wkpkgScout"></div></section>';
    h += '<section class="wkpkg-block"><div class="lbl">4 · Install / teaching</div><div id="wkpkgInstall"></div></section>';
    h += '<section class="wkpkg-block"><div class="lbl">5 · Weekly briefing</div><div id="wkpkgBrief"></div></section>';
    h += "</div>";
    return h;
  }

  function fillSections(host, ctx, opts) {
    opts = opts || {};
    const week = ctx.week || root.WEEK;
    const opp = ctx.opponent || (week && week.opponent) || "";
    const oppName = opp || "This week";
    const draft = gamePlanDraft(week);
    const tend = host.querySelector("#wkpkgTend");
    const plan = host.querySelector("#wkpkgPlan");
    const scout = host.querySelector("#wkpkgScout");
    const install = host.querySelector("#wkpkgInstall");
    const brief = host.querySelector("#wkpkgBrief");
    if (tend && !opts.skipTend) {
      tend.innerHTML = renderTendencySection(ctx.defRows, ctx.offRows, opp, oppName, ctx.scopeLabel);
    }
    if (plan) {
      plan.innerHTML = renderGamePlanSection(draft, week, !!ctx.canEdit, opts.planStatus);
    }
    if (scout) scout.innerHTML = renderScoutActions();
    if (install) install.innerHTML = renderInstallSection(week, ctx.playbook || root.PBOOK);
    if (brief) brief.innerHTML = renderBriefingSection(week);
  }

  async function injectPackage(host, ctx) {
    if (!host) return;
    ctx = ctx || {};
    host.innerHTML = buildPackageShell(ctx);
    wirePackageUI(host, ctx);
    await yieldPaint();
    fillSections(host, ctx, {});
    wirePackageUI(host, ctx);
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
    try { localStorage.setItem("offgrd_week_v1", JSON.stringify(root.WEEK)); } catch (e) {}
  }

  async function runGenerate(ctx, force) {
    if (_busy) return null;
    if (!root.OFFGRD_WEEKLY_PACKAGE_GEN) throw new Error("Sign in as a coach to generate the weekly package.");
    _busy = true;
    const host = document.getElementById("view-package");
    try {
      if (host) {
        setStatus(host, "Generating weekly package… briefing + game-plan draft (usually 20–45s). Tab stays usable.");
        const plan = host.querySelector("#wkpkgPlan");
        if (plan) plan.innerHTML = renderGamePlanSection(null, root.WEEK, !!ctx.canEdit, { loading: "Drafting game plan vs their tendencies…" });
        const regen = host.querySelector("#wkpkgRegen");
        if (regen) { regen.disabled = true; regen.textContent = "Generating…"; }
      }
      await yieldPaint();
      const payload = collectPayload(ctx);
      const res = await root.OFFGRD_WEEKLY_PACKAGE_GEN(!!force, payload);
      mergeGenFromResult(res);
      if (host) {
        setStatus(host, "");
        fillSections(host, Object.assign({}, ctx, { week: root.WEEK }), { skipTend: true });
        wirePackageUI(host, ctx);
      }
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
      _busy = false;
      const regen = host && host.querySelector("#wkpkgRegen");
      if (regen) { regen.disabled = false; regen.textContent = "Regenerate"; }
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
    if (regen && ctx.onRegenerate) regen.onclick = () => ctx.onRegenerate();
  }

  function packageBarHTML() {
    if (!isWeeklyPackage() || !root.WEEK) return "";
    const hasDraft = !!(root.WEEK.gen && root.WEEK.gen.game_plan_draft && root.WEEK.gen.game_plan_draft.sections && root.WEEK.gen.game_plan_draft.sections.length);
    const btn = root.WEEK_EDIT && root.OFFGRD_WEEKLY_PACKAGE
      ? ('<button class="ghost no-print" id="wkPkgBtn" style="font-weight:800">📦 ' + (hasDraft ? "Open weekly package" : "Generate weekly package") + "</button>")
      : (hasDraft ? '<button class="ghost no-print" id="wkPkgBtn">📦 Weekly package</button>' : "");
    if (!btn) return "";
    return '<div class="no-print" style="background:#eef6ff;border:1px solid #b8d4f0;border-radius:12px;padding:9px 12px;margin-bottom:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">'
      + btn
      + '<span class="foot">One screen: tendencies + game-plan draft + scout cards + install + briefing. AI drafts; you approve before sharing.</span></div>';
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
    return ".wkpkg-block{margin:14px 0;padding-top:8px;border-top:1px solid var(--line)}.wkpkg-trust{background:#fff8e8;border:1px solid #e8c96a;border-radius:8px;padding:8px 10px;font-size:13px;font-weight:700;margin-bottom:8px}.wkpkg-sec{margin:10px 0}.wkpkg-sec h3{font-size:15px;margin:0 0 6px;color:var(--ink)}.wkpkg-sec ul{margin:4px 0 0 18px;padding:0;font-size:14px}.tn-tile .tn-stat{background:#f4f6f9;border-radius:8px;padding:8px 10px;min-width:120px}.tn-tile .tn-stat b{display:block;font-size:14px}.tn-tile .tn-stat span{font-size:11px;color:#5b626e}@media print{.wkpkg-why{display:none!important}.no-print{display:none!important}}";
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
    mergeGenFromResult,
    isBusy,
    css
  };
})(typeof window !== "undefined" ? window : globalThis);
