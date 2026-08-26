/**
 * OFFGRD-play-direction.js — strip trailing direction out of a play NAME.
 *
 * Same idea as coverage synonyms (SKY → Cover 3): direction is an attribute,
 * not a different call. HOUSTON WEST → HOUSTON · L when HOUSTON already exists.
 * A play actually named "WEST" is never touched.
 *
 * Pure, DOM-free, testable. No network.
 */
(function (global) {
  "use strict";

  var DEFAULT_TOKEN_SPEC = [
    { token: "WEST", dir: "L" },
    { token: "EAST", dir: "R" },
    { token: "LEFT", dir: "L" },
    { token: "RIGHT", dir: "R" },
    { token: "WST", dir: "L" },
    { token: "EST", dir: "R" },
    { token: "LT", dir: "L" },
    { token: "RT", dir: "R" },
    { token: "L", dir: "L" },
    { token: "R", dir: "R" }
  ];

  var DIR_MAP = Object.create(null);
  DEFAULT_TOKEN_SPEC.forEach(function (t) {
    DIR_MAP[t.token] = t.dir;
  });

  var MIN_SPLIT_N = 8;
  var TOKEN_STORE = "offgrd_dir_tokens_";

  function normName(s) {
    return String(s == null ? "" : s).trim().replace(/\s+/g, " ").toUpperCase();
  }

  function playSide(p) {
    if (!p) return "offense";
    if (p.side === "defense" || p.side === "def") return "defense";
    if (p.side === "offense" || p.side === "off") return "offense";
    if (p.type === "defense" || p.def_call) return "defense";
    return "offense";
  }

  function idOf(p) {
    if (!p) return "";
    return String(p.cid || p.id || "") || ("name:" + normName(p.name) + "|" + playSide(p));
  }

  function defaultTokens() {
    return DEFAULT_TOKEN_SPEC.map(function (t) {
      return { token: t.token, dir: t.dir };
    });
  }

  function parseTokenList(raw) {
    if (!raw) return defaultTokens();
    var parts = [];
    if (Array.isArray(raw)) {
      raw.forEach(function (item) {
        if (!item) return;
        if (typeof item === "object" && item.token) {
          parts.push({
            token: String(item.token).trim().toUpperCase(),
            dir: item.dir === "R" || item.dir === "r" ? "R" : (DIR_MAP[String(item.token).trim().toUpperCase()] || "L")
          });
          return;
        }
        String(item).split(/[,;\n]+/).forEach(function (bit) { parts.push(bit); });
      });
    } else {
      String(raw).split(/[,;\n]+/).forEach(function (bit) { parts.push(bit); });
    }
    var out = [];
    var seen = Object.create(null);
    parts.forEach(function (bit) {
      if (typeof bit === "object" && bit.token) {
        if (seen[bit.token]) return;
        seen[bit.token] = 1;
        out.push(bit);
        return;
      }
      var s = String(bit || "").trim();
      if (!s) return;
      var tok = s;
      var dir = null;
      var eq = s.split("=");
      if (eq.length === 2) {
        tok = eq[0].trim();
        dir = /r/i.test(eq[1]) ? "R" : "L";
      }
      tok = tok.toUpperCase();
      if (!tok || seen[tok]) return;
      seen[tok] = 1;
      out.push({ token: tok, dir: dir || DIR_MAP[tok] || "L" });
    });
    return out.length ? out : defaultTokens();
  }

  function sortTokens(tokens) {
    return (tokens || defaultTokens()).slice().sort(function (a, b) {
      return String(b.token).length - String(a.token).length;
    });
  }

  function tokensFor(opts) {
    opts = opts || {};
    if (opts.tokens) return parseTokenList(opts.tokens);
    if (opts.brand && opts.brand.directionTokens) return parseTokenList(opts.brand.directionTokens);
    var teamId = opts.teamId;
    if (!teamId) {
      try {
        var B = global.OFFGRD_CALLER_BRIDGE;
        if (B && typeof B.getTeamId === "function") teamId = B.getTeamId();
      } catch (e) {}
    }
    if (teamId) {
      try {
        var raw = global.localStorage && localStorage.getItem(TOKEN_STORE + teamId);
        if (raw) return parseTokenList(JSON.parse(raw));
      } catch (e2) {}
    }
    return defaultTokens();
  }

  function saveTokens(teamId, tokens) {
    var list = parseTokenList(tokens);
    if (!teamId) return list;
    try {
      if (global.localStorage) {
        localStorage.setItem(TOKEN_STORE + teamId, JSON.stringify(list.map(function (t) {
          return t.token + "=" + t.dir;
        })));
      }
    } catch (e) {}
    return list;
  }

  function peekTrailing(name, tokens) {
    var s = String(name == null ? "" : name).trim().replace(/\s+/g, " ");
    if (!s) return null;
    var list = sortTokens(tokens);
    var upper = s.toUpperCase();
    for (var i = 0; i < list.length; i++) {
      var tok = String(list[i].token || "").toUpperCase();
      if (!tok) continue;
      if (upper === tok) return null;
      var suffix = " " + tok;
      if (upper.length > suffix.length && upper.slice(upper.length - suffix.length) === suffix) {
        var base = s.slice(0, s.length - tok.length).trim();
        if (!base) return null;
        return { base: base, token: tok, dir: list[i].dir, raw: s };
      }
    }
    return null;
  }

  function nameSet(plays) {
    var set = Object.create(null);
    (plays || []).forEach(function (p) {
      if (!p || !p.name) return;
      var k = playSide(p) + "|" + normName(p.name);
      if (!set[k]) set[k] = p;
      (p.aliases || []).forEach(function (a) {
        var ak = playSide(p) + "|" + normName(a);
        if (!set[ak]) set[ak] = p;
      });
    });
    return set;
  }

  function hasName(set, name, side) {
    return !!(set[(side || "offense") + "|" + normName(name)]);
  }

  /**
   * Strip only when the remainder already exists as a play.
   * playDir wins when already populated.
   */
  function foldName(name, playsOrNames, playDir, tokens) {
    var raw = String(name == null ? "" : name).trim();
    var dirIn = playDir ? String(playDir).trim().toUpperCase().charAt(0) : "";
    if (dirIn && dirIn !== "L" && dirIn !== "R") dirIn = "";
    var peek = peekTrailing(raw, tokens);
    if (!peek) return { name: raw, dir: dirIn || null, stripped: false };
    var exist = Array.isArray(playsOrNames)
      ? nameSet(playsOrNames.map(function (x) {
        return typeof x === "string" ? { name: x, side: "offense" } : x;
      }))
      : (playsOrNames || Object.create(null));
    var side = "offense";
    if (Array.isArray(playsOrNames) && playsOrNames[0] && playsOrNames[0].side) {
      /* keep default; callers pass play objects with side */
    }
    var hit = exist[side + "|" + normName(peek.base)] || exist["defense|" + normName(peek.base)];
    if (!hit && typeof exist[normName(peek.base)] === "object") hit = exist[normName(peek.base)];
    if (!hit && !hasName(exist, peek.base, "offense") && !hasName(exist, peek.base, "defense")) {
      /* also accept a bare name list stored as offense|NAME via nameSet */
      return { name: raw, dir: dirIn || null, stripped: false };
    }
    return {
      name: hit && hit.name ? hit.name : peek.base,
      dir: dirIn || peek.dir,
      stripped: true,
      token: peek.token
    };
  }

  function findPairs(plays, tokens) {
    var list = (plays || []).filter(function (p) { return p && p.name; });
    var byKey = Object.create(null);
    list.forEach(function (p) {
      var k = playSide(p) + "|" + normName(p.name);
      if (!byKey[k]) byKey[k] = p;
    });
    var pairs = [];
    var used = Object.create(null);
    list.forEach(function (p) {
      var peek = peekTrailing(p.name, tokens);
      if (!peek) return;
      var keep = byKey[playSide(p) + "|" + normName(peek.base)];
      if (!keep || keep === p) return;
      var dk = idOf(p);
      if (used[dk]) return;
      used[dk] = 1;
      pairs.push({
        keep: keep,
        drop: p,
        keepName: keep.name,
        dropName: p.name,
        dir: peek.dir,
        token: peek.token,
        side: playSide(p)
      });
    });
    return pairs;
  }

  function findNearMisses(plays, tokens) {
    var list = (plays || []).filter(function (p) { return p && p.name; });
    var byKey = Object.create(null);
    list.forEach(function (p) {
      var k = playSide(p) + "|" + normName(p.name);
      if (!byKey[k]) byKey[k] = p;
    });
    var misses = [];
    var seen = Object.create(null);
    list.forEach(function (p) {
      var peek = peekTrailing(p.name, tokens);
      if (!peek) return;
      var keep = byKey[playSide(p) + "|" + normName(peek.base)];
      if (keep && keep !== p) return;
      var k = playSide(p) + "|" + normName(p.name);
      if (seen[k]) return;
      seen[k] = 1;
      misses.push({
        name: p.name,
        base: peek.base,
        dir: peek.dir,
        token: peek.token,
        side: playSide(p)
      });
    });
    return misses;
  }

  function previewMerge(plays, tokens) {
    var list = Array.isArray(plays) ? plays : [];
    var pairs = findPairs(list, tokens);
    return {
      pairs: pairs,
      nearMisses: findNearMisses(list, tokens),
      beforeCount: list.length,
      afterCount: list.length - pairs.length,
      tokens: tokens || defaultTokens()
    };
  }

  function nearMissClause(preview) {
    var misses = (preview && preview.nearMisses) || [];
    if (!misses.length) return "";
    var names = misses.slice(0, 3).map(function (m) { return m.name; });
    var s = misses.length + " name" + (misses.length === 1 ? "" : "s") +
      " have a direction word but no unmarked twin (" + names.join(", ");
    if (misses.length > 3) s += ", …";
    s += ") — add the twin to merge, or strip the word.";
    return s;
  }

  function previewSentence(preview) {
    var miss = nearMissClause(preview);
    if (!preview || !preview.pairs || !preview.pairs.length) {
      return miss ? "No mirrored plays to merge. " + miss : "No mirrored plays to merge.";
    }
    var n = preview.pairs.length;
    var examples = preview.pairs.slice(0, 3).map(function (p) {
      return p.dropName + " → " + p.keepName + " · " + p.dir;
    });
    var s = "Merged " + n + " mirrored play" + (n === 1 ? "" : "s") + " (" + examples.join("; ");
    if (n > 3) s += "; …";
    s += "). " + preview.beforeCount + " names → " + preview.afterCount + " plays.";
    if (miss) s += " " + miss;
    return s;
  }

  function isDrawnPlay(p) {
    if (!p) return false;
    var S = global.OFFGRD_PLAY_STUBS;
    if (S && typeof S.isDrawn === "function") return S.isDrawn(p);
    var players = p.players || (p.data && p.data.players) || [];
    return Array.isArray(players) && players.some(function (o) {
      return o && Array.isArray(o.route) && o.route.length;
    });
  }

  function applyMerge(plays, pairs) {
    pairs = pairs || [];
    var dropIds = Object.create(null);
    pairs.forEach(function (p) { dropIds[idOf(p.drop)] = p; });
    var out = [];
    (plays || []).forEach(function (p) {
      if (dropIds[idOf(p)]) return;
      out.push(p);
    });
    var remaps = [];
    pairs.forEach(function (p) {
      var keep = null;
      var kid = idOf(p.keep);
      for (var i = 0; i < out.length; i++) {
        if (idOf(out[i]) === kid) { keep = out[i]; break; }
      }
      if (keep) {
        var aliases = Array.isArray(keep.aliases) ? keep.aliases.slice() : [];
        if (aliases.indexOf(p.dropName) < 0) aliases.push(p.dropName);
        keep.aliases = aliases;
        if (!isDrawnPlay(keep) && isDrawnPlay(p.drop)) {
          keep.players = p.drop.players || keep.players;
          keep.defs = p.drop.defs || keep.defs;
          keep.draws = p.drop.draws || keep.draws;
          keep.thumbSvg = p.drop.thumbSvg || keep.thumbSvg;
          keep.stub = false;
          keep.needsDiagram = false;
        }
      }
      remaps.push({
        fromName: p.dropName,
        toName: p.keepName,
        dir: p.dir,
        fromId: p.drop && (p.drop.cid || p.drop.id) || null,
        toId: p.keep && (p.keep.cid || p.keep.id) || null
      });
    });
    return { plays: out, remaps: remaps, droppedIds: remaps.map(function (r) { return r.fromId; }).filter(Boolean) };
  }

  function foldRows(rows, plays, tokens) {
    var set = nameSet(plays);
    return (rows || []).map(function (r) {
      if (!r) return r;
      var rawDir = r.playDir || r.play_dir || r.dir || r.direction || "";
      var folded = foldName(r.play, set, rawDir, tokens);
      if (!folded.stripped && !folded.dir) return r;
      var copy = Object.assign({}, r);
      if (folded.stripped) copy.play = folded.name;
      if (folded.dir && !String(rawDir || "").trim()) {
        copy.playDir = folded.dir;
        copy.play_dir = folded.dir;
      }
      return copy;
    });
  }

  function hideMirrors(plays, tokens) {
    var pairs = findPairs(plays, tokens);
    if (!pairs.length) return plays || [];
    var drop = Object.create(null);
    pairs.forEach(function (p) { drop[idOf(p.drop)] = 1; });
    return (plays || []).filter(function (p) { return !drop[idOf(p)]; });
  }

  function annotateStubPreview(preview, lib, tokens) {
    if (!preview) return preview;
    var exist = nameSet(lib);
    (preview.rows || []).forEach(function (r) {
      if (r.status === "new" && !peekTrailing(r.name, tokens)) {
        exist["offense|" + normName(r.name)] = { name: r.name, side: "offense" };
        exist[preview.side === "defense" ? "defense|" + normName(r.name) : "offense|" + normName(r.name)] = { name: r.name, side: preview.side || "offense" };
      }
    });
    var merged = 0;
    var side = preview.side === "defense" ? "defense" : "offense";
    (preview.rows || []).forEach(function (r) {
      if (r.status !== "new") return;
      var peek = peekTrailing(r.name, tokens);
      if (!peek) return;
      if (!exist[side + "|" + normName(peek.base)]) return;
      r.status = "merge";
      r.mergeInto = peek.base;
      r.dir = peek.dir;
      merged++;
      if (preview.willAdd > 0) preview.willAdd--;
    });
    preview.merged = merged;
    var near = [];
    (preview.rows || []).forEach(function (r) {
      if (r.status !== "new") return;
      var peek = peekTrailing(r.name, tokens);
      if (!peek) return;
      if (exist[side + "|" + normName(peek.base)]) return;
      r.nearMiss = true;
      r.base = peek.base;
      r.dir = peek.dir;
      near.push({ name: r.name, base: peek.base, dir: peek.dir });
    });
    preview.nearMisses = near;
    return preview;
  }

  function stubPreviewSentence(preview, stubSentence) {
    var s = stubSentence || "";
    if (preview && preview.merged) {
      var extra = preview.merged + " mirrored play" + (preview.merged === 1 ? "" : "s") + " folded into an existing name.";
      s = s ? s + " " + extra : extra;
    }
    var miss = nearMissClause(preview);
    if (miss) s = s ? s + " " + miss : miss;
    return s;
  }

  function hashSide(hash) {
    var h = String(hash || "").trim().toUpperCase();
    if (!h || h === "ANY" || h === "M" || h === "MID" || h === "MIDDLE") return "";
    if (h.charAt(0) === "L") return "L";
    if (h.charAt(0) === "R") return "R";
    return "";
  }

  function snapDir(row) {
    var d = String((row && (row.playDir || row.play_dir || row.dir || row.direction)) || "").trim().toUpperCase();
    if (d.charAt(0) === "L") return "L";
    if (d.charAt(0) === "R") return "R";
    return "";
  }

  /** Field = wide side: left hash + R, right hash + L. */
  function toField(row) {
    var h = hashSide(row && (row.hash || row.Hash));
    var d = snapDir(row);
    if (!h || !d) return "";
    if (h === "L" && d === "R") return "field";
    if (h === "R" && d === "L") return "field";
    if (h === "L" && d === "L") return "boundary";
    if (h === "R" && d === "R") return "boundary";
    return "";
  }

  function directionSplit(rows, playName, opts) {
    opts = opts || {};
    var minN = opts.minN != null ? opts.minN : MIN_SPLIT_N;
    var getSuccess = typeof opts.getSuccess === "function" ? opts.getSuccess : function (r) {
      if (!r) return null;
      if (r.success != null && r.success !== "") return +r.success ? 1 : 0;
      return null;
    };
    var want = normName(playName);
    var pool = (rows || []).filter(function (r) { return r && normName(r.play) === want; });
    var field = [];
    var bound = [];
    pool.forEach(function (r) {
      var cut = toField(r);
      if (cut === "field") field.push(r);
      else if (cut === "boundary") bound.push(r);
    });
    function rate(list) {
      var n = 0, hit = 0;
      list.forEach(function (r) {
        var s = getSuccess(r);
        if (s == null) return;
        n++;
        hit += s ? 1 : 0;
      });
      return { n: n, sr: n ? hit / n : 0 };
    }
    var f = rate(field);
    var b = rate(bound);
    var all = rate(pool);
    var show = f.n >= minN || b.n >= minN;
    return {
      n: all.n,
      sr: all.sr,
      field: f,
      boundary: b,
      show: show,
      label: show ? splitLabel(all, f, b, minN) : ""
    };
  }

  function splitLabel(all, field, bound, minN) {
    var bits = [];
    if (all.n) bits.push(Math.round(all.sr * 100) + "% overall");
    if (field.n >= minN) bits.push(Math.round(field.sr * 100) + "% to the field");
    if (bound.n >= minN) bits.push(Math.round(bound.sr * 100) + "% to the boundary");
    return bits.join(" · ");
  }

  var API = {
    DEFAULT_TOKENS: DEFAULT_TOKEN_SPEC,
    MIN_SPLIT_N: MIN_SPLIT_N,
    normName: normName,
    playSide: playSide,
    defaultTokens: defaultTokens,
    parseTokenList: parseTokenList,
    tokensFor: tokensFor,
    saveTokens: saveTokens,
    peekTrailing: peekTrailing,
    foldName: foldName,
    findPairs: findPairs,
    findNearMisses: findNearMisses,
    previewMerge: previewMerge,
    previewSentence: previewSentence,
    applyMerge: applyMerge,
    foldRows: foldRows,
    hideMirrors: hideMirrors,
    annotateStubPreview: annotateStubPreview,
    stubPreviewSentence: stubPreviewSentence,
    directionSplit: directionSplit,
    toField: toField
  };

  global.OFFGRD_PLAY_DIRECTION = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
