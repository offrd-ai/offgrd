/**
 * OFFGRD formation canon — data-driven library.
 *
 * Formations are records (see formations/formations.v1.json). This module:
 *  - resolves scout strings → canonical Formation
 *  - places skill/backfield from SkillSpot/BackfieldSpot (no formation-name branches)
 *  - hard-fails on collision / unknown formation
 *
 * Browser: window.OFFGRD_FORMATION_CANON (+ OFFGRD_FORMATIONS_V1 embed)
 * Node: module.exports
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.OFFGRD_FORMATION_CANON = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var GEOM = {
    BALL_X: 500,
    LOS_Y: 380,
    PPY: 11,
    OT_L: 430,
    OT_R: 570,
    SIDE_L: 100,
    SIDE_R: 900,
    MIN_SEP: 48,
    MIN_SEP_Y: 28,
  };

  var OL5 = [
    { ol: true, lab: "LT", x: 430, y: 380 },
    { ol: true, lab: "LG", x: 465, y: 380 },
    { ol: true, lab: "C", x: 500, y: 380 },
    { ol: true, lab: "RG", x: 535, y: 380 },
    { ol: true, lab: "RT", x: 570, y: 380 },
  ];

  /** Build OL line; olCount 6 adds a TE-side tackle (jumbo). */
  function buildOL(olCount) {
    var n = olCount != null ? olCount : 5;
    if (n === 5) {
      return OL5.map(function (p) {
        return { ol: true, lab: p.lab, x: p.x, y: p.y };
      });
    }
    if (n === 6) {
      return [
        { ol: true, lab: "LT", x: 400, y: 380 },
        { ol: true, lab: "LG", x: 450, y: 380 },
        { ol: true, lab: "C", x: 500, y: 380 },
        { ol: true, lab: "RG", x: 550, y: 380 },
        { ol: true, lab: "RT", x: 600, y: 380 },
        { ol: true, lab: "TE6", x: 650, y: 380 },
      ];
    }
    throw new Error("[formation-canon] unsupported olCount: " + n);
  }

  function nonQbBacks(backfield) {
    return (backfield || []).filter(function (b) {
      return b && b.label !== "QB";
    });
  }

  function eligibleCount(formation) {
    return ((formation && formation.skill) || []).length + nonQbBacks(formation && formation.backfield).length;
  }

  function derivedPersonnel(formation) {
    var rb = 0;
    var te = 0;
    nonQbBacks(formation.backfield).forEach(function (b) {
      if (b.label === "RB" || b.label === "FB" || b.label === "HB" || b.label === "TB") rb++;
    });
    (formation.skill || []).forEach(function (s) {
      if (s.role === "RB" || s.role === "FB") rb++;
      if (s.role === "TE") te++;
    });
    return String(rb) + String(te);
  }

  function computeNxM(formation) {
    var left = 0;
    var right = 0;
    (formation.skill || []).forEach(function (s) {
      if (s.side === "L") left++;
      else if (s.side === "R") right++;
    });
    var hi = Math.max(left, right);
    var lo = Math.min(left, right);
    return hi + "x" + lo;
  }

  function assertFormationLegal(formation) {
    if (!formation || !formation.id) throw new Error("[formation-canon] illegal: missing formation");
    var ol = formation.olCount != null ? formation.olCount : 5;
    var qb = (formation.backfield || []).filter(function (b) {
      return b.label === "QB";
    }).length;
    var elig = eligibleCount(formation);
    if (qb !== 1) throw new Error("[formation-canon] " + formation.id + ": QB count " + qb + " (need 1)");
    if (ol + 1 + elig !== 11) {
      throw new Error(
        "[formation-canon] " +
          formation.id +
          ": ol(" +
          ol +
          ")+QB+elig(" +
          elig +
          ")=" +
          (ol + 1 + elig) +
          " (need 11)"
      );
    }
    var derived = derivedPersonnel(formation);
    if (String(formation.personnel) !== derived) {
      throw new Error(
        "[formation-canon] " + formation.id + ": personnel " + formation.personnel + " != derived " + derived
      );
    }
    var skillOnLos = (formation.skill || []).filter(function (s) {
      return !!s.onLOS;
    }).length;
    if (ol + skillOnLos !== 7) {
      throw new Error(
        "[formation-canon] " +
          formation.id +
          ": onLOS " +
          (ol + skillOnLos) +
          " (ol=" +
          ol +
          " + skillOnLOS=" +
          skillOnLos +
          ") need exactly 7"
      );
    }
    (formation.skill || []).forEach(function (s) {
      if (!s.role) throw new Error("[formation-canon] " + formation.id + ": skill " + s.label + " missing role");
    });
  }

  function loadCatalog() {
    if (root && root.OFFGRD_FORMATIONS_V1) return root.OFFGRD_FORMATIONS_V1;
    if (typeof require !== "undefined") {
      try {
        return require("./OFFGRD-formations-data.js");
      } catch (e1) {
        try {
          return require("./formations/formations.v1.json");
        } catch (e2) {
          return { version: 1, formations: [] };
        }
      }
    }
    return { version: 1, formations: [] };
  }

  var CATALOG = loadCatalog();
  var BY_ID = Object.create(null);
  var ALIAS_TO_ID = Object.create(null);

  function norm(raw) {
    return String(raw || "")
      .toLowerCase()
      .replace(/[×✕]/g, "x")
      .replace(/^vs\s+/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function indexCatalog(data) {
    BY_ID = Object.create(null);
    ALIAS_TO_ID = Object.create(null);
    (data.formations || []).forEach(function (f) {
      BY_ID[f.id] = f;
      ALIAS_TO_ID[norm(f.id)] = f.id;
      ALIAS_TO_ID[norm(f.display)] = f.id;
      (f.aliases || []).forEach(function (a) {
        var k = norm(a);
        if (k) ALIAS_TO_ID[k] = f.id;
      });
    });
  }

  indexCatalog(CATALOG);

  function reload(data) {
    CATALOG = data || loadCatalog();
    indexCatalog(CATALOG);
  }

  function logSkip(tag, detail) {
    try {
      if (typeof console !== "undefined" && console.error) {
        console.error("[align-formation]", tag, detail || "");
      }
      if (root) {
        root.__ALIGN_FORMATION_SKIPS__ = root.__ALIGN_FORMATION_SKIPS__ || [];
        root.__ALIGN_FORMATION_SKIPS__.push({ tag: tag, detail: detail, t: Date.now() });
        root.__FORMATION_UNMAPPED__ = root.__FORMATION_UNMAPPED__ || [];
        if (tag === "unmapped") root.__FORMATION_UNMAPPED__.push(String(detail || ""));
      }
    } catch (e) {}
  }

  /**
   * Resolve scout / coach string → Formation or null.
   * Exact synonyms only (normalized id / display / alias). No substring / near-neighbour
   * matching — ambiguous names (e.g. "SPREAD", "Unbalanced 2x1") must route to
   * "Map this formation" instead of silently teaching the wrong picture.
   */
  function resolve(raw) {
    var k = norm(raw);
    if (!k) return null;
    /* Explicit coach maps win (Scout "Map this formation") — before hard-blocks. */
    var overs = (root && root.__FORMATION_ALIAS_OVERRIDES__) || {};
    if (overs[k] && BY_ID[overs[k]]) return BY_ID[overs[k]];
    /* Structurally distinct / unsupported — never invent a balanced lookalike. */
    if (/\bunbalanced\b/.test(k) || /\btackle\s*over\b/.test(k) || /\bover\s*loaded\b/.test(k)) {
      return null;
    }
    /* Family labels without a specific formation — coach must map. */
    if (k === "spread" || k === "spread offense" || k === "spread set") {
      return null;
    }
    if (ALIAS_TO_ID[k]) return BY_ID[ALIAS_TO_ID[k]] || null;
    return null;
  }

  function resolveId(raw) {
    var f = resolve(raw);
    return f ? f.id : null;
  }

  function getById(id) {
    return BY_ID[id] || null;
  }

  function allFormations() {
    return (CATALOG.formations || []).slice();
  }

  function preferredX(spot) {
    var sign = spot.side === "L" ? -1 : 1;
    switch (spot.split) {
      case "wide":
        return spot.side === "L" ? GEOM.SIDE_L : GEOM.SIDE_R;
      case "slot":
        return GEOM.BALL_X + sign * 210;
      case "nasty":
        return GEOM.BALL_X + sign * 155;
      case "attached":
        return (spot.side === "L" ? GEOM.OT_L : GEOM.OT_R) + sign * 55;
      case "wing":
        return (spot.side === "L" ? GEOM.OT_L : GEOM.OT_R) + sign * 65;
      case "bunch":
        return GEOM.BALL_X + sign * 320;
      case "stack":
        return null;
      default:
        return GEOM.BALL_X + sign * 210;
    }
  }

  function spotY(spot) {
    var depth = spot.depth != null ? spot.depth : spot.onLOS ? 0 : 1;
    if (spot.split === "stack") depth = Math.max(depth, 1.5);
    if (spot.split === "bunch" && !spot.onLOS) depth = Math.max(depth, 1);
    return GEOM.LOS_Y + depth * GEOM.PPY;
  }

  /**
   * Place skill spots → {label,x,y}[]. No formation-id branching.
   * Throws on unresolvable collision.
   */
  function placeSkill(skill) {
    var spots = (skill || []).slice();
    var placed = [];
    var bySide = { L: [], R: [] };
    spots.forEach(function (s) {
      bySide[s.side === "L" ? "L" : "R"].push(s);
    });

    ["L", "R"].forEach(function (side) {
      var list = bySide[side].slice().sort(function (a, b) {
        return (a.order || 1) - (b.order || 1);
      });
      var bunch = list.filter(function (s) {
        return s.split === "bunch";
      });
      var linear = list.filter(function (s) {
        return s.split !== "bunch" && s.split !== "stack";
      });
      var stacks = list.filter(function (s) {
        return s.split === "stack";
      });

      if (bunch.length) {
        var anchor = preferredX(bunch[0]);
        var gap = GEOM.MIN_SEP;
        var sign = side === "L" ? -1 : 1;
        /* order 1 outermost: place outward from cluster center */
        bunch
          .slice()
          .sort(function (a, b) {
            return (a.order || 1) - (b.order || 1);
          })
          .forEach(function (s, idx) {
            var x = anchor + sign * idx * gap;
            placed.push({ label: s.label, x: x, y: spotY(s), spot: s });
          });
      }

      linear.forEach(function (s) {
        placed.push({ label: s.label, x: preferredX(s), y: spotY(s), spot: s });
      });

      stacks.forEach(function (s) {
        var base = placed
          .filter(function (p) {
            return p.spot && p.spot.side === side && p.spot.split !== "stack";
          })
          .sort(function (a, b) {
            return (a.spot.order || 1) - (b.spot.order || 1);
          })[0];
        var x = base ? base.x : preferredX({ side: side, split: "slot" });
        placed.push({ label: s.label, x: x, y: spotY(s), spot: s });
      });
    });

    /* Enforce separation — nudge, then hard-fail if still colliding. */
    placed.sort(function (a, b) {
      return a.x - b.x || a.y - b.y;
    });
    var guard = 0;
    while (guard++ < 40) {
      var moved = false;
      var i, j, a, b, dx, dy;
      for (i = 0; i < placed.length; i++) {
        for (j = i + 1; j < placed.length; j++) {
          a = placed[i];
          b = placed[j];
          dx = Math.abs(a.x - b.x);
          dy = Math.abs(a.y - b.y);
          if (dx < GEOM.MIN_SEP && dy < GEOM.MIN_SEP_Y) {
            var nudge = GEOM.MIN_SEP - dx + 2;
            if (a.x <= b.x) {
              a.x = Math.max(80, a.x - Math.ceil(nudge / 2));
              b.x = Math.min(920, b.x + Math.ceil(nudge / 2));
            } else {
              b.x = Math.max(80, b.x - Math.ceil(nudge / 2));
              a.x = Math.min(920, a.x + Math.ceil(nudge / 2));
            }
            moved = true;
          }
        }
      }
      if (!moved) break;
    }

    for (var ii = 0; ii < placed.length; ii++) {
      for (var jj = ii + 1; jj < placed.length; jj++) {
        if (
          Math.abs(placed[ii].x - placed[jj].x) < GEOM.MIN_SEP &&
          Math.abs(placed[ii].y - placed[jj].y) < GEOM.MIN_SEP_Y
        ) {
          var err =
            "skill collision: " +
            placed[ii].label +
            "@" +
            placed[ii].x +
            " vs " +
            placed[jj].label +
            "@" +
            placed[jj].x;
          logSkip("collision", err);
          throw new Error("[formation-canon] " + err);
        }
      }
    }
    return placed;
  }

  function placeBackfield(backfield) {
    var out = [];
    (backfield || []).forEach(function (b) {
      var x = GEOM.BALL_X;
      var y = GEOM.LOS_Y + (b.depth || 0) * GEOM.PPY;
      if (b.alignment === "offset_L") x = GEOM.BALL_X - 60;
      if (b.alignment === "offset_R") x = GEOM.BALL_X + 60;
      if (b.alignment === "split") {
        x = b.label === "FB" || b.label === "HB" ? GEOM.BALL_X - 70 : GEOM.BALL_X + 70;
      }
      if (b.alignment === "under_center") y = GEOM.LOS_Y + 8;
      if (b.alignment === "gun") y = GEOM.LOS_Y + Math.max(b.depth || 5, 5) * GEOM.PPY;
      if (b.alignment === "pistol") y = GEOM.LOS_Y + Math.max(b.depth || 4, 4) * GEOM.PPY;
      if (b.alignment === "I") {
        x = GEOM.BALL_X;
        y = GEOM.LOS_Y + (b.depth || 5) * GEOM.PPY;
      }
      var type = b.label === "QB" ? "qb" : "rb";
      out.push({
        type: type,
        lab: b.label,
        x: x,
        y: y,
        route: type === "rb" ? [{ x: x + 40, y: y - 20 }] : undefined,
      });
    });
    return out;
  }

  /**
   * Formation record OR canonical id → designer players[].
   * Throws on unresolvable input — never returns a partial (OL-only) set.
   */
  function playersFromFormation(formationOrId) {
    var formation = formationOrId;
    if (typeof formationOrId === "string") {
      formation = getById(formationOrId) || resolve(formationOrId);
      if (!formation) {
        throw new Error("[formation-canon] playersFromFormation: cannot resolve " + JSON.stringify(formationOrId));
      }
    }
    if (!formation || typeof formation !== "object" || !formation.id || !Array.isArray(formation.skill)) {
      throw new Error("[formation-canon] playersFromFormation: expected Formation object or id string");
    }
    assertFormationLegal(formation);
    var skillPlaced = placeSkill(formation.skill);
    var players = buildOL(formation.olCount);
    skillPlaced.forEach(function (p) {
      var role = (p.spot && p.spot.role) || "WR";
      players.push({
        type: role === "RB" || role === "FB" ? "rb" : "route",
        lab: p.label,
        role: role,
        x: Math.round(p.x),
        y: Math.round(p.y),
        route: [{ x: Math.round(p.x), y: Math.round(p.y - (p.label === "X" || p.label === "Z" ? 130 : 80)) }],
      });
    });
    placeBackfield(formation.backfield).forEach(function (p) {
      if (players.some(function (q) { return q.lab === p.lab; })) {
        throw new Error("[formation-canon] " + formation.id + ": duplicate label " + p.lab);
      }
      players.push(p);
    });
    assertNoSkillOverlap(players, formation.id);
    var olN = players.filter(function (p) { return p.ol; }).length;
    var qbN = players.filter(function (p) { return p.type === "qb" || p.lab === "QB"; }).length;
    var eligN = players.filter(function (p) { return !p.ol && p.lab !== "QB" && p.type !== "qb"; }).length;
    if (olN + qbN + eligN !== 11 || qbN !== 1) {
      throw new Error(
        "[formation-canon] " + formation.id + ": placed counts ol=" + olN + " qb=" + qbN + " elig=" + eligN
      );
    }
    return players;
  }

  function playersForId(id) {
    if (typeof id !== "string" || !id) throw new Error("[formation-canon] playersForId: id required");
    var f = getById(id);
    if (!f) throw new Error("[formation-canon] unknown formation id: " + id);
    return playersFromFormation(f);
  }

  function playersForName(raw) {
    var f = resolve(raw);
    if (!f) {
      logSkip("unmapped", raw);
      throw new Error("[formation-canon] unmapped formation: " + raw);
    }
    return playersFromFormation(f);
  }

  function skillPlayers(players) {
    return (players || []).filter(function (p) {
      return p && (p.type === "route" || p.type === "rb");
    });
  }

  function skillPlayersOverlap(players) {
    var skill = skillPlayers(players);
    var i, j;
    for (i = 0; i < skill.length; i++) {
      for (j = i + 1; j < skill.length; j++) {
        if (
          Math.abs((skill[i].x || 0) - (skill[j].x || 0)) < GEOM.MIN_SEP &&
          Math.abs((skill[i].y || 0) - (skill[j].y || 0)) < GEOM.MIN_SEP_Y
        )
          return true;
      }
    }
    return false;
  }

  function assertNoSkillOverlap(players, ctx) {
    if (skillPlayersOverlap(players)) {
      var msg = "skill overlap in " + (ctx || "placement");
      logSkip("collision", msg);
      throw new Error("[formation-canon] " + msg);
    }
  }

  function findClearSkillX(desiredX, mover, players) {
    var X_MIN = 40;
    var X_MAX = 980;
    var occupied = skillPlayers(players)
      .filter(function (p) {
        return p && p !== mover;
      })
      .map(function (p) {
        return p.x || 0;
      });
    function blocked(xx) {
      var k;
      for (k = 0; k < occupied.length; k++) {
        if (Math.abs(occupied[k] - xx) < GEOM.MIN_SEP) return true;
      }
      return false;
    }
    var x = Math.max(X_MIN, Math.min(X_MAX, desiredX));
    if (!blocked(x)) return x;
    /* Prefer outside (away from ball) first — Across/Zip must land past the #1. */
    var dir = x < 500 ? -1 : 1;
    var step, tryX;
    for (step = 1; step <= 16; step++) {
      tryX = Math.max(X_MIN, Math.min(X_MAX, x + dir * step * 24));
      if (!blocked(tryX)) return tryX;
      tryX = Math.max(X_MIN, Math.min(X_MAX, x - dir * step * 24));
      if (!blocked(tryX)) return tryX;
    }
    throw new Error("[formation-canon] no clear skill x for motion end near " + desiredX);
  }

  /** Across/Jet land outside the outermost eligible on the destination side. */
  function acrossLandX(mover, players) {
    var x = (mover && mover.x) || 500;
    var destRight = x < 500;
    var others = skillPlayers(players).filter(function (p) {
      return p && p !== mover;
    });
    var onDest = others.filter(function (p) {
      return destRight ? (p.x || 0) >= 500 : (p.x || 0) < 500;
    });
    var endX;
    if (onDest.length) {
      var outer = destRight
        ? Math.max.apply(
            null,
            onDest.map(function (p) {
              return p.x || 0;
            })
          )
        : Math.min.apply(
            null,
            onDest.map(function (p) {
              return p.x || 0;
            })
          );
      endX = destRight ? outer + GEOM.MIN_SEP : outer - GEOM.MIN_SEP;
    } else {
      endX = 1000 - x;
    }
    return findClearSkillX(endX, mover, players);
  }

  /** Legacy family key for align_by_family until derived align lands. */
  function familyHint(formationOrRaw) {
    var f =
      typeof formationOrRaw === "object" && formationOrRaw && formationOrRaw.id
        ? formationOrRaw
        : resolve(formationOrRaw);
    if (f && f.familyHint) return f.familyHint;
    if (f) {
      var tags = f.tags || [];
      if (tags.indexOf("bunch") >= 0) return "bunch";
      if (tags.indexOf("empty") >= 0 || tags.indexOf("quads") >= 0) return "empty";
      if (tags.indexOf("3x1") >= 0) return "3x1";
      if (tags.indexOf("2x1") >= 0) return "2x1";
      if (tags.indexOf("2x2") >= 0) return "2x2";
    }
    return "other";
  }

  /* ---------- Compatibility shims (pre-library call sites) ---------- */

  function familyFromName(raw) {
    var f = resolve(raw);
    if (f) return familyHint(f);
    return "other";
  }

  function familyFromGeometry(players) {
    /* Include F/RB skill — empty 3x2 parks F as type "rb". */
    var skill = skillPlayers(players).filter(function (p) {
      return p.type === "route" || p.type === "rb";
    });
    if (!skill.length) return "other";
    var wingTe = skill.find(function (p) {
      return p && (p.lab === "Y" || p.lab === "TE") && (p.x || 0) >= 590 && (p.x || 0) <= 670;
    });
    var wide = wingTe
      ? skill.filter(function (p) {
          return p !== wingTe;
        })
      : skill;
    var left = wide.filter(function (p) {
      return (p.x || 0) < 500;
    }).length;
    var right = wide.filter(function (p) {
      return (p.x || 0) >= 500;
    }).length;
    if (skill.length >= 5) return "empty";
    if (wingTe && Math.max(left, right) === 2 && Math.min(left, right) === 1) return "2x1";
    if (Math.max(left, right) >= 3 && Math.min(left, right) <= 1) return "3x1";
    if (Math.max(left, right) === 2 && Math.min(left, right) === 1) return "2x1";
    if (left >= 2 && right >= 2) return "2x2";
    return "other";
  }

  function familyFromLook(look) {
    var fromName = familyFromName((look && (look.formation || look.name || look.id)) || "");
    if (fromName !== "other") return fromName;
    return familyFromGeometry((look && look.state && look.state.players) || []);
  }

  function playersForFamily(fam) {
    /* Map legacy family → a representative formation id */
    var map = {
      "2x2": "DOUBLES_2X2",
      "3x1": "TRIPS_RT",
      "2x1": "WING_2X1",
      empty: "EMPTY_3X2",
      bunch: "TRIPS_RT_BUNCH",
    };
    var id = map[fam];
    if (!id) return null;
    return playersForId(id);
  }

  function lookDrawableForAlign(look) {
    if (!look || !look.state || !((look.state.players || []).length)) {
      return { ok: false, reason: "no players" };
    }
    try {
      assertNoSkillOverlap(look.state.players, look.name || look.id);
    } catch (e) {
      return { ok: false, reason: "skill overlap" };
    }
    var labelRaw = look.name || look.formation || "";
    var f = resolve(labelRaw);
    if (look._unsupported) return { ok: false, reason: "unsupported formation" };
    if (look._synthetic) {
      if (!f && familyFromName(labelRaw) === "other") {
        return { ok: false, reason: "unsupported synthetic name" };
      }
      return { ok: true, formationId: look._formationId || (f && f.id), family: familyHint(f || look._syntheticFamily) };
    }
    if (labelRaw && !f && familyFromName(labelRaw) === "other") {
      return { ok: false, reason: "unmapped formation name" };
    }
    return { ok: true, formationId: f && f.id, family: familyFromLook(look) };
  }

  function isSupportedName(raw) {
    return !!resolve(raw);
  }

  function buildLookFromName(raw) {
    var f = resolve(raw);
    if (!f) {
      logSkip("unmapped", raw);
      return null;
    }
    return {
      id: "form-" + f.id,
      name: raw || f.display,
      formation: f.id,
      display: f.display,
      state: { players: playersFromFormation(f) },
      _synthetic: true,
      _syntheticFamily: familyHint(f),
      _formationId: f.id,
    };
  }

  function clonePlayers(arr) {
    try {
      return JSON.parse(JSON.stringify(arr));
    } catch (e) {
      return (arr || []).slice();
    }
  }

  /* Team display overrides (local for now; DB later) */
  function displayName(formationOrId, teamOverrides) {
    var f = typeof formationOrId === "string" ? getById(formationOrId) : formationOrId;
    if (!f) return String(formationOrId || "");
    var o = teamOverrides || (root && root.__FORMATION_DISPLAY_OVERRIDES__) || {};
    if (o[f.id]) return o[f.id];
    return f.display;
  }

  return {
    VERSION: 2,
    GEOM: GEOM,
    SKILL_MIN_SEP: GEOM.MIN_SEP,
    reload: reload,
    catalog: function () {
      return CATALOG;
    },
    allFormations: allFormations,
    resolve: resolve,
    resolveId: resolveId,
    getById: getById,
    isSupportedName: isSupportedName,
    displayName: displayName,
    playersFromFormation: playersFromFormation,
    playersForId: playersForId,
    playersForName: playersForName,
    buildLookFromName: buildLookFromName,
    buildOL: buildOL,
    eligibleCount: eligibleCount,
    derivedPersonnel: derivedPersonnel,
    computeNxM: computeNxM,
    assertFormationLegal: assertFormationLegal,
    placeSkill: placeSkill,
    skillPlayers: skillPlayers,
    skillPlayersOverlap: skillPlayersOverlap,
    assertNoSkillOverlap: assertNoSkillOverlap,
    findClearSkillX: findClearSkillX,
    acrossLandX: acrossLandX,
    familyHint: familyHint,
    familyFromName: familyFromName,
    familyFromGeometry: familyFromGeometry,
    familyFromLook: familyFromLook,
    playersForFamily: playersForFamily,
    lookDrawableForAlign: lookDrawableForAlign,
    logSkip: logSkip,
    clonePlayers: clonePlayers,
    /* legacy */
    FAMILY_IDS: ["2x2", "3x1", "2x1", "empty", "bunch"],
    FAMILIES: null,
    BASE_PLAYERS: null,
  };
});
