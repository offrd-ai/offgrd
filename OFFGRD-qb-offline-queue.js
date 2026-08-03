/* OFFGRD player rep offline queue — Daily Check pattern for qb_results.
   Offline / failed save → localStorage queue → flush on online + app open.
   Idempotent via client-generated result id (Cloud.saveQuizResult upsert).
   Single-flight, bounded backoff. */
(function (global) {
  var KEY = "offgrd_qb_results_queue_v1";
  var MAX_BACKOFF = 30000;
  var _flight = null;
  var _syncing = false;
  var _backoffN = 0;
  var _backoffT = null;
  var _listeners = [];

  function notify() {
    for (var i = 0; i < _listeners.length; i++) {
      try {
        _listeners[i]();
      } catch (e) {}
    }
  }

  function subscribe(fn) {
    _listeners.push(fn);
    return function () {
      _listeners = _listeners.filter(function (f) {
        return f !== fn;
      });
    };
  }

  function isOnline() {
    return typeof navigator === "undefined" || navigator.onLine !== false;
  }

  function uuid() {
    try {
      if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) {}
    return "q" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function readQueue() {
    try {
      var raw = localStorage.getItem(KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function writeQueue(items) {
    try {
      localStorage.setItem(KEY, JSON.stringify(items || []));
    } catch (e) {}
    notify();
  }

  function pendingCount() {
    return readQueue().length;
  }

  function getSyncHeaderState() {
    var online = isOnline();
    var pending = pendingCount();
    if (_syncing) {
      return {
        online: online,
        pending: pending,
        syncing: true,
        label: pending ? pending + " pending · syncing…" : "Syncing…",
      };
    }
    if (!online && pending > 0) {
      return { online: online, pending: pending, syncing: false, label: "Offline · " + pending + " pending" };
    }
    if (pending > 0) {
      return {
        online: online,
        pending: pending,
        syncing: false,
        label: pending + " pending · will sync",
      };
    }
    return { online: online, pending: 0, syncing: false, label: "All synced" };
  }

  function enqueue(item) {
    var clientId = item.clientId || uuid();
    var next = {
      clientId: clientId,
      teamId: item.teamId,
      result: Object.assign({}, item.result || {}, { clientId: clientId, id: clientId }),
      queuedAt: new Date().toISOString(),
      lastError: null,
    };
    var q = readQueue().filter(function (x) {
      return x.clientId !== clientId;
    });
    q.push(next);
    writeQueue(q);
    return clientId;
  }

  function clearBackoff() {
    if (_backoffT) {
      clearTimeout(_backoffT);
      _backoffT = null;
    }
  }

  function scheduleBackoff() {
    if (_backoffT) return;
    if (_backoffN >= 8) return;
    var delay = Math.min(MAX_BACKOFF, 500 * Math.pow(2, _backoffN));
    _backoffN++;
    _backoffT = setTimeout(function () {
      _backoffT = null;
      flush();
    }, delay);
  }

  function flush() {
    if (_flight) return _flight;
    _flight = doFlush()
      .catch(function (e) {
        scheduleBackoff();
        return { synced: 0, failed: pendingCount(), error: e };
      })
      .finally(function () {
        _flight = null;
        _syncing = false;
        notify();
      });
    return _flight;
  }

  /** Same class as caller-sync R1: conflict = already landed = dequeue. */
  function isDuplicateKeyError(e) {
    if (!e) return false;
    if (e.code === "23505") return true;
    if (e.deduped) return true;
    var msg = String((e && (e.message || e.error_description || e.details)) || "");
    return /23505|duplicate key|unique constraint|already exists/i.test(msg);
  }

  async function doFlush() {
    if (!isOnline()) return { synced: 0, failed: pendingCount(), offline: true };
    var Cloud = global.Cloud;
    if (!Cloud || !Cloud.saveQuizResult) return { synced: 0, failed: pendingCount(), reason: "no-cloud" };

    _syncing = true;
    notify();
    clearBackoff();

    var items = readQueue();
    var remaining = [];
    var synced = 0;
    var failed = 0;

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      try {
        var res = await Cloud.saveQuizResult(item.teamId, item.result);
        /* Upsert ignoreDuplicates / prior success → treat as synced. */
        if (res && res.deduped) synced++;
        else synced++;
      } catch (e) {
        if (isDuplicateKeyError(e)) {
          synced++;
          continue;
        }
        failed++;
        remaining.push(
          Object.assign({}, item, {
            lastError: (e && e.message) || String(e),
          })
        );
      }
    }

    writeQueue(remaining);
    if (failed) scheduleBackoff();
    else _backoffN = 0;
    return { synced: synced, failed: failed };
  }

  /**
   * Online try → success; offline/fail → queue.
   * Returns { status: 'synced'|'queued', clientId }
   */
  async function saveWithOffline(teamId, result) {
    var clientId = (result && (result.clientId || result.id)) || uuid();
    var payload = Object.assign({}, result || {}, { clientId: clientId, id: clientId });
    if (!isOnline()) {
      enqueue({ teamId: teamId, result: payload, clientId: clientId });
      return { status: "queued", clientId: clientId };
    }
    try {
      var Cloud = global.Cloud;
      if (!Cloud || !Cloud.saveQuizResult) throw new Error("Cloud not ready");
      await Cloud.saveQuizResult(teamId, payload);
      return { status: "synced", clientId: clientId };
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        return { status: "synced", clientId: clientId, deduped: true };
      }
      enqueue({ teamId: teamId, result: payload, clientId: clientId });
      return { status: "queued", clientId: clientId, error: e };
    }
  }

  var _bound = false;
  function bindTriggers() {
    if (_bound) return;
    _bound = true;
    window.addEventListener("online", function () {
      flush();
    });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && isOnline()) flush();
    });
    setTimeout(function () {
      flush();
    }, 1200);
  }

  bindTriggers();

  global.OFFGRD_QB_OFFLINE_QUEUE = {
    enqueue: enqueue,
    flush: flush,
    saveWithOffline: saveWithOffline,
    pendingCount: pendingCount,
    getSyncHeaderState: getSyncHeaderState,
    subscribe: subscribe,
    isSyncing: function () {
      return _syncing;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
