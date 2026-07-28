/* ============================================================
   OFFGRD-shell.js — OFFOPS unified top bar (Gameday | Team Portal)
   Nav/shell only. Same-origin session already shared with the portal.
   ============================================================ */
(function (root) {
  "use strict";

  var LAST_GD = "offops_last_gameday";
  var LAST_PT = "offops_last_portal";
  var SHELL_H = "44px";

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

  function initialsFrom(label) {
    var s = String(label || "").trim();
    if (!s) return "?";
    if (s.indexOf("@") > 0) s = s.split("@")[0];
    var parts = s.replace(/[._-]+/g, " ").split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function ensureCss() {
    if (document.getElementById("offopsShellCss")) return;
    var st = document.createElement("style");
    st.id = "offopsShellCss";
    st.textContent = [
      ":root{--offops-shell-h:" + SHELL_H + ";}",
      "#offopsShell{box-sizing:border-box;display:flex;align-items:center;gap:10px;",
      "min-height:var(--offops-shell-h);",
      "padding:0 12px;padding-top:constant(safe-area-inset-top);padding-top:env(safe-area-inset-top,0px);",
      "position:sticky;top:0;z-index:55;background:#0b1220;color:#e8eef7;",
      "border-bottom:1px solid rgba(255,255,255,.1);font:600 13px/1 Inter,Segoe UI,system-ui,sans-serif;}",
      "#offopsShell *,#offopsShell *::before,#offopsShell *::after{box-sizing:border-box;}",
      "#offopsShell .ops-brand{display:inline-flex;align-items:center;gap:8px;color:#fff;text-decoration:none;",
      "font-weight:800;letter-spacing:.02em;flex:0 0 auto;min-height:44px;min-width:44px;}",
      "#offopsShell .ops-brand b{font-size:13px;}",
      "#offopsShell .ops-brand span{opacity:.55;font-weight:700;font-size:11px;letter-spacing:.08em;}",
      "#offopsShell .ops-brand .ops-mark{display:none;width:28px;height:28px;border-radius:8px;",
      "background:linear-gradient(135deg,#2f6bff,#3bd0f2);color:#04121f;font:800 11px/28px Inter,sans-serif;",
      "text-align:center;letter-spacing:0;}",
      /* Switcher is primary nav — never shrink/truncate */
      "#offopsShell .ops-switch{display:inline-flex;align-items:stretch;border:1px solid rgba(255,255,255,.16);",
      "border-radius:9px;overflow:hidden;background:rgba(255,255,255,.04);flex:0 0 auto;min-width:0;}",
      "#offopsShell .ops-switch a,#offopsShell .ops-switch button{appearance:none;border:0;background:transparent;",
      "color:rgba(232,238,247,.72);padding:10px 12px;min-height:44px;font:700 12px/1 Inter,Segoe UI,system-ui,sans-serif;",
      "cursor:pointer;text-decoration:none;white-space:nowrap;}",
      "#offopsShell .ops-switch .on{background:rgba(75,156,211,.28);color:#fff;}",
      "#offopsShell .ops-switch button:focus-visible{outline:2px solid #3bd0f2;outline-offset:-2px;}",
      "#offopsShell .ops-spacer{flex:1;min-width:4px;}",
      "#offopsShell .ops-profile{position:relative;flex:0 0 auto;}",
      "#offopsShell .ops-avatar{appearance:none;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);",
      "color:#e8eef7;border-radius:999px;width:44px;height:44px;min-width:44px;min-height:44px;padding:0;",
      "font:700 12px/1 Inter,Segoe UI,system-ui,sans-serif;cursor:pointer;display:inline-flex;",
      "align-items:center;justify-content:center;}",
      "#offopsShell .ops-avatar:focus-visible{outline:2px solid #3bd0f2;outline-offset:2px;}",
      "#offopsShell .ops-avatar[hidden]{display:none!important;}",
      "#offopsShell .ops-menu{display:none;position:absolute;right:0;top:calc(100% + 6px);min-width:200px;",
      "background:#121a2b;border:1px solid rgba(255,255,255,.14);border-radius:12px;",
      "box-shadow:0 16px 40px rgba(0,0,0,.45);padding:6px;z-index:70;}",
      "#offopsShell .ops-menu.open{display:block;}",
      "#offopsShell .ops-menu .ops-mail{display:block;padding:10px 12px;font-size:12px;font-weight:600;",
      "color:rgba(232,238,247,.65);word-break:break-all;}",
      "#offopsShell .ops-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;",
      "color:#e8eef7;padding:12px;min-height:44px;border-radius:8px;font:700 13px/1 Inter,sans-serif;cursor:pointer;}",
      "#offopsShell .ops-menu button:hover{background:rgba(255,255,255,.06);}",
      "#offopsShell .ops-menu button:focus-visible{outline:2px solid #3bd0f2;outline-offset:-2px;}",
      "html.offops-shell-on #rdShell{top:calc(var(--offops-shell-h) + env(safe-area-inset-top,0px))!important;}",
      "html.rd-on #rdShell{top:calc(var(--offops-shell-h) + env(safe-area-inset-top,0px))!important;}",
      "html.rd-on #rdAcctHost{display:none!important;}",
      "@media (max-width:820px){",
      "#offopsShell{gap:8px;padding-left:10px;padding-right:10px;}",
      "#offopsShell .ops-brand b,#offopsShell .ops-brand span{display:none;}",
      "#offopsShell .ops-brand .ops-mark{display:inline-block;}",
      "#offopsShell .ops-switch{flex:1 1 auto;justify-content:center;max-width:none;}",
      "#offopsShell .ops-switch button{flex:1 1 auto;padding:10px 8px;font-size:12px;}",
      "}",
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

  function setProfileOpen(open) {
    var menu = document.getElementById("opsProfileMenu");
    var btn = document.getElementById("opsAvatar");
    if (!menu || !btn) return;
    menu.classList.toggle("open", !!open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
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
      + '<span class="ops-mark" aria-hidden="true">OO</span>'
      + "<b>OFFOPS</b><span>UNIFIED</span></a>"
      + '<div class="ops-switch" role="tablist" aria-label="App mode">'
      + '<button type="button" class="on" data-ops="gameday" aria-current="page">Gameday</button>'
      + '<button type="button" data-ops="portal">Team Portal</button>'
      + "</div>"
      + '<span class="ops-spacer"></span>'
      + '<div class="ops-profile">'
      + '<button type="button" class="ops-avatar" id="opsAvatar" aria-label="Account menu" aria-haspopup="true" aria-expanded="false" aria-controls="opsProfileMenu" hidden>?</button>'
      + '<div class="ops-menu" id="opsProfileMenu" role="menu">'
      + '<span class="ops-mail" id="opsWho"></span>'
      + '<button type="button" role="menuitem" id="opsSignOut">Sign out</button>'
      + "</div></div>";

    document.body.insertBefore(bar, document.body.firstChild);
    document.documentElement.classList.add("offops-shell-on");

    var portalBtn = bar.querySelector('[data-ops="portal"]');
    if (portalBtn) {
      portalBtn.onclick = function () {
        rememberGameday();
        location.href = targetPortal();
      };
    }

    var avatar = document.getElementById("opsAvatar");
    var so = document.getElementById("opsSignOut");
    if (avatar) {
      avatar.onclick = function (e) {
        e.stopPropagation();
        var menu = document.getElementById("opsProfileMenu");
        setProfileOpen(!(menu && menu.classList.contains("open")));
      };
    }
    if (so) {
      so.onclick = function () {
        setProfileOpen(false);
        doSignOut();
      };
    }
    document.addEventListener("click", function (e) {
      var wrap = document.querySelector("#offopsShell .ops-profile");
      if (wrap && !wrap.contains(e.target)) setProfileOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setProfileOpen(false);
    });

    function paintWho() {
      currentUserLabel().then(function (label) {
        var el = document.getElementById("opsWho");
        var av = document.getElementById("opsAvatar");
        if (el) el.textContent = label || "";
        if (av) {
          if (label) {
            av.hidden = false;
            av.textContent = initialsFrom(label);
            av.title = label;
          } else {
            av.hidden = true;
            setProfileOpen(false);
          }
        }
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
