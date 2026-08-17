/* ============================================================
   OFFGRD-opp-shells.js — Opponent scout-card grouping (commit 1)
   Shells are derived state: regenerate from SNAP_CORPUS on any device.
   Session cache only — never localStorage, never offgrd_opp_cards_v1.
   Drawn cards (later) live in offgrd_opp_cards, not this module.
   ============================================================ */
(function (root) {
  "use strict";

  /* Scout-card THIN is n<3. Cheat cards use n<5 (OFFGRD-scout-report confLevel).
     Different questions: cheat cards ask "is this tendency stable enough to call from?"
     (need more snaps). Shell cards ask "is this play real enough to print a card?"
     (a 2-snap play is still a play they ran). Do not unify these thresholds. */
  var CARD_THIN_N = 3;
  /* Named export — do not inline 1.25. Strict majority of the group's
     D&D / field-zone distribution (count * 2 > n), not "any 3rd/RZ snap." */
  var OPP_CARD_SIT_WEIGHT = { THIRD_OR_REDZONE_MULT: 1.25 };

  var _cache = Object.create(null);

  function norm(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function isOffSide(side) {
    var s = norm(side);
    return s === "off" || s === "offense" || s === "o";
  }

  function isDefSide(side) {
    var s = norm(side);
    return s === "def" || s === "defense" || s === "d";
  }

  function normSide(side) {
    if (isDefSide(side)) return "def";
    return "off";
  }

  /** Specific charted stunt/blitz label — not bare pressure=yes. */
  function chartedBlitz(row) {
    var b = String((row && row.blitz) || "").trim();
    if (!b) return "";
    if (/^(yes|y|1|true|press|pressure)$/i.test(b)) return "";
    return b;
  }

  function sameOpponent(a, b) {
    return norm(a) === norm(b);
  }

  function playName(row) {
    var p = String((row && row.play) || "").trim();
    if (!p) return "";
    if (/^(n\/?a|none|unknown|unk|-|\?)$/i.test(p)) return "";
    return p;
  }

  /** No tag charted — not a value the canon refused. */
  function isBlankChartTag(raw) {
    var t = String(raw == null ? "" : raw).trim();
    if (!t) return true;
    return /^(n\/?a|none|unknown|unk|-|—|--|\?)$/i.test(t);
  }

  function playTypeOf(row) {
    var t = norm(row && row.playType);
    if (/pass/.test(t)) return "pass";
    if (/run/.test(t)) return "run";
    return t || "";
  }

  function backfieldKey(row) {
    if (row && row.offBackCount != null && row.offBackCount !== "") {
      var n = +row.offBackCount;
      if (!isNaN(n) && n >= 0 && n <= 2) return String(n);
    }
    return norm(row && row.offBackfield);
  }

  function poaKey(row, playType) {
    if (playType === "pass") return norm(row && row.passZone);
    return norm(row && row.gap);
  }

  function distBucket(n) {
    var T = root.OFFGRD_TENDENCIES;
    if (T && typeof T.distBucket === "function") return T.distBucket(n);
    n = +n;
    if (isNaN(n)) return "";
    if (n <= 3) return "1-3";
    if (n <= 6) return "4-6";
    if (n <= 9) return "7-9";
    return "10+";
  }

  function ddKey(row) {
    var d = +((row && row.down) || 0);
    var bucket = distBucket(row && row.distance);
    if (!d && !bucket) return "";
    var ord = ({ 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" })[d] || (d ? d + "th" : "?");
    return bucket ? ord + " & " + bucket : ord;
  }

  function hashKey(row) {
    var h = String((row && row.hash) || "")
      .trim()
      .toUpperCase();
    if (h === "L" || h === "LEFT") return "L";
    if (h === "R" || h === "RIGHT") return "R";
    if (h === "M" || h === "MID" || h === "MIDDLE") return "M";
    return h || "";
  }

  function fieldZoneKey(row) {
    return String((row && row.fieldZone) || "")
      .trim()
      .toUpperCase();
  }

  function formationKey(row) {
    return norm(row && row.formation);
  }

  /**
   * Card unit = (play name if present, else signature) × formation.
   * Named plays do not collapse across formations — alignment is the card.
   */
  function signatureOf(row, side) {
    if (normSide(side) === "def") {
      var front = (row && row.front) || "";
      var cov = (row && row.coverage) || "";
      var blitz = chartedBlitz(row);
      var key = "def:" + norm(front) + "|" + norm(cov) + (blitz ? "|" + norm(blitz) : "");
      return {
        kind: "def",
        play: "",
        rollupKey: "def:" + norm(front),
        key: key,
        front: front,
        coverage: cov,
        blitz: blitz,
      };
    }
    var named = playName(row);
    var form = formationKey(row);
    if (named) {
      return {
        kind: "play",
        play: named,
        rollupKey: "play:" + norm(named),
        key: "play:" + norm(named) + "|" + form,
      };
    }
    var playType = playTypeOf(row);
    var parts = [
      form,
      backfieldKey(row),
      norm(row && row.offStrength),
      playType,
      norm(row && row.direction),
      poaKey(row, playType),
    ];
    return { kind: "signature", play: "", rollupKey: "", key: "sig:" + parts.join("|") };
  }

  function bump(map, key) {
    if (!key) return;
    map[key] = (map[key] || 0) + 1;
  }

  function emptyGroup(sig, sample) {
    return {
      shellKey: sig.key,
      groupKind: sig.kind,
      rollupKey: sig.rollupKey || "",
      rollupLabel: "",
      play: sig.play || playName(sample) || "",
      formation: (sample && sample.formation) || "",
      backfield: (sample && sample.offBackfield) || "",
      backCount: sample && sample.offBackCount != null ? sample.offBackCount : null,
      offStrength: (sample && sample.offStrength) || "",
      playType: playTypeOf(sample),
      direction: (sample && sample.direction) || "",
      gap: (sample && sample.gap) || "",
      passZone: (sample && sample.passZone) || "",
      n: 0,
      thin: false,
      ddDist: {},
      downDist: {},
      fieldZoneDist: {},
      hashSplit: {},
      avgGain: null,
      successRate: null,
      rowIds: [],
      side: sig.kind === "def" ? "def" : "off",
      front: sig.front || (sample && sample.front) || "",
      coverage: sig.coverage || (sample && sample.coverage) || "",
      blitz: sig.blitz || "",
      pressureN: 0,
      pressureRate: 0,
      share: 0,
    };
  }

  function distCount(map, pred) {
    var n = 0;
    Object.keys(map || {}).forEach(function (k) {
      if (pred(k)) n += map[k] || 0;
    });
    return n;
  }

  function isRedZoneKey(k) {
    var u = String(k || "").toUpperCase().replace(/\s+/g, "");
    return u === "REDZONE" || u === "RZ" || u === "RED" || u === "GOALLINE" || u === "GL";
  }

  /** weight = n, ×1.25 if the group is strictly majority 3rd down or red zone. */
  function situationWeight(group) {
    var n = +((group && group.n) || 0);
    if (!n) return 0;
    var third = distCount(group.downDist, function (k) { return String(k) === "3"; });
    var rz = distCount(group.fieldZoneDist, isRedZoneKey);
    var boost = third * 2 > n || rz * 2 > n;
    return n * (boost ? OPP_CARD_SIT_WEIGHT.THIRD_OR_REDZONE_MULT : 1);
  }

  function finishGroup(g, gainSum, gainN, successN, successTot) {
    g.thin = g.n < CARD_THIN_N;
    g.sitWeight = situationWeight(g);
    g.avgGain = gainN ? Math.round((gainSum / gainN) * 10) / 10 : null;
    g.successRate = successTot ? Math.round((successN / successTot) * 100) / 100 : null;
    return g;
  }

  function queueCompare(a, b) {
    var at = a && a.thin ? 1 : 0;
    var bt = b && b.thin ? 1 : 0;
    if (at !== bt) return at - bt;
    var au = a && a.unchartedFormation ? 1 : 0;
    var bu = b && b.unchartedFormation ? 1 : 0;
    if (au !== bu) return au - bu;
    var aw = a && a.sitWeight != null ? a.sitWeight : situationWeight(a);
    var bw = b && b.sitWeight != null ? b.sitWeight : situationWeight(b);
    if (bw !== aw) return bw - aw;
    if (((b && b.n) || 0) !== ((a && a.n) || 0)) return ((b && b.n) || 0) - ((a && a.n) || 0);
    return String((a && (a.shellKey || a.name)) || "").localeCompare(String((b && (b.shellKey || b.name)) || ""));
  }

  function coverageOf(cards, total, topN, side) {
    var def = normSide(side) === "def";
    topN = topN == null ? (def ? 6 : 12) : topN;
    var list = cards || [];
    var take = Math.min(topN, list.length);
    var snaps = 0;
    for (var i = 0; i < take; i++) snaps += (list[i] && list[i].n) || 0;
    var tot = +total || 0;
    var pct = tot ? Math.round((snaps / tot) * 100) : 0;
    return {
      topCount: take,
      snaps: snaps,
      total: tot,
      pct: pct,
      header: def
        ? ("Top " + take + " looks = " + pct + "% of their defensive snaps.")
        : ("Top " + take + " plays = " + pct + "% of their snaps."),
      selectedHeader: def
        ? ("Selected " + take + " looks = " + pct + "% of their defensive snaps.")
        : ("Selected " + take + " plays = " + pct + "% of their snaps."),
      weightHint: def
        ? ("Top " + take + " by weight = " + pct + "% of their defensive snaps.")
        : ("Top " + take + " by weight = " + pct + "% of their snaps."),
    };
  }

  function printFooterLine(opts) {
    opts = opts || {};
    var drawn = +opts.drawnCount || 0;
    var shells = +opts.shellCount || 0;
    var pct = opts.pct != null ? opts.pct : 0;
    var snapWord = normSide(opts.side) === "def" ? "D snaps" : "snaps";
    var line = drawn + " drawn · " + shells + " shells · " + pct + "% of " + snapWord;
    if (opts.opponent) line += " · " + opts.opponent;
    return line;
  }

  function filterRows(rows, opponent, side) {
    var opp = String(opponent || "").trim();
    if (!opp) return [];
    var want = normSide(side);
    return (rows || []).filter(function (r) {
      if (!r || !sameOpponent(r.opponent, opp)) return false;
      return want === "def" ? isDefSide(r.side) : isOffSide(r.side);
    });
  }

  function filterOffRows(rows, opponent) {
    return filterRows(rows, opponent, "off");
  }

  function cacheKey(rows, opponent, side) {
    var list = rows || [];
    var first = list[0] || {};
    var last = list[list.length - 1] || {};
    return [
      normSide(side),
      norm(opponent),
      list.length,
      first.id || first.play || "",
      last.id || last.play || "",
    ].join("\0");
  }

  /**
   * Group verified SNAP_CORPUS rows for one opponent + side (off default).
   * Always recomputes (and refreshes the session cache).
   */
  function groupRows(rows, opponent, side) {
    var opp = String(opponent || "").trim();
    var want = normSide(side);
    var scoped = filterRows(rows, opp, want);
    var by = Object.create(null);
    var order = [];
    var gainSum = Object.create(null);
    var gainN = Object.create(null);
    var successN = Object.create(null);
    var successTot = Object.create(null);

    scoped.forEach(function (row) {
      var sig = signatureOf(row, want);
      var g = by[sig.key];
      if (!g) {
        g = emptyGroup(sig, row);
        by[sig.key] = g;
        order.push(sig.key);
        gainSum[sig.key] = 0;
        gainN[sig.key] = 0;
        successN[sig.key] = 0;
        successTot[sig.key] = 0;
      }
      g.n += 1;
      if (row.id) g.rowIds.push(row.id);
      bump(g.ddDist, ddKey(row));
      if (row.down != null && String(row.down).trim() !== "") {
        bump(g.downDist, String(+row.down));
      }
      bump(g.fieldZoneDist, fieldZoneKey(row));
      bump(g.hashSplit, hashKey(row));
      if (+row.pressure === 1 || row.pressure === true || row.pressure === "1") g.pressureN += 1;
      var gn = +row.gain;
      if (!isNaN(gn) && row.gain != null && row.gain !== "") {
        gainSum[sig.key] += gn;
        gainN[sig.key] += 1;
      }
      if (row.success === 1 || row.success === true || row.success === "1") {
        successN[sig.key] += 1;
        successTot[sig.key] += 1;
      } else if (row.success === 0 || row.success === false || row.success === "0") {
        successTot[sig.key] += 1;
      }
    });

    var groups = order.map(function (k) {
      return finishGroup(by[k], gainSum[k], gainN[k], successN[k], successTot[k]);
    });
    groups.sort(function (a, b) {
      if (b.n !== a.n) return b.n - a.n;
      return String(a.shellKey).localeCompare(String(b.shellKey));
    });

    var rollupN = Object.create(null);
    var rollupLooks = Object.create(null);
    groups.forEach(function (g) {
      if (!g.rollupKey) return;
      rollupN[g.rollupKey] = (rollupN[g.rollupKey] || 0) + g.n;
      rollupLooks[g.rollupKey] = (rollupLooks[g.rollupKey] || 0) + 1;
    });
    var rollups = Object.keys(rollupLooks).map(function (k) {
      var looks = rollupLooks[k];
      var play = (groups.find(function (g) { return g.rollupKey === k; }) || {}).play || "";
      var label = looks > 1 ? play + " · " + looks + " looks" : play;
      return { rollupKey: k, play: play, lookCount: looks, n: rollupN[k], label: label };
    });
    groups.forEach(function (g) {
      if (!g.rollupKey) return;
      var r = rollups.find(function (x) { return x.rollupKey === g.rollupKey; });
      g.rollupLabel = r ? r.label : g.play;
    });

    var sumN = 0;
    groups.forEach(function (g) { sumN += g.n; });
    groups.forEach(function (g) {
      g.share = sumN ? g.n / sumN : 0;
      g.pressureRate = g.n ? g.pressureN / g.n : 0;
    });
    var result = {
      opponent: opp,
      side: want,
      total: scoped.length,
      sumN: sumN,
      groups: groups,
      rollups: rollups,
    };
    if (opp) _cache[cacheKey(scoped, opp, want)] = result;
    return result;
  }

  /** Session-cached grouping. Same opponent + side + same scoped rows → same object. */
  function groupsFor(rows, opponent, side) {
    var opp = String(opponent || "").trim();
    var want = normSide(side);
    var scoped = filterRows(rows, opp, want);
    var key = cacheKey(scoped, opp, want);
    if (_cache[key]) return _cache[key];
    return groupRows(rows, opponent, want);
  }

  function clearCache() {
    _cache = Object.create(null);
  }

  function shellKeyOf(row, side) {
    return signatureOf(row, side).key;
  }

  /**
   * Every verified row for this opponent + side must land in exactly one group.
   * sum(group.n) === scoped row count. No drops, no double-counts.
   */
  function reconcile(rows, opponent, side) {
    var want = normSide(side);
    var scoped = filterRows(rows, opponent, want);
    var grouped = groupRows(rows, opponent, want);
    var seenIds = Object.create(null);
    var dupIds = [];
    var missing = 0;
    var byKey = Object.create(null);
    grouped.groups.forEach(function (g) {
      byKey[g.shellKey] = g;
      (g.rowIds || []).forEach(function (id) {
        if (seenIds[id]) dupIds.push(id);
        seenIds[id] = (seenIds[id] || 0) + 1;
      });
    });
    scoped.forEach(function (row) {
      var key = shellKeyOf(row, want);
      if (!byKey[key]) missing += 1;
    });
    var ok = grouped.sumN === scoped.length && !dupIds.length && missing === 0;
    return {
      opponent: String(opponent || "").trim(),
      side: want,
      verifiedOffRows: scoped.length,
      verifiedRows: scoped.length,
      groupCount: grouped.groups.length,
      sumN: grouped.sumN,
      missing: missing,
      duplicateIds: dupIds,
      ok: ok,
      groups: grouped.groups.map(function (g) {
        return { shellKey: g.shellKey, play: g.play || "(unnamed)", formation: g.formation, n: g.n };
      }),
    };
  }

  /* ---------- drawn-card cache (gameday pattern: local first, Cloud when online) ---------- */
  var DRAWN_CACHE_KEY = "offgrd_opp_cards_cache";

  function loadDrawnCache(teamId) {
    try {
      var raw = JSON.parse(localStorage.getItem(DRAWN_CACHE_KEY) || "{}");
      if (!raw || (teamId && raw.teamId && raw.teamId !== teamId)) return [];
      return Array.isArray(raw.rows) ? raw.rows : [];
    } catch (e) {
      return [];
    }
  }

  function saveDrawnCache(teamId, rows) {
    try {
      localStorage.setItem(
        DRAWN_CACHE_KEY,
        JSON.stringify({ teamId: teamId || "", rows: rows || [], updatedAt: Date.now() })
      );
    } catch (e) {}
  }

  function filterDrawn(rows, opponent) {
    var list = rows || [];
    if (!opponent) return list.slice();
    return list.filter(function (r) {
      return sameOpponent(r.opponent, opponent);
    });
  }

  function mergeDrawn(cloud, local) {
    var byKey = Object.create(null);
    (cloud || []).forEach(function (c) {
      var k = norm(c.opponent) + "\0" + String(c.shell_key || c.shellKey || "");
      byKey[k] = c;
    });
    (local || []).forEach(function (p) {
      if (p.id || p.cid) return;
      var k = norm(p.opponent) + "\0" + String(p.shell_key || p.shellKey || "");
      if (!byKey[k]) byKey[k] = p;
    });
    return Object.keys(byKey).map(function (k) {
      return byKey[k];
    });
  }

  function pullDrawn(teamId, opponent) {
    var local = loadDrawnCache(teamId);
    var Cloud = root.Cloud;
    if (!Cloud || !Cloud.listOppCards || !teamId) {
      return Promise.resolve(filterDrawn(local, opponent));
    }
    return Cloud.listOppCards(teamId, opponent)
      .then(function (cloud) {
        var merged = mergeDrawn(cloud, local);
        saveDrawnCache(teamId, merged);
        return filterDrawn(merged, opponent);
      })
      .catch(function () {
        return filterDrawn(local, opponent);
      });
  }

  function upsertDrawnLocal(teamId, card) {
    var rows = loadDrawnCache(teamId);
    var key = String(card.shell_key || card.shellKey || "");
    var idx = -1;
    for (var i = 0; i < rows.length; i++) {
      if (sameOpponent(rows[i].opponent, card.opponent) && String(rows[i].shell_key || rows[i].shellKey || "") === key) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) rows[idx] = Object.assign({}, rows[idx], card);
    else rows.push(card);
    saveDrawnCache(teamId, rows);
    return card;
  }

  function pushDrawn(teamId, card) {
    upsertDrawnLocal(teamId, card);
    var Cloud = root.Cloud;
    if (!Cloud || !Cloud.upsertOppCard || !teamId) return Promise.resolve(card);
    return Cloud.upsertOppCard(teamId, card)
      .then(function (saved) {
        if (saved && saved.id) {
          card.id = saved.id;
          upsertDrawnLocal(teamId, Object.assign({}, card, saved));
        }
        return saved || card;
      })
      .catch(function () {
        return card;
      });
  }

  /* ---------- shell rendering (shared OFFGRD_RENDER only) ---------- */
  var LOS_Y = 380;
  var BALL_X = 500;
  var PPY = 11;

  function dirSign(direction, offStrength) {
    var d = String(direction || "").toUpperCase();
    if (d === "L") return -1;
    if (d === "R") return 1;
    var s = norm(offStrength);
    if (s === "left") return -1;
    if (s === "right") return 1;
    return 1;
  }

  function resolveFormation(raw) {
    var FC = root.OFFGRD_FORMATION_CANON;
    var fallback = FC && typeof FC.getById === "function" ? FC.getById("DOUBLES_2X2") : null;
    var trimmed = String(raw || "").trim();
    /* No OFF FORM tag is not an error — keep a placement fallback, do not reject. */
    if (isBlankChartTag(trimmed)) return { formation: fallback, unresolved: false, uncharted: true };
    var tries = [
      trimmed,
      trimmed.replace(/\s*\([^)]*\)\s*$/, ""),
      trimmed.replace(/\s+(gun|pistol|under)\s*$/i, ""),
    ];
    var f = null;
    if (FC && typeof FC.resolve === "function") {
      for (var i = 0; i < tries.length; i++) {
        f = FC.resolve(tries[i]);
        if (f) return { formation: f, unresolved: false, uncharted: false };
      }
    }
    return { formation: fallback, unresolved: true, uncharted: false };
  }

  function gapTarget(gap, sign) {
    var g = norm(gap);
    var lat = 28;
    if (g === "b") lat = 70;
    else if (g === "c") lat = 130;
    else if (g === "d" || g === "edge" || g === "e") lat = 190;
    else if (g === "a" || !g) lat = 28;
    return { x: BALL_X + sign * lat, y: LOS_Y - 42 };
  }

  function zoneHint(group) {
    var z = norm(group && group.passZone);
    if (z) return z;
    var p = norm(group && group.play);
    if (/smash/.test(p)) return "smash";
    if (/slant/.test(p) && /flat/.test(p)) return "slant-flat";
    if (/hitch/.test(p)) return "hitch";
    if (/stick/.test(p)) return "stick";
    if (/flood/.test(p)) return "flood";
    if (/slant/.test(p)) return "slant";
    if (/flat/.test(p)) return "flat";
    if (/curl/.test(p)) return "curl";
    return z;
  }

  function zonePoints(hint, sign) {
    var h = norm(hint);
    if (h === "smash") {
      return [
        { x: BALL_X + sign * 280, y: LOS_Y - 6 * PPY, label: "SMASH" },
        { x: BALL_X + sign * 310, y: LOS_Y - 16 * PPY, label: "" },
      ];
    }
    if (h === "slant-flat") {
      return [
        { x: BALL_X + sign * 90, y: LOS_Y - 6 * PPY, label: "SLANT" },
        { x: BALL_X + sign * 320, y: LOS_Y - 4 * PPY, label: "FLAT" },
      ];
    }
    if (h === "flood") {
      return [
        { x: BALL_X + sign * 310, y: LOS_Y - 4 * PPY, label: "FLAT" },
        { x: BALL_X + sign * 290, y: LOS_Y - 12 * PPY, label: "OUT" },
        { x: BALL_X + sign * 300, y: LOS_Y - 18 * PPY, label: "FLOOD" },
      ];
    }
    if (h === "stick") return [{ x: BALL_X + sign * 170, y: LOS_Y - 5 * PPY, label: "STICK" }];
    if (h === "hitch") {
      return [
        { x: BALL_X + sign * 220, y: LOS_Y - 6 * PPY, label: "HITCH" },
        { x: BALL_X - sign * 220, y: LOS_Y - 6 * PPY, label: "HITCH" },
      ];
    }
    if (h === "slant") return [{ x: BALL_X + sign * 90, y: LOS_Y - 6 * PPY, label: "SLANT" }];
    if (h === "flat") return [{ x: BALL_X + sign * 320, y: LOS_Y - 4 * PPY, label: "FLAT" }];
    if (h === "curl") return [{ x: BALL_X + sign * 200, y: LOS_Y - 12 * PPY, label: "CURL" }];
    return [{ x: BALL_X + sign * 180, y: LOS_Y - 10 * PPY, label: (hint || "ZONE").toUpperCase() }];
  }

  function clonePlayers(arr) {
    try {
      return JSON.parse(JSON.stringify(arr || []));
    } catch (e) {
      return (arr || []).slice();
    }
  }

  function buildShell(group) {
    var g = group || {};
    var resolved = resolveFormation(g.formation);
    var players = [];
    var FC = root.OFFGRD_FORMATION_CANON;
    if (resolved.formation && FC && typeof FC.playersFromFormation === "function") {
      try {
        players = clonePlayers(FC.playersFromFormation(resolved.formation));
      } catch (e) {
        resolved = { formation: FC.getById && FC.getById("DOUBLES_2X2"), unresolved: !resolved.uncharted, uncharted: !!resolved.uncharted };
        try {
          players = clonePlayers(FC.playersFromFormation(resolved.formation));
        } catch (e2) {
          players = [];
        }
      }
    }
    players.forEach(function (p, i) {
      p.id = i;
      p.route = [];
      p.motion = [];
      if (p.ol) {
        p.type = "block";
        p.ol = 1;
      }
    });

    var playType = playTypeOf({ playType: g.playType });
    var sign = dirSign(g.direction, g.offStrength);
    var draws = [];
    var texts = [];
    var qb = players.filter(function (p) { return p.type === "qb" || p.lab === "QB"; })[0];
    var rb = players.filter(function (p) { return p.type === "rb"; })[0];

    if (playType === "run" && rb) {
      var tgt = gapTarget(g.gap, sign);
      rb.route = [
        { x: Math.round((rb.x + tgt.x) / 2), y: Math.round(LOS_Y + 8) },
        { x: Math.round(tgt.x), y: Math.round(tgt.y) },
      ];
      rb.dashed = false;
    } else if (playType === "pass") {
      var origin = qb || { x: BALL_X, y: LOS_Y + 5 * PPY };
      zonePoints(zoneHint(g), sign).forEach(function (z) {
        draws.push({
          pts: [
            { x: origin.x, y: origin.y - 8 },
            { x: Math.round(z.x), y: Math.round(z.y) },
          ],
          color: "#bfe3ff",
          dashed: true,
        });
        if (z.label) {
          texts.push({
            x: Math.round(z.x),
            y: Math.round(z.y) - 14,
            text: z.label,
            size: 13,
            color: "#bfe3ff",
          });
        }
      });
    }

    var displayForm = resolved.uncharted
      ? ""
      : ((resolved.formation && resolved.formation.display) || g.formation || "");
    var name = g.play || [g.playType, g.direction, g.gap || g.passZone].filter(Boolean).join(" ") || "Opp play";
    return {
      id: "shell-" + g.shellKey,
      name: name,
      formation: displayForm,
      personnel: resolved.uncharted ? "" : ((resolved.formation && resolved.formation.personnel) || ""),
      opponent: g.opponent || "",
      cardStatus: "shell",
      shellKey: g.shellKey,
      n: g.n,
      thin: !!g.thin,
      sitWeight: g.sitWeight != null ? g.sitWeight : situationWeight(g),
      unchartedFormation: !!resolved.uncharted,
      unresolvedFormation: !!resolved.unresolved && !resolved.uncharted,
      rollupLabel: g.rollupLabel || "",
      play: g.play || "",
      playType: playType,
      direction: g.direction || "",
      gap: g.gap || "",
      passZone: g.passZone || "",
      offStrength: g.offStrength || "",
      offBackfield: g.backfield || "",
      players: players,
      defs: [],
      texts: texts,
      draws: draws,
      field: "High School",
    };
  }

  var FRONT_ALIASES = {
    "42 over-g": "4-3",
    "42 over": "4-3",
    "42 under": "4-3",
    "4-3 over": "4-3",
    "4-3 under": "4-3",
    "33 stack": "3-3-5 (Tite)",
    "3-3-5": "3-3-5 (Tite)",
    "3-3-5 tite": "3-3-5 (Tite)",
    tite: "3-3-5 (Tite)",
    bear: "Bear (46)",
    "46": "Bear (46)",
    "bear (46)": "Bear (46)",
    "30 odd": "3-4",
    "3-4 odd": "3-4",
    nickel: "Nickel",
    "4-2-5": "4-2-5",
    dime: "Dime (4-1-6)",
    "dime (4-1-6)": "Dime (4-1-6)",
    "4-4 eagle": "4-4 EAGLE",
    "4-4 over": "4-4 OVER",
    "5-0": "5-0",
    "5-0 even": "5-0",
  };

  function coverageCanon(raw) {
    var n = norm(raw).replace(/^c\s*/, "cover ");
    if (n === "cover 0" || n === "cover0" || n === "c0") return "Cover 0";
    if (n === "cover 1" || n === "cover1" || n === "c1" || n === "man") return "Cover 1";
    if (n === "cover 2" || n === "cover2" || n === "c2") return "Cover 2";
    if (n === "2-man" || n === "2 man" || n === "cover 2 man") return "2-Man";
    if (n === "cover 3" || n === "cover3" || n === "c3") return "Cover 3";
    if (n === "cover 4" || n === "cover4" || n === "c4" || n === "quarters") return "Cover 4";
    if (n === "cover 6" || n === "cover6" || n === "c6") return "Cover 6";
    if (n === "tampa 2" || n === "tampa2") return "Tampa 2";
    var pretty = String(raw || "").trim();
    return pretty || "";
  }

  function resolveDefFront(raw) {
    var R = root.OFFGRD_RENDER;
    var fronts = (R && R.DFRONTS) || {};
    var trimmed = String(raw || "").trim();
    if (isBlankChartTag(trimmed)) {
      return { front: fronts["4-3"] ? "4-3" : Object.keys(fronts)[0] || "4-3", unresolved: false, uncharted: true };
    }
    if (trimmed && fronts[trimmed]) return { front: trimmed, unresolved: false, uncharted: false };
    var aliased = FRONT_ALIASES[norm(raw)] || "";
    if (aliased && fronts[aliased]) return { front: aliased, unresolved: false, uncharted: false };
    return { front: fronts["4-3"] ? "4-3" : Object.keys(fronts)[0] || "4-3", unresolved: true, uncharted: false };
  }

  function applyChartedStunt(defs, blitz) {
    if (!blitz || !defs || !defs.length) return;
    var rusher = defs.filter(function (d) { return d.group === "LB"; })[0]
      || defs.filter(function (d) { return d.group === "DL"; })[0]
      || defs[0];
    if (!rusher) return;
    rusher.role = "rush";
    rusher.route = [
      { x: Math.round((rusher.x + BALL_X) / 2), y: Math.round(rusher.y + 18) },
      { x: BALL_X, y: LOS_Y + 8 },
    ];
  }

  function buildDefShell(group) {
    var g = group || {};
    var R = root.OFFGRD_RENDER;
    var resolved = resolveDefFront(g.front);
    var cov = coverageCanon(g.coverage);
    var state = {
      id: "shell-" + g.shellKey,
      name: [g.front || resolved.front, cov].filter(Boolean).join(" · ") || "Opp D",
      formation: g.formation || "",
      opponent: g.opponent || "",
      cardStatus: "shell",
      shellKey: g.shellKey,
      side: "def",
      cardFormat: "opponent-d",
      n: g.n,
      thin: !!g.thin,
      sitWeight: g.sitWeight != null ? g.sitWeight : situationWeight(g),
      unchartedFormation: !!resolved.uncharted,
      unresolvedFormation: !!resolved.unresolved && !resolved.uncharted,
      front: resolved.front,
      coverage: cov,
      blitz: g.blitz || "",
      pressureRate: g.pressureRate || 0,
      pressureN: g.pressureN || 0,
      share: g.share || 0,
      showZones: true,
      players: [],
      defs: [],
      texts: [],
      draws: [],
      field: "High School",
    };
    if (R && typeof R.placeDefenseOn === "function") {
      R.placeDefenseOn(state, resolved.front, cov || "none");
    }
    (state.defs || []).forEach(function (d) {
      d.route = [];
      if (d.role === "rush") d.role = "zone";
    });
    if (g.blitz) applyChartedStunt(state.defs, g.blitz);
    return state;
  }

  function drawnToPlay(row) {
    if (!row) return null;
    var st = row.play_state || row.playState || row.data || row;
    if (!st || !((st.players && st.players.length) || row.thumbSvg)) return null;
    return Object.assign({}, st, {
      id: row.id || row.cid || "drawn-" + (row.shell_key || row.shellKey),
      name: row.play_name || row.playName || st.name || row.play || "Opp play",
      formation: row.formation || st.formation || "",
      opponent: row.opponent || st.opponent || "",
      cardStatus: "drawn",
      side: st.side || row.side || (String(row.shell_key || row.shellKey || "").indexOf("def:") === 0 ? "def" : "off"),
      cardFormat: st.cardFormat || row.cardFormat || "",
      shellKey: row.shell_key || row.shellKey || "",
      players: st.players,
      thumbSvg: st.thumbSvg || row.thumbSvg || "",
      data: st.players ? st : undefined,
    });
  }

  /**
   * Precedence: drawn > rows with real players/thumbSvg > shells.
   * Shells never shadow a drawn diagram (matched by shellKey).
   */
  function cardsForOpponent(opts) {
    opts = opts || {};
    var opponent = opts.opponent || "";
    var side = normSide(opts.side);
    var grouped = groupsFor(opts.snaps || [], opponent, side);
    var byKey = Object.create(null);
    grouped.groups.forEach(function (g) { byKey[g.shellKey] = g; });
    function attachMeta(card) {
      if (!card) return card;
      var g = card.shellKey ? byKey[card.shellKey] : null;
      if (g) {
        card.n = g.n;
        card.thin = !!g.thin;
        card.sitWeight = g.sitWeight;
        card.downDist = g.downDist;
        card.fieldZoneDist = g.fieldZoneDist;
      } else {
        if (card.n == null) card.n = 0;
        card.thin = !!card.thin || card.n < CARD_THIN_N;
        card.sitWeight = situationWeight(card);
      }
      return card;
    }
    var drawn = (opts.drawn || []).map(drawnToPlay).filter(Boolean).filter(function (d) {
      var ds = d.side || (d.shellKey && String(d.shellKey).indexOf("def:") === 0 ? "def" : "off");
      return normSide(ds) === side;
    }).map(attachMeta);
    var drawnKeys = Object.create(null);
    drawn.forEach(function (d) {
      if (d.shellKey) drawnKeys[d.shellKey] = true;
    });
    var rowDiagrams = side === "def" ? [] : (opts.rowDiagrams || []).filter(function (p) {
      var k = p.shellKey || "";
      return !k || !drawnKeys[k];
    }).map(attachMeta);
    var shells = grouped.groups
      .map(function (g) {
        g.opponent = opponent;
        return attachMeta(side === "def" ? buildDefShell(g) : buildShell(g));
      })
      .filter(function (s) {
        if (!s || drawnKeys[s.shellKey]) return false;
        if (side === "def") return !!(s.defs && s.defs.length);
        return !!(s.players && s.players.length);
      });
    var cards = drawn.concat(rowDiagrams, shells).sort(queueCompare);
    var cov = coverageOf(cards, grouped.total, side === "def" ? 6 : 12, side);
    return {
      opponent: opponent,
      side: side,
      total: grouped.total,
      rollups: grouped.rollups || [],
      drawn: drawn,
      rowDiagrams: rowDiagrams,
      shells: shells,
      cards: cards,
      coverage: cov,
    };
  }

  var OPP_CARD_TAG = "opp-card";
  var DRAFT_KEY = "offgrd_opp_card_edit";

  function isOppCardPlay(p) {
    function flagsOn(obj) {
      if (!obj || typeof obj !== "object") return false;
      if (obj.excludeFromPlaybook) return true;
      if (obj.shellKey && obj.opponent) return true;
      if (obj.cardStatus === "shell" || obj.cardStatus === "drawn") return true;
      var tags = obj.tags || [];
      for (var i = 0; i < tags.length; i++) {
        var t = String(tags[i] || "").toLowerCase();
        if (t === OPP_CARD_TAG || t.indexOf("opponent:") === 0 || t.indexOf("shell:") === 0) return true;
      }
      return false;
    }
    if (!p) return false;
    if (flagsOn(p)) return true;
    if (p.data && p.data !== p && flagsOn(p.data)) return true;
    return false;
  }

  function tagOppCard(state, opponent, shellKey) {
    if (!state) return state;
    state.opponent = opponent || state.opponent || "";
    state.shellKey = shellKey || state.shellKey || "";
    state.excludeFromPlaybook = true;
    if (!Array.isArray(state.tags)) state.tags = [];
    function add(tag) {
      var low = state.tags.map(function (t) { return String(t).toLowerCase(); });
      if (low.indexOf(String(tag).toLowerCase()) < 0) state.tags.push(tag);
    }
    add(OPP_CARD_TAG);
    if (state.opponent) add("opponent:" + state.opponent);
    if (state.shellKey) add("shell:" + state.shellKey);
    return state;
  }

  function ownPlaybookList(list) {
    return (list || []).filter(function (p) { return !isOppCardPlay(p); });
  }

  function writeEditDraft(play) {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(play));
    } catch (e) {}
  }

  function isEditSession() {
    try {
      if (typeof location === "undefined") return false;
      if (!/[?&]from=opp-card(?:&|$)/.test(location.search || "")) return false;
      var d = readEditDraft();
      return !!(d && d.shellKey);
    } catch (e) {
      return false;
    }
  }

  function readEditDraft() {
    try {
      var raw = sessionStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function clearEditDraft() {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch (e) {}
  }

  function queueReturnUrl(opponent, format) {
    var fmt = format || "opponent";
    return "OFFGRD.html?view=cards&opp=" + encodeURIComponent(opponent || "") + "&fmt=" + encodeURIComponent(fmt);
  }

  function promoteToEditor(shell) {
    if (!shell) return false;
    var draft = JSON.parse(JSON.stringify(shell));
    tagOppCard(draft, shell.opponent, shell.shellKey);
    draft.cardStatus = "shell";
    draft.cardFormat = draft.cardFormat || (draft.side === "def" ? "opponent-d" : "opponent");
    writeEditDraft(draft);
    telePush("shell_edit", { opponent: draft.opponent || "", shellKey: draft.shellKey || "" });
    location.href = "OFFGRD-Playbook.html?from=opp-card";
    return true;
  }

  /* Event names are stable so a later POST to Supabase can reuse them. */
  var TELE_KEY = "offgrd_opp_card_tele_v1";
  var TELE_MAX = 50;

  function teleRead() {
    try {
      if (typeof localStorage === "undefined") return [];
      var raw = localStorage.getItem(TELE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function telePush(event, payload) {
    var row = Object.assign({ event: event, t: Date.now() }, payload || {});
    var buf = teleRead();
    buf.push(row);
    if (buf.length > TELE_MAX) buf = buf.slice(buf.length - TELE_MAX);
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(TELE_KEY, JSON.stringify(buf));
    } catch (e) {}
    return row;
  }

  function persistDrawnFromEditor(state, teamId) {
    if (!state || !isOppCardPlay(state)) return Promise.resolve(null);
    state.cardStatus = "drawn";
    tagOppCard(state, state.opponent, state.shellKey);
    var card = {
      opponent: state.opponent,
      shell_key: state.shellKey,
      shellKey: state.shellKey,
      side: state.side || (String(state.shellKey || "").indexOf("def:") === 0 ? "def" : "off"),
      card_status: "drawn",
      cardStatus: "drawn",
      play_state: state,
      play_name: state.name || state.play || "",
      formation: state.formation || "",
      backfield: state.offBackfield || state.backfield || "",
      off_str: state.offStrength || "",
      play_type: state.playType || state.type || "",
      direction: state.direction || "",
      gap: state.gap || "",
      pass_zone: state.passZone || "",
    };
    return pushDrawn(teamId, card);
  }

  root.OFFGRD_OPP_SHELLS = {
    CARD_THIN_N: CARD_THIN_N,
    OPP_CARD_SIT_WEIGHT: OPP_CARD_SIT_WEIGHT,
    OPP_CARD_TAG: OPP_CARD_TAG,
    situationWeight: situationWeight,
    queueCompare: queueCompare,
    coverageOf: coverageOf,
    printFooterLine: printFooterLine,
    teleRead: teleRead,
    telePush: telePush,
    groupRows: groupRows,
    groupsFor: groupsFor,
    clearCache: clearCache,
    shellKeyOf: shellKeyOf,
    reconcile: reconcile,
    filterOffRows: filterOffRows,
    filterRows: filterRows,
    chartedBlitz: chartedBlitz,
    isOppCardPlay: isOppCardPlay,
    tagOppCard: tagOppCard,
    ownPlaybookList: ownPlaybookList,
    writeEditDraft: writeEditDraft,
    isEditSession: isEditSession,
    readEditDraft: readEditDraft,
    clearEditDraft: clearEditDraft,
    queueReturnUrl: queueReturnUrl,
    promoteToEditor: promoteToEditor,
    persistDrawnFromEditor: persistDrawnFromEditor,
    resolveFormation: resolveFormation,
    resolveDefFront: resolveDefFront,
    coverageCanon: coverageCanon,
    buildShell: buildShell,
    buildDefShell: buildDefShell,
    cardsForOpponent: cardsForOpponent,
    loadDrawnCache: loadDrawnCache,
    saveDrawnCache: saveDrawnCache,
    pullDrawn: pullDrawn,
    pushDrawn: pushDrawn,
    mergeDrawn: mergeDrawn,
  };
})(typeof window !== "undefined" ? window : globalThis);
