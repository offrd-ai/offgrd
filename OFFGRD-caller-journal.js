/* OFFGRD caller journal — append-only ledger. Source of truth for O/D taps.
   IndexedDB primary; localStorage mirror written in the same tap turn so a
   force-quit cannot lose the row while IDB is still committing.
   Rows are never updated or deleted. Clear / undo are new rows.
   The localStorage "store" is a derived view rebuilt from this journal. */
(function (global) {
  "use strict";

  var DB_NAME = "offgrd_caller_journal_v1";
  var STORE = "events";
  var LS_KEY = "offgrd_caller_journal_ls_v1";
  var META_KEY = "offgrd_caller_journal_meta_v1";
  var UNDO_MS = 30 * 60 * 1000;
  var EXPORT_EVERY = 25;

  var mem = Object.create(null);
  var readyP = null;
  var idb = null;
  var lastExportN = 0;

  function now() {
    return Date.now();
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

  function parseJson(raw) {
    if (raw == null || raw === "") return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function loadLsMirror() {
    var o = parseJson(lsGet(LS_KEY)) || {};
    var rows = o.rows && typeof o.rows === "object" ? o.rows : {};
    Object.keys(rows).forEach(function (id) {
      if (rows[id] && rows[id].eventId) mem[id] = rows[id];
    });
  }

  function persistLsMirror() {
    return lsSet(LS_KEY, JSON.stringify({ schemaVersion: 1, rows: mem }));
  }

  function loadMeta() {
    var m = parseJson(lsGet(META_KEY));
    return m && typeof m === "object" ? m : {};
  }

  function saveMeta(patch) {
    var m = Object.assign(loadMeta(), patch || {});
    lsSet(META_KEY, JSON.stringify(m));
    return m;
  }

  function cloneRow(row) {
    if (!row) return null;
    var out = Object.assign({}, row);
    if (row.payload && typeof row.payload === "object") {
      out.payload = Object.assign({}, row.payload);
    }
    return out;
  }

  function toRow(ev, extra) {
    extra = extra || {};
    if (!ev || !ev.eventId) return null;
    return {
      eventId: String(ev.eventId),
      gameId: ev.gameId || extra.gameId || null,
      side: ev.side === "defense" || ev.side === "offense" ? ev.side : extra.side || null,
      type: ev.type || extra.type || "call",
      playIndex: ev.playIndex,
      payload: ev.payload && typeof ev.payload === "object" ? ev.payload : {},
      deviceId: ev.deviceId || extra.deviceId || null,
      actorId: ev.actorId != null ? ev.actorId : extra.actorId || null,
      clientTs: ev.clientTs != null ? +ev.clientTs : now(),
      seq: ev.seq,
      superseded: !!ev.superseded,
      journaledAt: ev.journaledAt != null ? +ev.journaledAt : now(),
      refs: extra.refs || ev.refs || null,
    };
  }

  function isLedgerEvent(row) {
    if (!row || !row.eventId) return false;
    if (row.type === "clear" || row.type === "undo_clear") return false;
    return true;
  }

  function openIdb() {
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    return new Promise(function (resolve) {
      var req;
      try {
        req = indexedDB.open(DB_NAME, 1);
      } catch (e) {
        resolve(null);
        return;
      }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "eventId" });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        resolve(null);
      };
      req.onblocked = function () {
        resolve(null);
      };
    });
  }

  function idbGetAll(db) {
    if (!db) return Promise.resolve([]);
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(STORE, "readonly");
        var req = tx.objectStore(STORE).getAll();
        req.onsuccess = function () {
          resolve(req.result || []);
        };
        req.onerror = function () {
          resolve([]);
        };
      } catch (e) {
        resolve([]);
      }
    });
  }

  function idbPut(db, row) {
    if (!db || !row) return Promise.resolve(false);
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(STORE, "readwrite");
        tx.oncomplete = function () {
          resolve(true);
        };
        tx.onerror = function () {
          resolve(false);
        };
        tx.onabort = function () {
          resolve(false);
        };
        var store = tx.objectStore(STORE);
        var get = store.get(row.eventId);
        get.onsuccess = function () {
          if (get.result) return;
          store.add(row);
        };
        get.onerror = function () {
          try {
            store.add(row);
          } catch (e2) {}
        };
      } catch (e) {
        resolve(false);
      }
    });
  }

  function ready() {
    if (readyP) return readyP;
    loadLsMirror();
    readyP = openIdb()
      .then(function (db) {
        idb = db;
        return idbGetAll(db);
      })
      .then(function (rows) {
        (rows || []).forEach(function (r) {
          if (!r || !r.eventId) return;
          if (!mem[r.eventId]) mem[r.eventId] = r;
        });
        persistLsMirror();
        return true;
      })
      .catch(function () {
        return true;
      });
    return readyP;
  }

  /** Sync write. Must run before the tap updates the derived view. */
  function appendNow(ev, extra) {
    var row = toRow(ev, extra);
    if (!row) return null;
    if (mem[row.eventId]) return mem[row.eventId];
    mem[row.eventId] = row;
    persistLsMirror();
    if (idb) {
      idbPut(idb, row);
    } else if (readyP) {
      readyP.then(function () {
        if (idb) idbPut(idb, row);
      });
    }
    return row;
  }

  function retargetGameId(from, to) {
    if (!from || !to || String(from) === String(to)) return 0;
    var n = 0;
    Object.keys(mem).forEach(function (id) {
      var r = mem[id];
      if (!r || String(r.gameId) !== String(from)) return;
      r.gameId = String(to);
      n += 1;
      if (idb) idbPut(idb, r);
    });
    if (n) persistLsMirror();
    return n;
  }

  function isFallbackOpp(name) {
    var Pin = global.OFFGRD_GAMEDAY_PIN;
    if (Pin && Pin.isFallbackOpp) return Pin.isFallbackOpp(name);
    var n = String(name == null ? "" : name).trim().toLowerCase();
    return !n || n === "any" || n === "live" || n === "opponent";
  }

  function stampFallbackOpponent(opp, gameId) {
    if (!opp || isFallbackOpp(opp) || !gameId) return 0;
    var n = 0;
    Object.keys(mem).forEach(function (id) {
      var r = mem[id];
      if (!r || String(r.gameId) !== String(gameId)) return;
      if (!r.payload) r.payload = {};
      if (!isFallbackOpp(r.payload.opponent)) return;
      r.payload.opponent = String(opp).trim();
      n += 1;
      if (idb) idbPut(idb, r);
    });
    if (n) persistLsMirror();
    return n;
  }

  function adopt(events) {
    var n = 0;
    (events || []).forEach(function (e) {
      if (appendNow(e)) n += 1;
    });
    return n;
  }

  function allRows() {
    return Object.keys(mem).map(function (id) {
      return cloneRow(mem[id]);
    });
  }

  function latestByType(gameId, type) {
    var latest = null;
    Object.keys(mem).forEach(function (id) {
      var r = mem[id];
      if (!r || r.type !== type) return;
      if (gameId && String(r.gameId) !== String(gameId)) return;
      if (!latest || (r.clientTs || 0) > (latest.clientTs || 0)) latest = r;
    });
    return latest;
  }

  function gameIsCleared(gameId) {
    if (!gameId) return false;
    var clr = latestByType(gameId, "clear");
    if (!clr) return false;
    var undo = latestByType(gameId, "undo_clear");
    if (undo && (undo.clientTs || 0) >= (clr.clientTs || 0)) return false;
    return true;
  }

  function clearUndoUntil(gameId) {
    var clr = latestByType(gameId, "clear");
    if (!clr || !gameIsCleared(gameId)) return null;
    var until = clr.payload && clr.payload.undoUntil != null ? +clr.payload.undoUntil : clr.clientTs + UNDO_MS;
    if (now() > until) return null;
    return until;
  }

  function activeEvents(side) {
    var out = [];
    Object.keys(mem).forEach(function (id) {
      var r = mem[id];
      if (!isLedgerEvent(r)) return;
      if (side && r.side && r.side !== side) return;
      if (r.gameId && gameIsCleared(r.gameId)) return;
      out.push(cloneRow(r));
    });
    out.sort(function (a, b) {
      return (a.clientTs || 0) - (b.clientTs || 0) || (a.seq || 0) - (b.seq || 0);
    });
    return out;
  }

  function eventsForGame(gameId) {
    if (!gameId) return [];
    return allRows()
      .filter(function (r) {
        return isLedgerEvent(r) && String(r.gameId) === String(gameId);
      })
      .sort(function (a, b) {
        return (a.clientTs || 0) - (b.clientTs || 0);
      });
  }

  /** A snap is a call. Outcomes and corrections are the same snap, not extra saved. */
  function isSnapRow(row) {
    if (!isLedgerEvent(row)) return false;
    return !row.type || row.type === "call";
  }

  function sameGame(row, gameId) {
    return !!(row && gameId && String(row.gameId) === String(gameId));
  }

  function viewEventsForGame(gameId, side) {
    if (!gameId) return [];
    if (gameIsCleared(gameId)) return [];
    return eventsForGame(gameId).filter(function (r) {
      if (side && r.side && r.side !== side) return false;
      return true;
    });
  }

  function snapRowsForGame(gameId, side) {
    return viewEventsForGame(gameId, side).filter(isSnapRow);
  }

  function recordClear(gameId, side) {
    if (!gameId) return null;
    return appendNow({
      eventId: "clear-" + gameId + "-" + now(),
      gameId: gameId,
      side: side || null,
      type: "clear",
      payload: { undoUntil: now() + UNDO_MS },
      clientTs: now(),
    });
  }

  function undoClear(gameId, side) {
    if (!gameId) return null;
    return appendNow({
      eventId: "undo-clear-" + gameId + "-" + now(),
      gameId: gameId,
      side: side || null,
      type: "undo_clear",
      payload: { refs: gameId },
      clientTs: now(),
    });
  }

  function hydrateView(prior, side, gameId) {
    adopt(prior);
    if (!gameId) {
      var priorKeep = prior && prior.length ? prior : [];
      return priorKeep;
    }
    var fromJ = viewEventsForGame(gameId, side);
    if (fromJ.length) return fromJ;
    var priorSame = (prior || []).filter(function (e) {
      return sameGame(e, gameId);
    });
    var EU = global.OFFGRD_EMPTY_UNKNOWN;
    if (EU && EU.isUnknownEmpty(fromJ, { confirmedEmpty: false }) && priorSame.length) {
      return priorSame;
    }
    return priorSame.length ? priorSame : fromJ;
  }

  function formatLast(ts) {
    if (ts == null || isNaN(+ts)) return "";
    var d = new Date(+ts);
    if (isNaN(d.getTime())) return "";
    var h = d.getHours();
    var m = d.getMinutes();
    var am = h < 12;
    var h12 = h % 12;
    if (!h12) h12 = 12;
    return h12 + ":" + (m < 10 ? "0" : "") + m + " " + (am ? "AM" : "PM");
  }

  function syncedSet(side, gameId) {
    var Sync = global.OFFGRD_CALLER_SYNC_ENGINE;
    if (!Sync || !Sync.isSynced) return Object.create(null);
    var set = Object.create(null);
    Object.keys(mem).forEach(function (id) {
      var r = mem[id];
      if (!isSnapRow(r)) return;
      if (gameId && !sameGame(r, gameId)) return;
      if (side && r.side && r.side !== side) return;
      if (Sync.isSynced(side || r.side, r.eventId)) set[r.eventId] = 1;
    });
    return set;
  }

  function census(opts) {
    opts = opts || {};
    var side = opts.side === "defense" ? "defense" : opts.side === "offense" ? "offense" : null;
    var gameId = opts.gameId || null;
    var letter = side === "defense" ? "D" : "O";
    var online = typeof navigator === "undefined" || navigator.onLine !== false;
    if (!gameId) {
      return {
        side: side,
        gameId: null,
        snaps: 0,
        saved: 0,
        synced: 0,
        lastTs: null,
        last: "",
        online: online,
        reconciled: false,
        tone: "neutral",
        label: letter + ": no active game",
        undoUntil: null,
        missingGameId: true,
      };
    }
    var snapRows = opts.includeCleared
      ? eventsForGame(gameId).filter(function (r) {
          if (side && r.side && r.side !== side) return false;
          return isSnapRow(r);
        })
      : snapRowsForGame(gameId, side);
    var saved = snapRows.length;
    var log = Array.isArray(opts.log) ? opts.log : null;
    var snaps = log ? log.length : saved;
    var syn = syncedSet(side, gameId);
    var synced = 0;
    snapRows.forEach(function (r) {
      if (syn[r.eventId]) synced += 1;
    });
    var lastTs = null;
    snapRows.forEach(function (r) {
      if (r.clientTs != null && (lastTs == null || r.clientTs > lastTs)) lastTs = r.clientTs;
    });
    var last = formatLast(lastTs);
    var reconciled = snaps > 0 && saved === snaps && saved === synced;
    var tone = "neutral";
    var label;
    if (saved !== snaps) {
      tone = "bad";
      label = letter + ": " + snaps + " snaps · " + saved + " saved · " + synced + " synced";
    } else if (synced < saved) {
      tone = online ? "amber" : "offline";
      label = online
        ? letter + ": " + snaps + " snaps · " + saved + " saved · " + synced + " synced"
        : letter + ": " + snaps + " snaps · offline, " + (saved - synced) + " queued";
    } else if (reconciled) {
      tone = "good";
      label = letter + ": " + snaps + " snaps · " + saved + " saved · " + synced + " synced";
    } else {
      label = letter + ": " + snaps + " snaps · " + saved + " saved · " + synced + " synced";
    }
    if (last && tone !== "offline") label += " · last " + last;
    return {
      side: side,
      gameId: gameId,
      snaps: snaps,
      saved: saved,
      synced: synced,
      lastTs: lastTs,
      last: last,
      online: online,
      reconciled: reconciled,
      tone: tone,
      label: label,
      undoUntil: clearUndoUntil(gameId),
      missingGameId: false,
    };
  }

  function exportPayload(reason) {
    return {
      kind: "offgrd_caller_journal",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      reason: reason || "manual",
      rows: allRows(),
      census: {
        rows: Object.keys(mem).length,
        active: activeEvents(null).length,
      },
    };
  }

  function downloadJson(filename, obj) {
    var Rec = global.OFFGRD_CALLER_RECOVERY;
    if (Rec && Rec.downloadJson) return Rec.downloadJson(filename, obj);
    var json = JSON.stringify(obj, null, 2);
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
      return { ok: false, reason: "download-failed" };
    }
  }

  function exportNow(reason) {
    var payload = exportPayload(reason);
    if (!payload.rows.length) return { ok: false, reason: "empty", skipped: true };
    var day = new Date().toISOString().slice(0, 10);
    var name = "offgrd-journal-" + day + "-" + String(reason || "manual").replace(/\s+/g, "-") + ".json";
    var r = downloadJson(name, payload);
    saveMeta({ lastExportAt: now(), lastExportReason: reason, lastExportN: payload.rows.length });
    return Object.assign({ ok: true, rows: payload.rows.length, reason: reason }, r);
  }

  function maybeAutoExport(reason, snapCount) {
    if (reason === "halftime" || reason === "final" || reason === "background") {
      return exportNow(reason);
    }
    var n = snapCount != null ? +snapCount : activeEvents(null).length;
    if (reason === "snap" && n > 0 && n % EXPORT_EVERY === 0 && n !== lastExportN) {
      lastExportN = n;
      return exportNow("snap-" + n);
    }
    return { ok: true, skipped: true };
  }

  function bindAutoExport() {
    if (typeof document === "undefined") return;
    function onHide() {
      try {
        maybeAutoExport("background");
      } catch (e) {}
    }
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") onHide();
    });
    global.addEventListener("pagehide", onHide);
  }

  try {
    loadLsMirror();
  } catch (eLoad) {}
  try {
    ready();
  } catch (eReady) {}
  try {
    bindAutoExport();
  } catch (eBind) {}

  global.OFFGRD_CALLER_JOURNAL = {
    LS_KEY: LS_KEY,
    DB_NAME: DB_NAME,
    UNDO_MS: UNDO_MS,
    EXPORT_EVERY: EXPORT_EVERY,
    ready: ready,
    appendNow: appendNow,
    adopt: adopt,
    retargetGameId: retargetGameId,
    stampFallbackOpponent: stampFallbackOpponent,
    allRows: allRows,
    activeEvents: activeEvents,
    eventsForGame: eventsForGame,
    viewEventsForGame: viewEventsForGame,
    snapRowsForGame: snapRowsForGame,
    isSnapRow: isSnapRow,
    hydrateView: hydrateView,
    gameIsCleared: gameIsCleared,
    clearUndoUntil: clearUndoUntil,
    recordClear: recordClear,
    undoClear: undoClear,
    census: census,
    exportPayload: exportPayload,
    exportNow: exportNow,
    maybeAutoExport: maybeAutoExport,
    isLedgerEvent: isLedgerEvent,
  };
})(typeof window !== "undefined" ? window : globalThis);
