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

  /** Typed/chip family through the same collapse as seedFamilies. */
  function resolveTypedFamily(raw, existingNames) {
    var typed = canonFamily(raw);
    if (!typed) return { family: "", collapsed: false, notice: "" };
    var col = collapseFamilies((existingNames || []).concat([typed]));
    var g = null;
    (col.groups || []).forEach(function (x) {
      if (!x) return;
      if (familyKey(x.canon) === familyKey(typed)) g = x;
      else if (x.aliases && x.aliases.indexOf(typed) >= 0) g = x;
    });
    var family = (g && g.canon) || typed;
    var collapsed = familyKey(family) !== familyKey(typed);
    var notice = "";
    if (collapsed) {
      notice = '"' + typed + '" is the same family as "' + family + '" — saving as ' + family + ".";
    } else if (g && g.aliases && g.aliases.length > 1 && typed !== family) {
      collapsed = true;
      notice = '"' + typed + '" is the same family as "' + family + '" — saving as ' + family + ".";
    }
    return { family: family, collapsed: collapsed, notice: notice };
  }

  /**
   * Save family: typed free-text wins (so "new family" is never ignored),
   * then selected chip. play_id is not required.
   */
  function prepareSave(opts) {
    opts = opts || {};
    var typed = String(opts.typed == null ? "" : opts.typed).trim();
    var chip = canonFamily(opts.chip || "");
    var existing = opts.families || [];
    var playId = opts.play_id || null;
    if (playId === "") playId = null;
    var resolved;
    if (typed) resolved = resolveTypedFamily(typed, existing);
    else if (chip) resolved = resolveTypedFamily(chip, existing);
    else {
      return { ok: false, error: "Pick a family — tap a chip or type one.", target: "family", play_id: playId };
    }
    if (!resolved.family) {
      return { ok: false, error: "Pick a family — tap a chip or type one.", target: "family", play_id: playId };
    }
    return {
      ok: true,
      family: resolved.family,
      collapsed: !!resolved.collapsed,
      notice: resolved.notice || "",
      play_id: playId,
    };
  }

  function seedFamilies(playbook) {
    var raw = [];
    (playbook || []).forEach(function (p) {
      if (p && p.family) raw.push(p.family);
    });
    return collapseFamilies(raw);
  }

  var FAMILY_CHIP_LIMIT = 6;

  function aliasMatches(name, group) {
    var k = familyKey(name);
    if (!k || !group) return false;
    if (familyKey(group.canon) === k) return true;
    var i;
    for (i = 0; i < (group.aliases || []).length; i++) {
      if (familyKey(group.aliases[i]) === k) return true;
    }
    return false;
  }

  /** Canonical spelling after collapse. Does not rewrite the playbook row. */
  function canonicalFamily(name, groups) {
    var typed = canonFamily(name);
    if (!typed) return "";
    var i;
    for (i = 0; i < (groups || []).length; i++) {
      if (aliasMatches(typed, groups[i])) return groups[i].canon;
    }
    return typed;
  }

  /**
   * Offered set = playbook families ∪ map families, collapsed.
   * Ranked by snaps already mapped. Chips = top FAMILY_CHIP_LIMIT.
   */
  function offerFamilies(playbook, maps, playRows) {
    var raw = [];
    (playbook || []).forEach(function (p) {
      if (p && p.family) raw.push(p.family);
    });
    (maps || []).forEach(function (m) {
      if (m && m.family) raw.push(m.family);
    });
    var col = collapseFamilies(raw);
    var byNorm = Object.create(null);
    (maps || []).forEach(function (m) {
      if (!m) return;
      var k = normCall(m.raw_call_norm || m.raw_call);
      if (k) byNorm[k] = m;
    });
    var snapByStored = Object.create(null);
    (playRows || []).forEach(function (r) {
      var t = String((r && r.play) || "").trim();
      if (!t) return;
      var m = byNorm[normCall(t)];
      if (!m || !m.family) return;
      var fam = canonFamily(m.family);
      snapByStored[fam] = (snapByStored[fam] || 0) + 1;
    });
    var ranked = (col.groups || []).map(function (g) {
      var snaps = 0;
      (g.aliases || []).forEach(function (a) {
        snaps += snapByStored[a] || 0;
      });
      return { family: g.canon, aliases: g.aliases, snaps: snaps };
    });
    ranked.sort(function (a, b) {
      return b.snaps - a.snaps || a.family.localeCompare(b.family);
    });
    return {
      families: ranked.map(function (x) { return x.family; }),
      familyChips: ranked.slice(0, FAMILY_CHIP_LIMIT).map(function (x) { return x.family; }),
      notices: col.notices,
      groups: col.groups,
      ranked: ranked,
    };
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

  function rowsSig(rows) {
    try { return JSON.stringify(rows || []); } catch (e) { return ""; }
  }

  function applyRows(teamId, rows) {
    var next = rows || [];
    var same = _hydrated && _mapTeamId === (teamId || "") && rowsSig(_mapRows) === rowsSig(next);
    _mapRows = next;
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
    if (!same) afterHydrate();
    return _mapRows;
  }

  function setCache(teamId, rows) {
    return applyRows(teamId, rows);
  }

  function loadCache(teamId) {
    return applyRows(teamId, readStore(teamId));
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

  var PLAY_TYPE_TOKENS = {
    pass: 1,
    run: 1,
    rush: 1,
    play: 1,
    "2 pt": 1,
    "2pt": 1,
    "2 point": 1,
    "2point": 1,
    "extra point": 1,
  };

  /** PlayType / ST label in the play column (Pass / Run / 2-pt / Extra Point / PLAY). Not a playbook call. */
  function isPlayTypeToken(raw) {
    return !!PLAY_TYPE_TOKENS[normCall(raw)];
  }

  function rowGameLabel(r) {
    var opp = String((r && (r.opponent || r.opp)) || "").trim();
    var week = String((r && (r.week || r.gameWeek)) || "").trim();
    var date = String((r && r.date) || "").trim();
    if (opp && week) return opp + " · " + week;
    if (opp && date) return opp + " · " + date;
    if (opp) return opp;
    if (week) return week;
    if (date) return date;
    return "unknown game";
  }

  function uniqueSources(rows) {
    var seen = Object.create(null);
    var out = [];
    (rows || []).forEach(function (r) {
      var lab = rowGameLabel(r);
      if (seen[lab]) return;
      seen[lab] = 1;
      out.push(lab);
    });
    return out;
  }

  function inventoryCalls(rows, maps, playbook, opts) {
    opts = opts || {};
    var groups = opts.groups;
    var byNorm = Object.create(null);
    (maps || []).forEach(function (m) {
      if (!m) return;
      var k = normCall(m.raw_call_norm || m.raw_call);
      if (k) byNorm[k] = m;
    });
    var counts = Object.create(null);
    var byRaw = Object.create(null);
    (rows || []).forEach(function (r) {
      var t = String((r && r.play) || "").trim();
      if (!t) return;
      counts[t] = (counts[t] || 0) + 1;
      if (!byRaw[t]) byRaw[t] = [];
      byRaw[t].push(r);
    });
    var junk = [];
    var items = [];
    Object.keys(counts).forEach(function (raw) {
      var rec = {
        raw: raw,
        n: counts[raw],
        sources: uniqueSources(byRaw[raw]),
        mapped: byNorm[normCall(raw)] || null,
        book: findPlaybook(playbook, raw),
      };
      rec.suggestedFamilyBook = !rec.mapped && rec.book && rec.book.family ? canonFamily(rec.book.family) : null;
      rec.suggestedFamily = rec.suggestedFamilyBook
        ? canonicalFamily(rec.suggestedFamilyBook, groups)
        : null;
      rec.suggestedPlayId = !rec.mapped && rec.book && rec.book.id ? rec.book.id : null;
      if (isPlayTypeToken(raw)) junk.push(rec);
      else items.push(rec);
    });
    items.sort(function (a, b) {
      return b.n - a.n || a.raw.localeCompare(b.raw);
    });
    junk.sort(function (a, b) {
      return b.n - a.n || a.raw.localeCompare(b.raw);
    });
    var mappedOnlySnaps = 0;
    var bookOnlySnaps = 0;
    var totalSnaps = 0;
    items.forEach(function (it) {
      totalSnaps += it.n;
      if (it.mapped) mappedOnlySnaps += it.n;
      else if (it.book && it.book.family) bookOnlySnaps += it.n;
    });
    var resolvedSnaps = mappedOnlySnaps + bookOnlySnaps;
    var junkSnaps = 0;
    junk.forEach(function (it) { junkSnaps += it.n; });
    return {
      items: items,
      junk: junk,
      junkSnaps: junkSnaps,
      unmapped: items.filter(function (i) { return !i.mapped; }),
      mapped: items.filter(function (i) { return !!i.mapped; }),
      mappedOnlySnaps: mappedOnlySnaps,
      bookOnlySnaps: bookOnlySnaps,
      resolvedSnaps: resolvedSnaps,
      mappedSnaps: resolvedSnaps,
      totalSnaps: totalSnaps,
      stems: suggestStems(items),
    };
  }

  function coverageCounts(inv) {
    inv = inv || {};
    return {
      total: inv.totalSnaps || 0,
      mapped: inv.mappedOnlySnaps || 0,
      fromBook: inv.bookOnlySnaps || 0,
      resolved: inv.resolvedSnaps != null ? inv.resolvedSnaps : (inv.mappedSnaps || 0),
    };
  }

  /** One definition: resolved = map rows + playbook name matches. */
  function coverageLine(inv, resolvedSet) {
    var c = resolvedSet || coverageCounts(inv);
    if (!c.total) {
      if (inv && inv.junk && inv.junk.length) {
        return "No mappable calls yet — play-type labels are listed separately.";
      }
      return "No charted own-offense calls yet.";
    }
    var pct = Math.round((c.resolved / c.total) * 100);
    var line = c.resolved + " of " + c.total + " calls resolve — " + c.mapped + " you mapped, " + c.fromBook + " from your playbook = " + pct + "%.";
    var junkN = inv && inv.junkSnaps != null ? inv.junkSnaps : 0;
    if (!junkN && inv && inv.junk && inv.junk.length) {
      junkN = inv.junk.reduce(function (a, x) { return a + (x.n || 0); }, 0);
    }
    if (junkN) {
      line += " " + junkN + " play-type label" + (junkN === 1 ? "" : "s") + " set aside.";
    }
    return line;
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
    var offer = offerFamilies(opts.playbook || [], resolved.rows, playRows);
    var inv = inventoryCalls(playRows, resolved.rows, opts.playbook || [], { groups: offer.groups });
    return {
      state: "ready",
      statusText: coverageLine(inv, coverageCounts(inv)),
      inv: inv,
      families: offer.families,
      familyChips: offer.familyChips,
      familyGroups: offer.groups,
      familyNotices: offer.notices,
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

  /** Hudl RESULT only. Live hit/miss and blank are not inferred. */
  function resultKind(raw) {
    var s = String(raw == null ? "" : raw).trim().toLowerCase();
    if (!s) return "";
    if (/penalt/.test(s)) return "penalty";
    if (/sack/.test(s)) return "sack";
    if (/incomplete/.test(s)) return "incomplete";
    if (/intercept|\bint\b/.test(s)) return "incomplete";
    if (/complete/.test(s)) return "complete";
    if (/scramble/.test(s)) return "scramble";
    if (/fumble/.test(s)) return "fumble";
    if (/^rush/.test(s)) return "rush";
    return "other";
  }

  function isPassSnap(row) {
    if (/pass/i.test((row && row.playType) || "")) return true;
    var k = resultKind(row && row.result);
    return k === "complete" || k === "incomplete" || k === "sack";
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
    var junkN = 0;
    var leakedDefense = 0;
    var list = (rows || []).filter(function (r) {
      var t = r && String(r.play || "").trim();
      if (!t) return false;
      if (isPlayTypeToken(t)) {
        junkN += 1;
        var tok = normCall(t);
        if (tok === "pass" || tok === "run" || tok === "run m") leakedDefense += 1;
        return false;
      }
      return true;
    });
    var offer = offerFamilies(playbook, maps, list);
    var resolved = list.map(function (r) {
      var hit = r.family && r.family !== "UNMAPPED"
        ? { family: canonFamily(r.family), concept: r.concept || canonFamily(r.play), play_id: r.play_id || null, source: "row" }
        : resolveCall(r.play, { playbook: playbook, maps: maps });
      if (hit.family && hit.family !== "UNMAPPED") {
        hit = {
          family: canonicalFamily(hit.family, offer.groups),
          concept: hit.concept,
          play_id: hit.play_id,
          source: hit.source,
        };
      }
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
        var distSum = 0, distN = 0;
        var complete = 0, incomplete = 0, resultKnown = 0, passN = 0, sackN = 0, penaltyN = 0;
        rs.forEach(function (r) {
          var s = successOf(r);
          if (s === 1 || s === 0) {
            known += 1;
            if (s === 1) ok += 1;
            var d = +r.distance;
            if (isFinite(d) && d > 0) {
              distSum += d;
              distN += 1;
            }
          }
          var kind = resultKind(r.result);
          if (kind === "penalty") penaltyN += 1;
          if (kind === "sack") sackN += 1;
          if (isPassSnap(r)) passN += 1;
          if (kind === "complete") { complete += 1; resultKnown += 1; }
          else if (kind === "incomplete") { incomplete += 1; resultKnown += 1; }
        });
        var passFamily = passN * 2 > n;
        return {
          key: k,
          label: k,
          n: n,
          pct: total ? n / total : 0,
          ypp: ypp,
          yppN: gains.length,
          eff: known ? ok / known : null,
          effN: known,
          distAvg: distN ? distSum / distN : null,
          distN: distN,
          comp: passFamily && resultKnown ? complete / resultKnown : null,
          compN: resultKnown,
          passN: passN,
          compThin: passFamily && resultKnown > 0 && resultKnown < 8,
          sackN: sackN,
          penaltyN: penaltyN,
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
      junkN: junkN,
      leakedDefense: leakedDefense,
    };
  }

  root.OFFGRD_PLAY_MAP = {
    MAP_CACHE_KEY: MAP_CACHE_KEY,
    normCall: normCall,
    isBlank: isBlank,
    canonFamily: canonFamily,
    collapseFamilies: collapseFamilies,
    resolveTypedFamily: resolveTypedFamily,
    prepareSave: prepareSave,
    seedFamilies: seedFamilies,
    offerFamilies: offerFamilies,
    canonicalFamily: canonicalFamily,
    FAMILY_CHIP_LIMIT: FAMILY_CHIP_LIMIT,
    suggestStems: suggestStems,
    inventoryCalls: inventoryCalls,
    isPlayTypeToken: isPlayTypeToken,
    coverageCounts: coverageCounts,
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
    resultKind: resultKind,
  };
})(typeof window !== "undefined" ? window : globalThis);
