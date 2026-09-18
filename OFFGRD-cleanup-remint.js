/* One-time local purge after the 2026-09-09 remint cleanup.
   Server reject list / row cap is the belt. This stops the same device from
   pushing 86-row drill / extra outcomes / the phantom North session. */
(function (global) {
  "use strict";

  var VER = "2026-09-09-remint-v1";
  var VER_KEY = "offgrd_cleanup_ver";
  var REJECTED_GAMES = {
    "a95456e8-4b83-4a09-8303-269be46dbc05": 1,
  };
  var DRILL_WEEK = "live 2026-09-02";

  function lsGet(k) {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  }
  function lsSet(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch (e) {}
  }

  function isRejectedGame(id) {
    return !!(id && REJECTED_GAMES[String(id)]);
  }

  function payloadKey(p) {
    try {
      return JSON.stringify(p || {});
    } catch (e) {
      return "";
    }
  }

  function collapseOutcomes(evs) {
    var keep = Object.create(null);
    var out = [];
    (evs || []).forEach(function (e) {
      if (!e) return;
      if (isRejectedGame(e.gameId)) return;
      if (e.type === "outcome") {
        var k = String(e.gameId) + "|" + String(e.side) + "|" + String(e.playIndex) + "|" + payloadKey(e.payload);
        if (keep[k]) return;
        keep[k] = 1;
      }
      out.push(e);
    });
    return out;
  }

  function stripDrill(games) {
    return (games || []).map(function (g) {
      if (!g || String(g.side) !== "ours") return g;
      if (String(g.week || "").trim().toLowerCase() !== DRILL_WEEK) return g;
      if (String(g.opponent || "").trim().toLowerCase() !== "live") return g;
      var rows = (g.rows || []).filter(function (r) {
        return String((r && r.date) || "").slice(0, 10) !== "2026-09-04";
      });
      if (rows.length === (g.rows || []).length) return g;
      return Object.assign({}, g, { rows: rows });
    });
  }

  function dropJournalExtras() {
    var J = global.OFFGRD_CALLER_JOURNAL;
    if (!J || !J.allRows || !J.dropEventIds) return 0;
    var rows = J.allRows();
    var keepIds = Object.create(null);
    collapseOutcomes(rows).forEach(function (e) {
      if (e && e.eventId) keepIds[e.eventId] = 1;
    });
    var drop = [];
    rows.forEach(function (e) {
      if (e && e.eventId && !keepIds[e.eventId]) drop.push(e.eventId);
    });
    return drop.length ? J.dropEventIds(drop) : 0;
  }

  function apply() {
    var n = { events: 0, games: 0, journal: 0 };
    try {
      if (global.CALLER_EVENTS) {
        var nextO = collapseOutcomes(global.CALLER_EVENTS);
        n.events += (global.CALLER_EVENTS.length || 0) - nextO.length;
        global.CALLER_EVENTS = nextO;
      }
    } catch (eO) {}
    try {
      var E = global.OFFGRD_CALLER;
      var key = (E && E.DCALLER_STORE_KEY) || "offgrd_dcaller_events_v2";
      var st = E && E.loadStore ? E.loadStore(key) : null;
      if (st && Array.isArray(st.events)) {
        var nextD = collapseOutcomes(st.events);
        n.events += st.events.length - nextD.length;
        if (nextD.length !== st.events.length && E.saveStore) {
          st.events = nextD;
          E.saveStore(st, key);
        }
      }
    } catch (eD) {}
    try {
      n.journal += dropJournalExtras();
    } catch (eJ) {}
    try {
      if (Array.isArray(global.GAMES)) {
        var stripped = stripDrill(global.GAMES);
        if (stripped !== global.GAMES) n.games = 1;
        global.GAMES = stripped;
      }
    } catch (eG) {}
    lsSet(VER_KEY, VER);
    return { ver: VER, dropped: n, prior: lsGet(VER_KEY) };
  }

  global.OFFGRD_CLEANUP_REMINT = {
    VER: VER,
    REJECTED_GAMES: REJECTED_GAMES,
    isRejectedGame: isRejectedGame,
    collapseOutcomes: collapseOutcomes,
    stripDrill: stripDrill,
    apply: apply,
  };
})(typeof window !== "undefined" ? window : globalThis);
