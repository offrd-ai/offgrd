/* ============================================================
   OFFGRD-week-autotest.js — auto-generate & assign weekly teach-tests
   Flag: ?week_autotest=0|1 | localStorage.offgrd_week_autotest | OFFGRD_CONFIG.weekAutotest
   Default ON (config). Rollback: ?week_autotest=0 / localStorage=0.
   ============================================================ */
(function (root) {
  "use strict";

  const POSKINDS = {
    QB: ["reads", "coverage", "routes", "protect"],
    RB: ["routes", "protect", "coverage"],
    WR: ["routes"],
    TE: ["routes", "protect"],
    OL: ["protect"],
    /* blitz kind: DL/LB front-seven rush lane / stunt path / drop assignment (built) */
    DL: ["blitz"],
    LB: ["coverage", "blitz"],
    DB: ["coverage"],
    S: ["coverage"],
    CB: ["coverage"],
    FB: ["routes", "protect", "coverage"]
  };
  const READY_MIN_TESTS = 2;
  const READY_AVG = 80;
  const KIND_QUIZ = {
    reads: "Reads test",
    coverage: "Coverage ID test",
    routes: "Route quiz",
    protect: "OL test",
    blitz: "Blitz test"
  };

  function flagParam(name) {
    try {
      const blob = String((location && (location.search || "") + "&" + ((location.hash || "").replace(/^#/, ""))) || "");
      if (new RegExp("[?&#]" + name + "=0(?:&|#|$)").test(blob)) return "0";
      if (new RegExp("[?&#]" + name + "=1(?:&|#|$)").test(blob)) return "1";
    } catch (e) {}
    return null;
  }

  function isWeekAutotest() {
    try {
      const url = flagParam("week_autotest");
      if (url === "0") return false;
      if (url === "1") return true;
      const ls = localStorage.getItem("offgrd_week_autotest");
      if (ls === "0") return false;
      if (ls === "1") return true;
      if (root.OFFGRD_CONFIG && root.OFFGRD_CONFIG.weekAutotest === false) return false;
      if (root.OFFGRD_CONFIG && root.OFFGRD_CONFIG.weekAutotest) return true;
    } catch (e) {}
    return false;
  }

  /**
   * Map depth-chart / roster codes → POSKINDS buckets.
   * Taxonomy matches hub depth chart: LT/LG/C/RG/RT, X/Z/H/Y, MIKE/SAM/WILL, CB/FS/SS/NB.
   * S/CB collapse into DB so secondary assignments stay one bucket.
   */
  function normPos(p) {
    p = String(p || "").toUpperCase().trim();
    if (!p) return "";

    /* OL — depth-chart + free-text */
    if (
      p === "LT" || p === "LG" || p === "C" || p === "RG" || p === "RT" ||
      p === "OG" || p === "OT" || p === "G" || p === "T" ||
      p === "OC" || p === "CENTER" || p === "GUARD" || p === "TACKLE" ||
      p.indexOf("OLINE") >= 0 || p === "O-LINE" || p === "OFFENSIVE LINE" || p === "OL"
    ) return "OL";

    /* WR — depth-chart letter codes + free-text */
    if (
      p === "X" || p === "Z" || p === "H" || p === "SLOT" || p === "SE" || p === "FL" ||
      p === "RECEIVER" || p === "WIDE RECEIVER" || p.indexOf("WIDEOUT") >= 0 || p === "WR"
    ) return "WR";

    /* TE */
    if (p === "Y" || p === "TE" || p === "TIGHT END" || p === "TIGHTEND") return "TE";

    /* LB — depth-chart names + free-text */
    if (
      p === "MIKE" || p === "SAM" || p === "WILL" ||
      p === "ILB" || p === "OLB" || p === "MLB" || p === "WLB" || p === "SLB" ||
      p === "LINEBACKER" || p.indexOf("LINEBACK") >= 0 || p === "LB"
    ) return "LB";

    /* Secondary → DB (coverage). Includes S/CB/SAF/NB. */
    if (
      p === "CB" || p === "FS" || p === "SS" || p === "S" || p === "SAF" || p === "NB" ||
      p === "NICKEL" || p === "NICKELBACK" || p === "CORNER" || p === "CORNERBACK" ||
      p === "SAFETY" || p === "FREE SAFETY" || p === "STRONG SAFETY" ||
      p === "DB" || p === "DEFENSIVE BACK"
    ) return "DB";

    /* DL */
    if (
      p === "DE" || p === "DT" || p === "NT" || p === "EDGE" ||
      p === "DEFENSIVE END" || p === "DEFENSIVE TACKLE" || p === "NOSE" || p === "NOSE TACKLE" ||
      p === "DL" || p === "D-LINE" || p === "DEFENSIVE LINE"
    ) return "DL";

    if (p === "QB" || p === "QUARTERBACK") return "QB";
    if (p === "RB" || p === "HB" || p === "TB" || p === "RUNNING BACK" || p === "TAILBACK" || p === "HALFBACK") return "RB";
    if (p === "FB" || p === "FULLBACK") return "FB";

    return p;
  }

  function normCov(c) {
    c = String(c || "").toLowerCase();
    if (!c || c === "—") return null;
    if (c.indexOf("tampa") >= 0) return "Tampa 2";
    const m = c.match(/[0-4]/);
    if (m) return "Cover " + m[0];
    return null;
  }

  function planPlayList(week) {
    const out = [];
    const seen = {};
    ((week && week.buckets) || []).forEach(function (b) {
      (b.plays || []).forEach(function (p) {
        if (!p || !p.name) return;
        const key = (p.id != null ? "id:" + p.id : "nm:" + String(p.name).toLowerCase());
        if (seen[key]) return;
        seen[key] = 1;
        out.push(p);
      });
    });
    return out;
  }

  function resolvePlayRow(call, playbook) {
    const pb = playbook || [];
    const cid = call && call.id != null ? String(call.id) : "";
    if (cid) {
      const byId = pb.find(function (p) { return p && String(p.id) === cid; });
      if (byId) return byId;
    }
    const nm = String((call && call.name) || "").trim().toLowerCase();
    if (!nm) return null;
    return pb.find(function (p) { return p && String(p.name || "").trim().toLowerCase() === nm; }) || null;
  }

  function playHasDiagram(play) {
    const d = (play && play.data) || play || {};
    return !!(d && (d.players || d.defs));
  }

  /** Force auto-derive during approve (authored still wins via merge). Persist when Cloud is available. */
  async function ensureDerivedContent(playbook, forceOn) {
    if (!forceOn) return { derivedReads: 0, derivedOl: 0 };
    const AD = root.OFFGRD_AUTODERIVE;
    if (!AD || !AD.deriveReads || !AD.mergeReads) return { derivedReads: 0, derivedOl: 0 };
    let derivedReads = 0, derivedOl = 0;
    const saves = [];
    (playbook || []).forEach(function (play) {
      if (!play || !playHasDiagram(play)) return;
      try {
        if (!play.qb_reads || !Object.keys(play.qb_reads).length) {
          const d = AD.deriveReads(play.data || play, { playName: play.name });
          const merged = AD.mergeReads(null, d);
          if (merged && merged.reads && Object.keys(merged.reads).length) {
            play.qb_reads = merged.reads;
            play._autotest_reads = true;
            derivedReads++;
            if (root.Cloud && root.Cloud.updatePlayReads && play.id) {
              saves.push(Promise.resolve(root.Cloud.updatePlayReads(play.id, merged.reads)).catch(function () {}));
            }
          }
        } else if (AD.mergeReads) {
          const d = AD.deriveReads(play.data || play, { playName: play.name });
          const merged = AD.mergeReads(play.qb_reads, d);
          if (merged && merged.filled) {
            play.qb_reads = merged.reads;
            derivedReads += merged.filled;
            if (root.Cloud && root.Cloud.updatePlayReads && play.id) {
              saves.push(Promise.resolve(root.Cloud.updatePlayReads(play.id, merged.reads)).catch(function () {}));
            }
          }
        }
      } catch (e) {}
      try {
        const hasOl = play.ol_keys && play.ol_keys.keys && Object.keys(play.ol_keys.keys).length;
        if (!hasOl && AD.deriveOlKeys && AD.mergeOlKeys) {
          const d = AD.deriveOlKeys(play.data || play);
          const merged = AD.mergeOlKeys(null, d);
          if (merged && merged.ol && merged.ol.keys && Object.keys(merged.ol.keys).length) {
            play.ol_keys = merged.ol;
            play._autotest_ol = true;
            derivedOl++;
            if (root.Cloud && root.Cloud.updatePlayOlKeys && play.id) {
              saves.push(Promise.resolve(root.Cloud.updatePlayOlKeys(play.id, merged.ol)).catch(function () {}));
            }
          }
        }
      } catch (e) {}
    });
    if (saves.length) await Promise.all(saves);
    return { derivedReads: derivedReads, derivedOl: derivedOl };
  }

  /** Opponent offensive looks available for blitz picture: drawn scout diagrams and/or charted formations. */
  function opponentOffenseLookCount(games, opponent) {
    const opp = (opponent || "").trim();
    const list = (games || []).filter(function (g) {
      if (opp && g.opponent && g.opponent !== opp) return false;
      return !g.side || g.side === "off" || g.side === "offense";
    });
    let diagrams = 0;
    if (root.OFFGRD_SCOUTCARDS && typeof root.OFFGRD_SCOUTCARDS.opponentPlaysFromGames === "function") {
      diagrams = root.OFFGRD_SCOUTCARDS.opponentPlaysFromGames(list).length;
    } else {
      list.forEach(function (g) {
        (g.rows || []).forEach(function (r) {
          if (r && (r.thumbSvg || r.data || r.diagram || r.players)) diagrams += 1;
        });
      });
    }
    if (diagrams) return diagrams;
    const forms = {};
    list.forEach(function (g) {
      (g.rows || []).forEach(function (r) {
        const f = String((r && (r.formation || r.playType)) || "").trim();
        if (f) forms[f] = 1;
      });
    });
    return Object.keys(forms).length;
  }

  function kindBuildable(kind, planPlays, playbook, coverages, ctx) {
    ctx = ctx || {};
    const rows = planPlays.map(function (c) { return resolvePlayRow(c, playbook); }).filter(Boolean);
    if (!rows.length) return { ok: false, reason: "no plays" };
    if (kind === "reads") {
      const n = rows.filter(function (p) { return p.qb_reads && Object.keys(p.qb_reads).length; }).length;
      return n ? { ok: true } : { ok: false, reason: "no reads on plan plays" };
    }
    if (kind === "coverage") {
      return (coverages && coverages.length) ? { ok: true } : { ok: false, reason: "no opponent coverages" };
    }
    if (kind === "routes") {
      const n = rows.filter(function (p) {
        const st = (p.data && p.data.players) ? p.data : p.data || p;
        return ((st && st.players) || []).some(function (q) { return q && (q.type === "route" || q.route); });
      }).length;
      return n ? { ok: true } : { ok: false, reason: "no route plays" };
    }
    if (kind === "protect") {
      const n = rows.filter(function (p) { return p.ol_keys && p.ol_keys.keys && Object.keys(p.ol_keys.keys).length; }).length;
      return n ? { ok: true } : { ok: false, reason: "no OL keys on plan plays" };
    }
    if (kind === "blitz") {
      /* Buildable when (a) our week has a drawn front + blitz/stunt AND (b) the opponent
         has offensive looks (drawn scout cards or charted formations). Picture = opponent
         offense; overlay/answer = our defensive call. Don't fabricate either side. */
      const calls = rows.filter(function (p) {
        const st = (p.data && p.data.players) ? p.data : (p.data || p);
        const defs = (st && st.defs) || [];
        if (!defs.length) return false;
        const stunt = p.ol_keys && p.ol_keys.stunt;
        const hasStunt = stunt && Object.keys(stunt).length;
        const hasBlitzPath = defs.some(function (d) { return d && d.route && d.route.length; });
        return !!(hasStunt || hasBlitzPath);
      }).length;
      if (!calls) return { ok: false, reason: "no fronts with a blitz/stunt on plan plays" };
      const looks = opponentOffenseLookCount(ctx.games, ctx.opponent || "");
      if (!looks) return { ok: false, reason: "no opponent offensive looks (scout cards / charted formations)" };
      return { ok: true };
    }
    return { ok: false, reason: "unknown kind" };
  }

  /** Parse roster member → normalized position buckets (supports positions[] or "WR, DB"). */
  function parseMemberPositions(m) {
    const raw = [];
    if (m && m.positions && m.positions.length) {
      m.positions.forEach(function (p) { if (p) raw.push(p); });
    } else if (m && m.position) {
      String(m.position).split(/[,/|+&]+/).forEach(function (p) {
        p = String(p || "").trim();
        if (p) raw.push(p);
      });
    }
    const out = [];
    raw.forEach(function (p) {
      const n = normPos(p);
      if (n && POSKINDS[n] && out.indexOf(n) < 0) out.push(n);
    });
    return out;
  }

  function kindsForPositions(posList) {
    const kinds = [];
    (posList || []).forEach(function (pos) {
      (POSKINDS[pos] || []).forEach(function (k) {
        if (kinds.indexOf(k) < 0) kinds.push(k);
      });
    });
    return kinds;
  }

  /** Union test_spec kinds for a player at one or more positions. */
  function unionSpecForPlayer(posList, testSpec) {
    posList = posList || [];
    const positions = (testSpec && testSpec.positions) || {};
    const kinds = [];
    let incomplete = false;
    const missing = [];
    let minAvg = READY_AVG;
    posList.forEach(function (pos) {
      const s = positions[pos];
      if (!s) return;
      (s.kinds || []).forEach(function (k) {
        if (kinds.indexOf(k) < 0) kinds.push(k);
      });
      if (s.incomplete) {
        incomplete = true;
        (s.missing || []).forEach(function (x) {
          if (missing.indexOf(x) < 0) missing.push(x);
        });
      }
      if (s.minAvg != null) minAvg = s.minAvg;
    });
    if (!kinds.length && posList.length) {
      return {
        kinds: kindsForPositions(posList),
        minTests: READY_MIN_TESTS,
        minAvg: minAvg,
        incomplete: false,
        missing: [],
        positions: posList.slice()
      };
    }
    return {
      kinds: kinds,
      minTests: READY_MIN_TESTS,
      minAvg: minAvg,
      incomplete: incomplete,
      missing: missing,
      positions: posList.slice()
    };
  }

  function buildTestSpec(week, roster, playbook, coverages, games) {
    const planPlays = planPlayList(week);
    const players = (roster || []).filter(function (m) { return m && m.role === "player"; });
    const positions = {};
    const blitzCtx = { games: games || [], opponent: (week && week.opponent) || "" };
    players.forEach(function (m) {
      parseMemberPositions(m).forEach(function (pos) {
        positions[pos] = positions[pos] || { kinds: POSKINDS[pos].slice(), minTests: READY_MIN_TESTS, minAvg: READY_AVG, incomplete: false, missing: [] };
      });
    });
    // Always include positions that have kinds even if roster empty? Ticket says roster-derived — skip empty.
    Object.keys(positions).forEach(function (pos) {
      const spec = positions[pos];
      const missing = [];
      const okKinds = [];
      (spec.kinds || []).forEach(function (k) {
        const b = kindBuildable(k, planPlays, playbook, coverages, blitzCtx);
        if (b.ok) okKinds.push(k);
        else missing.push(k + ": " + b.reason);
      });
      if (missing.length) {
        spec.incomplete = true;
        spec.missing = missing;
        // keep required kinds listed so coach nudge is visible; player still sees assigned set
      }
      spec.kinds = (spec.kinds || []).slice();
      spec.buildable = okKinds;
    });
    return {
      v: 1,
      generated_at: new Date().toISOString(),
      opponent: (week && week.opponent) || "",
      week_plan_id: (week && week.id) || null,
      coverages: (coverages || []).slice(0, 6),
      positions: positions
    };
  }

  /** Seed def_aligns keys for top opponent looks (base shells until coach customizes). */
  function buildDefAligns(coverages, genDefense) {
    const def = {};
    const list = [];
    (coverages || []).forEach(function (c) {
      const n = typeof c === "string" ? normCov(c) : normCov(c && (c.k || c.coverage));
      if (n && list.indexOf(n) < 0) list.push(n);
    });
    if (genDefense && Array.isArray(genDefense.looks)) {
      genDefense.looks.forEach(function (L) {
        const n = normCov(L && (L.coverage || L.name || L));
        if (n && list.indexOf(n) < 0) list.push(n);
      });
    }
    if (genDefense && genDefense.alignments && typeof genDefense.alignments === "object") {
      Object.keys(genDefense.alignments).forEach(function (k) {
        const n = normCov(k) || k;
        if (n && list.indexOf(n) < 0) list.push(n);
        if (genDefense.alignments[k] && typeof genDefense.alignments[k] === "object") {
          def[n] = genDefense.alignments[k];
        }
      });
    }
    list.slice(0, 6).forEach(function (n) {
      if (!def[n]) def[n] = { _auto: true, _seed: true };
    });
    return def;
  }

  function quizKindFromLabel(quiz) {
    const q = String(quiz || "");
    if (q.indexOf("Coverage") >= 0) return "coverage";
    if (q.indexOf("Route") >= 0) return "routes";
    if (q.indexOf("OL test") >= 0 || q.indexOf("protect") >= 0) return "protect";
    if (q.indexOf("Blitz") >= 0 || q.indexOf("blitz") >= 0) return "blitz";
    if (q.indexOf("Reads") >= 0) return "reads";
    return null;
  }

  function completionForPlayer(specPos, rows, weekPlanId, opponent) {
    const kinds = (specPos && specPos.kinds) || [];
    const mine = (rows || []).filter(function (r) {
      if (weekPlanId && r.week_plan_id) return String(r.week_plan_id) === String(weekPlanId);
      const pref = "Week vs " + (opponent || "—");
      return r.quiz && String(r.quiz).indexOf(pref) === 0;
    });
    const done = {};
    mine.forEach(function (r) {
      const k = quizKindFromLabel(r.quiz);
      if (!k) return;
      const pct = r.total ? (r.score / r.total) * 100 : 0;
      if (!done[k] || pct > done[k].pct) done[k] = { pct: pct, row: r };
    });
    const items = kinds.map(function (k) {
      const d = done[k];
      const passed = d && d.pct >= (specPos.minAvg != null ? specPos.minAvg : READY_AVG);
      const started = !!d;
      return { kind: k, label: KIND_QUIZ[k] || k, started: started, passed: !!passed, pct: d ? Math.round(d.pct) : null };
    });
    const startedN = items.filter(function (i) { return i.started; }).length;
    const passedN = items.filter(function (i) { return i.passed; }).length;
    let status = "not_started";
    if (passedN >= kinds.length && kinds.length) status = "passed";
    else if (startedN) status = "started";
    return { items: items, status: status, started: startedN, passed: passedN, assigned: kinds.length };
  }

  /**
   * Called from approvePackage when flag is on.
   * Returns { test_spec, def_aligns, derive } or null if skipped.
   */
  async function onApprove(week, opts) {
    if (!isWeekAutotest() || !week || !week.id) return null;
    opts = opts || {};
    let roster = opts.roster || [];
    let playbook = opts.playbook || [];
    let coverages = opts.coverages || [];

    try {
      if (root.Cloud && root.Cloud.ready) {
        const teams = await root.Cloud.myTeams();
        let tid = null;
        try { tid = localStorage.getItem("offgrd_team"); } catch (e) {}
        const team = (teams || []).find(function (t) { return t.id === tid; }) || (teams && teams[0]);
        if (team) {
          if (!roster.length) roster = await root.Cloud.teamRoster(team.id).catch(function () { return []; });
          if (!playbook.length) playbook = await root.Cloud.listPlays(team.id).catch(function () { return []; });
          try {
            let games = await root.Cloud.listGames(team.id).catch(function () { return []; });
            if (!games || !games.length) games = root.GAMES || [];
            opts._games = games;
            if (!coverages.length) {
              const counts = {};
              (games || []).filter(function (g) { return g.side === "def" && g.opponent === week.opponent; }).forEach(function (g) {
                (g.rows || []).forEach(function (r) {
                  const n = normCov(r && r.coverage);
                  if (n) counts[n] = (counts[n] || 0) + 1;
                });
              });
              coverages = Object.keys(counts).map(function (k) { return { k: k, n: counts[k] }; }).sort(function (a, b) { return b.n - a.n; });
            }
          } catch (e) {}
        }
      }
    } catch (e) {}

    // Force derive path during approve (authored wins)
    const derive = await ensureDerivedContent(playbook, true);
    const covNames = coverages.map(function (c) { return typeof c === "string" ? c : c.k; }).filter(Boolean);
    const test_spec = buildTestSpec(week, roster, playbook, covNames, opts._games || root.GAMES || []);
    const genDef = (week.gen && week.gen.defense) || {};
    const def_aligns = Object.assign({}, week.def_aligns || {}, buildDefAligns(coverages, genDef));

    week.test_spec = test_spec;
    week.def_aligns = def_aligns;
    week.gen = week.gen || {};
    week.gen.test_spec_generated_at = test_spec.generated_at;
    week.gen.autotest_derive = derive;

    try {
      if (root.Cloud && root.Cloud.saveWeekPlan) {
        await root.Cloud.saveWeekPlan(week.id, {
          test_spec: test_spec,
          def_aligns: def_aligns,
          gen: week.gen
        });
      }
    } catch (e) {
      console.warn("[week-autotest] save failed", e);
    }

    return { test_spec: test_spec, def_aligns: def_aligns, derive: derive };
  }

  function nudgeHtml(testSpec) {
    if (!testSpec || !testSpec.positions) return "";
    const lines = [];
    Object.keys(testSpec.positions).forEach(function (pos) {
      const s = testSpec.positions[pos];
      if (s && s.incomplete && s.missing && s.missing.length) {
        lines.push(pos + ": add " + s.missing.join("; "));
      }
    });
    if (!lines.length) return "";
    return '<p class="foot" style="color:#b8860b;font-weight:700;margin:8px 0 0">Week test gaps — ' + lines.join(" · ") + "</p>";
  }

  /** Normalize a week.gen key entry → { text, positions[] }. Supports plain strings + tagged objects. */
  function keyText(k) {
    if (k == null) return "";
    if (typeof k === "string") return k;
    if (typeof k === "object") return String(k.text || k.key || k.k || "");
    return String(k);
  }

  function uniqPos(arr) {
    const out = [];
    (arr || []).forEach(function (p) {
      const n = String(p || "").toUpperCase();
      if (n === "TEAM" || n === "ALL") { if (out.indexOf("TEAM") < 0) out.push("TEAM"); return; }
      const np = normPos(n) || n;
      if (np && out.indexOf(np) < 0) out.push(np);
    });
    return out;
  }

  /** Keyword heuristic when AI hasn't tagged positions yet. */
  function inferKeyPositions(text, side) {
    const t = String(text || "").toLowerCase();
    const hits = [];
    const push = function (p) { if (hits.indexOf(p) < 0) hits.push(p); };

    if (/o-?line|offensive line|protection|pass.?pro|get the block|combo block|slide protect|who's your man|who do you block/.test(t)
      || (/\b(block|blocking|blocker)\b/.test(t) && /\b(mike|will|sam|a-?gap|b-?gap|blitz|stunt|twist|edge)\b/.test(t))) {
      push("OL");
    }
    if (/\b(qb|quarterback)\b/.test(t)
      || /\b(progression|hot route|sight.?adjust|check.?down|pre-?snap|audible|cadence)\b/.test(t)
      || /read (the )?(coverage|shell|leverage|front)/.test(t)) {
      push("QB");
    }
    if (/\b(wr|wide ?out|wide ?receiver|receiver|te\b|tight end)\b/.test(t)
      || /\b(route|release|stemming|stem)\b/.test(t)) {
      push("WR"); push("TE");
    }
    if (/\b(rb|running back|halfback|fullback|\bfb\b)\b/.test(t)
      || /blitz.?pickup|check.?release|pass.?pro.?rb/.test(t)) {
      push("RB");
    }
    if (/\b(db|corner|\bcb\b|safety|nickel|\bfs\b|\bss\b)\b/.test(t)
      || /\b(trail|bail|press man|man turn|zone turn|play the ball)\b/.test(t)) {
      push("DB");
    }
    if (/\b(lb|linebacker)\b/.test(t)
      || (/\b(mike|will|sam)\b/.test(t) && !/o-?line|get the block|protection|block/.test(t))) {
      push("LB");
    }
    if (/\b(dl|defensive line|defensive end|nose|dt\b)\b/.test(t)
      || (/\b(rush|set the edge|two-?gap|shed)\b/.test(t) && side === "def")) {
      push("DL");
    }
    if (/\b(special teams|punt|kickoff|return team|coverage unit)\b/.test(t)) {
      push("ST");
    }

    if (!hits.length) {
      if (side === "def") return ["TEAM"];
      return ["TEAM"];
    }
    return hits;
  }

  function keyPositions(k, side) {
    if (k && typeof k === "object") {
      let raw = k.positions || k.for || k.pos || k.audience;
      if (typeof raw === "string") raw = raw.split(/[,/|+\s]+/);
      if (Array.isArray(raw) && raw.length) {
        const tagged = uniqPos(raw);
        if (tagged.length) return tagged;
      }
    }
    return inferKeyPositions(keyText(k), side);
  }

  /** Filter keys for one position (includes TEAM). Dedupes by text. */
  function filterKeysForPos(keys, pos, side) {
    pos = normPos(pos) || String(pos || "").toUpperCase();
    const out = [];
    const seen = {};
    (keys || []).forEach(function (k) {
      const text = keyText(k).trim();
      if (!text) return;
      const sk = text.toLowerCase();
      if (seen[sk]) return;
      const ps = keyPositions(k, side);
      if (ps.indexOf("TEAM") >= 0 || (pos && ps.indexOf(pos) >= 0)) {
        seen[sk] = 1;
        out.push(text);
      }
    });
    return out;
  }

  /** Union of keys matching any of the player's positions (+ TEAM). */
  function filterKeysForPositions(keys, positions, side) {
    const out = [];
    const seen = {};
    (positions && positions.length ? positions : [""]).forEach(function (pos) {
      filterKeysForPos(keys, pos, side).forEach(function (t) {
        const sk = t.toLowerCase();
        if (seen[sk]) return;
        seen[sk] = 1;
        out.push(t);
      });
    });
    return out;
  }

  root.OFFGRD_WEEK_AUTOTEST = {
    isWeekAutotest: isWeekAutotest,
    POSKINDS: POSKINDS,
    KIND_QUIZ: KIND_QUIZ,
    READY_MIN_TESTS: READY_MIN_TESTS,
    READY_AVG: READY_AVG,
    buildTestSpec: buildTestSpec,
    buildDefAligns: buildDefAligns,
    onApprove: onApprove,
    completionForPlayer: completionForPlayer,
    quizKindFromLabel: quizKindFromLabel,
    normPos: normPos,
    parseMemberPositions: parseMemberPositions,
    kindsForPositions: kindsForPositions,
    unionSpecForPlayer: unionSpecForPlayer,
    nudgeHtml: nudgeHtml,
    keyText: keyText,
    keyPositions: keyPositions,
    inferKeyPositions: inferKeyPositions,
    filterKeysForPos: filterKeysForPos,
    filterKeysForPositions: filterKeysForPositions
  };
})(typeof window !== "undefined" ? window : globalThis);
