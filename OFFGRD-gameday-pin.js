/* OFFGRD gameday pin — pick tonight's game once. The caller never guesses. */
(function (global) {
  "use strict";

  var PIN_KEY = "offgrd_gameday_pin_v1";
  var ENTERED_KEY = "offgrd_gameday_entered_v1";
  var PENDING_KEY = "offgrd_gameday_pending_side_v1";

  function lsGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }
  function lsSet(key, val) {
    try {
      localStorage.setItem(key, val);
      return true;
    } catch (e) {
      return false;
    }
  }
  function parseJson(raw) {
    if (raw == null || raw === "") return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
  function normalizeOpp(name) {
    return String(name == null ? "" : name).trim().toLowerCase();
  }
  function isFallbackOpp(name) {
    var n = normalizeOpp(name);
    return !n || n === "any" || n === "live" || n === "opponent";
  }
  function todayISO(now) {
    var Side = global.OFFGRD_CALLER_SIDE;
    if (Side && Side.liveDateISO) return Side.liveDateISO(now);
    var d = now ? new Date(now) : new Date();
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return y + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
  }
  function addDays(iso, n) {
    var p = String(iso || "").split("-");
    var d = new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1);
    d.setDate(d.getDate() + n);
    return todayISO(d);
  }
  function scheduleKey(opp, date) {
    return normalizeOpp(opp) + "|" + String(date || "").slice(0, 10);
  }
  function fnv(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ("00000000" + (h >>> 0).toString(16)).slice(-8);
  }
  function gameIdFor(opp, date) {
    return "gd-" + fnv(scheduleKey(opp, date));
  }

  function get() {
    var o = parseJson(lsGet(PIN_KEY));
    if (!o || isFallbackOpp(o.opponent) || !o.gameId) return null;
    return o;
  }
  function save(pin) {
    lsSet(PIN_KEY, JSON.stringify(pin));
    return pin;
  }
  function entered() {
    var v = lsGet(ENTERED_KEY);
    return v === "caller" || v === "dcaller" ? v : "";
  }
  function setEntered(view) {
    if (view === "caller" || view === "dcaller") lsSet(ENTERED_KEY, view);
    else {
      try {
        localStorage.removeItem(ENTERED_KEY);
      } catch (e) {}
    }
  }
  function pendingSide() {
    var v = lsGet(PENDING_KEY);
    return v === "defense" ? "defense" : "offense";
  }
  function setPendingSide(side) {
    lsSet(PENDING_KEY, side === "defense" ? "defense" : "offense");
  }

  function snapCountFor(gameId, side) {
    var J = global.OFFGRD_CALLER_JOURNAL;
    if (J && J.snapRowsForGame && gameId) return J.snapRowsForGame(gameId, side).length;
    if (side === "defense") {
      try {
        var Ds = global.OFFGRD_DCALLER;
        var dsess = Ds && (Ds.getSession ? Ds.getSession() : Ds.session);
        if (dsess && String(dsess.gameId) === String(gameId)) {
          var log = Ds.logForUi ? Ds.logForUi() : [];
          return (log || []).length;
        }
      } catch (e) {}
      return 0;
    }
    try {
      if (global.CALLER_SESSION && String(CALLER_SESSION.gameId) === String(gameId)) {
        return (global.CALLER_LOG || []).length;
      }
    } catch (e2) {}
    return 0;
  }

  function existingGameId(opp, date) {
    var want = scheduleKey(opp, date);
    var pin = get();
    if (pin && scheduleKey(pin.opponent, pin.date) === want) return pin.gameId;
    return gameIdFor(opp, date);
  }

  function listGames(now) {
    var today = todayISO(now);
    var lo = addDays(today, -1);
    var hi = addDays(today, 7);
    var seen = Object.create(null);
    var out = [];
    function add(g) {
      if (!g || isFallbackOpp(g.opponent)) return;
      var date = String(g.date || g.game_date || today).slice(0, 10);
      if (date < lo || date > hi) return;
      var k = scheduleKey(g.opponent, date);
      if (seen[k]) return;
      seen[k] = 1;
      var gid = existingGameId(g.opponent, date);
      var snaps = snapCountFor(gid, "offense") + snapCountFor(gid, "defense");
      out.push({
        opponent: String(g.opponent).trim(),
        date: date,
        ha: g.ha || "H",
        gameId: gid,
        snaps: snaps,
        live: snaps > 0,
      });
    }
    var sched = global.SCHEDULE;
    if (Array.isArray(sched)) sched.forEach(add);
    var pin = get();
    if (pin) add({ opponent: pin.opponent, date: pin.date || today, ha: pin.ha || "H" });
    out.sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date)) || a.opponent.localeCompare(b.opponent);
    });
    var nearest = null;
    var best = 99;
    out.forEach(function (g, i) {
      var dist = Math.abs(dateDiff(g.date, today));
      if (dist < best) {
        best = dist;
        nearest = i;
      }
    });
    if (nearest != null) out[nearest].highlight = true;
    return out;
  }

  function dateDiff(a, b) {
    var pa = String(a).split("-");
    var pb = String(b).split("-");
    var da = new Date(+pa[0], (+pa[1] || 1) - 1, +pa[2] || 1);
    var db = new Date(+pb[0], (+pb[1] || 1) - 1, +pb[2] || 1);
    return Math.round((da - db) / 86400000);
  }

  function applyPinToSessions(pin, rotatePrior) {
    var Side = global.OFFGRD_CALLER_SIDE;
    var J = global.OFFGRD_CALLER_JOURNAL;
    var mint = function () {
      return pin.gameId;
    };
    try {
      if (rotatePrior && global.CALLER_SESSION && Side && Side.sessionOpponentDiffers && Side.sessionOpponentDiffers(global.CALLER_SESSION, pin.opponent)) {
        var rotated = Side.endAndMintForOpponent(
          global.CALLER_SESSION,
          { opp: pin.opponent, week: "Live " + pin.date, game_date: pin.date, side: "offense" },
          mint,
          global.CALLER_EVENTS,
          global.callerSit
        );
        if (rotated.archive) global.CALLER_SESSION_ARCHIVES = (global.CALLER_SESSION_ARCHIVES || []).concat([rotated.archive]);
        global.CALLER_SESSION = rotated.session;
        global.CALLER_EVENTS = J && J.hydrateView ? J.hydrateView([], "offense", pin.gameId) : [];
        if (typeof global.callerSitDefaults === "function") global.callerSit = global.callerSitDefaults();
      } else {
        global.CALLER_SESSION = {
          opp: pin.opponent,
          week: "Live " + pin.date,
          game_date: pin.date,
          gameId: pin.gameId,
          inProgress: !!(global.CALLER_SESSION && global.CALLER_SESSION.inProgress),
          ended: false,
        };
        if (J && J.hydrateView) global.CALLER_EVENTS = J.hydrateView(global.CALLER_EVENTS || [], "offense", pin.gameId);
      }
      if (typeof global.callerRefold === "function") global.callerRefold();
      if (typeof global.callerSaveLocal === "function") global.callerSaveLocal();
    } catch (eO) {}
    try {
      var D = global.OFFGRD_DCALLER;
      if (D && D.applyPin) D.applyPin(pin, rotatePrior);
    } catch (eD) {}
  }

  function pick(game, opts) {
    opts = opts || {};
    if (!game || isFallbackOpp(game.opponent)) return null;
    var date = String(game.date || todayISO()).slice(0, 10);
    var fresh = !!opts.fresh;
    var gameId = fresh ? gameIdFor(game.opponent, date + "|new|" + Date.now()) : existingGameId(game.opponent, date);
    var prior = get();
    var rotate = !!(prior && normalizeOpp(prior.opponent) !== normalizeOpp(game.opponent));
    var pin = save({
      opponent: String(game.opponent).trim(),
      date: date,
      gameId: gameId,
      ha: game.ha || "H",
      pinnedAt: Date.now(),
    });
    applyPinToSessions(pin, rotate);
    try {
      if (typeof global.setOpponent === "function") global.setOpponent(pin.opponent);
    } catch (eSit) {}
    var side = opts.side || pendingSide();
    var view = side === "defense" ? "dcaller" : "caller";
    setEntered(view);
    if (typeof global.setView === "function") global.setView(view);
    return pin;
  }

  function request(side) {
    setPendingSide(side);
    var view = side === "defense" ? "dcaller" : "caller";
    if (entered() && get()) {
      if (typeof global.setView === "function") global.setView(view);
      return;
    }
    if (typeof global.setView === "function") global.setView("pick");
  }

  function leave() {
    setEntered("");
    if (typeof global.setView === "function") global.setView("pick");
  }

  function adoptIfPinned(sess) {
    var pin = get();
    if (!pin || !sess) return sess;
    sess.opp = pin.opponent;
    sess.gameId = pin.gameId;
    sess.game_date = pin.date;
    sess.week = sess.week || "Live " + pin.date;
    sess.ended = false;
    return sess;
  }

  function haLabel(ha) {
    if (ha === "A") return "Away";
    if (ha === "N") return "Neutral";
    return "Home";
  }

  function fmtWhen(iso) {
    if (!iso) return "";
    var p = String(iso).split("-");
    var d = new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }

  function fmtTime(ms) {
    var n = +ms;
    if (!n) return "";
    var d = new Date(n);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function ensurePickCss() {
    if (!global.document || document.getElementById("gd-pick-css")) return;
    var s = document.createElement("style");
    s.id = "gd-pick-css";
    s.textContent =
      "#view-pick{max-width:720px;margin:0 auto;padding:12px}" +
      ".rd-gd-pick{display:flex;flex-direction:column;gap:12px}" +
      ".rd-gd-pick-head{display:flex;flex-direction:column;gap:4px}" +
      ".rd-gd-pick-head b{font-size:22px;font-weight:800}" +
      ".rd-gd-pick-card{display:flex;align-items:center;gap:14px;width:100%;text-align:left;" +
      "min-height:88px;padding:14px 16px;border:2px solid var(--rd-border,#2a3140);border-radius:14px;" +
      "background:var(--rd-surface,#12161e);color:var(--rd-text,#e8edf5);cursor:pointer}" +
      ".rd-gd-pick-card.is-next{border-color:var(--rd-accent,#0856ff)}" +
      ".rd-gd-pick-card.is-pin{box-shadow:inset 0 0 0 1px var(--rd-accent,#0856ff)}" +
      ".rd-gd-pick-card .crest{flex:0 0 56px;height:56px;width:56px;border-radius:10px;object-fit:contain}" +
      ".rd-gd-pick-body{display:flex;flex-direction:column;gap:4px;min-width:0}" +
      ".rd-gd-pick-body b{font-size:20px;font-weight:800}" +
      ".rd-gd-pick-cta{font-size:13px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:var(--rd-accent,#0856ff)}" +
      ".rd-gd-pick-card .live{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;" +
      "background:#c8102e;color:#fff;font-size:11px;font-weight:800;letter-spacing:.06em}";
    document.head.appendChild(s);
  }

  function renderPicker() {
    var host = global.document && document.getElementById("view-pick");
    if (!host) return;
    ensurePickCss();
    var games = listGames();
    var pin = get();
    var side = pendingSide();
    var sideLbl = side === "defense" ? "D Caller" : "O Caller";
    var esc = typeof global.esc === "function" ? global.esc : function (s) { return String(s == null ? "" : s); };
    var crest = typeof global.crest === "function" ? global.crest : function () { return ""; };
    var h = '<div class="rd-gd rd-gd-pick">';
    h += '<div class="rd-gd-pick-head"><b>Tonight\'s game</b><span class="foot">Pick once. ' + esc(sideLbl) + " opens on that pin.</span></div>";
    if (!games.length) {
      h += '<p class="foot">No games on the schedule for yesterday through next week. Add one under Schedule.</p>';
    }
    games.forEach(function (g) {
      var vs = (g.ha === "A" ? "@ " : "vs ") + g.opponent;
      var action = g.live ? "Resume" : "Start";
      var meta = [fmtWhen(g.date), haLabel(g.ha)];
      if (g.live) meta.push(g.snaps + " snap" + (g.snaps === 1 ? "" : "s"));
      if (g.live && pin && String(pin.gameId) === String(g.gameId) && pin.pinnedAt) {
        var started = fmtTime(pin.pinnedAt);
        if (started) meta.push("started " + started);
      }
      if (pin && String(pin.gameId) === String(g.gameId)) meta.push("pinned");
      var liveBadge = g.live ? '<span class="live">Live</span>' : "";
      var cls = "rd-gd-pick-card" + (g.highlight ? " is-next" : "") + (pin && String(pin.gameId) === String(g.gameId) ? " is-pin" : "");
      h +=
        '<button type="button" class="' +
        cls +
        '" data-opp="' +
        esc(g.opponent) +
        '" data-date="' +
        esc(g.date) +
        '" data-ha="' +
        esc(g.ha) +
        '">' +
        crest(g.opponent, 56) +
        '<span class="rd-gd-pick-body"><b>' +
        esc(vs) +
        liveBadge +
        "</b><span class=\"foot\">" +
        esc(meta.join(" · ")) +
        "</span><span class=\"rd-gd-pick-cta\">" +
        action +
        " · " +
        esc(vs) +
        "</span></span></button>";
    });
    if (games.some(function (g) { return g.live; })) {
      h += '<p class="foot" style="margin-top:12px"><button type="button" class="ghost" id="gdPickFresh">Start new game</button> · never the default</p>';
    }
    h += "</div>";
    host.innerHTML = h;
    host.querySelectorAll(".rd-gd-pick-card").forEach(function (btn) {
      btn.onclick = function () {
        pick({ opponent: btn.getAttribute("data-opp"), date: btn.getAttribute("data-date"), ha: btn.getAttribute("data-ha") }, { side: side });
      };
    });
    var fresh = host.querySelector("#gdPickFresh");
    if (fresh) {
      fresh.onclick = function () {
        var g = games.filter(function (x) { return x.highlight; })[0] || games[0];
        if (g) pick(g, { side: side, fresh: true });
      };
    }
  }

  global.OFFGRD_GAMEDAY_PIN = {
    PIN_KEY: PIN_KEY,
    get: get,
    listGames: listGames,
    gameIdFor: gameIdFor,
    existingGameId: existingGameId,
    scheduleKey: scheduleKey,
    pick: pick,
    request: request,
    leave: leave,
    entered: entered,
    pendingSide: pendingSide,
    adoptIfPinned: adoptIfPinned,
    renderPicker: renderPicker,
    snapCountFor: snapCountFor,
  };
})(typeof window !== "undefined" ? window : globalThis);
