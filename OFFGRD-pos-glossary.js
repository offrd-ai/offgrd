/* ============================================================
   OFFGRD-pos-glossary.js — Team Position Glossary editor + sync
   Display-only labels; persists program-wide via brand.posGlossary
   + localStorage.offgrd_pos_glossary
   ============================================================ */
(function (root) {
  "use strict";

  const LS_KEY = "offgrd_pos_glossary";
  const PROMPT_KEY = "offgrd_pos_glossary_prompted";

  const OFF_GROUPS = [
    { title: "O-line", keys: ["LT", "LG", "C", "RG", "RT"] },
    { title: "Eligibles", keys: ["X", "Y", "Z", "H", "F", "TE", "U", "W", "A"] },
    { title: "Backs", keys: ["QB", "RB", "FB", "B"] }
  ];
  const DEF_GROUPS = [
    { title: "DL", keys: ["DE", "DT", "NT"] },
    { title: "LB", keys: ["W", "M", "S", "I", "O"] },
    { title: "DB", keys: ["CB", "FS", "SS", "N"] }
  ];

  function R() { return root.OFFGRD_RENDER || null; }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function apply(g, opts) {
    opts = opts || {};
    const ren = R();
    if (ren && ren.setPosGlossary) ren.setPosGlossary(g);
    try { localStorage.setItem(LS_KEY, JSON.stringify(ren ? ren.getPosGlossary() : g)); } catch (e) {}
    if (!opts.skipCloud) pushCloud();
    if (!opts.silent && typeof opts.onApplied === "function") opts.onApplied();
    try {
      if (root.document) {
        root.document.dispatchEvent(new CustomEvent("offgrd:posglossary", { detail: ren ? ren.getPosGlossary() : g }));
      }
    } catch (e) {}
  }

  function pushCloud() {
    try {
      const ren = R();
      if (!ren) return;
      const g = ren.getPosGlossary();
      const TEAM = root.TEAM;
      const Cloud = root.Cloud || (root.OFFGRD_CLOUD && root.OFFGRD_CLOUD.Cloud);
      const canEdit = typeof root.canEdit === "function" ? root.canEdit() : true;
      if (!TEAM || !canEdit) return;
      /* Nest on brand jsonb so players pull it with the team row — no new RPC required */
      const brand = Object.assign({}, TEAM.brand || {}, { posGlossary: g });
      TEAM.brand = brand;
      TEAM.position_glossary = g;
      if (root.OFFGRD_PUSH_BRAND && brand.name) {
        root.OFFGRD_PUSH_BRAND(brand.name, brand);
      } else if (Cloud && Cloud.setTeamBrand) {
        Cloud.setTeamBrand(TEAM.id, brand).catch(function () {});
      }
    } catch (e) {}
  }

  function pullFromTeam() {
    try {
      const TEAM = root.TEAM;
      const fromTeam = (TEAM && (TEAM.position_glossary || (TEAM.brand && TEAM.brand.posGlossary))) || null;
      const local = loadLocal();
      const g = fromTeam || local;
      if (g) apply(g, { skipCloud: true, silent: true });
      else if (R()) R().setPosGlossary(null);
    } catch (e) {}
  }

  function boot() {
    pullFromTeam();
    if (!R()) return;
    const local = loadLocal();
    if (local && !(root.TEAM && root.TEAM.brand && root.TEAM.brand.posGlossary)) {
      apply(local, { skipCloud: true, silent: true });
    }
  }

  function saveFromEditor(host) {
    const ren = R();
    if (!ren) return null;
    const g = ren.cloneGlossary(ren.getPosGlossary());
    host.querySelectorAll("input[data-pg-side]").forEach(function (inp) {
      const side = inp.getAttribute("data-pg-side");
      const key = inp.getAttribute("data-pg-key");
      const val = String(inp.value || "").trim().slice(0, 10);
      if (side && key) g[side][key] = val || key;
    });
    apply(g);
    return g;
  }

  function resetSection(side) {
    const ren = R();
    if (!ren) return;
    const g = ren.cloneGlossary(ren.getPosGlossary());
    const def = ren.DEFAULT_POS_GLOSSARY[side] || {};
    Object.keys(def).forEach(function (k) { g[side][k] = def[k]; });
    apply(g);
  }

  function gridHTML(side, groups) {
    const ren = R();
    const g = ren ? ren.getPosGlossary()[side] : {};
    let html = "";
    groups.forEach(function (grp) {
      html += '<div class="lbl" style="margin:12px 0 6px;color:#cbd5e1">' + grp.title + '</div>';
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px">';
      grp.keys.forEach(function (k) {
        const val = (g && g[k]) || k;
        const tip = k === val ? k : (k + " → " + val);
        html += '<label style="display:flex;flex-direction:column;gap:3px;font-size:11px;font-weight:800;color:#cbd5e1" title="' + tip + '">'
          + '<span>' + k + (k !== val ? ' <span style="font-weight:600;color:#94a3b8">(' + val + ')</span>' : "") + "</span>"
          + '<input data-pg-side="' + side + '" data-pg-key="' + k + '" value="' + String(val).replace(/"/g, "&quot;") + '" maxlength="10" placeholder="' + k + '" style="padding:8px;border:1px solid #e2e5ea;border-radius:8px;font-weight:800;font-size:14px;background:#fff;color:#16181d;caret-color:#16181d">'
          + "</label>";
      });
      html += "</div>";
    });
    return html;
  }

  /** Mount editor into a host element. Returns { save, refresh }. */
  function mountEditor(host, opts) {
    opts = opts || {};
    if (!host) return null;
    function paint() {
      host.innerHTML = ""
        + '<p class="hint" style="margin:0 0 10px;color:#94a3b8">What does your staff call each position? This shows on the field, in the wizard, and on player tests. Engine keys stay the same.</p>'
        + '<div class="row" style="justify-content:space-between;align-items:center"><b style="color:#e6ebf2">Offense</b>'
        + '<button type="button" class="btn" data-pg-reset="off">Reset offense</button></div>'
        + '<div data-pg-off>' + gridHTML("off", OFF_GROUPS) + "</div>"
        + '<div class="row" style="justify-content:space-between;align-items:center;margin-top:16px"><b style="color:#e6ebf2">Defense</b>'
        + '<button type="button" class="btn" data-pg-reset="def">Reset defense</button></div>'
        + '<div data-pg-def>' + gridHTML("def", DEF_GROUPS) + "</div>"
        + '<div class="row" style="margin-top:14px;gap:8px">'
        + '<button type="button" class="btn go" data-pg-save>Save position names</button>'
        + (opts.showSkip ? '<button type="button" class="btn" data-pg-skip>Skip for now</button>' : "")
        + '<span class="hint" data-pg-msg style="margin:0;color:#94a3b8"></span></div>';
      const saveBtn = host.querySelector("[data-pg-save]");
      if (saveBtn) saveBtn.onclick = function () {
        saveFromEditor(host);
        const msg = host.querySelector("[data-pg-msg]");
        if (msg) msg.textContent = "Saved — whole program sees these names.";
        try { localStorage.setItem(PROMPT_KEY, "1"); } catch (e) {}
        if (opts.onSave) opts.onSave();
      };
      host.querySelectorAll("[data-pg-reset]").forEach(function (b) {
        b.onclick = function () {
          resetSection(b.getAttribute("data-pg-reset"));
          paint();
        };
      });
      const skip = host.querySelector("[data-pg-skip]");
      if (skip) skip.onclick = function () {
        try { localStorage.setItem(PROMPT_KEY, "1"); } catch (e) {}
        if (opts.onSkip) opts.onSkip();
      };
    }
    paint();
    return { save: function () { return saveFromEditor(host); }, refresh: paint };
  }

  function shouldPromptWizard() {
    try {
      if (localStorage.getItem(PROMPT_KEY) === "1") return false;
      const g = loadLocal();
      if (!g) return true;
      /* If anything differs from defaults, already customized */
      const ren = R();
      if (!ren) return !g;
      const def = ren.DEFAULT_POS_GLOSSARY;
      const cur = ren.cloneGlossary(g);
      let dirty = false;
      ["off", "def"].forEach(function (side) {
        Object.keys(def[side]).forEach(function (k) {
          if (cur[side][k] !== def[side][k]) dirty = true;
        });
      });
      return !dirty;
    } catch (e) { return true; }
  }

  function markPrompted() {
    try { localStorage.setItem(PROMPT_KEY, "1"); } catch (e) {}
  }

  /* Hook cloud brand apply */
  const prevApply = root.applyCloudBrand;
  root.OFFGRD_APPLY_POS_GLOSSARY = pullFromTeam;

  root.OFFGRD_POS_GLOSSARY = {
    LS_KEY: LS_KEY,
    OFF_GROUPS: OFF_GROUPS,
    DEF_GROUPS: DEF_GROUPS,
    boot: boot,
    apply: apply,
    loadLocal: loadLocal,
    pullFromTeam: pullFromTeam,
    pushCloud: pushCloud,
    mountEditor: mountEditor,
    saveFromEditor: saveFromEditor,
    shouldPromptWizard: shouldPromptWizard,
    markPrompted: markPrompted,
    POSLABEL: function (p, s) { return R() ? R().POSLABEL(p, s) : String(p || ""); }
  };

  /* Auto-boot after DOM + render available */
  function tryBoot() {
    if (!R()) return;
    boot();
  }
  if (root.document && root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", function () { setTimeout(tryBoot, 0); });
  } else {
    setTimeout(tryBoot, 0);
  }
  /* Re-pull when account finishes team load */
  root.document && root.document.addEventListener("offgrd:team", pullFromTeam);

  /* Patch applyCloudBrand if already defined later — account.js calls us */
  root.OFFGRD_POS_GLOSSARY_ON_BRAND = function (brand) {
    if (brand && brand.posGlossary) apply(brand.posGlossary, { skipCloud: true, silent: true });
  };
})(typeof window !== "undefined" ? window : globalThis);
