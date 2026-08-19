/* OFFGRD play map — Slice 2 own-offense family/concept join.
   Map is COACH-STATED. Resolver looks up exact raw_call_norm only.
   No fuzzy, no stem auto-apply, no suggestion auto-apply.
   Do not reuse OFFGRD_CALLER_SELECT.norm (trim+lower only) — that misses
   ST. LOUIS vs ST LOUIS and HITCH & PITCH vs HITCH AND PITCH. */
(function (root) {
  "use strict";

  var MAP_CACHE_KEY = "offgrd_play_map_cache";
  var DECLINE_KEY = "offgrd_play_map_declined_stems";
  var _mapRows = [];
  var _mapTeamId = "";
  var _hydrated = false;
  var _hydrateListeners = [];

  /**
   * Expand & → and FIRST, then strip punctuation, collapse space.
   * HITCH & PITCH and HITCH AND PITCH must share one key.
   */
  function normCall(s) {
    return String(s == null ? "" : s)
      .trim()
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isBlank(s) {
    return !String(s == null ? "" : s).trim();
  }

  function canonFamily(s) {
    return String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  }

  function familyKey(s) {
    return canonFamily(s).toLowerCase();
  }

  function tokens(s) {
    return familyKey(s).split(" ").filter(Boolean);
  }

  /** Token-prefix collapse: Quick + Quick Game → one family (longest display). */
  function collapseFamilies(names) {
    var cleaned = [];
    (names || []).forEach(function (n) {
      var c = canonFamily(n);
      if (c) cleaned.push(c);
    });
    var groups = [];
    cleaned.forEach(function (name) {
      var t = tokens(name);
      var i, g, gt, prefix;
      for (i = 0; i < groups.length; i++) {
        g = groups[i];
        gt = tokens(g.canon);
        prefix =
          t.length <= gt.length
            ? t.every(function (w, j) { return w === gt[j]; })
            : gt.every(function (w, j) { return w === t[j]; });
        if (prefix) {
          if (name.length > g.canon.length) g.canon = name;
          if (g.aliases.indexOf(name) < 0) g.aliases.push(name);
          return;
        }
      }
      groups.push({ canon: name, aliases: [name] });
    });
    var notices = [];
    groups.forEach(function (g) {
      var uniq = [];
      g.aliases.forEach(function (a) {
        if (uniq.indexOf(a) < 0) uniq.push(a);
      });
      g.aliases = uniq;
      if (uniq.length > 1) {
        notices.push(uniq.map(function (a) { return '"' + a + '"'; }).join(" and ") + " are the same family — showing as " + g.canon + ".");
      }
    });
    return { families: groups.map(function (g) { return g.canon; }), notices: notices, groups: groups };
  }

  function seedFamilies(playbook) {
    var raw = [];
    (playbook || []).forEach(function (p) {
      if (p && p.family) raw.push(p.family);
    });
    return collapseFamilies(raw);
  }

  function firstToken(raw) {
    var n = normCall(raw);
    if (!n) return "";
    return n.split(" ")[0] || "";
  }

  function suggestStems(items) {
    var by = Object.create(null);
    (items || []).forEach(function (it) {
      var stem = firstToken(it.raw);
      if (!stem) return;
      (by[stem] = by[stem] || []).push(it);
    });
    return Object.keys(by)
      .map(function (stem) {
        var members = by[stem];
        if (members.length < 2) return null;
        var base = members.filter(function (m) { return normCall(m.raw) === stem; })[0] || members[0];
        return {
          stem: stem,
          display: base.raw,
          members: members,
          n: members.reduce(function (a, m) { return a + (m.n || 0); }, 0),
        };
      })
      .filter(Boolean)
      .sort(function (a, b) { return b.n - a.n || a.stem.localeCompare(b.stem); });
  }

  function storage() {
    try {
      if (root && root.localStorage) return root.localStorage;
      if (typeof localStorage !== "undefined") return localStorage;
    } catch (e) {}
    return null;
  }

  function readStore(teamId) {
    try {
      var store = storage();
      if (!store) return [];
      var raw = JSON.parse(store.getItem(MAP_CACHE_KEY) || "{}");
      if (!raw || (teamId && raw.teamId && raw.teamId !== teamId)) return [];
      return Array.isArray(raw.rows) ? raw.rows : [];
    } catch (e) {
      return [];
    }
  }

  function afterHydrate() {
    try {
      var rv = root.refreshView;
      if (typeof rv !== "function" && root.window) rv = root.window.refreshView;
      if (typeof rv === "function") rv();
    } catch (e) {}
    var i;
    for (i = 0; i < _hydrateListeners.length; i++) {
      try { _hydrateListeners[i](); } catch (e2) {}
    }
  }

  function onAfterHydrate(fn) {
    if (typeof fn !== "function") return function () {};
    _hydrateListeners.push(fn);
    return function () {
      var idx = _hydrateListeners.indexOf(fn);
      if (idx >= 0) _hydrateListeners.splice(idx, 1);
    };
  }

  function isHydrated() {
    return _hydrated;
  }

  function setCache(teamId, rows) {
    _mapRows = rows || [];
    _mapTeamId = teamId || "";
    _hydrated = true;
    try {
      var store = storage();
      if (store) {
        store.setItem(
          MAP_CACHE_KEY,
          JSON.stringify({ teamId: teamId || "", rows: _mapRows, updatedAt: Date.now() })
        );
      }
    } catch (e) {}
    afterHydrate();
    return _mapRows;
  }

  function loadCache(teamId) {
    var rows = readStore(teamId);
    _mapRows = rows;
    _mapTeamId = teamId || "";
    _hydrated = true;
    afterHydrate();
    return _mapRows;
  }

  function getCached() {
    return _mapRows;
  }

  function cachedTeamId() {
    return _mapTeamId;
  }

  function resolvePanelMaps(opts) {
    opts = opts || {};
    var fetched = opts.fetched;
    if (_mapRows && _mapRows.length) {
      return { rows: _mapRows, known: true, source: "cache" };
    }
    if (Array.isArray(fetched) && fetched.length) {
      return { rows: fetched, known: true, source: "fetched" };
    }
    if (_hydrated) {
      return { rows: _mapRows || [], known: true, source: "hydrated" };
    }
    return { rows: [], known: false, source: "unknown" };
  }

  function findPlaybook(playbook, raw) {
    var n = normCall(raw);
    if (!n) return null;
    var i, p;
    for (i = 0; i < (playbook || []).length; i++) {
      p = playbook[i];
      if (p && normCall(p.name) === n) return p;
    }
    return null;
  }

  function inventoryCalls(rows, maps, playbook) {
    var byNorm = Object.create(null);
    (maps || []).forEach(function (m) {
      if (!m) return;
      var k = normCall(m.raw_call_norm || m.raw_call);
      if (k) byNorm[k] = m;
    });
    var counts = Object.create(null);
    var display = Object.create(null);
    (rows || []).forEach(function (r) {
      var t = String((r && r.play) || "").trim();
      if (!t) return;
      counts[t] = (counts[t] || 0) + 1;
      display[t] = t;
    });
    var items = Object.keys(counts)
      .map(function (raw) {
        var mapped = byNorm[normCall(raw)] || null;
        var book = findPlaybook(playbook, raw);
        return {
          raw: raw,
          n: counts[raw],
          mapped: mapped,
          book: book,
          suggestedFamily: !mapped && book && book.family ? canonFamily(book.family) : null,
          suggestedPlayId: !mapped && book && book.id ? book.id : null,
        };
      })
      .sort(function (a, b) {
        return b.n - a.n || a.raw.localeCompare(b.raw);
      });
    var mappedSnaps = 0;
    var totalSnaps = 0;
    items.forEach(function (it) {
      totalSnaps += it.n;
      if (it.mapped || (it.book && it.book.family)) mappedSnaps += it.n;
    });
    return {
      items: items,
      unmapped: items.filter(function (i) { return !i.mapped; }),
      mapped: items.filter(function (i) { return !!i.mapped; }),
      mappedSnaps: mappedSnaps,
      totalSnaps: totalSnaps,
      stems: suggestStems(items),
    };
  }

  function coverageLine(inv) {
    if (!inv || !inv.totalSnaps) return "No charted own-offense calls yet.";
    var pct = Math.round((inv.mappedSnaps / inv.totalSnaps) * 100);
    var names = inv.mapped ? inv.mapped.length : 0;
    return names + " mapped = " + pct + "% of your calls.";
  }

  function panelPaint(playRows, opts) {
    opts = opts || {};
    var cacheReady = (_mapRows && _mapRows.length) || _hydrated;
    var fetchedReady = Array.isArray(opts.fetched) && opts.fetched.length;
    if (opts.hydrating && !cacheReady && !fetchedReady) {
      return { state: "loading", statusText: "Loading play map\u2026", inv: null };
    }
    var resolved = resolvePanelMaps({ fetched: opts.fetched });
    if (!resolved.known) {
      return { state: "unknown", statusText: "Play map isn't loaded yet.", inv: null };
    }
    var inv = inventoryCalls(playRows, resolved.rows, opts.playbook || []);
    var seed = seedFamilies(opts.playbook || []);
    return {
      state: "ready",
      statusText: coverageLine(inv),
      inv: inv,
      families: seed.families,
      familyNotices: seed.notices,
      source: resolved.source,
    };
  }

  function buildUpsertPayload(opts) {
    opts = opts || {};
    var raw = String(opts.raw_call == null ? "" : opts.raw_call).trim();
    if (!raw) throw new Error("blank call");
    var family = canonFamily(opts.family);
    if (!family) throw new Error("family required");
    var concept = opts.concept != null ? canonFamily(opts.concept) : "";
    var playId = opts.play_id || null;
    if (playId === "") playId = null;
    return {
      team_id: opts.team_id || null,
      raw_call: raw,
      raw_call_norm: normCall(raw),
      family: family,
      concept: concept || null,
      play_id: playId,
      created_by: opts.created_by || null,
    };
  }

  function resolveMapped(raw) {
    var n = normCall(raw);
    if (!n) return null;
    var i, row;
    for (i = 0; i < _mapRows.length; i++) {
      row = _mapRows[i];
      if (!row) continue;
      if (normCall(row.raw_call_norm || row.raw_call) === n) return row;
    }
    return null;
  }

  /** Map first, then playbook name match. Never invent a family from a Hudl string. */
  function resolveCall(raw, opts) {
    opts = opts || {};
    var mapped = resolveMapped(raw);
    if (!mapped && Array.isArray(opts.maps)) {
      var n = normCall(raw);
      var i;
      for (i = 0; i < opts.maps.length; i++) {
        if (opts.maps[i] && normCall(opts.maps[i].raw_call_norm || opts.maps[i].raw_call) === n) {
          mapped = opts.maps[i];
          break;
        }
      }
    }
    if (mapped && mapped.family) {
      return {
        family: canonFamily(mapped.family),
        concept: mapped.concept ? canonFamily(mapped.concept) : canonFamily(raw),
        play_id: mapped.play_id || null,
        source: "map",
      };
    }
    var book = findPlaybook(opts.playbook || [], raw);
    if (book && book.family) {
      return {
        family: canonFamily(book.family),
        concept: canonFamily(book.name || raw),
        play_id: book.id || null,
        source: "playbook",
      };
    }
    return { family: "UNMAPPED", concept: canonFamily(raw), play_id: null, source: "unmapped" };
  }

  function pullMap(teamId) {
    var local = loadCache(teamId);
    var Cloud = root.Cloud;
    if (!Cloud || typeof Cloud.listPlayMap !== "function" || !teamId) {
      return Promise.resolve(local);
    }
    return Cloud.listPlayMap(teamId)
      .then(function (cloud) {
        if ((!cloud || !cloud.length) && local && local.length) return _mapRows;
        setCache(teamId, cloud || []);
        return _mapRows;
      })
      .catch(function () {
        return local;
      });
  }

  function declinedStems(teamId) {
    try {
      var store = storage();
      if (!store) return [];
      var raw = JSON.parse(store.getItem(DECLINE_KEY) || "{}");
      if (!raw || (teamId && raw.teamId && raw.teamId !== teamId)) return [];
      return Array.isArray(raw.stems) ? raw.stems : [];
    } catch (e) {
      return [];
    }
  }

  function declineStem(teamId, stem) {
    var cur = declinedStems(teamId);
    if (cur.indexOf(stem) < 0) cur.push(stem);
    try {
      var store = storage();
      if (store) store.setItem(DECLINE_KEY, JSON.stringify({ teamId: teamId || "", stems: cur }));
    } catch (e) {}
    return cur;
  }

  function successOf(row) {
    var O = root.OFFGRD_CALLER_OUTCOME;
    if (!O || typeof O.isSuccessVal !== "function") return null;
    return O.isSuccessVal(row.down, row.distance, row.gain);
  }

  function distBucket(n) {
    n = +n;
    if (!isFinite(n)) return "";
    if (n <= 3) return "1-3";
    if (n <= 6) return "4-6";
    if (n <= 9) return "7-9";
    return "10+";
  }

  function structureLabel(row) {
    var kind = /pass/i.test(row.playType || "")
      ? "PASS"
      : /run/i.test(row.playType || "")
        ? "RUN"
        : "PLAY";
    var d = String(row.direction || "").toUpperCase().charAt(0);
    var dir = d === "L" ? "LEFT" : d === "R" ? "RIGHT" : d === "M" ? "MIDDLE" : "";
    var label = dir ? kind + " " + dir : kind;
    var struct = row.offStructure || row.off_structure || "";
    if (!struct) {
      var FM = root.OFFGRD_FORMATION_MAP;
      if (FM && typeof FM.resolveMapped === "function") {
        var hit = FM.resolveMapped(row.formation, "ours");
        if (hit && hit.off_structure) struct = hit.off_structure;
      }
      if (!struct && FM && typeof FM.normalizeOffStructure === "function") {
        struct = FM.normalizeOffStructure(row.formation) || "";
      }
    }
    struct = String(struct || "").toLowerCase();
    if (/^(2x2|3x1|2x1|1x1|4x1|3x2)$/.test(struct)) label += " \u00b7 " + struct;
    return label;
  }

  function sliceReady(rows, field) {
    if (!rows || !rows.length) return true;
    return rows.every(function (r) {
      var v = r && r[field];
      return v != null && String(v).trim() !== "";
    });
  }

  function rollup(rows, opts) {
    opts = opts || {};
    var playbook = opts.playbook || [];
    var maps = opts.maps != null ? opts.maps : _mapRows;
    var axis = opts.axis;
    var list = (rows || []).filter(function (r) { return r && String(r.play || "").trim(); });
    var resolved = list.map(function (r) {
      var hit = r.family && r.family !== "UNMAPPED"
        ? { family: canonFamily(r.family), concept: r.concept || canonFamily(r.play), play_id: r.play_id || null, source: "row" }
        : resolveCall(r.play, { playbook: playbook, maps: maps });
      return { row: r, hit: hit, struct: structureLabel(r) };
    });
    var familyHits = resolved.filter(function (x) { return x.hit.source !== "unmapped"; }).length;
    if (!axis) axis = list.length && familyHits / list.length >= 0.5 ? "family" : "structure";
    var qtrOk = sliceReady(list, "qtr");
    var zoneOk = sliceReady(list, "fieldZone");
    if (opts.qtr && opts.qtr !== "ANY") {
      if (!qtrOk) return { axis: axis, buckets: [], total: list.length, slice: "unavailable", sliceField: "qtr", qtrOk: false, zoneOk: zoneOk };
      resolved = resolved.filter(function (x) { return String(x.row.qtr) === String(opts.qtr); });
    }
    if (opts.zone && opts.zone !== "ANY") {
      if (!zoneOk) return { axis: axis, buckets: [], total: list.length, slice: "unavailable", sliceField: "fieldZone", qtrOk: qtrOk, zoneOk: false };
      resolved = resolved.filter(function (x) { return String(x.row.fieldZone) === String(opts.zone); });
    }
    if (opts.db && opts.db !== "ANY") {
      resolved = resolved.filter(function (x) { return distBucket(x.row.distance) === opts.db && (!opts.dn || opts.dn === "ANY" || +x.row.down === +opts.dn); });
    } else if (opts.dn && opts.dn !== "ANY") {
      resolved = resolved.filter(function (x) { return +x.row.down === +opts.dn; });
    }
    var by = Object.create(null);
    resolved.forEach(function (x) {
      var key = axis === "structure" ? x.struct : (opts.level === "concept" ? (x.hit.concept || x.hit.family) : x.hit.family);
      if (!key) key = axis === "structure" ? "PLAY" : "UNMAPPED";
      if (!by[key]) by[key] = { key: key, rows: [], unmapped: key === "UNMAPPED" };
      by[key].rows.push(x.row);
    });
    var total = resolved.length;
    var buckets = Object.keys(by)
      .map(function (k) {
        var rs = by[k].rows;
        var n = rs.length;
        var gains = rs.map(function (r) { return +r.gain; }).filter(function (g) { return !isNaN(g); });
        var ypp = gains.length ? gains.reduce(function (a, b) { return a + b; }, 0) / gains.length : null;
        var ok = 0, known = 0;
        rs.forEach(function (r) {
          var s = successOf(r);
          if (s === 1 || s === 0) {
            known += 1;
            if (s === 1) ok += 1;
          }
        });
        return {
          key: k,
          label: k,
          n: n,
          pct: total ? n / total : 0,
          ypp: ypp,
          eff: known ? ok / known : null,
          effN: known,
          thin: n < 8,
          unmapped: !!by[k].unmapped,
        };
      })
      .sort(function (a, b) {
        if (a.unmapped !== b.unmapped) return a.unmapped ? 1 : -1;
        return b.n - a.n || a.key.localeCompare(b.key);
      });
    var sumN = buckets.reduce(function (a, b) { return a + b.n; }, 0);
    return {
      axis: axis,
      buckets: buckets,
      total: total,
      reconcile: sumN === total,
      qtrOk: qtrOk,
      zoneOk: zoneOk,
      slice: null,
      resolvedShare: list.length ? familyHits / list.length : 0,
    };
  }

  root.OFFGRD_PLAY_MAP = {
    MAP_CACHE_KEY: MAP_CACHE_KEY,
    normCall: normCall,
    isBlank: isBlank,
    canonFamily: canonFamily,
    collapseFamilies: collapseFamilies,
    seedFamilies: seedFamilies,
    suggestStems: suggestStems,
    inventoryCalls: inventoryCalls,
    coverageLine: coverageLine,
    resolvePanelMaps: resolvePanelMaps,
    panelPaint: panelPaint,
    buildUpsertPayload: buildUpsertPayload,
    setCache: setCache,
    loadCache: loadCache,
    getCached: getCached,
    cachedTeamId: cachedTeamId,
    resolveMapped: resolveMapped,
    resolveCall: resolveCall,
    pullMap: pullMap,
    afterHydrate: afterHydrate,
    onAfterHydrate: onAfterHydrate,
    isHydrated: isHydrated,
    declinedStems: declinedStems,
    declineStem: declineStem,
    structureLabel: structureLabel,
    sliceReady: sliceReady,
    rollup: rollup,
    successOf: successOf,
  };
})(typeof window !== "undefined" ? window : globalThis);
