/**
 * OFFGRD-d-vocab.js — team D Caller call vocabulary.
 *
 * Three ordered lists (FRONT · COVERAGE · BLITZ/STUNT). Fully callable from
 * the name alone. Canonical family mapping is optional and never a gate.
 *
 * D Caller Step 3 only. O Caller opponent-look chips stay generic.
 * Pure + localStorage. Cloud pull/push is optional.
 */
(function (global) {
  "use strict";

  var KINDS = ["front", "coverage", "blitz"];
  var STORE_KEY = "offgrd_d_vocab_v1";
  var MORE_AFTER = 16;
  var OTHER = "other";

  var FRONT_FAMILIES = ["4-3", "3-4", "nickel", "dime", "bear", "odd", "even", "other"];
  var COVERAGE_FAMILIES = ["C0", "C1", "C2", "C3", "C4", "2-man", "match/quarters", "other"];
  var PRESSURE_FAMILIES = ["none", "1-man", "2-man", "zone-blitz", "stunt/twist"];

  var WEST_SEED = {
    team: "Parkway West",
    side: "defense",
    front: ["ALPHA", "BRAVO", "CHARLIE", "DELTA", "ZULU"],
    coverage: [
      "BOSTON", "BUFFALO", "CHICAGO", "CINCY", "DENVER", "DALLAS", "CALI",
      "FLORIDA", "M2M", "ATLANTA", "AKRON", "OMAHA", "ORLANDO", "LOCK CALL"
    ],
    blitz: [
      "SAM", "BILL", "X TAG", "BOSS", "BOW", "BANDIT", "SCOUT",
      "SAM & BILL", "SAM & SCOUT", "BILL & BANDIT", "SAM & BANDIT",
      "BILL & SCOUT", "SCOUT LONG STICK", "BANDIT LONG STICK",
      "SCOUT AND BANDIT LONGSTICK"
    ]
  };

  var _book = null;
  var _teamId = "";
  var _hydrated = false;

  function storage() {
    try {
      if (global && global.localStorage) return global.localStorage;
      if (typeof localStorage !== "undefined") return localStorage;
    } catch (e) {}
    return null;
  }

  /** Match key: UPPERCASE, collapsed whitespace, & and AND are the same token. Never split. */
  function normKey(s) {
    var t = String(s == null ? "" : s)
      .replace(/^\uFEFF/, "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");
    if (!t) return "";
    t = t.replace(/\s*&\s*/g, " AND ");
    t = t.replace(/\s+/g, " ");
    return t;
  }

  function sameCall(a, b) {
    var ka = normKey(a);
    var kb = normKey(b);
    return !!ka && ka === kb;
  }

  function cleanName(raw) {
    var s = String(raw == null ? "" : raw).replace(/^\uFEFF/, "").trim();
    if (!s) return "";
    s = s.replace(/^[\s]*[\d]+[\.\)\:\-][\s]*/, "");
    s = s.replace(/^[\s]*[\-\*\u2022\u00b7\u2013\u2014]+[\s]*/, "");
    s = s.replace(/[\t,;]+$/g, "").trim();
    return s;
  }

  function parseLines(text) {
    var raw = String(text == null ? "" : text).replace(/^\uFEFF/, "");
    var lines = raw.split(/\r?\n/);
    var rows = [];
    var seen = Object.create(null);
    var skippedBlank = 0;
    var skippedDupes = 0;
    for (var i = 0; i < lines.length; i++) {
      var name = cleanName(lines[i]);
      if (!name) {
        skippedBlank++;
        continue;
      }
      var key = normKey(name);
      if (!key) {
        skippedBlank++;
        continue;
      }
      if (seen[key]) {
        skippedDupes++;
        continue;
      }
      seen[key] = true;
      rows.push({ name: name, nameNorm: key });
    }
    return { rows: rows, skippedBlank: skippedBlank, skippedDupes: skippedDupes };
  }

  function emptyKind() {
    return [];
  }

  function emptyBook() {
    return {
      v: 1,
      side: "defense",
      front: emptyKind(),
      coverage: emptyKind(),
      blitz: emptyKind(),
      updatedAt: 0
    };
  }

  function asItem(name, extra) {
    extra = extra || {};
    var display = String(name || "").trim();
    return {
      name: display,
      nameNorm: extra.nameNorm || normKey(display),
      retired: extra.retired === true,
      family: extra.family || null,
      retiredAt: extra.retiredAt || null
    };
  }

  function cloneItems(list) {
    return (Array.isArray(list) ? list : []).map(function (it) {
      if (!it) return null;
      if (typeof it === "string") return asItem(it);
      return asItem(it.name, it);
    }).filter(function (it) {
      return it && it.name && it.nameNorm;
    });
  }

  function normalizeBook(raw) {
    var base = emptyBook();
    if (!raw || typeof raw !== "object") return base;
    base.updatedAt = +raw.updatedAt || 0;
    if (raw.teamId) base.teamId = raw.teamId;
    KINDS.forEach(function (k) {
      base[k] = cloneItems(raw[k]);
    });
    return base;
  }

  function activeItems(book, kind) {
    return cloneItems((book && book[kind]) || []).filter(function (it) {
      return !it.retired;
    });
  }

  function allItems(book, kind) {
    return cloneItems((book && book[kind]) || []);
  }

  function hasActiveVocab(book) {
    var b = book || emptyBook();
    for (var i = 0; i < KINDS.length; i++) {
      if (activeItems(b, KINDS[i]).length) return true;
    }
    return false;
  }

  function findByName(list, name) {
    var key = normKey(name);
    if (!key) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].nameNorm === key) return list[i];
    }
    return null;
  }

  /**
   * Paste is the source of truth for that kind's order and active set.
   * Names not in the paste are retired (never deleted).
   * Re-pasting a retired name un-retires it. Family is kept on rematch.
   */
  function adoptKind(existing, incomingRows) {
    var prior = cloneItems(existing);
    var byKey = Object.create(null);
    prior.forEach(function (it) {
      byKey[it.nameNorm] = it;
    });
    var out = [];
    var seen = Object.create(null);
    (incomingRows || []).forEach(function (r) {
      var name = r && (r.name || r);
      var key = r && r.nameNorm ? r.nameNorm : normKey(name);
      if (!key || seen[key]) return;
      seen[key] = true;
      var prev = byKey[key];
      out.push(asItem(name, {
        nameNorm: key,
        retired: false,
        family: prev && prev.family ? prev.family : null,
        retiredAt: null
      }));
    });
    prior.forEach(function (it) {
      if (seen[it.nameNorm]) return;
      out.push(asItem(it.name, {
        nameNorm: it.nameNorm,
        retired: true,
        family: it.family,
        retiredAt: it.retiredAt || Date.now()
      }));
    });
    return out;
  }

  function adoptPaste(book, texts) {
    var next = normalizeBook(book);
    texts = texts || {};
    KINDS.forEach(function (k) {
      if (texts[k] == null) return;
      var parsed = parseLines(texts[k]);
      next[k] = adoptKind(next[k], parsed.rows);
    });
    next.updatedAt = Date.now();
    return next;
  }

  function applySeed(book, seed) {
    seed = seed || WEST_SEED;
    var texts = {};
    KINDS.forEach(function (k) {
      texts[k] = (seed[k] || []).join("\n");
    });
    return adoptPaste(book, texts);
  }

  function addName(book, kind, name) {
    if (KINDS.indexOf(kind) < 0) return normalizeBook(book);
    var next = normalizeBook(book);
    var parsed = parseLines(String(name || ""));
    if (!parsed.rows.length) return next;
    var row = parsed.rows[0];
    var hit = findByName(next[kind], row.name);
    if (hit) {
      hit.retired = false;
      hit.retiredAt = null;
      hit.name = row.name;
      hit.nameNorm = row.nameNorm;
    } else {
      next[kind] = next[kind].concat([asItem(row.name, row)]);
    }
    next.updatedAt = Date.now();
    return next;
  }

  function renameName(book, kind, fromName, toName) {
    if (KINDS.indexOf(kind) < 0) return normalizeBook(book);
    var next = normalizeBook(book);
    var item = findByName(next[kind], fromName);
    var cleaned = cleanName(toName);
    if (!item || !cleaned) return next;
    var newKey = normKey(cleaned);
    var clash = findByName(next[kind], cleaned);
    if (clash && clash !== item) return next;
    item.name = cleaned;
    item.nameNorm = newKey;
    next.updatedAt = Date.now();
    return next;
  }

  function retireName(book, kind, name) {
    if (KINDS.indexOf(kind) < 0) return normalizeBook(book);
    var next = normalizeBook(book);
    var item = findByName(next[kind], name);
    if (item && !item.retired) {
      item.retired = true;
      item.retiredAt = Date.now();
      next.updatedAt = Date.now();
    }
    return next;
  }

  function moveName(book, kind, name, dir) {
    if (KINDS.indexOf(kind) < 0) return normalizeBook(book);
    var next = normalizeBook(book);
    var list = next[kind];
    var idx = -1;
    var i;
    for (i = 0; i < list.length; i++) {
      if (sameCall(list[i].name, name)) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return next;
    var dest = idx + (dir < 0 ? -1 : 1);
    if (dest < 0 || dest >= list.length) return next;
    var tmp = list[idx];
    list[idx] = list[dest];
    list[dest] = tmp;
    next.updatedAt = Date.now();
    return next;
  }

  function setFamily(book, kind, name, family) {
    if (KINDS.indexOf(kind) < 0) return normalizeBook(book);
    var next = normalizeBook(book);
    var item = findByName(next[kind], name);
    if (!item) return next;
    var allowed = kind === "front" ? FRONT_FAMILIES : kind === "coverage" ? COVERAGE_FAMILIES : PRESSURE_FAMILIES;
    var fam = family ? String(family).trim() : null;
    if (fam && allowed.indexOf(fam) < 0) return next;
    item.family = fam || null;
    next.updatedAt = Date.now();
    return next;
  }

  function unmappedCount(book) {
    var n = 0;
    KINDS.forEach(function (k) {
      activeItems(book, k).forEach(function (it) {
        if (!it.family) n++;
      });
    });
    return n;
  }

  function mappingHint(book) {
    var n = unmappedCount(book);
    if (!n) return "";
    return n + " call" + (n === 1 ? "" : "s") + " need mapping →";
  }

  function familyOf(book, kind, name) {
    if (!name) return "";
    var item = findByName(allItems(book, kind), name);
    return item && item.family ? item.family : "";
  }

  function familiesFor(book, front, coverage, blitz) {
    return {
      front: familyOf(book, "front", front) || "",
      coverage: familyOf(book, "coverage", coverage) || "",
      pressure: familyOf(book, "blitz", blitz) || ""
    };
  }

  function ensureOther(items) {
    var list = (items || []).slice();
    var has = list.some(function (it) {
      var id = it.id || it.name;
      return sameCall(id, OTHER) || String(id).toLowerCase() === OTHER;
    });
    if (!has) list.push({ id: OTHER, name: OTHER });
    return list;
  }

  function callerLists(book, opts) {
    opts = opts || {};
    var showAll = opts.showAll || {};
    function row(kind, field) {
      var active = activeItems(book, kind);
      var more = false;
      var shown = active;
      if (!opts.expandAll && active.length > MORE_AFTER && !showAll[kind]) {
        shown = active.slice(0, MORE_AFTER - 1);
        more = true;
      }
      var items = shown.map(function (it) {
        return { id: it.name, name: it.name, family: it.family || null };
      });
      items = ensureOther(items);
      return { kind: kind, field: field, items: items, more: more, total: active.length };
    }
    return {
      fronts: row("front", "front"),
      coverages: row("coverage", "coverage"),
      pressures: row("blitz", "pressure")
    };
  }

  function formatCall(front, coverage, blitz) {
    return [front, coverage, blitz]
      .map(function (s) {
        return String(s == null ? "" : s).trim();
      })
      .filter(function (s) {
        return s && !/^none$/i.test(s);
      })
      .join(" · ");
  }

  function callOfRecord(snap) {
    if (!snap) return "";
    var front = snap.dCallFront || snap.front || "";
    var cov = snap.dCallCoverage || snap.coverage || "";
    var blitz = snap.dCallBlitz || snap.pressure || "";
    return formatCall(front, cov, blitz);
  }

  function payloadFromSit(sit, book) {
    var front = sit && sit.front ? sit.front : "";
    var cov = sit && sit.coverage ? sit.coverage : "";
    var blitz = sit && sit.pressure ? sit.pressure : "";
    var fam = familiesFor(book, front, cov, blitz);
    return {
      front: front,
      coverage: cov,
      pressure: blitz,
      dCallFront: front,
      dCallCoverage: cov,
      dCallBlitz: blitz,
      frontFamily: fam.front,
      coverageFamily: fam.coverage,
      pressureFamily: fam.pressure
    };
  }

  function isSelected(current, id) {
    return sameCall(current, id);
  }

  function readStore(teamId) {
    try {
      var store = storage();
      if (!store) return emptyBook();
      var raw = JSON.parse(store.getItem(STORE_KEY) || "null");
      if (!raw) return emptyBook();
      if (teamId && raw.teamId && raw.teamId !== teamId) return emptyBook();
      return normalizeBook(raw);
    } catch (e) {
      return emptyBook();
    }
  }

  function writeStore(teamId, book) {
    var next = normalizeBook(book);
    next.teamId = teamId || next.teamId || "";
    next.updatedAt = next.updatedAt || Date.now();
    _book = next;
    _teamId = next.teamId || "";
    _hydrated = true;
    try {
      var store = storage();
      if (store) store.setItem(STORE_KEY, JSON.stringify(next));
    } catch (e) {}
    return next;
  }

  function getBook(teamId) {
    if (_book && (!teamId || !_teamId || _teamId === teamId)) return normalizeBook(_book);
    var loaded = readStore(teamId);
    _book = loaded;
    _teamId = teamId || loaded.teamId || "";
    return normalizeBook(_book);
  }

  function setBook(book, teamId) {
    return writeStore(teamId, book);
  }

  function currentTeamId() {
    try {
      if (global.TEAM && global.TEAM.id) return global.TEAM.id;
    } catch (e0) {}
    try {
      var b = global.OFFGRD_CALLER_BRIDGE;
      if (b && typeof b.getTeamId === "function") {
        var id = b.getTeamId();
        if (id) return id;
      }
    } catch (e1) {}
    try {
      var store = storage();
      if (store) return store.getItem("offgrd_team") || "";
    } catch (e2) {}
    return "";
  }

  function adoptRemote(remote, prior, opts) {
    opts = opts || {};
    var Empty = global.OFFGRD_EMPTY_UNKNOWN;
    var loc = normalizeBook(prior);
    if (!remote) {
      if (opts.confirmedEmpty) return emptyBook();
      return hasActiveVocab(loc) || (loc.front && loc.front.length) ? loc : emptyBook();
    }
    var incoming = normalizeBook(remote.payload || remote);
    if (hasActiveVocab(incoming) || (incoming.front && incoming.front.length) || (incoming.coverage && incoming.coverage.length) || (incoming.blitz && incoming.blitz.length)) {
      return incoming;
    }
    var remoteEmpty = !hasActiveVocab(incoming) && !incoming.front.length && !incoming.coverage.length && !incoming.blitz.length;
    if (remoteEmpty && opts.confirmedEmpty) return emptyBook();
    if (Empty && Empty.isUnknownEmpty && Empty.isUnknownEmpty([], { confirmedEmpty: !!opts.confirmedEmpty })) {
      return loc;
    }
    if (hasActiveVocab(loc) || loc.front.length || loc.coverage.length || loc.blitz.length) return loc;
    return incoming;
  }

  function pullBook(teamId) {
    var tid = teamId || currentTeamId();
    var local = getBook(tid);
    var Cloud = global.Cloud;
    if (!Cloud || typeof Cloud.listDVocab !== "function" || !tid) {
      return Promise.resolve(local);
    }
    return Cloud.listDVocab(tid)
      .then(function (rows) {
        var confirmed = !!(rows && rows.confirmedEmpty);
        var row = rows && rows[0] ? rows[0] : null;
        var next = adoptRemote(row, local, { confirmedEmpty: confirmed });
        writeStore(tid, next);
        return getBook(tid);
      })
      .catch(function () {
        return local;
      });
  }

  function pushBook(teamId) {
    var tid = teamId || currentTeamId();
    var book = getBook(tid);
    writeStore(tid, book);
    var Cloud = global.Cloud;
    if (!Cloud || typeof Cloud.upsertDVocab !== "function" || !tid) {
      return Promise.resolve(book);
    }
    return Cloud.upsertDVocab(tid, {
      v: 1,
      side: "defense",
      front: book.front,
      coverage: book.coverage,
      blitz: book.blitz,
      updatedAt: book.updatedAt
    }).then(function () {
      return book;
    }).catch(function () {
      return book;
    });
  }

  function previewSentence(parsed, kind) {
    var n = parsed && parsed.rows ? parsed.rows.length : 0;
    var label = kind === "front" ? "front" : kind === "coverage" ? "coverage" : "blitz/stunt";
    if (!n) return "No " + label + " names in that list.";
    var s = n + " " + label + " call" + (n === 1 ? "" : "s") + ".";
    if (parsed.skippedDupes) {
      s += " " + parsed.skippedDupes + " duplicate" + (parsed.skippedDupes === 1 ? "" : "s") + " reported.";
    }
    return s;
  }

  var API = {
    KINDS: KINDS,
    STORE_KEY: STORE_KEY,
    MORE_AFTER: MORE_AFTER,
    OTHER: OTHER,
    FRONT_FAMILIES: FRONT_FAMILIES,
    COVERAGE_FAMILIES: COVERAGE_FAMILIES,
    PRESSURE_FAMILIES: PRESSURE_FAMILIES,
    WEST_SEED: WEST_SEED,
    normKey: normKey,
    sameCall: sameCall,
    cleanName: cleanName,
    parseLines: parseLines,
    emptyBook: emptyBook,
    normalizeBook: normalizeBook,
    activeItems: activeItems,
    allItems: allItems,
    hasActiveVocab: hasActiveVocab,
    adoptKind: adoptKind,
    adoptPaste: adoptPaste,
    applySeed: applySeed,
    addName: addName,
    renameName: renameName,
    retireName: retireName,
    moveName: moveName,
    setFamily: setFamily,
    unmappedCount: unmappedCount,
    mappingHint: mappingHint,
    familyOf: familyOf,
    familiesFor: familiesFor,
    ensureOther: ensureOther,
    callerLists: callerLists,
    formatCall: formatCall,
    callOfRecord: callOfRecord,
    payloadFromSit: payloadFromSit,
    isSelected: isSelected,
    getBook: getBook,
    setBook: setBook,
    readStore: readStore,
    currentTeamId: currentTeamId,
    adoptRemote: adoptRemote,
    pullBook: pullBook,
    pushBook: pushBook,
    previewSentence: previewSentence
  };

  global.OFFGRD_D_VOCAB = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
