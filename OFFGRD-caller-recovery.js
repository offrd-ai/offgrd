/* OFFGRD caller recovery — dump every session, replay to cloud, keep archives.
   Export is session-scoped (offgrd_dcaller_export / offgrd_ocaller_export).
   This module reads the raw stores before restamp can mint a new Live-today.
   Every boot writes a snapshot. The first snapshot that has events is
   precious and is never overwritten by an empty later boot. */
(function (global) {
  "use strict";

  var SNAPSHOT_KEY = "offgrd_caller_recovery_snapshot_v1";
  var BOOT_KEY = "offgrd_caller_recovery_boot_v1";
  var RING_KEY = "offgrd_caller_recovery_boot_ring_v1";
  var RING_MAX = 5;
  var ALL_KIND = "offgrd_caller_all_sessions";
  var STORE_KEYS = ["offgrd_dcaller_events_v2", "offgrd_caller_events_v2"];
  var RECEIPT_PREFIXES = [
    "offgrd_dcaller_export_",
    "offgrd_ocaller_export_",
    "offgrd_dcaller_export_latest",
    "offgrd_ocaller_export_latest",
  ];

  function sideApi() {
    return global.OFFGRD_CALLER_SIDE || null;
  }

  function storeKeys() {
    var S = sideApi();
    return [
      (S && S.D_STORE_KEY) || STORE_KEYS[0],
      (S && S.O_STORE_KEY) || STORE_KEYS[1],
    ];
  }

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

  function lsKeys() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k) out.push(k);
      }
    } catch (e) {}
    return out;
  }

  function parseJson(raw) {
    if (raw == null || raw === "") return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function isReceiptKey(k) {
    if (!k) return false;
    if (k === "offgrd_dcaller_export_latest" || k === "offgrd_ocaller_export_latest") return true;
    var i;
    for (i = 0; i < RECEIPT_PREFIXES.length; i++) {
      if (k.indexOf(RECEIPT_PREFIXES[i]) === 0) return true;
    }
    return false;
  }

  function eventsFromStore(st) {
    if (!st) return [];
    if (Array.isArray(st.events)) return st.events;
    if (Array.isArray(st)) return st;
    return [];
  }

  function censusEvents(events) {
    var byGame = Object.create(null);
    var n = 0;
    (events || []).forEach(function (e) {
      if (!e) return;
      n += 1;
      var id = e.gameId || e.game_id || "(none)";
      if (!byGame[id]) {
        byGame[id] = { gameId: id, events: 0, calls: 0, minTs: null, maxTs: null, side: e.side || null };
      }
      var g = byGame[id];
      g.events += 1;
      if (e.type === "call") g.calls += 1;
      if (e.side && !g.side) g.side = e.side;
      var ts = e.clientTs != null ? +e.clientTs : NaN;
      if (!isNaN(ts)) {
        if (g.minTs == null || ts < g.minTs) g.minTs = ts;
        if (g.maxTs == null || ts > g.maxTs) g.maxTs = ts;
      }
    });
    return { eventCount: n, games: byGame };
  }

  function readRawStores() {
    var keys = storeKeys();
    var stores = {};
    var raw = {};
    keys.forEach(function (k) {
      var s = lsGet(k);
      raw[k] = s;
      stores[k] = parseJson(s);
    });
    return { stores: stores, raw: raw, keys: keys };
  }

  function readReceipts() {
    var receipts = {};
    var raw = {};
    lsKeys().forEach(function (k) {
      if (!isReceiptKey(k)) return;
      var s = lsGet(k);
      raw[k] = s;
      receipts[k] = parseJson(s);
    });
    return { receipts: receipts, raw: raw };
  }

  function collectAllEvents(payload) {
    var map = Object.create(null);
    function add(list) {
      (list || []).forEach(function (e) {
        if (!e) return;
        var id = e.eventId || e.event_id;
        if (id) map[id] = e;
        else map["anon-" + Object.keys(map).length] = e;
      });
    }
    var stores = (payload && payload.stores) || {};
    Object.keys(stores).forEach(function (k) {
      add(eventsFromStore(stores[k]));
    });
    var receipts = (payload && payload.receipts) || {};
    Object.keys(receipts).forEach(function (k) {
      var r = receipts[k];
      if (!r) return;
      add(r.events);
      if (r.stores) {
        Object.keys(r.stores).forEach(function (sk) {
          add(eventsFromStore(r.stores[sk]));
        });
      }
    });
    if (payload && Array.isArray(payload.events)) add(payload.events);
    if (payload && Array.isArray(payload.rows)) add(payload.rows);
    try {
      var J = global.OFFGRD_CALLER_JOURNAL;
      if (J && J.allRows) add(J.allRows());
    } catch (eJ) {}
    function addSnapStores(snap) {
      if (!snap || !snap.stores) return;
      Object.keys(snap.stores).forEach(function (k) {
        add(eventsFromStore(snap.stores[k]));
      });
    }
    if (payload && payload.snapshot) addSnapStores(payload.snapshot);
    if (payload && payload.boot) addSnapStores(payload.boot);
    (payload && payload.bootRing ? payload.bootRing : []).forEach(addSnapStores);
    return Object.keys(map).map(function (id) {
      return map[id];
    });
  }

  function snapshotHasEvents(snap) {
    if (!snap) return false;
    if (snap.census && snap.census.eventCount > 0) return true;
    var stores = snap.stores || {};
    return Object.keys(stores).some(function (k) {
      return eventsFromStore(stores[k]).length > 0;
    });
  }

  function captureSnapshot() {
    var read = readRawStores();
    var rec = readReceipts();
    var storeCen = censusEvents(
      Object.keys(read.stores).reduce(function (acc, k) {
        return acc.concat(eventsFromStore(read.stores[k]));
      }, [])
    );
    return {
      kind: "offgrd_caller_recovery_snapshot",
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      stores: read.stores,
      receipts: rec.receipts,
      census: {
        eventCount: storeCen.eventCount,
        games: storeCen.games,
        storeKeys: read.keys,
        receiptKeys: Object.keys(rec.receipts),
      },
    };
  }

  function buildDump() {
    var read = readRawStores();
    var rec = readReceipts();
    var snapshot = parseJson(lsGet(SNAPSHOT_KEY));
    var boot = parseJson(lsGet(BOOT_KEY));
    var bootRing = parseJson(lsGet(RING_KEY));
    if (!Array.isArray(bootRing)) bootRing = [];
    var all = collectAllEvents({
      stores: read.stores,
      receipts: rec.receipts,
      snapshot: snapshot,
      boot: boot,
      bootRing: bootRing,
    });
    var cen = censusEvents(all);
    return {
      kind: ALL_KIND,
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      stores: read.stores,
      storeRaw: read.raw,
      receipts: rec.receipts,
      snapshot: snapshot,
      boot: boot,
      bootRing: bootRing,
      census: {
        eventCount: cen.eventCount,
        games: cen.games,
        storeKeys: read.keys,
        receiptKeys: Object.keys(rec.receipts),
      },
    };
  }

  /** Every boot. Precious first-with-events is kept; empty later boots do not erase it. */
  function snapshotOnBoot() {
    var snap = captureSnapshot();
    var has =
      snapshotHasEvents(snap) ||
      Object.keys(snap.receipts || {}).length > 0 ||
      STORE_KEYS.some(function (k) {
        var st = snap.stores && snap.stores[k];
        return !!(st && (st.sit || st.session));
      });
    if (!has) return parseJson(lsGet(SNAPSHOT_KEY));
    lsSet(BOOT_KEY, JSON.stringify(snap));
    var ring = parseJson(lsGet(RING_KEY));
    if (!Array.isArray(ring)) ring = [];
    ring.unshift(snap);
    if (ring.length > RING_MAX) ring = ring.slice(0, RING_MAX);
    lsSet(RING_KEY, JSON.stringify(ring));
    var precious = parseJson(lsGet(SNAPSHOT_KEY));
    if (!precious || (!snapshotHasEvents(precious) && snapshotHasEvents(snap))) {
      lsSet(SNAPSHOT_KEY, JSON.stringify(snap));
      precious = snap;
    }
    return precious;
  }

  function snapshotIfNeeded() {
    return snapshotOnBoot();
  }

  function downloadJson(filename, obj) {
    var json = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
    try {
      var blob = new Blob([json], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        try {
          URL.revokeObjectURL(a.href);
          a.remove();
        } catch (e2) {}
      }, 500);
      return { ok: true, bytes: json.length };
    } catch (e3) {
      try {
        prompt("Copy caller recovery JSON:", json);
      } catch (e4) {}
      return { ok: true, fallback: "prompt", bytes: json.length };
    }
  }

  function exportAllSessions() {
    snapshotIfNeeded();
    var dump = buildDump();
    var day = new Date().toISOString().slice(0, 10);
    downloadJson("offgrd-caller-all-sessions-" + day + ".json", dump);
    return dump;
  }

  function groupEventsByGame(events) {
    var groups = Object.create(null);
    (events || []).forEach(function (e) {
      if (!e) return;
      var id = e.gameId || e.game_id || "";
      if (!id) return;
      (groups[id] = groups[id] || []).push(e);
    });
    return groups;
  }

  function inferGameMeta(events, fallback) {
    fallback = fallback || {};
    var sample = (events || []).find(function (e) {
      return e && e.payload && (e.payload.date || e.payload.opponent);
    }) || (events || [])[0] || {};
    var p = (sample && sample.payload) || {};
    var date = p.date ? String(p.date).slice(0, 10) : null;
    if (!date && sample && sample.clientTs) {
      var S = sideApi();
      date = S && S.liveDateISO ? S.liveDateISO(new Date(sample.clientTs)) : new Date(sample.clientTs).toISOString().slice(0, 10);
    }
    var side = sample && (sample.side === "defense" || sample.side === "offense") ? sample.side : fallback.side || null;
    return {
      opponent: p.opponent || fallback.opponent || null,
      week: date ? "Live " + date : fallback.week || null,
      game_date: date || fallback.game_date || null,
      side: side,
    };
  }

  function remapEventsToGame(events, gameId) {
    return (events || []).map(function (e) {
      if (!e) return e;
      var copy = Object.assign({}, e);
      copy.gameId = gameId;
      return copy;
    });
  }

  function bridge() {
    return global.OFFGRD_CALLER_BRIDGE || null;
  }

  /**
   * Push recovered events under the game they already belong to.
   * opts.targetGameId remaps every event onto one existing cloud game
   * (Friday's row). Default: keep each event's gameId and ensure that row.
   */
  async function replayPayload(payload, opts) {
    opts = opts || {};
    var b = bridge();
    if (!b || !b.getTeamId || !b.cloud) return { ok: false, reason: "no-bridge" };
    var teamId = b.getTeamId();
    if (!teamId) return { ok: false, reason: "no-team" };
    if (b.canSync && !b.canSync()) return { ok: false, reason: "not-staff" };
    var cloud = b.cloud;
    var events = collectAllEvents(payload);
    if (opts.side) {
      events = events.filter(function (e) {
        return e && e.side === opts.side;
      });
    }
    if (!events.length) return { ok: false, reason: "no-events", pushed: 0 };
    var target = opts.targetGameId ? String(opts.targetGameId) : null;
    var groups = target
      ? (function () {
          var g = Object.create(null);
          g[target] = remapEventsToGame(events, target);
          return g;
        })()
      : groupEventsByGame(events);
    var gids = Object.keys(groups);
    if (!gids.length) return { ok: false, reason: "no-gameId", pushed: 0 };
    var pushed = 0;
    var games = [];
    for (var i = 0; i < gids.length; i++) {
      var gid = gids[i];
      var evs = groups[gid];
      var meta = inferGameMeta(evs, {
        opponent: opts.opponent,
        week: opts.week,
        game_date: opts.game_date,
        side: opts.side,
      });
      var side = meta.side === "defense" ? "defense" : "offense";
      if (cloud.ensureCallerGameRow) {
        await cloud.ensureCallerGameRow(teamId, {
          id: gid,
          opponent: meta.opponent,
          week: meta.week,
          game_date: meta.game_date,
          created_by: (b.getActorId && b.getActorId()) || null,
          side: side,
          status: "archived",
        });
      }
      if (cloud.appendCallerEvents && evs.length) {
        var rows = await cloud.appendCallerEvents(teamId, evs);
        pushed += (rows && rows.length) || 0;
      }
      games.push({ gameId: gid, events: evs.length, side: side, date: meta.game_date });
    }
    return { ok: true, pushed: pushed, games: games, eventCount: events.length };
  }

  function pickFile() {
    return new Promise(function (resolve, reject) {
      var input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.style.display = "none";
      document.body.appendChild(input);
      input.onchange = function () {
        var f = input.files && input.files[0];
        input.remove();
        if (!f) {
          reject(new Error("cancelled"));
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          var parsed = parseJson(reader.result);
          if (!parsed) reject(new Error("not-json"));
          else resolve(parsed);
        };
        reader.onerror = function () {
          reject(new Error("read-failed"));
        };
        reader.readAsText(f);
      };
      input.click();
    });
  }

  async function replayFromFile(opts) {
    var payload = await pickFile();
    return replayPayload(payload, opts);
  }

  function listSelectableSessions(store, archives) {
    var st = store || {};
    var events = eventsFromStore(st);
    var cen = censusEvents(events);
    var out = [];
    var seen = Object.create(null);
    function add(row) {
      if (!row || !row.gameId) return;
      var prev = seen[row.gameId];
      if (prev) {
        if (row.sit && !prev.sit) prev.sit = row.sit;
        if (row.session && !prev.session) prev.session = row.session;
        if (row.source === "archive") prev.source = "archive";
        if (row.eventCount > prev.eventCount) prev.eventCount = row.eventCount;
        return;
      }
      seen[row.gameId] = row;
      out.push(row);
    }
    if (st.session && st.session.gameId) {
      var cur = cen.games[st.session.gameId] || { events: 0, calls: 0 };
      add({
        gameId: String(st.session.gameId),
        week: st.session.week || "",
        game_date: st.session.game_date || "",
        opp: st.session.opp || "",
        eventCount: cur.events || 0,
        source: "current",
      });
    }
    Object.keys(cen.games).forEach(function (id) {
      if (id === "(none)") return;
      var g = cen.games[id];
      add({
        gameId: id,
        week: g.minTs ? "Live " + new Date(g.minTs).toISOString().slice(0, 10) : "",
        game_date: g.minTs ? new Date(g.minTs).toISOString().slice(0, 10) : "",
        opp: "",
        eventCount: g.events,
        source: "events",
      });
    });
    (archives || st.sessionArchives || []).forEach(function (a) {
      if (!a || !a.session || !a.session.gameId) return;
      add({
        gameId: String(a.session.gameId),
        week: a.session.week || "",
        game_date: a.session.game_date || "",
        opp: a.session.opp || "",
        eventCount: a.eventCount || 0,
        source: "archive",
        sit: a.sit || null,
        session: a.session,
      });
    });
    return out;
  }

  try {
    snapshotIfNeeded();
  } catch (eSnap) {}

  global.OFFGRD_CALLER_RECOVERY = {
    SNAPSHOT_KEY: SNAPSHOT_KEY,
    BOOT_KEY: BOOT_KEY,
    RING_KEY: RING_KEY,
    ALL_KIND: ALL_KIND,
    snapshotIfNeeded: snapshotIfNeeded,
    snapshotOnBoot: snapshotOnBoot,
    buildDump: buildDump,
    exportAllSessions: exportAllSessions,
    collectAllEvents: collectAllEvents,
    censusEvents: censusEvents,
    groupEventsByGame: groupEventsByGame,
    inferGameMeta: inferGameMeta,
    remapEventsToGame: remapEventsToGame,
    replayPayload: replayPayload,
    replayFromFile: replayFromFile,
    listSelectableSessions: listSelectableSessions,
    downloadJson: downloadJson,
  };
})(typeof window !== "undefined" ? window : globalThis);
