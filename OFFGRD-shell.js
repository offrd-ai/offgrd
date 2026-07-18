/* ============================================================
   OFFGRD-shell.js — OFFOPS unified top bar (Gameday | Team Portal)
   Nav/shell only. Same-origin session already shared with the portal.
   ============================================================ */
(function (root) {
  "use strict";

  var LAST_GD = "offops_last_gameday";
  var LAST_PT = "offops_last_portal";
  var SHELL_H = "40px";

  function portalUrl() {
    try {
      return (root.OFFGRD_CONFIG && root.OFFGRD_CONFIG.coachPortalUrl)
        || "https://getoffrd.com/high-school-coach/dashboard";
    } catch (e) {
      return "https://getoffrd.com/high-school-coach/dashboard";
    }
  }

  function gamedayHome() {
    try {
      return (root.OFFGRD_CONFIG && root.OFFGRD_CONFIG.gamedayUrl)
        || "https://getoffrd.com/gameday/OFFGRD.html";
    } catch (e) {
      return "https://getoffrd.com/gameday/OFFGRD.html";
    }
  }

  function rememberGameday() {
    try {
      var href = location.href || "";
      if (/OFFGRD/i.test(href) || /\/gameday\//i.test(href)) {
        localStorage.setItem(LAST_GD, href);
      }
    } catch (e) {}
  }

  function targetPortal() {
    try {
      return localStorage.getItem(LAST_PT) || portalUrl();
    } catch (e) {
      return portalUrl();
    }
  }

  function ensureCss() {
    if (document.getElementById("offopsShellCss")) return;
    var st = document.createElement("style");
    st.id = "offopsShellCss";
    st.textContent = [
      ":root{--offops-shell-h:" + SHELL_H + ";}",
      "#offopsShell{box-sizing:border-box;display:flex;align-items:center;gap:12px;height:var(--offops-shell-h);",
      "padding:0 12px;position:sticky;top:0;z-index:55;background:#0b1220;color:#e8eef7;",
      "border-bottom:1px solid rgba(255,255,255,.1);font:600 13px/1 Inter,Segoe UI,system-ui,sans-serif;}",
      "#offopsShell *,#offopsShell *::before,#offopsShell *::after{box-sizing:border-box;}",
      "#offopsShell .ops-brand{display:inline-flex;align-items:center;gap:8px;color:#fff;text-decoration:none;font-weight:800;letter-spacing:.02em;}",
      "#offopsShell .ops-brand b{font-size:13px;}",
      "#offopsShell .ops-brand span{opacity:.55;font-weight:700;font-size:11px;letter-spacing:.08em;}",
      "#offopsShell .ops-switch{display:inline-flex;align-items:stretch;border:1px solid rgba(255,255,255,.16);border-radius:9px;overflow:hidden;background:rgba(255,255,255,.04);}",
      "#offopsShell .ops-switch a,#offopsShell .ops-switch button{appearance:none;border:0;background:transparent;color:rgba(232,238,247,.72);",
      "padding:7px 12px;font:700 12px/1 Inter,Segoe UI,system-ui,sans-serif;cursor:pointer;text-decoration:none;}",
      "#offopsShell .ops-switch .on{background:rgba(75,156,211,.28);color:#fff;}",
      "#offopsShell .ops-spacer{flex:1;min-width:8px;}",
      "#offopsShell .ops-who{color:rgba(232,238,247,.65);font-size:12px;font-weight:600;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      "#offopsShell .ops-out{appearance:none;border:1px solid rgba(255,255,255,.16);background:transparent;color:#e8eef7;",
      "border-radius:8px;padding:6px 10px;font:700 12px/1 Inter,Segoe UI,system-ui,sans-serif;cursor:pointer;}",
      "#offopsShell .ops-out:hover{background:rgba(255,255,255,.06);}",
      "html.rd-on #rdShell{top:var(--offops-shell-h)!important;}",
      "html.rd-on #rdAcctHost{display:none!important;}",
      "@media print{#offopsShell{display:none!important;}}"
    ].join("");
    document.head.appendChild(st);
  }

  async function currentUserLabel() {
    try {
      if (root.Cloud && root.Cloud.session) {
        var u = await root.Cloud.session();
        if (u && u.email) return u.email;
      }
    } catch (e) {}
    try {
      var acct = document.getElementById("acct");
      var t = (acct && (acct.textContent || "")).trim();
      if (t) return t.split(/\s+/).slice(0, 2).join(" ");
    } catch (e2) {}
    return "";
  }

  async function doSignOut() {
    try { if (root.OFFGRD_CLEAR_PROGRAM_CACHE) root.OFFGRD_CLEAR_PROGRAM_CACHE(); } catch (e) {}
    try {
      if (root.Cloud && root.Cloud.signOut) await root.Cloud.signOut();
    } catch (e2) {}
    try { location.reload(); } catch (e3) {}
  }

  function mount() {
    if (document.getElementById("offopsShell")) return;
    ensureCss();
    rememberGameday();

    var bar = document.createElement("div");
    bar.id = "offopsShell";
    bar.className = "no-print";
    bar.innerHTML = ""
      + '<a class="ops-brand" href="' + gamedayHome().replace(/"/g, "") + '" title="OFFOPS">'
      + "<b>OFFOPS</b><span>UNIFIED</span></a>"
      + '<div class="ops-switch" role="tablist" aria-label="App mode">'
      + '<button type="button" class="on" data-ops="gameday" aria-current="page">Gameday</button>'
      + '<button type="button" data-ops="portal">Team Portal</button>'
      + "</div>"
      + '<span class="ops-spacer"></span>'
      + '<span class="ops-who" id="opsWho"></span>'
      + '<button type="button" class="ops-out" id="opsSignOut">Sign out</button>';

    document.body.insertBefore(bar, document.body.firstChild);
    document.documentElement.classList.add("offops-shell-on");

    var portalBtn = bar.querySelector('[data-ops="portal"]');
    if (portalBtn) {
      portalBtn.onclick = function () {
        rememberGameday();
        location.href = targetPortal();
      };
    }

    var so = document.getElementById("opsSignOut");
    if (so) so.onclick = function () { doSignOut(); };

    function paintWho() {
      currentUserLabel().then(function (label) {
        var el = document.getElementById("opsWho");
        if (el) el.textContent = label || "";
        if (so) so.style.display = label ? "" : "none";
      });
    }
    paintWho();
    setTimeout(paintWho, 400);
    setTimeout(paintWho, 1500);

    /* Refresh last-gameday as coaches move between views/pages */
    try {
      window.addEventListener("hashchange", rememberGameday);
      window.addEventListener("popstate", rememberGameday);
      setInterval(rememberGameday, 4000);
    } catch (e) {}
  }

  function boot() {
    try { mount(); } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 0); });
  } else {
    setTimeout(boot, 0);
  }

  root.OFFGRD_SHELL = {
    rememberGameday: rememberGameday,
    portalUrl: portalUrl,
    gamedayHome: gamedayHome,
    mount: mount
  };
})(typeof window !== "undefined" ? window : this);
