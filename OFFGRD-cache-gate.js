/* OFFGRD program-cache privacy gate.
   Clears offgrd_* / offrd:* program data when there is no valid session,
   and scopes cache to the signed-in uid (account-switch safe).
   Offline-first is preserved when a Supabase auth token is present. */
(function () {
  var KEEP_PREFIXES = ["sb-"]; // never wipe Supabase auth tokens here
  /* Feature-flag rollbacks — must survive clearProgramCache. */
  var FLAG_KEYS = {
    "offgrd_weekly_package": 1,
    "offgrd_week_autotest": 1,
    "offgrd_unified_render": 1,
    "offgrd_autoderive_reads": 1,
    "offgrd_scoutcards": 1,
    "offgrd_tendency_reports": 1,
    "offgrd_film_telestrate": 1,
    "offgrd_redesign": 1,
    "offgrd_redesign_base": 1
  };

  function isProgramCacheKey(k) {
    if (!k) return false;
    if (FLAG_KEYS[k]) return false;
    if (k.indexOf("offgrd_") === 0) return true;
    if (k.indexOf("offrd:") === 0) return true;
    if (k.indexOf("offrd_") === 0) return true;
    return false;
  }

  function clearProgramCache() {
    try {
      var kill = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        var keepAuth = false;
        for (var p = 0; p < KEEP_PREFIXES.length; p++) {
          if (k.indexOf(KEEP_PREFIXES[p]) === 0) { keepAuth = true; break; }
        }
        if (keepAuth) continue;
        if (isProgramCacheKey(k)) kill.push(k);
      }
      kill.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
    try {
      window.OFFGRD_SESSION_GATED = true;
    } catch (e) {}
  }

  /** Sync heuristic: a persisted Supabase session token exists. */
  function hasLikelySession() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i) || "";
        if (/^sb-.*-auth-token$/.test(k)) {
          var v = localStorage.getItem(k);
          if (v && v.length > 20) return true;
        }
      }
    } catch (e) {}
    return false;
  }

  /**
   * If no likely session: wipe program cache and mark gated.
   * Returns true when gated (caller should not render program data).
   */
  function gateIfLoggedOut() {
    if (hasLikelySession()) {
      try { window.OFFGRD_SESSION_GATED = false; } catch (e) {}
      return false;
    }
    clearProgramCache();
    try { window.OFFGRD_SESSION_GATED = true; } catch (e) {}
    return true;
  }

  /** If cached uid ≠ session uid, wipe program cache (account switch). */
  function scopeCacheToUser(uid) {
    if (!uid) {
      clearProgramCache();
      return true;
    }
    var prev = null;
    try { prev = localStorage.getItem("offgrd_uid"); } catch (e) {}
    if (prev && prev !== uid) {
      clearProgramCache();
      try { localStorage.setItem("offgrd_uid", uid); } catch (e) {}
      return true;
    }
    try { localStorage.setItem("offgrd_uid", uid); } catch (e) {}
    return false;
  }

  function showSignedOutGate() {
    try {
      var existing = document.getElementById("ogSignedOutGate");
      if (existing) return;
      var host = document.createElement("div");
      host.id = "ogSignedOutGate";
      host.className = "no-print";
      host.innerHTML =
        '<div style="background:#fff8e8;border:1px solid #e8c96a;border-radius:12px;padding:14px 16px;margin:12px 0 14px;font:14px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif">' +
        '<b style="color:#13294B">Sign in to load your program</b>' +
        '<p style="margin:6px 0 0;color:#5b626e;font-size:13px">Program data is hidden while signed out. Sign in to restore your scout, schedule, and playbook — including offline use on the sideline.</p>' +
        "</div>";
      var tb = document.querySelector(".topbar");
      if (tb && tb.parentNode) tb.parentNode.insertBefore(host, tb.nextSibling);
      else document.body.insertBefore(host, document.body.firstChild);
    } catch (e) {}
  }

  function hideSignedOutGate() {
    try {
      var el = document.getElementById("ogSignedOutGate");
      if (el) el.remove();
    } catch (e) {}
  }

  function resetInMemoryProgram() {
    try {
      if (window.OFFGRD_APP && typeof window.OFFGRD_APP.set === "function") {
        window.OFFGRD_APP.set([]);
      }
    } catch (e) {}
    try {
      if (window.OFFGRD_SCHEDULE && typeof window.OFFGRD_SCHEDULE.set === "function") {
        window.OFFGRD_SCHEDULE.set([], false, "");
      }
    } catch (e) {}
    try {
      if (window.OFFGRD_WEEK && typeof window.OFFGRD_WEEK.set === "function") {
        window.OFFGRD_WEEK.set(null, false);
      }
    } catch (e) {}
    try {
      if (typeof window.refreshView === "function") window.refreshView();
      else if (typeof window.render === "function") window.render();
    } catch (e) {}
  }

  window.OFFGRD_CLEAR_PROGRAM_CACHE = clearProgramCache;
  window.OFFGRD_HAS_LIKELY_SESSION = hasLikelySession;
  window.OFFGRD_GATE_IF_LOGGED_OUT = gateIfLoggedOut;
  window.OFFGRD_SCOPE_CACHE_TO_USER = scopeCacheToUser;
  window.OFFGRD_SHOW_SIGNED_OUT_GATE = showSignedOutGate;
  window.OFFGRD_HIDE_SIGNED_OUT_GATE = hideSignedOutGate;
  window.OFFGRD_RESET_IN_MEMORY_PROGRAM = resetInMemoryProgram;

  // Run immediately so later inline scripts don't hydrate from a stale cache
  gateIfLoggedOut();
})();
