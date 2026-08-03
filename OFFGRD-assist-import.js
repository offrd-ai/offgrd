/* ============================================================
   OFFGRD Assist / Classic film import → offgrd.scout_snaps
   P1 supply side. Does NOT write scouting_games.
   Does NOT touch existing ALIASES.backfield (two-readers).
   ============================================================ */
(function (root) {
  "use strict";

  var PROVIDER = "hudl-assist";

  /**
   * Target fields for the editable remap UI.
   * off_backfield is ADDITIVE — Assist Backfield only; never reuses ALIASES.backfield.
   */
  var FIELD_DEFS = [
    { key: "play_index", label: "Play #", optional: true },
    { key: "odk", label: "ODK", optional: true },
    { key: "down", label: "Down", optional: true },
    { key: "distance", label: "Distance", optional: true },
    { key: "hash", label: "Hash", optional: true },
    { key: "yardline", label: "Yard line", optional: true },
    { key: "play_type", label: "Play type", optional: true },
    { key: "result", label: "Result", optional: true },
    { key: "gain", label: "Gain/Loss", optional: true },
    { key: "formation", label: "Off. formation", optional: true },
    { key: "play", label: "Off. play", optional: true },
    { key: "off_strength", label: "Off. strength", optional: true },
    { key: "off_backfield", label: "Backfield (Assist)", optional: true },
    { key: "play_dir", label: "Play direction", optional: true },
    { key: "motion", label: "Motion direction", optional: true },
    { key: "front", label: "Def front", optional: true },
    { key: "coverage", label: "Coverage", optional: true },
    { key: "pressure", label: "Blitz / pressure", optional: true },
    { key: "qtr", label: "Quarter", optional: true },
    { key: "series", label: "Series", optional: true },
    { key: "efficiency", label: "Efficiency", optional: true },
    { key: "gap", label: "Gap", optional: true },
    { key: "pass_zone", label: "Pass zone", optional: true },
  ];

  /** Ship-with preset — locked against testplaylogs PlaylistData_* (2026-06/07). */
  var PRESET_ALIASES = {
    play_index: ["play #", "play#", "play number", "play no", "play"],
    odk: ["odk", "o/d/k", "odk.", "phase"],
    down: ["dn", "down", "dn.", "dwn"],
    distance: ["dist", "distance", "dist.", "dst", "to go"],
    hash: ["hash", "hash mark", "h"],
    yardline: ["yard ln", "yard line", "yardline", "yd ln", "yl", "ball on"],
    play_type: ["play type", "playtype", "run/pass"],
    result: ["result", "play result", "outcome"],
    gain: ["gn/ls", "gain", "gnls", "gn ls", "yards", "yds"],
    formation: ["off form", "off formation", "offensive formation", "formation", "form"],
    play: ["off play", "off. play", "offensive play", "play name", "concept"],
    off_strength: ["off str", "off strength", "offensive strength", "strength", "str"],
    off_backfield: ["backfield", "off backfield", "offensive backfield", "bf"],
    play_dir: ["play dir", "play direction", "dir", "direction"],
    motion: ["motion dir", "motion direction", "motion", "mot"],
    front: ["def front", "defensive front", "front", "d front"],
    coverage: ["coverage", "cov", "def coverage", "def cov"],
    pressure: ["blitz", "pressure", "pressure type", "def blitz", "blitz/stunt"],
    qtr: ["qtr", "quarter", "q", "period"],
    series: ["series", "ser"],
    efficiency: ["efficiency", "eff"],
    gap: ["gap"],
    pass_zone: ["pass zone", "pass zon", "passzone"],
  };

  var state = {
    headers: [],
    map: {}, // field → header name
    pending: null, // { snaps, meta }
    savedMapLoaded: false,
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normHeader(h) {
    return String(h || "")
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase();
  }

  function splitCSVLine(line) {
    if (typeof root.splitCSVLine === "function") return root.splitCSVLine(line);
    var parts = [];
    var cur = "";
    var q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') {
        q = !q;
        continue;
      }
      if (ch === "," && !q) {
        parts.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    parts.push(cur);
    return parts;
  }

  function stripJunk(txt) {
    if (typeof root.stripJunkRows === "function") return root.stripJunkRows(txt);
    return txt;
  }

  /** Mirror of offgrd.normalize_off_structure / formationCanon.normalizeOffStructure */
  function normalizeOffStructure(value) {
    if (value == null) return null;
    var v = String(value).trim().toLowerCase();
    if (!v) return null;
    if (v === "2x2" || v === "doubles" || v === "twins") return "2x2";
    if (
      v === "3x1" ||
      v === "trips" ||
      v === "bunch" ||
      v === "trips_bunch" ||
      v === "tight_bunch"
    )
      return "3x1";
    if (v === "2x1" || v === "trey" || v === "wing") return "2x1";
    if (v === "1x1") return "1x1";
    if (v === "4x1" || v === "quads") return "4x1";
    if (v === "3x2") return "3x2";
    return null;
  }

  /** Mirror of normalizeOffStrength */
  function normalizeOffStrength(value) {
    if (value == null) return null;
    var v = String(value).trim().toLowerCase();
    if (!v) return null;
    if (v === "field") return "field";
    if (v === "boundary") return "boundary";
    if (v === "left" || v === "l" || v === "lt") return "left";
    if (v === "right" || v === "r" || v === "rt") return "right";
    if (v === "balanced" || v === "bal" || v === "b") return "balanced";
    return null;
  }

  /** Match SQL plays.formation_id backfill / normalizeFormationForAliasLookup */
  function normalizeFormationForAliasLookup(raw) {
    if (raw == null) return "";
    return String(raw)
      .trim()
      .toLowerCase()
      .replace(/\s*\([^)]*\)\s*$/, "");
  }

  function zoneFromYardLine(raw) {
    if (typeof root.zoneFromYardLine === "function") return root.zoneFromYardLine(raw) || null;
    if (!raw) return null;
    var s = String(raw).trim().toUpperCase();
    if (/^G\b|GOAL|RZ|RED/.test(s)) return "REDZONE";
    var own = s.indexOf("-") === 0 || /^O[\s.]|OWN/.test(s);
    var opp = s.indexOf("+") === 0 || /^D[\s.]|OPP/.test(s);
    var num = parseInt(s.replace(/[^0-9]/g, ""), 10);
    if (opp) return !isNaN(num) && num <= 20 ? "REDZONE" : "PLUS";
    if (own) return "OWN";
    return null;
  }

  function isSuccessVal(down, distance, gain) {
    var O = root.OFFGRD_CALLER_OUTCOME;
    if (O && typeof O.isSuccessVal === "function") {
      var r = O.isSuccessVal(down, distance, gain);
      if (r === 1) return true;
      if (r === 0) return false;
      return null;
    }
    var g = +gain,
      d = +distance;
    if (isNaN(g) || isNaN(d) || d <= 0) return null;
    if (down <= 1) return g >= 0.5 * d;
    if (down === 2) return g >= 0.7 * d;
    return g >= d;
  }

  function normCoverage(v) {
    if (typeof root.normCoverage === "function") return root.normCoverage(v) || null;
    return v ? String(v).trim() : null;
  }

  function normHash(v) {
    if (!v) return null;
    var s = String(v).trim().toUpperCase();
    if (s === "L" || s === "LEFT") return "L";
    if (s === "R" || s === "RIGHT") return "R";
    if (s === "M" || s === "MID" || s === "MIDDLE") return "M";
    return s.slice(0, 1);
  }

  function asInt(v) {
    if (v == null || String(v).trim() === "") return null;
    var n = parseInt(String(v).replace(/[^0-9\-]/g, ""), 10);
    return isNaN(n) ? null : n;
  }

  function asNum(v) {
    if (v == null || String(v).trim() === "") return null;
    var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
    return isNaN(n) ? null : n;
  }

  /**
   * Assist backfield → off_back_count only when clean.
   * Unknown → null (never guess). Additive field — not ALIASES.personnel/formation.
   */
  function backCountFromBackfield(raw) {
    if (raw == null) return null;
    var s = String(raw).trim().toLowerCase();
    if (!s) return null;
    if (/^empty$|^0\b|no\s*back/.test(s)) return 0;
    if (/^1\b|single|one\s*back|pistol\s*1|gun\s*1/.test(s)) return 1;
    if (/^2\b|two\s*back|i[\s\-]?form|split\s*backs/.test(s)) return 2;
    var m = s.match(/\b([012])\s*back/);
    if (m) return Number(m[1]);
    return null;
  }

  function familyHintToStructure(hint) {
    if (!hint) return null;
    var h = String(hint).toLowerCase();
    if (h === "2x2") return "2x2";
    if (h === "3x1" || h === "bunch") return "3x1";
    if (h === "3x2" || h === "empty") return h === "empty" ? "3x2" : "3x2";
    if (h === "2x1") return "2x1";
    if (h === "4x1") return "4x1";
    return normalizeOffStructure(h);
  }

  function resolveFormation(raw) {
    var canon = root.OFFGRD_FORMATION_CANON;
    var lookup = normalizeFormationForAliasLookup(raw);
    var formationId = null;
    var formation = null;
    if (canon) {
      if (typeof canon.resolve === "function") {
        formation = canon.resolve(lookup) || canon.resolve(raw);
      }
      if (!formation && typeof canon.resolveId === "function") {
        var id = canon.resolveId(lookup) || canon.resolveId(raw);
        if (id && typeof canon.getById === "function") formation = canon.getById(id);
        formationId = id;
      }
      if (formation) formationId = formation.id;
    }
    var structure =
      normalizeOffStructure(lookup) ||
      normalizeOffStructure(raw) ||
      (formation && familyHintToStructure(formation.familyHint)) ||
      (formation &&
        typeof canon.computeNxM === "function" &&
        normalizeOffStructure(canon.computeNxM(formation))) ||
      null;
    var backCount = null;
    if (formation && formation.backfield) {
      var n = formation.backfield.filter(function (b) {
        return b && String(b.label || "").toUpperCase() !== "QB";
      }).length;
      if (n >= 0 && n <= 2) backCount = n;
    }
    var personnel = formation && formation.personnel ? String(formation.personnel) : null;
    return {
      formationId: formationId,
      structure: structure,
      backCount: backCount,
      personnel: personnel,
      raw: raw ? String(raw).trim() : null,
    };
  }

  function detectPresetMap(headers) {
    var byNorm = Object.create(null);
    headers.forEach(function (h) {
      byNorm[normHeader(h)] = h;
    });
    var map = {};
    FIELD_DEFS.forEach(function (fd) {
      var aliases = PRESET_ALIASES[fd.key] || [];
      for (var i = 0; i < aliases.length; i++) {
        if (byNorm[aliases[i]]) {
          map[fd.key] = byNorm[aliases[i]];
          break;
        }
      }
    });
    return map;
  }

  function mergeSavedMap(headers, saved) {
    var base = detectPresetMap(headers);
    if (!saved || typeof saved !== "object") return base;
    var byNorm = Object.create(null);
    headers.forEach(function (h) {
      byNorm[normHeader(h)] = h;
    });
    Object.keys(saved).forEach(function (k) {
      var want = saved[k];
      if (!want) return;
      var hit = byNorm[normHeader(want)];
      if (hit) base[k] = hit;
    });
    return base;
  }

  function headerIndex(headers, name) {
    if (!name) return -1;
    var n = normHeader(name);
    for (var i = 0; i < headers.length; i++) {
      if (normHeader(headers[i]) === n) return i;
    }
    return -1;
  }

  function parseText(txt) {
    var clean = stripJunk(txt || "");
    var lines = clean.replace(/\r/g, "").split("\n").filter(function (l) {
      return l.trim().length;
    });
    if (!lines.length) return { headers: [], rows: [] };
    var headers = splitCSVLine(lines[0]).map(function (h) {
      return h.trim();
    });
    var rows = [];
    for (var i = 1; i < lines.length; i++) {
      var cells = splitCSVLine(lines[i]);
      if (!cells.length || !cells.join("").trim()) continue;
      rows.push(cells);
    }
    return { headers: headers, rows: rows };
  }

  function cellAt(cells, headers, map, key) {
    var h = map[key];
    var idx = headerIndex(headers, h);
    if (idx < 0 || idx >= cells.length) return "";
    return String(cells[idx] == null ? "" : cells[idx]).trim();
  }

  function buildSnaps(parsed, map, opts) {
    opts = opts || {};
    var odkKeep = (opts.odkKeep || "auto").toUpperCase();
    var side = opts.side || "off";
    var opponent = opts.opponent || "";
    var week = opts.week || "";
    var teamId = opts.teamId;

    var snaps = [];
    var droppedOdk = 0;
    var unmatchedForms = Object.create(null);
    var matchedForms = 0;
    var formTagged = 0;
    var defPresent = !!(map.front || map.coverage || map.pressure);
    var defFilled = 0;

    // Auto ODK: side=off → keep D (their offense on our defensive film) when both present;
    // side=def → keep O (their defense on our offensive film). Coach can override.
    var odkHist = { O: 0, D: 0, K: 0, other: 0 };
    parsed.rows.forEach(function (cells) {
      var o = cellAt(cells, parsed.headers, map, "odk").toUpperCase().slice(0, 1);
      if (o === "O") odkHist.O++;
      else if (o === "D") odkHist.D++;
      else if (o === "K") odkHist.K++;
      else odkHist.other++;
    });
    var autoKeep = null;
    if (odkKeep === "AUTO") {
      if (side === "off") autoKeep = odkHist.D > 0 ? "D" : odkHist.O > 0 ? "O" : null;
      else autoKeep = odkHist.O > 0 ? "O" : odkHist.D > 0 ? "D" : null;
    } else if (odkKeep === "O" || odkKeep === "D") {
      autoKeep = odkKeep;
    } else {
      autoKeep = null; // ALL
    }

    var snapIndex = 0;
    parsed.rows.forEach(function (cells, rowIdx) {
      var odk = cellAt(cells, parsed.headers, map, "odk").toUpperCase().slice(0, 1);
      if (autoKeep && odk && odk !== autoKeep) {
        droppedOdk++;
        return;
      }

      var formRaw = cellAt(cells, parsed.headers, map, "formation");
      var resolved = resolveFormation(formRaw);
      if (formRaw) {
        formTagged++;
        if (resolved.formationId) matchedForms++;
        else unmatchedForms[formRaw] = (unmatchedForms[formRaw] || 0) + 1;
      }

      var bfRaw = cellAt(cells, parsed.headers, map, "off_backfield");
      var backFromBf = backCountFromBackfield(bfRaw);
      var offBack =
        backFromBf != null
          ? backFromBf
          : resolved.backCount != null
            ? resolved.backCount
            : null;

      var down = asInt(cellAt(cells, parsed.headers, map, "down"));
      var distance = asInt(cellAt(cells, parsed.headers, map, "distance"));
      var gain = asNum(cellAt(cells, parsed.headers, map, "gain"));
      var success = isSuccessVal(down, distance, gain);

      var coverage = normCoverage(cellAt(cells, parsed.headers, map, "coverage"));
      var front = cellAt(cells, parsed.headers, map, "front") || null;
      var pressureRaw = cellAt(cells, parsed.headers, map, "pressure");
      var pressure = pressureRaw ? String(pressureRaw).trim() : null;
      if (front || coverage || pressure) defFilled++;

      var motionRaw = cellAt(cells, parsed.headers, map, "motion");
      var motionType = motionRaw ? motionRaw : "none";

      var yardRaw = cellAt(cells, parsed.headers, map, "yardline");
      var fieldZone = zoneFromYardLine(yardRaw);

      // raw: all cells by header + Assist extras
      var rawObj = {};
      parsed.headers.forEach(function (h, i) {
        rawObj[h] = cells[i] != null ? String(cells[i]) : "";
      });
      if (bfRaw) rawObj._off_backfield = bfRaw;

      var mappedHeaders = {};
      Object.keys(map).forEach(function (k) {
        if (map[k]) mappedHeaders[normHeader(map[k])] = true;
      });
      // Unmapped columns already in rawObj by header name — keep verbatim.

      snaps.push({
        team_id: teamId,
        import_batch_id: null, // set at commit
        snap_index: snapIndex,
        opponent: opponent,
        week: week,
        side: side,
        down: down,
        distance: distance,
        field_zone: fieldZone || null,
        hash: normHash(cellAt(cells, parsed.headers, map, "hash")),
        coverage: coverage,
        front: front,
        pressure: pressure,
        play: cellAt(cells, parsed.headers, map, "play") || null,
        play_type: (cellAt(cells, parsed.headers, map, "play_type") || "").toLowerCase() || null,
        gain: gain,
        success: success,
        off_structure: resolved.structure,
        off_back_count: offBack,
        off_personnel: resolved.personnel,
        off_strength: normalizeOffStrength(
          cellAt(cells, parsed.headers, map, "off_strength")
        ),
        motion_type: motionType,
        formation: resolved.raw,
        formation_id: resolved.formationId,
        contract_version: "v1",
        raw: rawObj,
        _source_row: rowIdx + 1,
        _odk: odk || null,
      });
      snapIndex++;
    });

    var unmatchedList = Object.keys(unmatchedForms)
      .map(function (k) {
        return { form: k, n: unmatchedForms[k] };
      })
      .sort(function (a, b) {
        return b.n - a.n;
      });

    return {
      snaps: snaps,
      stats: {
        sourceRows: parsed.rows.length,
        kept: snaps.length,
        droppedOdk: droppedOdk,
        odkHist: odkHist,
        odkKeep: autoKeep || "ALL",
        formTagged: formTagged,
        formMatched: matchedForms,
        formMatchRate: formTagged ? Math.round((1000 * matchedForms) / formTagged) / 10 : null,
        unmatchedForms: unmatchedList,
        defColumnsPresent: defPresent,
        defRowsFilled: defFilled,
        mappedFields: Object.keys(map).filter(function (k) {
          return !!map[k];
        }),
        unmappedHeaders: parsed.headers.filter(function (h) {
          var used = false;
          Object.keys(map).forEach(function (k) {
            if (map[k] && normHeader(map[k]) === normHeader(h)) used = true;
          });
          return !used;
        }),
      },
    };
  }

  function getTeamId() {
    var b = root.OFFGRD_CALLER_BRIDGE;
    if (b && typeof b.getTeamId === "function" && b.getTeamId()) return b.getTeamId();
    var p = root.OFFGRD_PROGRAM;
    if (p && p.teamId) return p.teamId;
    return null;
  }

  function cloud() {
    return root.Cloud || null;
  }

  function readDialog() {
    return {
      opponent: ((document.getElementById("imp-opp") || {}).value || "").trim(),
      week: ((document.getElementById("imp-week") || {}).value || "").trim() || "Wk?",
      side: ((document.getElementById("imp-assist-side") || {}).value || "off"),
      odkKeep: ((document.getElementById("imp-assist-odk") || {}).value || "auto"),
    };
  }

  function renderMapGrid(headers, map) {
    var host = document.getElementById("assistMapGrid");
    if (!host) return;
    var opts =
      '<option value="">— unmapped —</option>' +
      headers
        .map(function (h) {
          return '<option value="' + esc(h) + '">' + esc(h) + "</option>";
        })
        .join("");
    var html =
      '<div class="lbl" style="margin-top:8px">Column map <span class="foot">(Hudl Assist / Classic preset · editable · saved per school)</span></div>';
    html +=
      '<div class="mapgrid" style="grid-template-columns:1fr 1.4fr;gap:6px">';
    FIELD_DEFS.forEach(function (fd) {
      html +=
        '<div class="maprow" style="display:contents"><span style="padding:6px 0;font-size:13px">' +
        esc(fd.label) +
        '</span><select data-assist-field="' +
        esc(fd.key) +
        '" style="width:100%;padding:6px 8px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--ink);font-weight:600">' +
        opts +
        "</select></div>";
    });
    html += "</div>";
    host.innerHTML = html;
    host.querySelectorAll("select[data-assist-field]").forEach(function (sel) {
      var k = sel.getAttribute("data-assist-field");
      if (map[k]) sel.value = map[k];
      sel.onchange = function () {
        if (sel.value) state.map[k] = sel.value;
        else delete state.map[k];
      };
    });
  }

  async function ensureMap(headers) {
    state.headers = headers;
    var C = cloud();
    var teamId = getTeamId();
    var saved = null;
    if (C && teamId && typeof C.getFilmColumnMap === "function") {
      try {
        var row = await C.getFilmColumnMap(teamId, PROVIDER);
        saved = row && row.map ? row.map : null;
      } catch (e) {
        console.warn("[assist-import] film_column_maps", e && e.message);
      }
    }
    state.map = mergeSavedMap(headers, saved);
    renderMapGrid(headers, state.map);
    state.savedMapLoaded = true;
  }

  async function preview() {
    var msg = document.getElementById("importMsg");
    var prev = document.getElementById("importPreview");
    var commitBtn = document.getElementById("commitBtn");
    var txt = ((document.getElementById("csvText") || {}).value || "").trim();
    if (!txt) {
      if (msg) msg.textContent = "Paste or choose a file first.";
      return;
    }
    var dlg = readDialog();
    if (!dlg.opponent) {
      if (msg) msg.textContent = "Enter the opponent name before preview.";
      return;
    }
    var teamId = getTeamId();
    if (!teamId) {
      if (msg) msg.textContent = "Sign in to your program (top right) before Auto-Scout import.";
      return;
    }

    var parsed = parseText(txt);
    await ensureMap(parsed.headers);
    // re-read map from selects
    var host = document.getElementById("assistMapGrid");
    if (host) {
      host.querySelectorAll("select[data-assist-field]").forEach(function (sel) {
        var k = sel.getAttribute("data-assist-field");
        if (sel.value) state.map[k] = sel.value;
        else delete state.map[k];
      });
    }

    var built = buildSnaps(parsed, state.map, {
      teamId: teamId,
      opponent: dlg.opponent,
      week: dlg.week,
      side: dlg.side,
      odkKeep: dlg.odkKeep,
    });
    state.pending = {
      snaps: built.snaps,
      stats: built.stats,
      dlg: dlg,
      teamId: teamId,
      headers: parsed.headers,
      map: Object.assign({}, state.map),
    };

    var st = built.stats;
    var H = "";
    H +=
      '<div class="lbl" style="margin-top:6px">Auto-Scout preview</div>';
    H +=
      '<p style="font-size:14px"><b>' +
      st.kept +
      "</b> snaps → <b>" +
      esc(dlg.opponent) +
      "</b> · " +
      esc(dlg.week) +
      " · side=<b>" +
      esc(dlg.side) +
      "</b> · ODK keep=<b>" +
      esc(st.odkKeep) +
      "</b></p>";
    H +=
      '<p class="foot" style="margin:2px 0">Source rows ' +
      st.sourceRows +
      " · dropped by ODK filter <b>" +
      st.droppedOdk +
      "</b> (never silent)</p>";
    if (st.odkHist) {
      H +=
        '<p style="font-size:13px;margin:2px 0">ODK histogram: ' +
        Object.keys(st.odkHist)
          .filter(function (k) {
            return st.odkHist[k];
          })
          .map(function (k) {
            return "<b>" + esc(k) + "</b> " + st.odkHist[k];
          })
          .join(" · ") +
        "</p>";
    }
    H +=
      '<p style="font-size:13px;margin:4px 0">Defensive columns present: <b>' +
      (st.defColumnsPresent ? "yes" : "no") +
      "</b>" +
      (st.defColumnsPresent
        ? " · " + st.defRowsFilled + " rows with front/coverage/blitz"
        : "") +
      "</p>";
    H +=
      '<p style="font-size:13px;margin:4px 0">Formation match-rate: <b>' +
      (st.formMatchRate == null ? "n/a" : st.formMatchRate + "%") +
      "</b> (" +
      st.formMatched +
      "/" +
      st.formTagged +
      " → formation_id)</p>";
    if (st.unmatchedForms.length) {
      H +=
        '<div class="lbl" style="margin-top:8px">Unmatched formations <span class="foot">(alias gap list)</span></div><div class="cleanwrap">';
      st.unmatchedForms.slice(0, 24).forEach(function (u) {
        H +=
          '<span class="chip">' +
          esc(u.form) +
          " <i>&times;" +
          u.n +
          "</i></span>";
      });
      H += "</div>";
    }
    H +=
      '<div class="lbl" style="margin-top:8px">Mapped fields (' +
      st.mappedFields.length +
      ')</div><p class="foot">' +
      st.mappedFields.map(esc).join(", ") +
      "</p>";
    if (st.unmappedHeaders.length) {
      H +=
        '<div class="lbl" style="margin-top:6px">Unmapped columns → raw jsonb</div><p class="foot">' +
        st.unmappedHeaders.map(esc).join(", ") +
        "</p>";
    }
    H +=
      '<p class="foot" style="margin-top:8px">Commit writes <code>tag_source=import</code> via <code>upsert_scout_snap_import_v1</code> · never <code>scouting_games</code>.</p>';

    if (prev) prev.innerHTML = H;
    if (commitBtn) {
      commitBtn.style.display = "";
      commitBtn.textContent = "Commit to Auto-Scout";
    }
    if (msg)
      msg.textContent =
        "Review map + sanity above, then Commit. Re-import of the same game will ask to replace.";
  }

  async function persistMap() {
    var C = cloud();
    var teamId = getTeamId();
    if (!C || !teamId || typeof C.saveFilmColumnMap !== "function") return;
    try {
      await C.saveFilmColumnMap(teamId, PROVIDER, state.map);
    } catch (e) {
      console.warn("[assist-import] save map", e && e.message);
    }
  }

  async function commit() {
    var msg = document.getElementById("importMsg");
    var C = cloud();
    if (!state.pending || !state.pending.snaps.length) {
      if (msg) msg.textContent = "Preview first.";
      return;
    }
    if (!C || typeof C.upsertScoutSnapImport !== "function") {
      if (msg) msg.textContent = "Cloud client missing Auto-Scout helpers — reload after deploy.";
      return;
    }
    var p = state.pending;
    var dlg = p.dlg;
    var teamId = p.teamId;

    if (msg) msg.textContent = "Checking for a prior import…";

    var priorCount = 0;
    var priorBatches = [];
    try {
      priorBatches = await C.listImportBatchesForGame(
        teamId,
        dlg.opponent,
        dlg.week,
        dlg.side
      );
      priorCount = await C.countImportSnapsForGame(
        teamId,
        dlg.opponent,
        dlg.week,
        dlg.side
      );
    } catch (e) {
      if (msg) msg.textContent = "Could not check prior imports: " + (e.message || e);
      return;
    }

    if (priorCount > 0) {
      var ok = confirm(
        "Replace previous import for " +
          dlg.opponent +
          ", " +
          dlg.week +
          " (side=" +
          dlg.side +
          ")?\n\n" +
          priorCount +
          " existing import row(s) across " +
          priorBatches.length +
          " batch(es) will be deleted, then this file will be committed.\n\nCancel keeps the previous import."
      );
      if (!ok) {
        if (msg) msg.textContent = "Commit cancelled — previous import kept.";
        return;
      }
      try {
        await C.deleteImportSnapsForGame(teamId, dlg.opponent, dlg.week, dlg.side);
      } catch (e2) {
        if (msg) msg.textContent = "Supersede delete failed: " + (e2.message || e2);
        return;
      }
    }

    await persistMap();

    if (msg) msg.textContent = "Creating import batch…";
    var job;
    try {
      job = await C.createAutoScoutJob({
        team_id: teamId,
        opponent: dlg.opponent,
        source: "hudl-assist-csv",
        clip_count: p.snaps.length,
        done_count: 0,
        skipped_count: p.stats.droppedOdk || 0,
        status: "processing",
      });
    } catch (e3) {
      if (msg) msg.textContent = "Could not create auto_scout_jobs row: " + (e3.message || e3);
      return;
    }

    var batchId = job.id;
    var done = 0;
    var failed = 0;
    var firstErr = null;
    if (msg) msg.textContent = "Importing 0/" + p.snaps.length + "…";

    for (var i = 0; i < p.snaps.length; i++) {
      var snap = p.snaps[i];
      var payload = {
        team_id: teamId,
        import_batch_id: batchId,
        snap_index: snap.snap_index,
        opponent: dlg.opponent,
        week: dlg.week,
        side: dlg.side,
        down: snap.down,
        distance: snap.distance,
        field_zone: snap.field_zone,
        hash: snap.hash,
        coverage: snap.coverage,
        front: snap.front,
        pressure: snap.pressure,
        play: snap.play,
        play_type: snap.play_type,
        gain: snap.gain,
        success: snap.success,
        off_structure: snap.off_structure,
        off_back_count: snap.off_back_count,
        off_personnel: snap.off_personnel,
        off_strength: snap.off_strength,
        motion: { motion_type: snap.motion_type },
        formation: snap.formation,
        raw_formation_label: snap.formation,
        formation_id: snap.formation_id,
        contract_version: "v1",
        raw: snap.raw,
      };
      try {
        await C.upsertScoutSnapImport(payload);
        done++;
      } catch (e4) {
        failed++;
        if (!firstErr) firstErr = e4.message || String(e4);
      }
      if (i % 10 === 0 && msg) {
        msg.textContent = "Importing " + done + "/" + p.snaps.length + "…";
      }
    }

    try {
      await C.updateAutoScoutJob(batchId, {
        done_count: done,
        skipped_count: (p.stats.droppedOdk || 0) + failed,
        status: failed && !done ? "failed" : "done",
        finished_at: new Date().toISOString(),
      });
    } catch (e5) {
      console.warn("[assist-import] job update", e5 && e5.message);
    }

    var finalCount = done;
    try {
      finalCount = await C.countImportSnapsForGame(
        teamId,
        dlg.opponent,
        dlg.week,
        dlg.side
      );
    } catch (e6) {}

    if (msg) {
      msg.textContent =
        "Committed " +
        done +
        " import snaps" +
        (priorCount ? " (replaced " + priorCount + ")" : "") +
        " · " +
        dlg.opponent +
        " / " +
        dlg.week +
        " / " +
        dlg.side +
        " · rows now " +
        finalCount +
        (failed ? " · " + failed + " failed: " + firstErr : "") +
        " · batch " +
        String(batchId).slice(0, 8);
    }
    /* Cutover: Predict/Tendencies read scout_snaps — refresh corpus now. */
    try {
      if (typeof root.OFFGRD_REFRESH_SCOUT_SNAPS === "function") {
        await root.OFFGRD_REFRESH_SCOUT_SNAPS();
      }
    } catch (eRefresh) {
      console.warn("[assist-import] refresh snaps", eRefresh && eRefresh.message);
    }
    var commitBtn = document.getElementById("commitBtn");
    if (commitBtn && !failed) commitBtn.style.display = "none";
    state.pending = null;
  }

  function setAssistChrome(on) {
    var panel = document.getElementById("assistImportPanel");
    if (panel) panel.style.display = on ? "" : "none";
    var classicHints = document.getElementById("classicImportHints");
    if (classicHints) classicHints.style.display = on ? "none" : "";
    var commitBtn = document.getElementById("commitBtn");
    if (commitBtn && on) commitBtn.textContent = "Commit to Auto-Scout";
    else if (commitBtn) commitBtn.textContent = "Commit to season";
  }

  /**
   * Mode detection must NOT rely solely on window.IMPORT_MODE — OFFGRD.html
   * declares `let IMPORT_MODE` (script-local), so window.IMPORT_MODE was always
   * undefined and Assist commit silently fell through to commitPending →
   * scouting_games (BUG: tag_source='human' via bridge). Prefer the active
   * mode button + assist panel visibility; mirror onto window when present.
   */
  function isAssistMode() {
    if (root.IMPORT_MODE === "autoscout") return true;
    try {
      var on = document.querySelector("#seg-importmode button.on");
      if (on && on.getAttribute("data-mode") === "autoscout") return true;
      var panel = document.getElementById("assistImportPanel");
      if (panel && panel.style.display !== "none" && panel.offsetParent !== null) {
        /* panel shown — still require the mode button when present */
        if (on) return on.getAttribute("data-mode") === "autoscout";
      }
    } catch (e) {}
    return false;
  }

  function onPreviewClick() {
    if (!isAssistMode()) return false;
    Promise.resolve(preview()).catch(function (e) {
      console.warn("assist preview", e);
      var msg = document.getElementById("importMsg");
      if (msg) msg.textContent = "Auto-Scout preview failed: " + (e && e.message ? e.message : e);
    });
    return true;
  }

  function onCommitClick() {
    if (!isAssistMode()) return false;
    Promise.resolve(commit()).catch(function (e) {
      console.warn("assist commit", e);
      var msg = document.getElementById("importMsg");
      if (msg) msg.textContent = "Auto-Scout commit failed: " + (e && e.message ? e.message : e);
    });
    return true;
  }

  root.OFFGRD_ASSIST_IMPORT = {
    PROVIDER: PROVIDER,
    FIELD_DEFS: FIELD_DEFS,
    PRESET_ALIASES: PRESET_ALIASES,
    preview: preview,
    commit: commit,
    setAssistChrome: setAssistChrome,
    onPreviewClick: onPreviewClick,
    onCommitClick: onCommitClick,
    isAssistMode: isAssistMode,
    detectPresetMap: detectPresetMap,
    buildSnaps: buildSnaps,
    normalizeOffStructure: normalizeOffStructure,
  };
})(typeof window !== "undefined" ? window : globalThis);
