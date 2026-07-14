/* ============================================================
   OFFGRD-redesign.js — Design system: tokens + shell + Scout body
   Flag: ?redesign=0|1 | localStorage.offgrd_redesign | OFFGRD_CONFIG.redesign
   Default OFF — old UI intact until cutover.
   Phase 1/1.5: CSS vars (Night Turf / Day) + accent + context bar +
   four-phase nav + sub-app shell.
   Phase 2 (v66): Scout body restyle under html.rd-on (presentation only).
   v67: Kill switch fully restores legacy light — no body.dark / --bg leak.
   Phase 3 (v68): Plan body — Game Plan + Package restyle under html.rd-on.
   ============================================================ */
(function (root) {
  "use strict";

  const LS_FLAG = "offgrd_redesign";
  const LS_BASE = "offgrd_redesign_base";
  const INLINE_TOKEN_PROPS = [
    "--rd-accent", "--rd-accent-text", "--accent", "--accent-text", "--accent-ink",
    "--bg", "--panel", "--ink", "--muted", "--line",
    "--gold", "--blue", "--bluefill", "--accent2", "--chip", "--warn"
  ];

  /* ---- Unconditional kill switch — runs BEFORE any init/observers/tokens ---- */
  function queryFlag() {
    try {
      const q = location.search || "";
      if (/[?&]redesign=0(?:&|$)/.test(q)) return 0;
      if (/[?&]redesign=1(?:&|$)/.test(q)) return 1;
    } catch (e) {}
    return null;
  }

  function clearInlineTokenProps() {
    const els = [document.documentElement, document.body];
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (!el || !el.style) continue;
      for (let j = 0; j < INLINE_TOKEN_PROPS.length; j++) {
        try { el.style.removeProperty(INLINE_TOKEN_PROPS[j]); } catch (e) {}
      }
    }
  }

  function removeRdCss() {
    try {
      const st = document.getElementById("rdCss");
      if (st && st.parentNode) st.parentNode.removeChild(st);
    } catch (e) {}
  }

  /* Strip redesign paint so legacy :root --bg (#f4f5f7) wins again. */
  function tearDownRedesignPaint() {
    try {
      document.documentElement.classList.remove("rd-on");
      document.documentElement.removeAttribute("data-base");
      document.documentElement.removeAttribute("data-rd-accent");
      document.documentElement.removeAttribute("data-rd-base");
    } catch (e) {}
    clearInlineTokenProps();
    removeRdCss();
    try {
      const shell = document.getElementById("rdShell");
      if (shell) {
        if (queryFlag() === 0 && shell.parentNode) shell.parentNode.removeChild(shell);
        else shell.style.display = "none";
      }
    } catch (e) {}
  }

  /*
   * Redesign Night/Day own the look via --rd-* under html.rd-on — never body.dark.
   * body.dark is classic Booth only; leaving it on leaks #0b1017 --bg into flag-off.
   */
  function stripLegacyDarkClass() {
    try {
      if (document.body) document.body.classList.remove("dark");
    } catch (e) {}
    try {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta && meta.getAttribute("content") === "#0b1017") meta.setAttribute("content", "#13294B");
    } catch (e) {}
  }

  function restoreLegacyTheme() {
    tearDownRedesignPaint();
    if (!document.body) return;
    /* Explicit ?redesign=0: always force light (acceptance). Skip booth auto-restore. */
    if (queryFlag() === 0) {
      stripLegacyDarkClass();
      return;
    }
    /* Flag off without kill query: restore classic booth preference. */
    try {
      const booth = localStorage.getItem("offgrd_booth") === "1";
      document.body.classList.toggle("dark", booth);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", booth ? "#0b1017" : "#13294B");
    } catch (e) {
      stripLegacyDarkClass();
    }
  }

  function whenDomReady(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  (function applyKillSwitch() {
    if (queryFlag() !== 0) return;
    try { localStorage.setItem(LS_FLAG, "0"); } catch (e) {}
    try { localStorage.removeItem(LS_BASE); } catch (e) {}
    tearDownRedesignPaint();
    /* body may not exist yet (script in <head>) — finish on DOM ready */
    whenDomReady(function () { restoreLegacyTheme(); });
  })();

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
    { id: "base", label: "Theme: Night / Day", action: "toggleBase" }
  ];

  function isRedesign() {
    try {
      const qf = queryFlag();
      if (qf === 0) return false;
      if (qf === 1) return true;
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
      if (ls === "chalk") { try { localStorage.setItem("offgrd_redesign_base", "day"); } catch (e) {} return "day"; }
      if (ls === "day" || ls === "night") return ls;
    } catch (e) {}
    return "night";
  }

  function setBase(base) {
    if (base === "chalk") base = "day";
    base = base === "day" ? "day" : "night";
    try { localStorage.setItem(LS_BASE, base); } catch (e) {}
    try {
      if (document.documentElement.dataset.base !== base) {
        document.documentElement.dataset.base = base;
      }
    } catch (e) {}
    applyTokens(base);
    return base;
  }

  function toggleBase() {
    return setBase(getBase() === "night" ? "day" : "night");
  }

  /* ---- page / cache-bust helpers (sub-app shell) ---- */
  const ASSET_V = "68";

  function appKind() {
    try {
      const p = (location.pathname || "").split("/").pop() || "";
      if (/OFFGRD-QB\.html/i.test(p)) return "qb";
      if (/OFFGRD-Playbook\.html/i.test(p)) return "playbook";
    } catch (e) {}
    return "scout";
  }

  function assetV() {
    try {
      const m = (location.search || "").match(/[?&]v=(\d+)/);
      if (m) return m[1];
      const s = document.querySelector('script[src*="OFFGRD-redesign.js"]');
      if (s) {
        const sm = String(s.getAttribute("src") || "").match(/[?&]v=(\d+)/);
        if (sm) return sm[1];
      }
    } catch (e) {}
    return ASSET_V;
  }

  function withV(href) {
    if (!href || /^https?:/i.test(href) || href.charAt(0) === "#") return href;
    const hashIdx = href.indexOf("#");
    let base = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
    const hash = hashIdx >= 0 ? href.slice(hashIdx) : "";
    if (/[?&]v=/.test(base)) return href;
    const v = assetV();
    base += (base.indexOf("?") >= 0 ? "&" : "?") + "v=" + v;
    return base + hash;
  }

  function goMain(view) {
    try {
      if (view) sessionStorage.setItem("offgrd_rd_view", view);
    } catch (e) {}
    location.href = withV("OFFGRD.html");
  }

  function stampVersionedLinks() {
    try {
      [].forEach.call(document.querySelectorAll("a[href]"), function (a) {
        const h = a.getAttribute("href") || "";
        if (/^OFFGRD(-QB|-Playbook)?\.html/i.test(h) || h === "index.html") {
          a.setAttribute("href", withV(h));
        }
      });
    } catch (e) {}
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

  function contrastRatio(a, b) {
    const L1 = relativeLuminance(a), L2 = relativeLuminance(b);
    const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
    return (hi + 0.05) / (lo + 0.05);
  }

  function normalizeHex(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return null;
    function to(x) { return (x < 16 ? "0" : "") + x.toString(16); }
    return "#" + to(rgb.r) + to(rgb.g) + to(rgb.b);
  }

  /* Module cache of RAW team hex only — never store a tuned accent here. */
  let _rawTeamHex = null;

  function noteRawTeamHex(hex) {
    const n = normalizeHex(hex);
    if (!n) return null;
    _rawTeamHex = n;
    try { document.documentElement.setAttribute("data-team-hex", n); } catch (e) {}
    return n;
  }

  function adjustAccent(teamHex, base) {
    if (base === "chalk") base = "day";
    base = base === "day" ? "day" : "night";
    const fb = base === "day" ? "#0A63FF" : "#C6FF3A";
    const rgb = hexToRgb(teamHex);
    if (!rgb) {
      return { accent: fb, accentText: relativeLuminance(fb) > 0.45 ? "#0E1116" : "#FFFFFF" };
    }
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const s = Math.max(hsl.s, 0.55);
    let l = hsl.l;
    /* Spec bands — ONE PASS. Never iterate lightness. */
    if (base === "night") l = clamp(l, 0.54, 0.70);
    else l = clamp(l, 0.36, 0.48);

    let accent = hslToHex(hsl.h, s, l);
    const surface = base === "day" ? "#FFFFFF" : "#0E1116";

    /* At most one direct hop + one fallback — bounded, always terminates. */
    if (contrastRatio(accent, surface) < 4.5) {
      l = base === "day" ? 0.28 : 0.62;
      accent = hslToHex(hsl.h, s, l);
      if (contrastRatio(accent, surface) < 4.5) accent = fb;
    }

    const accentText = relativeLuminance(accent) > 0.45 ? "#0E1116" : "#FFFFFF";
    return { accent: accent, accentText: accentText };
  }

  /* Always the program's stored team color — never --accent / --rd-accent. */
  function rawTeamHex() {
    try {
      const stash = document.documentElement.getAttribute("data-team-hex");
      const fromStash = normalizeHex(stash);
      if (fromStash) { _rawTeamHex = fromStash; return fromStash; }
    } catch (e) {}
    if (_rawTeamHex && hexToRgb(_rawTeamHex)) return _rawTeamHex;
    try {
      const id = localStorage.getItem("offgrd_identity") || "";
      const brands = JSON.parse(localStorage.getItem("offgrd_brands") || "{}");
      if (id && brands[id] && brands[id].bg) return noteRawTeamHex(brands[id].bg);
      const name = root.OUR_TEAM;
      const winBrands = root.USER_BRANDS || brands;
      if (name && winBrands[name] && winBrands[name].bg) return noteRawTeamHex(winBrands[name].bg);
    } catch (e) {}
    return null;
  }

  function teamHex() { return rawTeamHex(); }

  function currentView() {
    const kind = appKind();
    if (kind === "qb") return "reps";
    if (kind === "playbook") return "playbook";
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
      /* Base palettes — ONLY while redesign is on (never redefine legacy --bg globally) */
      'html.rd-on[data-base="night"]{',
      '--rd-bg:#0E1116;--rd-surface:#1A1F27;--rd-surface-2:#232A34;--rd-border:#2C333D;',
      '--rd-text:#F5F7FA;--rd-muted:#9AA5B4;--rd-warn-bg:#3A2E12;--rd-warn-text:#F5C451;',
      '}',
      'html.rd-on[data-base="day"]{',
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
      '--gold:var(--rd-accent);--blue:var(--rd-accent);--bluefill:var(--rd-accent);--accent2:var(--rd-accent);',
      '--chip:var(--rd-surface-2);--warn:var(--rd-warn-text);',
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
      '#rdAcctHost{display:inline-flex;align-items:center;gap:6px;max-width:160px;}',
      /* Fold Team/Sync/Load/Sign out into Setup gear — keep Sign in + short identity */
      'html.rd-on #rdAcctHost #cteam,html.rd-on #rdAcctHost #cs,html.rd-on #rdAcctHost #cd,',
      'html.rd-on #rdAcctHost #co,html.rd-on #rdAcctHost #csetup,html.rd-on #rdAcctHost #syncstat',
      '{display:none!important;}',
      'html.rd-on #rdAcctHost .cbtn:not(#ci){display:none!important;}',
      'html.rd-on #rdAcctHost > span{font-size:11px;color:var(--rd-muted);max-width:110px;',
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
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
      '}',
      /* ---- Phase 2: Scout body (presentation only) ---- */
      'html.rd-on #view-scout{gap:10px;}',
      'html.rd-on #view-scout > .panel{',
      'background:var(--rd-surface);border:1px solid var(--rd-border);border-radius:var(--radius-card);',
      'box-shadow:none;padding:12px 14px;margin-bottom:0;',
      '}',
      'html.rd-on #view-scout > .panel.result{',
      'background:var(--rd-surface);border:1px solid var(--rd-border);border-left:5px solid var(--rd-accent);',
      'border-radius:var(--radius-card);padding:14px 16px;',
      '}',
      'html.rd-on #view-scout > .foot.panel{background:transparent!important;border:none!important;padding:4px 6px!important;}',
      'html.rd-on #view-scout .lbl{',
      'font-size:var(--fs-micro);font-weight:500;letter-spacing:1px;text-transform:uppercase;color:var(--rd-muted);',
      '}',
      'html.rd-on #view-scout .seg{background:var(--rd-surface-2);border-radius:var(--radius-pill);padding:3px;gap:2px;}',
      'html.rd-on #view-scout .seg button{',
      'background:transparent!important;border:1px solid transparent!important;',
      'font-weight:500!important;color:var(--rd-muted)!important;border-radius:var(--radius-pill);padding:8px 12px;',
      '}',
      'html.rd-on #view-scout .seg button.on{',
      'background:var(--rd-accent)!important;border-color:var(--rd-accent)!important;color:var(--rd-accent-text)!important;',
      '}',
      'html.rd-on #view-scout .gamepick{display:flex;align-items:center;gap:8px;}',
      'html.rd-on #view-scout .gamepick select{flex:1;min-width:0;}',
      'html.rd-on #view-scout .presetrow{display:flex;flex-wrap:wrap;align-items:center;gap:6px;}',
      'html.rd-on #view-scout .preset{',
      'background:var(--rd-surface-2);border:1px solid var(--rd-border);color:var(--rd-text);',
      'border-radius:var(--radius-pill);font-weight:500;padding:6px 11px;',
      '}',
      'html.rd-on #view-scout .preset:hover,html.rd-on #view-scout .preset.on{',
      'border-color:var(--rd-accent);color:var(--rd-accent);',
      '}',
      'html.rd-on #view-scout select{',
      'background:var(--rd-surface-2)!important;color:var(--rd-text)!important;border:1px solid var(--rd-border)!important;',
      'border-radius:var(--radius-ctl)!important;font-weight:500!important;padding:10px 10px;',
      '}',
      'html.rd-on #view-scout select:focus{outline:2px solid var(--rd-accent);outline-offset:1px;border-color:var(--rd-accent)!important;}',
      'html.rd-on #view-scout .tg{color:var(--rd-text);font-weight:500;}',
      'html.rd-on #view-scout .tg input{accent-color:var(--rd-accent);}',
      'html.rd-on #view-scout .reslead{',
      'font-size:var(--fs-micro);font-weight:500;letter-spacing:1px;text-transform:uppercase;color:var(--rd-muted);',
      '}',
      'html.rd-on #view-scout .callline{gap:12px;margin:4px 0 8px;align-items:baseline;}',
      'html.rd-on #view-scout .callname{',
      'font-size:var(--fs-hero)!important;font-weight:500!important;color:var(--rd-text)!important;line-height:1.05;',
      '}',
      'html.rd-on #view-scout .callpct{',
      'font-size:var(--fs-hero)!important;font-weight:500!important;color:var(--rd-accent)!important;line-height:1.05;',
      '}',
      'html.rd-on #view-scout .callline .sub{color:var(--rd-muted);font-size:var(--fs-body);font-weight:500;}',
      'html.rd-on #view-scout .conf .sub{color:var(--rd-muted);font-size:var(--fs-label);font-weight:500;}',
      'html.rd-on #view-scout .conf .sub b{color:var(--rd-text);font-weight:500;}',
      'html.rd-on #view-scout .pill{',
      'font-weight:500!important;border-radius:var(--radius-pill);letter-spacing:1px;padding:5px 10px;',
      '}',
      'html.rd-on #view-scout .pill.warn{background:var(--rd-warn-bg)!important;color:var(--rd-warn-text)!important;}',
      'html.rd-on #view-scout .pill.good{background:var(--rd-surface-2)!important;color:var(--rd-accent)!important;border:1px solid var(--rd-border);}',
      'html.rd-on #view-scout .pill.bad{background:var(--rd-warn-bg)!important;color:var(--rd-warn-text)!important;}',
      'html.rd-on #view-scout .widen{color:var(--rd-warn-text)!important;font-weight:500!important;font-size:var(--fs-label);}',
      'html.rd-on #view-scout .cards{gap:10px;margin:12px 0;}',
      'html.rd-on #view-scout .card{',
      'background:var(--rd-surface)!important;border:1px solid var(--rd-border)!important;',
      'border-radius:var(--radius-card);padding:12px 14px;',
      '}',
      'html.rd-on #view-scout .card .k{',
      'font-size:var(--fs-micro);font-weight:500;letter-spacing:1px;text-transform:uppercase;color:var(--rd-muted);',
      '}',
      'html.rd-on #view-scout .card .v{',
      'font-size:var(--fs-stat)!important;font-weight:500!important;color:var(--rd-text);margin-top:4px;',
      '}',
      'html.rd-on #view-scout .card .v.gold{color:var(--rd-accent)!important;}',
      'html.rd-on #view-scout .card .s{font-size:var(--fs-label);color:var(--rd-muted);font-weight:500;}',
      'html.rd-on #view-scout .attack{',
      'background:var(--rd-surface-2)!important;border-left:4px solid var(--rd-accent)!important;',
      'border-radius:0 var(--radius-card) var(--radius-card) 0!important;padding:12px 14px;margin:8px 0;',
      '}',
      'html.rd-on #view-scout .attack .h{',
      'color:var(--rd-accent)!important;font-weight:500!important;font-size:var(--fs-micro);letter-spacing:1px;',
      '}',
      'html.rd-on #view-scout .attack p,html.rd-on #view-scout .attack .beat{',
      'color:var(--rd-text)!important;font-weight:400;font-size:var(--fs-body);',
      '}',
      'html.rd-on #view-scout .attack .beat b{color:var(--rd-accent)!important;font-weight:500;}',
      'html.rd-on #view-scout .dist{margin-top:12px;}',
      'html.rd-on #view-scout .barrow .name{color:var(--rd-text);font-weight:500;font-size:var(--fs-label);}',
      'html.rd-on #view-scout .track{',
      'background:var(--rd-surface-2)!important;border-radius:8px;height:22px;overflow:hidden;',
      '}',
      'html.rd-on #view-scout .fill,',
      'html.rd-on #view-scout .fill.cov,',
      'html.rd-on #view-scout .fill.cov.alt,',
      'html.rd-on #view-scout .fill.prs{',
      'background:var(--rd-accent)!important;color:var(--rd-accent-text)!important;',
      'font-weight:500!important;font-size:var(--fs-micro);border-radius:8px;',
      '}',
      'html.rd-on #view-scout details{border-top:1px solid var(--rd-border);}',
      'html.rd-on #view-scout summary{color:var(--rd-muted);font-weight:500!important;font-size:var(--fs-micro);}',
      'html.rd-on #view-scout table{font-size:var(--fs-label);}',
      'html.rd-on #view-scout th{color:var(--rd-muted);font-weight:500;}',
      'html.rd-on #view-scout td{color:var(--rd-text);border-bottom-color:var(--rd-border);}',
      'html.rd-on #view-scout .tagrow td{font-weight:500;}',
      'html.rd-on #view-scout .foot{color:var(--rd-muted);font-size:var(--fs-label);}',
      'html.rd-on #view-scout .persp{border-bottom-color:var(--rd-border);}',
      'html.rd-on #view-scout .persp .pl{color:var(--rd-muted);font-weight:500;}',
      'html.rd-on #view-scout .persp .pl b{color:var(--rd-text);font-weight:500;}',
      'html.rd-on #view-scout .calls{',
      'background:var(--rd-surface)!important;border:1px solid var(--rd-border);',
      'border-left:4px solid var(--rd-accent)!important;border-radius:var(--radius-card);',
      'padding:12px 14px;margin-top:12px;',
      '}',
      'html.rd-on #view-scout .calls .lbl{color:var(--rd-text);font-weight:500;}',
      'html.rd-on #view-scout .callnote{color:var(--rd-muted);font-weight:500;}',
      'html.rd-on #view-scout .callsempty{color:var(--rd-muted);}',
      'html.rd-on #view-scout .callitem .cn{color:var(--rd-text);font-weight:500;}',
      'html.rd-on #view-scout .callitem .cnn{color:var(--rd-muted);font-weight:500;}',
      'html.rd-on #view-scout .xchip{color:var(--rd-accent)!important;font-weight:500;}',
      'html.rd-on #view-scout .btnp,html.rd-on #view-scout .rd-scout-cta{',
      'background:var(--rd-accent)!important;color:var(--rd-accent-text)!important;border:0!important;',
      'border-radius:var(--radius-ctl)!important;padding:10px 16px!important;font-weight:500!important;cursor:pointer;',
      '}',
      'html.rd-on #view-scout .gcell{background:var(--rd-surface-2);border-color:var(--rd-border);}',
      'html.rd-on #view-scout .gcell .gc{color:var(--rd-text);font-weight:500;}',
      'html.rd-on #view-scout .gcell .gp,html.rd-on #view-scout .legend{color:var(--rd-muted);}',
      'html.rd-on #view-scout .legend b{color:var(--rd-text);}',
      'html.rd-on #view-scout .rowh{color:var(--rd-text);font-weight:500;}',
      /* Scout SVG thumbnails / sketches — route stroke → accent, field lines → border */
      'html.rd-on #view-scout svg path[stroke]:not([stroke="none"]){stroke:var(--rd-accent);}',
      'html.rd-on #view-scout svg line[stroke^="rgba"],html.rd-on #view-scout svg line[stroke="#fff"],',
      'html.rd-on #view-scout svg line[stroke="white"]{stroke:var(--rd-border)!important;}',
      '@media (max-width:900px){',
      'html.rd-on #view-scout{display:flex!important;flex-direction:column!important;gap:10px!important;}',
      'html.rd-on #view-scout > .result{',
      'order:-1;position:static!important;max-height:none!important;grid-column:auto!important;grid-row:auto!important;',
      '}',
      'html.rd-on #view-scout > .panel{grid-column:auto!important;}',
      '}',
      /* ---- Phase 3: Plan body — Game Plan + Package (presentation only) ---- */
      'html.rd-on #view-plan,html.rd-on #view-package{gap:10px;}',
      'html.rd-on #view-plan > .panel,html.rd-on #view-package > .panel,html.rd-on #view-package .wkpkg-root{',
      'background:var(--rd-surface);border:1px solid var(--rd-border);border-radius:var(--radius-card);',
      'box-shadow:none;padding:14px 16px;',
      '}',
      'html.rd-on #view-plan .persp .pl,html.rd-on #view-package .persp .pl{',
      'font-size:var(--fs-title)!important;font-weight:500;color:var(--rd-muted);',
      '}',
      'html.rd-on #view-plan .persp .pl b,html.rd-on #view-package .persp .pl b{',
      'color:var(--rd-text)!important;font-weight:500;font-size:var(--fs-h2);',
      '}',
      'html.rd-on #view-plan .seg,html.rd-on #view-package .seg{',
      'background:var(--rd-surface-2);border-radius:var(--radius-pill);padding:3px;gap:2px;',
      '}',
      'html.rd-on #view-plan .seg button,html.rd-on #view-package .seg button{',
      'background:transparent!important;border:1px solid transparent!important;',
      'font-weight:500!important;color:var(--rd-muted)!important;border-radius:var(--radius-pill);padding:8px 12px;',
      '}',
      'html.rd-on #view-plan .seg button.on,html.rd-on #view-package .seg button.on{',
      'background:var(--rd-accent)!important;border-color:var(--rd-accent)!important;color:var(--rd-accent-text)!important;',
      '}',
      'html.rd-on #view-plan .ghost,html.rd-on #view-package .ghost{',
      'background:var(--rd-surface-2)!important;border:1px solid var(--rd-border)!important;color:var(--rd-text)!important;',
      'border-radius:var(--radius-ctl)!important;font-weight:500!important;',
      '}',
      'html.rd-on #view-plan .ghost:hover,html.rd-on #view-package .ghost:hover{border-color:var(--rd-accent)!important;color:var(--rd-accent)!important;}',
      'html.rd-on #view-plan .go,html.rd-on #view-package .go,html.rd-on #view-package #wkpkgApprove{',
      'background:var(--rd-accent)!important;border:1px solid var(--rd-accent)!important;',
      'color:var(--rd-accent-text)!important;border-radius:var(--radius-ctl)!important;',
      'padding:10px 16px!important;font-weight:500!important;cursor:pointer;',
      '}',
      'html.rd-on #view-plan .lbl,html.rd-on #view-package .lbl{',
      'font-size:var(--fs-micro);font-weight:500;letter-spacing:1px;text-transform:uppercase;color:var(--rd-muted);',
      '}',
      'html.rd-on #view-plan .foot,html.rd-on #view-package .foot{color:var(--rd-muted);font-size:var(--fs-label);font-weight:500;}',
      'html.rd-on #view-plan .tg,html.rd-on #view-package .tg{color:var(--rd-text);font-weight:500;}',
      'html.rd-on #view-plan .tg input,html.rd-on #view-package .tg input{accent-color:var(--rd-accent);}',
      /* This-week row + form fields */
      'html.rd-on #view-plan .rd-week-bar,html.rd-on #view-plan .rd-pkg-bar,html.rd-on #view-plan .rd-gen-empty{',
      'background:var(--rd-surface-2)!important;border:1px solid var(--rd-border)!important;',
      'border-radius:var(--radius-card)!important;padding:10px 12px;margin-bottom:10px;',
      'display:flex;gap:10px;align-items:center;flex-wrap:wrap;color:var(--rd-text);',
      '}',
      'html.rd-on #view-plan .rd-week-bar b,html.rd-on #view-plan .rd-pkg-bar b{color:var(--rd-text);font-weight:500;}',
      'html.rd-on #view-plan select,html.rd-on #view-plan input[type="date"],html.rd-on #view-plan input[type="number"],',
      'html.rd-on #view-plan input[type="text"],html.rd-on #view-plan .plan-tbl input,html.rd-on #view-plan .plan-tbl select{',
      'background:var(--rd-surface)!important;color:var(--rd-text)!important;border:1px solid var(--rd-border)!important;',
      'border-radius:var(--radius-ctl)!important;font-weight:500!important;',
      '}',
      'html.rd-on #view-plan select:focus,html.rd-on #view-plan input:focus{',
      'outline:2px solid var(--rd-accent);outline-offset:1px;border-color:var(--rd-accent)!important;',
      '}',
      'html.rd-on #view-plan .wb{',
      'background:var(--rd-accent)!important;color:var(--rd-accent-text)!important;',
      'border-radius:6px;font-weight:500!important;font-size:var(--fs-micro);',
      '}',
      /* Week briefing collapsible */
      'html.rd-on #view-plan details.rd-week-brief,html.rd-on #view-plan details{',
      'background:var(--rd-surface)!important;border:1px solid var(--rd-border)!important;',
      'border-radius:var(--radius-card)!important;padding:12px 14px;margin-bottom:10px;color:var(--rd-text);',
      '}',
      'html.rd-on #view-plan details summary{',
      'font-weight:500!important;color:var(--rd-text)!important;cursor:pointer;list-style:none;',
      '}',
      'html.rd-on #view-plan details summary::-webkit-details-marker{display:none;}',
      'html.rd-on #view-plan details summary::before{',
      'content:"";display:inline-block;width:0;height:0;margin-right:8px;vertical-align:middle;',
      'border-top:5px solid transparent;border-bottom:5px solid transparent;',
      'border-left:6px solid var(--rd-accent);',
      '}',
      'html.rd-on #view-plan details[open] summary::before{',
      'border-left:5px solid transparent;border-right:5px solid transparent;',
      'border-top:6px solid var(--rd-accent);border-bottom:0;margin-right:6px;',
      '}',
      /* Approve / share banners */
      'html.rd-on #view-plan .rd-share-locked{',
      'background:var(--rd-warn-bg)!important;border:1px solid var(--rd-border)!important;',
      'border-radius:var(--radius-card)!important;padding:10px 12px;margin-bottom:10px;color:var(--rd-warn-text)!important;',
      '}',
      'html.rd-on #view-plan .rd-share-locked .lbl{color:var(--rd-warn-text)!important;}',
      'html.rd-on #view-plan .rd-share-locked .foot{color:var(--rd-warn-text)!important;opacity:.92;}',
      'html.rd-on #view-plan .rd-share-open{',
      'background:var(--rd-surface-2)!important;border:1px solid var(--rd-border)!important;',
      'border-radius:var(--radius-card)!important;padding:10px 12px;margin-bottom:10px;',
      '}',
      'html.rd-on #view-plan .rd-share-open label{color:var(--rd-text)!important;font-weight:500!important;}',
      /* Situation table — dense working grid */
      'html.rd-on #view-plan .plan-tbl{margin-top:8px;font-size:var(--fs-label);}',
      'html.rd-on #view-plan .plan-tbl th{',
      'background:var(--rd-surface-2)!important;color:var(--rd-muted)!important;border-color:var(--rd-border)!important;',
      'font-weight:500;font-size:var(--fs-micro);letter-spacing:1px;',
      '}',
      'html.rd-on #view-plan .plan-tbl td{',
      'border-color:var(--rd-border)!important;color:var(--rd-text);padding:8px 9px;vertical-align:top;',
      '}',
      'html.rd-on #view-plan .plan-tbl td > b{color:var(--rd-text);font-weight:500;}',
      'html.rd-on #view-plan .rd-stat{color:var(--rd-accent)!important;font-weight:500;}',
      'html.rd-on #view-plan .wkchip{',
      'background:var(--rd-surface-2);border:1px solid var(--rd-border);border-radius:var(--radius-pill);',
      'padding:3px 8px;font-weight:500;font-size:var(--fs-label);color:var(--rd-text);',
      '}',
      'html.rd-on #view-plan .wkchip .wb{margin-right:4px;}',
      'html.rd-on #view-plan .wkcall .foot{color:var(--rd-muted);}',
      'html.rd-on #view-plan .wkcall .nm{color:var(--rd-text);font-weight:500;}',
      'html.rd-on #view-plan .wkadd{',
      'background:var(--rd-surface-2)!important;border-color:var(--rd-border)!important;color:var(--rd-accent)!important;',
      'border-radius:var(--radius-ctl);font-weight:500;',
      '}',
      'html.rd-on #view-plan .rd-runpass{color:var(--rd-accent)!important;font-weight:500!important;font-size:var(--fs-micro);letter-spacing:1px;}',
      /* Package — document-grade */
      'html.rd-on #view-package .wkpkg-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;}',
      'html.rd-on #view-package .wkpkg-draft-pill{',
      'display:inline-flex;align-items:center;padding:4px 10px;border-radius:var(--radius-pill);',
      'background:var(--rd-warn-bg)!important;color:var(--rd-warn-text)!important;',
      'font-size:var(--fs-micro);font-weight:500;letter-spacing:1px;text-transform:uppercase;',
      '}',
      'html.rd-on #view-package .wkpkg-ok-pill{',
      'display:inline-flex;align-items:center;padding:4px 10px;border-radius:var(--radius-pill);',
      'background:var(--rd-surface-2);color:var(--rd-accent);border:1px solid var(--rd-border);',
      'font-size:var(--fs-micro);font-weight:500;letter-spacing:1px;text-transform:uppercase;',
      '}',
      'html.rd-on #view-package .wkpkg-gate-note{color:var(--rd-muted);font-size:var(--fs-label);font-weight:500;margin:0 0 12px;}',
      'html.rd-on #view-package .wkpkg-block{',
      'margin:18px 0;padding-top:14px;border-top:1px solid var(--rd-border)!important;',
      '}',
      'html.rd-on #view-package .wkpkg-sec-lbl{',
      'display:flex;align-items:center;gap:10px;margin-bottom:10px;',
      'font-size:var(--fs-micro);font-weight:500;letter-spacing:1px;text-transform:uppercase;color:var(--rd-muted);',
      '}',
      'html.rd-on #view-package .wkpkg-num{',
      'display:inline-flex;align-items:center;justify-content:center;',
      'width:22px;height:22px;border-radius:6px;background:var(--rd-accent);color:var(--rd-accent-text);',
      'font-size:12px;font-weight:500;letter-spacing:0;flex:none;',
      '}',
      'html.rd-on #view-package .wkpkg-sec-title{color:var(--rd-text);}',
      'html.rd-on #view-package .wkpkg-sec-sub{color:var(--rd-muted);font-weight:500;text-transform:none;letter-spacing:0;margin-left:4px;}',
      'html.rd-on #view-package .wkpkg-trust{',
      'background:var(--rd-warn-bg)!important;border:1px solid var(--rd-border)!important;',
      'border-radius:var(--radius-card)!important;padding:10px 12px;margin-bottom:10px;',
      'color:var(--rd-warn-text)!important;font-weight:500!important;font-size:var(--fs-body);',
      '}',
      'html.rd-on #view-package .wkpkg-sec h3{color:var(--rd-text)!important;font-weight:500;font-size:var(--fs-title);}',
      'html.rd-on #view-package .wkpkg-sec ul{color:var(--rd-text);}',
      'html.rd-on #view-package .wkpkg-sec li b{color:var(--rd-text);font-weight:500;}',
      'html.rd-on #view-package .tn-tile .tn-stat{',
      'background:var(--rd-surface)!important;border:1px solid var(--rd-border);',
      'border-radius:var(--radius-card);padding:12px 14px;min-width:130px;',
      '}',
      'html.rd-on #view-package .tn-tile .tn-stat b{',
      'color:var(--rd-text)!important;font-size:var(--fs-stat)!important;font-weight:500;line-height:1.15;',
      '}',
      'html.rd-on #view-package .tn-tile .tn-stat span{',
      'color:var(--rd-muted)!important;font-size:var(--fs-micro);font-weight:500;',
      'letter-spacing:1px;text-transform:uppercase;',
      '}',
      'html.rd-on #view-package .plan-tbl th{',
      'background:var(--rd-surface-2)!important;color:var(--rd-muted)!important;border-color:var(--rd-border)!important;',
      'font-weight:500;font-size:var(--fs-micro);',
      '}',
      'html.rd-on #view-package .plan-tbl td{border-color:var(--rd-border)!important;color:var(--rd-text);}',
      'html.rd-on #view-package .wkpkg-tag-ok{color:var(--rd-accent)!important;font-weight:500!important;}',
      'html.rd-on #view-package .wkpkg-approved-msg{color:var(--rd-accent)!important;}',
      'html.rd-on #view-package .wkpkg-tag-neutral{',
      'display:inline-block;padding:2px 8px;border-radius:var(--radius-pill);',
      'background:var(--rd-surface-2);border:1px solid var(--rd-border);color:var(--rd-muted);',
      'font-size:var(--fs-micro);font-weight:500;',
      '}',
      'html.rd-on #view-package .wkpkg-brief{',
      'background:var(--rd-surface-2)!important;border-left:4px solid var(--rd-accent)!important;',
      'border-radius:0 var(--radius-card) var(--radius-card) 0;padding:12px 14px;color:var(--rd-text);',
      '}',
      'html.rd-on #view-package textarea.wkpkg-why{',
      'background:var(--rd-surface)!important;color:var(--rd-text)!important;border:1px solid var(--rd-border)!important;',
      'border-radius:var(--radius-ctl)!important;',
      '}',
      'html.rd-on #view-package svg path[stroke]:not([stroke="none"]){stroke:var(--rd-accent);}',
      'html.rd-on #view-package svg line[stroke^="rgba"],html.rd-on #view-package svg line[stroke="#fff"],',
      'html.rd-on #view-package svg line[stroke="white"]{stroke:var(--rd-border)!important;}',
      /* Print — white paper regardless of Night/Day */
      '@media print{',
      'html.rd-on #view-plan,html.rd-on #view-package,',
      'html.rd-on #view-plan .panel,html.rd-on #view-package .panel,html.rd-on #view-package .wkpkg-root{',
      'background:#fff!important;color:#111!important;border-color:#bbb!important;box-shadow:none!important;',
      '}',
      'html.rd-on #view-plan .persp .pl b,html.rd-on #view-package .persp .pl b,',
      'html.rd-on #view-plan .plan-tbl td,html.rd-on #view-package .plan-tbl td,',
      'html.rd-on #view-package .wkpkg-sec h3,html.rd-on #view-package .wkpkg-brief{color:#111!important;}',
      'html.rd-on #view-plan .foot,html.rd-on #view-package .foot,html.rd-on #view-plan .lbl,html.rd-on #view-package .lbl{color:#555!important;}',
      'html.rd-on #view-plan .wb,html.rd-on #view-package .wkpkg-num{',
      'background:#333!important;color:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;',
      '}',
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

  let _applyingTokens = false;
  function applyTokens(baseOverride) {
    if (_applyingTokens) return;
    if (!isRedesign()) return;
    _applyingTokens = true;
    try {
      const base = (baseOverride === "day" || baseOverride === "chalk" || baseOverride === "night")
        ? (baseOverride === "chalk" ? "day" : baseOverride)
        : getBase();
      try {
        if (document.documentElement.dataset.base !== base) {
          document.documentElement.dataset.base = base;
        }
      } catch (e) {}
      /* Re-tune from RAW stored team hex every time — never feed a prior --accent. */
      const raw = rawTeamHex();
      const tuned = adjustAccent(raw, base);
      const rootEl = document.documentElement;
      rootEl.style.setProperty("--rd-accent", tuned.accent);
      rootEl.style.setProperty("--rd-accent-text", tuned.accentText);
      rootEl.style.setProperty("--accent", tuned.accent);
      rootEl.style.setProperty("--accent-text", tuned.accentText);
      try {
        if (document.body) {
          document.body.style.setProperty("--accent", tuned.accent);
          document.body.style.setProperty("--accent-ink", tuned.accentText);
          /* Redesign tokens own Night/Day — never leave classic body.dark stuck. */
          document.body.classList.remove("dark");
        }
      } catch (e) {}
      try {
        rootEl.setAttribute("data-rd-accent", tuned.accent);
        rootEl.setAttribute("data-rd-base", base);
      } catch (e) {}
    } finally {
      _applyingTokens = false;
    }
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (m) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[m];
    });
  }

  function phaseForView(v) {
    if (v === "reps" || v === "author") return "teach";
    if (v === "playbook") return "plan";
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
        /* Under redesign, strip body.dark so Booth LS can flip without leaking dark --bg. */
        if (isRedesign()) stripLegacyDarkClass();
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
    if (b) b.textContent = "Theme: " + (getBase() === "day" ? "Day (tap→Night)" : "Night (tap→Day)");
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
          tools += '<a ' + attrs + ' href="' + esc(withV(t.href)) + '">' + esc(t.label) + "</a>";
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
      + '<a id="rdMark" href="' + esc(withV("OFFGRD.html")) + '" title="OFFGRD home"><img src="icon.svg" alt=""><span>OFF<span style="opacity:.85">GRD</span></span></a>'
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
    const kind = appKind();
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
      const href = p.getAttribute("href") || "";
      const onPill =
        (!!(v && v === view)) ||
        (kind === "playbook" && /OFFGRD-Playbook\.html/i.test(href)) ||
        (kind === "qb" && /OFFGRD-QB\.html/i.test(href));
      p.classList.toggle("on", onPill);
    });
  }

  function syncScopeBadge() {
    const btn = document.getElementById("rdScope");
    const src = document.getElementById("datbadge");
    if (btn) {
      if (src && (src.textContent || "").trim()) btn.textContent = src.textContent;
      else {
        const kind = appKind();
        btn.textContent = kind === "qb" ? "Reps Lab" : kind === "playbook" ? "Playbook" : "Scope";
      }
    }
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
    /* CSS under html.rd-on hides Team/Sync/Load/Sign out — no MutationObserver
       that mutates #acct (that feedback can freeze the main thread). */
    if (acct && !acct._rdAcctObs) {
      acct._rdAcctObs = true;
      try {
        const mo = new MutationObserver(function () {
          /* Read-only: refresh scope/sync label. Never write into #acct. */
          try { syncScopeBadge(); } catch (e) {}
        });
        mo.observe(acct, { childList: true, subtree: true });
      } catch (e) {}
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
        else goMain(ph.views[0]);
        syncPhaseUI();
      };
    });
    [].forEach.call(shell.querySelectorAll(".rd-pill"), function (p) {
      if (p.tagName === "A") return; /* href already versioned */
      p.onclick = function () {
        const action = p.getAttribute("data-action");
        const view = p.getAttribute("data-view");
        if (action) runAction(action);
        else if (view && typeof root.setView === "function") root.setView(view);
        else if (view) goMain(view);
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
        if (appKind() !== "scout") { goMain("scout"); return; }
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
    if (_patchedColors) return;
    if (typeof root.applyTeamColors !== "function") return;
    const orig = root.applyTeamColors;
    if (orig._rdPatched) { _patchedColors = true; return; }
    root.applyTeamColors = function () {
      orig.apply(this, arguments);
      if (!isRedesign()) return;
      try {
        const stash = document.documentElement.getAttribute("data-team-hex");
        if (stash) noteRawTeamHex(stash);
        applyTokens(getBase());
      } catch (e) {}
    };
    root.applyTeamColors._rdPatched = true;
    _patchedColors = true;
  }

  function applyRedesignShell() {
    if (queryFlag() === 0 || !isRedesign()) {
      restoreLegacyTheme();
      restoreAcct();
      return false;
    }

    document.documentElement.classList.add("rd-on");
    ensureCss();
    patchApplyTeamColors();
    setBase(getBase()); /* retunes from raw team hex — no data-base MutationObserver */
    stripLegacyDarkClass();

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
    stampVersionedLinks();
    syncCrest();
    syncScopeBadge();
    syncPhaseUI();
    patchSetView();
    refreshSetupBaseLabel();

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
    /* Kill switch again at boot — covers late-ready + persisted bad state. */
    if (queryFlag() === 0 || !isRedesign()) {
      restoreLegacyTheme();
      restoreAcct();
      return;
    }
    try { localStorage.setItem(LS_FLAG, "1"); } catch (e) {}
    applyRedesignShell();
    /* applyTeamColors / #acct may land after first paint — light touch only */
    setTimeout(function () {
      if (queryFlag() === 0 || !isRedesign()) return;
      patchApplyTeamColors();
      patchSetView();
      adoptAcct();
      applyTokens(getBase());
      syncCrest();
      syncScopeBadge();
      syncPhaseUI();
    }, 250);
  }

  /* If kill-switched, expose stubs only — no observers, no boot work. */
  if (queryFlag() === 0) {
    root.OFFGRD_REDESIGN = {
      isRedesign: function () { return false; },
      applyRedesignShell: function () { restoreLegacyTheme(); return false; },
      applyTokens: function () {},
      adjustAccent: adjustAccent,
      rawTeamHex: function () { return null; },
      getBase: function () { return "night"; },
      setBase: function () { return "night"; },
      toggleBase: function () { return "night"; },
      syncPhaseUI: function () {},
      restoreLegacyTheme: restoreLegacyTheme,
      PHASES: PHASES
    };
    return;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 0); });
  } else {
    setTimeout(boot, 0);
  }

  /* Re-apply accent when cloud brand lands (may overwrite earlier wrap) */
  const prevBrand = root.OFFGRD_BRAND;
  root.OFFGRD_BRAND = function () {
    if (typeof prevBrand === "function") {
      try { prevBrand.apply(this, arguments); } catch (e) {}
    }
    if (isRedesign()) applyTokens(getBase());
  };

  root.OFFGRD_REDESIGN = {
    isRedesign: isRedesign,
    applyRedesignShell: applyRedesignShell,
    applyTokens: applyTokens,
    adjustAccent: adjustAccent,
    rawTeamHex: rawTeamHex,
    getBase: getBase,
    setBase: setBase,
    toggleBase: toggleBase,
    syncPhaseUI: syncPhaseUI,
    PHASES: PHASES
  };
})(typeof window !== "undefined" ? window : globalThis);
