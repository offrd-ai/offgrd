/* ============================================================
   OFFGRD-redesign.js — Design system Phase 1: tokens + nav shell
   Flag: ?redesign=0|1 | localStorage.offgrd_redesign | OFFGRD_CONFIG.redesign
   Default OFF — old UI intact until cutover.
   Phase 1 only: CSS vars (Night Turf / Chalk) + accent-tuning +
   context bar + four-phase nav. No full screen restyle yet.
   ============================================================ */
(function (root) {
  "use strict";

  const LS_FLAG = "offgrd_redesign";
  const LS_BASE = "offgrd_redesign_base";

  const PHASES = [
    {
      id: "scout",
      label: "Scout",
      views: ["scout", "report"],
      tools: [
        { id: "predict", label: "Predict", view: "scout" },
        { id: "tendency", label: "Tendencies", view: "report", action: "tendency" },
        { id: "report", label: "Report", view: "report" },
        { id: "cards", label: "Scout cards", action: "scoutcards" }
      ]
    },
    {
      id: "plan",
      label: "Plan",
      views: ["plan", "package"],
      tools: [
        { id: "gameplan", label: "Game Plan", view: "plan" },
        { id: "playbook", label: "Playbook", href: "OFFGRD-Playbook.html" },
        { id: "package", label: "Package", view: "package", gate: "weeklyPackage" }
      ]
    },
    {
      id: "teach",
      label: "Teach",
      views: ["practice"],
      tools: [
        { id: "reps", label: "Reps Lab", href: "OFFGRD-QB.html" },
        { id: "practice", label: "Practice", view: "practice" },
        { id: "film", label: "Film", action: "telestrate" }
      ]
    },
    {
      id: "gameday",
      label: "Gameday",
      views: ["caller"],
      tools: [
        { id: "caller", label: "Caller", view: "caller" },
        { id: "booth", label: "Booth mode", action: "booth" }
      ]
    }
  ];

  const SETUP_ITEMS = [
    { id: "import", label: "Import data", action: "import" },
    { id: "brand", label: "Team & logos", action: "brand" },
    { id: "team", label: "Team / roster", action: "team" },
    { id: "sched", label: "Schedule", action: "sched" },
    { id: "manage", label: "Manage library", action: "manage" },
    { id: "sync", label: "Sync ↑", action: "sync" },
    { id: "load", label: "Load ↓", action: "load" },
    { id: "signout", label: "Sign out", action: "signout" },
    { id: "base", label: "Theme: Night / Chalk", action: "toggleBase" }
  ];

  function isRedesign() {
    try {
      const q = location.search || "";
      if (/[?&]redesign=0(?:&|$)/.test(q)) return false;
      if (/[?&]redesign=1(?:&|$)/.test(q)) return true;
      const ls = localStorage.getItem(LS_FLAG);
      if (ls === "0") return false;
      if (ls === "1") return true;
      if (root.OFFGRD_CONFIG && root.OFFGRD_CONFIG.redesign === true) return true;
      if (root.OFFGRD_CONFIG && root.OFFGRD_CONFIG.redesign === false) return false;
    } catch (e) {}
    return false;
  }

  function getBase() {
    try {
      const ls = localStorage.getItem(LS_BASE);
      if (ls === "chalk" || ls === "night") return ls;
    } catch (e) {}
    return "night";
  }

  function setBase(base) {
    base = base === "chalk" ? "chalk" : "night";
    try { localStorage.setItem(LS_BASE, base); } catch (e) {}
    document.documentElement.dataset.base = base;
    applyTokens();
    return base;
  }

  function toggleBase() {
    return setBase(getBase() === "night" ? "chalk" : "night");
  }

  /* ---- color math (accent tuning) ---- */
  function hexToRgb(hex) {
    hex = String(hex || "").replace("#", "").trim();
    if (hex.length === 3) hex = hex.split("").map(function (c) { return c + c; }).join("");
    if (hex.length < 6) return null;
    const n = parseInt(hex, 16);
    if (isNaN(n)) return null;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: h, s: s, l: l };
  }

  function hslToHex(h, s, l) {
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    function to(x) { const v = Math.round(x * 255); return (v < 16 ? "0" : "") + v.toString(16); }
    return "#" + to(r) + to(g) + to(b);
  }

  function relativeLuminance(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return 0;
    function f(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    return 0.2126 * f(rgb.r) + 0.7152 * f(rgb.g) + 0.0722 * f(rgb.b);
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function adjustAccent(teamHex, base) {
    const fb = base === "chalk" ? "#0A63FF" : "#C6FF3A";
    const rgb = hexToRgb(teamHex);
    if (!rgb) {
      return { accent: fb, accentText: relativeLuminance(fb) > 0.45 ? "#0E1116" : "#FFFFFF" };
    }
    let hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    let s = Math.max(hsl.s, 0.55);
    let l = hsl.l;
    if (base === "night") l = clamp(l, 0.54, 0.70);
    else l = clamp(l, 0.36, 0.48);
    const accent = hslToHex(hsl.h, s, l);
    const accentText = relativeLuminance(accent) > 0.45 ? "#0E1116" : "#FFFFFF";
    return { accent: accent, accentText: accentText };
  }

  function teamHex() {
    try {
      const stash = document.documentElement.getAttribute("data-team-hex");
      if (stash) return stash;
      const id = localStorage.getItem("offgrd_identity") || "";
      const brands = JSON.parse(localStorage.getItem("offgrd_brands") || "{}");
      if (id && brands[id] && brands[id].bg) return brands[id].bg;
      const name = root.OUR_TEAM;
      const winBrands = root.USER_BRANDS || brands;
      if (name && winBrands[name] && winBrands[name].bg) return winBrands[name].bg;
    } catch (e) {}
    return null;
  }

  function currentView() {
    try {
      if (typeof root.CURRENT_VIEW === "string" && root.CURRENT_VIEW) return root.CURRENT_VIEW;
    } catch (e) {}
    const ids = ["scout", "plan", "package", "caller", "report", "practice"];
    for (let i = 0; i < ids.length; i++) {
      const el = document.getElementById("view-" + ids[i]);
      if (el && el.style.display !== "none") return ids[i];
    }
    return "scout";
  }

  function cssTokens() {
    return [
      'html[data-base="night"]{',
      '--rd-bg:#0E1116;--rd-surface:#1A1F27;--rd-surface-2:#232A34;--rd-border:#2C333D;',
      '--rd-text:#F5F7FA;--rd-muted:#9AA5B4;--rd-warn-bg:#3A2E12;--rd-warn-text:#F5C451;',
      '}',
      'html[data-base="chalk"]{',
      '--rd-bg:#EDF0F4;--rd-surface:#FFFFFF;--rd-surface-2:#F4F6F9;--rd-border:#D8DEE7;',
      '--rd-text:#111722;--rd-muted:#5C6673;--rd-warn-bg:#FBEBCB;--rd-warn-text:#8A5A05;',
      '}',
      'html.rd-on{',
      '--fs-hero:44px;--fs-h1:34px;--fs-h2:26px;--fs-stat:30px;--fs-title:19px;',
      '--fs-body:14px;--fs-label:12px;--fs-micro:11px;',
      '--radius-pill:20px;--radius-card:14px;--radius-ctl:10px;',
      '}',
      'html.rd-on body{background:var(--rd-bg);color:var(--rd-text);}',
      /* When redesign on, bridge classic vars so un-restyled screens pick up base colors gently */
      'html.rd-on body{',
      '--bg:var(--rd-bg);--panel:var(--rd-surface);--ink:var(--rd-text);--muted:var(--rd-muted);',
      '--line:var(--rd-border);--accent:var(--rd-accent);--accent-ink:var(--rd-accent-text);',
      '}',
      /* Shell — context bar + left-rail phases (desktop) / bottom phases (tablet) */
      '#rdShell{display:none;flex-direction:column;gap:0;position:sticky;top:0;z-index:40;',
      'background:var(--rd-surface);border-bottom:1px solid var(--rd-border);}',
      'html.rd-on #rdShell{display:flex;}',
      'html.rd-on .topbar,html.rd-on #navbar{display:none!important;}',
      '#rdContext{display:flex;align-items:center;gap:10px;padding:10px 16px;flex-wrap:wrap;',
      'min-height:52px;}',
      '#rdMark{display:inline-flex;align-items:center;gap:8px;text-decoration:none;color:inherit;font-weight:500;font-size:15px;}',
      '#rdMark img{width:26px;height:26px;border-radius:6px;}',
      '#rdCrest{display:inline-flex;align-items:center;}',
      '#rdScope{cursor:pointer;background:var(--rd-surface-2);border:1px solid var(--rd-border);',
      'border-radius:var(--radius-pill);padding:6px 12px;font-size:var(--fs-label);font-weight:500;',
      'color:var(--rd-text);}',
      '#rdScope:hover{border-color:var(--rd-accent);}',
      '#rdSync{font-size:var(--fs-micro);letter-spacing:1px;text-transform:uppercase;color:var(--rd-muted);}',
      '#rdContext .rd-spacer{flex:1;min-width:8px;}',
      '.rd-iconbtn{background:var(--rd-surface-2);border:1px solid var(--rd-border);color:var(--rd-text);',
      'border-radius:var(--radius-ctl);padding:7px 10px;font-size:13px;font-weight:500;cursor:pointer;}',
      '.rd-iconbtn:hover{border-color:var(--rd-accent);}',
      '#rdAcctHost{display:inline-flex;align-items:center;gap:6px;}',
      '#rdNavBody{display:flex;align-items:flex-start;gap:0;min-height:0;}',
      '#rdPhases{display:flex;flex-direction:column;gap:4px;padding:10px 8px 12px;',
      'width:132px;flex:0 0 132px;border-right:1px solid var(--rd-border);align-self:stretch;}',
      '.rd-phase{appearance:none;border:0;background:transparent;color:var(--rd-muted);',
      'padding:10px 12px;border-radius:var(--radius-pill);font-size:13px;font-weight:500;cursor:pointer;text-align:left;}',
      '.rd-phase.on{background:var(--rd-accent);color:var(--rd-accent-text);}',
      '#rdTools{display:flex;gap:6px;padding:10px 16px 12px;flex-wrap:wrap;flex:1;min-height:40px;}',
      '.rd-pill{appearance:none;border:1px solid var(--rd-border);background:var(--rd-surface-2);',
      'color:var(--rd-text);padding:6px 12px;border-radius:var(--radius-pill);font-size:var(--fs-label);',
      'font-weight:500;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;}',
      '.rd-pill.on{background:var(--rd-accent);color:var(--rd-accent-text);border-color:var(--rd-accent);}',
      '.rd-pill[hidden]{display:none!important;}',
      '#rdSetup{position:relative;}',
      '#rdSetupMenu{display:none;position:absolute;right:0;top:calc(100% + 6px);min-width:200px;',
      'background:var(--rd-surface);border:1px solid var(--rd-border);border-radius:var(--radius-card);',
      'box-shadow:0 16px 40px rgba(0,0,0,.35);padding:6px;z-index:60;}',
      '#rdSetupMenu.open{display:block;}',
      '#rdSetupMenu button,#rdSetupMenu a{display:block;width:100%;text-align:left;border:0;',
      'background:transparent;color:var(--rd-text);padding:10px 12px;border-radius:8px;',
      'font-size:13px;font-weight:500;cursor:pointer;text-decoration:none;}',
      '#rdSetupMenu button:hover,#rdSetupMenu a:hover{background:var(--rd-surface-2);}',
      '@media (max-width:720px){',
      '#rdNavBody{flex-direction:column;}',
      '#rdPhases{flex-direction:row;justify-content:space-around;width:auto;flex:none;',
      'position:fixed;left:0;right:0;bottom:0;padding:8px 10px;border-right:0;',
      'border-top:1px solid var(--rd-border);background:var(--rd-surface);z-index:45;}',
      '.rd-phase{text-align:center;padding:10px 8px;min-height:44px;}',
      '#rdTools{padding:8px 16px 10px;}',
      'html.rd-on body{padding-bottom:64px;}',
      '}'
    ].join("");
  }

  function ensureCss() {
    let st = document.getElementById("rdCss");
    if (!st) {
      st = document.createElement("style");
      st.id = "rdCss";
      document.head.appendChild(st);
    }
    st.textContent = cssTokens();
  }

  function applyTokens() {
    const base = getBase();
    document.documentElement.dataset.base = base;
    const tuned = adjustAccent(teamHex(), base);
    const rootEl = document.documentElement;
    rootEl.style.setProperty("--rd-accent", tuned.accent);
    rootEl.style.setProperty("--rd-accent-text", tuned.accentText);
    try {
      document.body.style.setProperty("--accent", tuned.accent);
      document.body.style.setProperty("--accent-ink", tuned.accentText);
    } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (m) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[m];
    });
  }

  function phaseForView(v) {
    for (let i = 0; i < PHASES.length; i++) {
      if (PHASES[i].views.indexOf(v) >= 0) return PHASES[i].id;
    }
    return "scout";
  }

  function clickExisting(id) {
    const el = document.getElementById(id);
    if (el) { el.click(); return true; }
    return false;
  }

  function runAction(action) {
    switch (action) {
      case "tendency":
        if (!clickExisting("tendencyBtn") && typeof root.setView === "function") root.setView("report");
        break;
      case "scoutcards":
        clickExisting("scoutCardsBtn");
        break;
      case "telestrate":
        if (root.OFFGRD_TELESTRATE && root.OFFGRD_TELESTRATE.openModal) root.OFFGRD_TELESTRATE.openModal({});
        else clickExisting("telestrateBtn");
        break;
      case "booth":
        clickExisting("darkBtn");
        break;
      case "import":
        clickExisting("importBtn");
        break;
      case "brand":
        clickExisting("brandBtn");
        break;
      case "sched":
        clickExisting("schedBtn");
        break;
      case "manage":
        clickExisting("manageBtn");
        break;
      case "team":
        if (!clickExisting("cteam") && !clickExisting("csetup")) clickExisting("brandBtn");
        break;
      case "sync":
        clickExisting("cs");
        break;
      case "load":
        clickExisting("cd");
        break;
      case "signout":
        clickExisting("co");
        break;
      case "toggleBase":
        toggleBase();
        refreshSetupBaseLabel();
        break;
      default:
        break;
    }
  }

  function refreshSetupBaseLabel() {
    const b = document.getElementById("rdSetupBase");
    if (b) b.textContent = "Theme: " + (getBase() === "chalk" ? "Chalk (tap→Night)" : "Night (tap→Chalk)");
  }

  function buildShellHtml() {
    let phases = PHASES.map(function (p) {
      return '<button type="button" class="rd-phase" data-phase="' + p.id + '">' + esc(p.label) + "</button>";
    }).join("");

    let tools = "";
    PHASES.forEach(function (p) {
      (p.tools || []).forEach(function (t) {
        const attrs = [
          'class="rd-pill"',
          'data-phase-tool="' + p.id + '"',
          t.view ? 'data-view="' + t.view + '"' : "",
          t.action ? 'data-action="' + t.action + '"' : "",
          t.gate ? 'data-gate="' + t.gate + '"' : "",
          'hidden'
        ].filter(Boolean).join(" ");
        if (t.href) {
          tools += '<a ' + attrs + ' href="' + esc(t.href) + '">' + esc(t.label) + "</a>";
        } else {
          tools += "<button type=\"button\" " + attrs + ">" + esc(t.label) + "</button>";
        }
      });
    });

    let setup = SETUP_ITEMS.map(function (it) {
      const id = it.action === "toggleBase" ? ' id="rdSetupBase"' : "";
      return '<button type="button"' + id + ' data-action="' + esc(it.action) + '">' + esc(it.label) + "</button>";
    }).join("");

    return ''
      + '<div id="rdContext">'
      + '<a id="rdMark" href="index.html" title="OFFGRD home"><img src="icon.svg" alt=""><span>OFF<span style="opacity:.85">GRD</span></span></a>'
      + '<span id="rdCrest"></span>'
      + '<button type="button" id="rdScope" title="Opponent / scope">Scope</button>'
      + '<span id="rdSync">SYNC</span>'
      + '<span class="rd-spacer"></span>'
      + '<div id="rdSetup"><button type="button" class="rd-iconbtn" id="rdGear" aria-label="Setup">⚙ Setup</button>'
      + '<div id="rdSetupMenu" role="menu">' + setup + '</div></div>'
      + '<span id="rdAcctHost"></span>'
      + '</div>'
      + '<div id="rdNavBody">'
      + '<div id="rdPhases">' + phases + '</div>'
      + '<div id="rdTools">' + tools + '</div>'
      + '</div>';
  }

  function syncPhaseUI() {
    const view = currentView();
    const phase = phaseForView(view);
    [].forEach.call(document.querySelectorAll("#rdPhases .rd-phase"), function (b) {
      b.classList.toggle("on", b.getAttribute("data-phase") === phase);
    });
    [].forEach.call(document.querySelectorAll("#rdTools .rd-pill"), function (p) {
      const forPhase = p.getAttribute("data-phase-tool") === phase;
      const gate = p.getAttribute("data-gate");
      let gatedOff = false;
      if (gate === "weeklyPackage") {
        gatedOff = !(root.OFFGRD_WEEKLY_PACKAGE && root.OFFGRD_WEEKLY_PACKAGE.isWeeklyPackage && root.OFFGRD_WEEKLY_PACKAGE.isWeeklyPackage());
      }
      p.hidden = !forPhase || gatedOff;
      const v = p.getAttribute("data-view");
      p.classList.toggle("on", !!(v && v === view));
    });
  }

  function syncScopeBadge() {
    const btn = document.getElementById("rdScope");
    const src = document.getElementById("datbadge");
    if (btn && src) btn.textContent = src.textContent || "Scope";
    const sync = document.getElementById("rdSync");
    const stat = document.getElementById("syncstat");
    if (sync) {
      const t = (stat && (stat.textContent || "").trim()) || "";
      sync.textContent = t || "LOCAL";
    }
  }

  function syncCrest() {
    const host = document.getElementById("rdCrest");
    const src = document.getElementById("brandCrest");
    if (host && src) host.innerHTML = src.innerHTML;
  }

  function adoptAcct() {
    const host = document.getElementById("rdAcctHost");
    const acct = document.getElementById("acct");
    if (host && acct && acct.parentElement !== host) {
      host.appendChild(acct);
      acct.style.marginLeft = "0";
    }
  }

  function restoreAcct() {
    const acct = document.getElementById("acct");
    const tools = document.getElementById("tools");
    if (acct && tools && acct.parentElement !== tools) {
      tools.appendChild(acct);
      acct.style.marginLeft = "8px";
    }
  }

  function wireShell(shell) {
    [].forEach.call(shell.querySelectorAll(".rd-phase"), function (b) {
      b.onclick = function () {
        const id = b.getAttribute("data-phase");
        const ph = PHASES.filter(function (p) { return p.id === id; })[0];
        if (!ph || !ph.views || !ph.views.length) return;
        if (typeof root.setView === "function") root.setView(ph.views[0]);
        syncPhaseUI();
      };
    });
    [].forEach.call(shell.querySelectorAll(".rd-pill"), function (p) {
      if (p.tagName === "A") return;
      p.onclick = function () {
        const action = p.getAttribute("data-action");
        const view = p.getAttribute("data-view");
        if (action) runAction(action);
        else if (view && typeof root.setView === "function") root.setView(view);
        syncPhaseUI();
      };
    });
    const gear = shell.querySelector("#rdGear");
    const menu = shell.querySelector("#rdSetupMenu");
    if (gear && menu) {
      gear.onclick = function (e) {
        e.stopPropagation();
        menu.classList.toggle("open");
        refreshSetupBaseLabel();
      };
      document.addEventListener("click", function (ev) {
        if (!menu.contains(ev.target) && ev.target !== gear) menu.classList.remove("open");
      });
    }
    [].forEach.call(shell.querySelectorAll("#rdSetupMenu [data-action]"), function (btn) {
      btn.onclick = function () {
        runAction(btn.getAttribute("data-action"));
        if (menu) menu.classList.remove("open");
      };
    });
    const scope = shell.querySelector("#rdScope");
    if (scope) {
      scope.onclick = function () {
        /* Prefer opening schedule / opponent context; fall back to scout */
        if (!clickExisting("schedBtn") && typeof root.setView === "function") root.setView("scout");
      };
    }
  }

  let _patchedSetView = false;
  function patchSetView() {
    if (_patchedSetView || typeof root.setView !== "function") return;
    const orig = root.setView;
    root.setView = function (v) {
      orig.apply(this, arguments);
      if (isRedesign()) {
        try { syncPhaseUI(); syncScopeBadge(); } catch (e) {}
      }
    };
    _patchedSetView = true;
  }

  let _patchedColors = false;
  function patchApplyTeamColors() {
    if (_patchedColors || typeof root.applyTeamColors !== "function") return;
    /* applyTeamColors is not always on window — it's a local function in OFFGRD.html.
       Hook via wrapping after load if exposed; otherwise call applyTokens from shell apply. */
    _patchedColors = true;
  }

  function applyRedesignShell() {
    const on = isRedesign();
    document.documentElement.classList.toggle("rd-on", on);
    if (!on) {
      const shell = document.getElementById("rdShell");
      if (shell) shell.style.display = "none";
      restoreAcct();
      return false;
    }

    ensureCss();
    setBase(getBase()); /* also applies tokens */
    applyTokens();

    let shell = document.getElementById("rdShell");
    if (!shell) {
      shell = document.createElement("div");
      shell.id = "rdShell";
      shell.className = "no-print";
      const top = document.querySelector(".topbar");
      if (top && top.parentNode) top.parentNode.insertBefore(shell, top);
      else document.body.insertBefore(shell, document.body.firstChild);
      shell.innerHTML = buildShellHtml();
      wireShell(shell);
    }
    shell.style.display = "flex";
    adoptAcct();
    syncCrest();
    syncScopeBadge();
    syncPhaseUI();
    patchSetView();
    refreshSetupBaseLabel();

    /* Keep scope badge in sync when datbadge updates */
    try {
      const badge = document.getElementById("datbadge");
      if (badge && !badge._rdObs) {
        badge._rdObs = true;
        const mo = new MutationObserver(function () { syncScopeBadge(); });
        mo.observe(badge, { childList: true, characterData: true, subtree: true });
      }
    } catch (e) {}

    return true;
  }

  function boot() {
    if (!isRedesign()) {
      document.documentElement.classList.remove("rd-on");
      return;
    }
    applyRedesignShell();
    /* Account chip + setView may land slightly after first paint */
    setTimeout(function () {
      if (!isRedesign()) return;
      applyRedesignShell();
      patchSetView();
      syncCrest();
      syncScopeBadge();
      syncPhaseUI();
    }, 250);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 0); });
  } else {
    setTimeout(boot, 0);
  }

  /* Re-apply accent when cloud brand lands */
  const prevBrand = root.OFFGRD_BRAND;
  root.OFFGRD_BRAND = function () {
    if (typeof prevBrand === "function") {
      try { prevBrand.apply(this, arguments); } catch (e) {}
    }
    if (isRedesign()) applyTokens();
  };

  root.OFFGRD_REDESIGN = {
    isRedesign: isRedesign,
    applyRedesignShell: applyRedesignShell,
    applyTokens: applyTokens,
    adjustAccent: adjustAccent,
    getBase: getBase,
    setBase: setBase,
    toggleBase: toggleBase,
    syncPhaseUI: syncPhaseUI,
    PHASES: PHASES
  };
})(typeof window !== "undefined" ? window : globalThis);
