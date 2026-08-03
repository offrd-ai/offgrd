/**
 * Caller analysis · Step 3 — LLM phrasing over templates.
 *
 * Numbers from the engine. Words from the model. Never the reverse.
 * Template paints instantly; LLM swaps in only if every number validates.
 * Drive toast stays template-only (attention budget). Half/final (+ quarter) may upgrade.
 *
 *   window.OFFGRD_CALLER_SUMMARY_LLM
 */
(function (global) {
  "use strict";

  var TIMEOUT_MS = 8000;
  var FAMILY = "game_summary";
  var VERSION = "v1";

  function isOffline() {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (_, rej) {
        setTimeout(function () {
          rej(new Error("timeout"));
        }, ms);
      }),
    ]);
  }

  /**
   * Canonical numeric atoms from text — 8/11 ≡ 8 of 11 ≡ 73%; 3/3 ≡ 3 of 3 ≡ 100%.
   * Used both to build the allow-set from templates and to validate LLM output.
   */
  function extractNumericAtoms(text) {
    var s = String(text || "");
    var atoms = Object.create(null);

    function add(a) {
      if (a == null || a === "") return;
      atoms[String(a)] = 1;
    }

    /* Add a fraction and its full synonym family (ratio + percent forms). */
    function addFractionFamily(a, b) {
      if (!b || !isFinite(a) || !isFinite(b)) return;
      add(a + "/" + b);
      add(a + "of" + b);
      add(String(a));
      add(String(b));
      var pct = Math.round((100 * a) / b);
      add(String(pct));
      add(pct + "%");
      add((a / b).toFixed(2));
      /* 0.XX form only for 0–99; 100% is 1.00 (already added). */
      if (pct >= 0 && pct < 100) add("0." + String(pct).padStart(2, "0"));
    }

    /* fractions: 8/11, 8 of 11, 8-of-11 */
    var fracRe = /(\d+)\s*(?:\/|of|-of-)\s*(\d+)/gi;
    var m;
    var fracSpans = [];
    while ((m = fracRe.exec(s))) {
      addFractionFamily(+m[1], +m[2]);
      fracSpans.push([m.index, m.index + m[0].length]);
    }

    /* percentages — also accept as fraction family anchors when 0–100 */
    var pctRe = /(\d+(?:\.\d+)?)\s*%/g;
    while ((m = pctRe.exec(s))) {
      var p = Math.round(parseFloat(m[1]));
      add(String(p));
      add(p + "%");
      if (p >= 0 && p <= 100) add((p / 100).toFixed(2));
      if (p >= 0 && p < 100) add("0." + String(p).padStart(2, "0"));
    }

    /* plain integers / decimals — skip spans already claimed by a fraction match */
    function inFracSpan(idx) {
      for (var i = 0; i < fracSpans.length; i++) {
        if (idx >= fracSpans[i][0] && idx < fracSpans[i][1]) return true;
      }
      return false;
    }
    var numRe = /\b(\d+\.\d+|\d+)\b/g;
    while ((m = numRe.exec(s))) {
      if (inFracSpan(m.index)) continue;
      var n = m[1];
      add(n);
      if (n.indexOf(".") >= 0) {
        var f = parseFloat(n);
        if (!isNaN(f) && f <= 1) {
          var pc = Math.round(f * 100);
          add(String(pc));
          add(pc + "%");
        }
      }
    }

    return atoms;
  }

  function mergeAtoms(into, from) {
    Object.keys(from || {}).forEach(function (k) {
      into[k] = 1;
    });
    return into;
  }

  /**
   * Coerce allow-set to a null-prototype atom map.
   * Strings are fact text (extract atoms) — never index a string by digit key
   * (JS "fact"[7] is a character → false accept of hallucinated 7).
   */
  function asAtomSet(allowedAtoms) {
    if (typeof allowedAtoms === "string") return extractNumericAtoms(allowedAtoms);
    if (!allowedAtoms || typeof allowedAtoms !== "object" || Array.isArray(allowedAtoms)) {
      return Object.create(null);
    }
    return allowedAtoms;
  }

  function atomsFromView(view) {
    var atoms = Object.create(null);
    if (!view) return atoms;
    (view.lines || []).forEach(function (ln) {
      mergeAtoms(atoms, extractNumericAtoms(ln));
    });
    (view.sections || []).forEach(function (sec) {
      mergeAtoms(atoms, extractNumericAtoms(sec.title || ""));
      (sec.lines || []).forEach(function (ln) {
        mergeAtoms(atoms, extractNumericAtoms(ln));
      });
    });
    return atoms;
  }

  /**
   * Product-safety core: every numeric atom in llmText must exist in the
   * fact/template allow-set. LLM may rephrase; it may not introduce numbers.
   * 3/3 ≡ 3 of 3 ≡ 100% via extractNumericAtoms synonym family.
   */
  function validateLlmText(llmText, allowedAtoms) {
    var allowed = asAtomSet(allowedAtoms);
    var found = extractNumericAtoms(llmText);
    var keys = Object.keys(found);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!Object.prototype.hasOwnProperty.call(allowed, k)) {
        return { ok: false, bad: k, reason: "number mismatch" };
      }
    }
    return { ok: true };
  }

  function validateLlmSections(sections, allowedAtoms) {
    if (!Array.isArray(sections) || !sections.length) return { ok: false, reason: "empty" };
    for (var i = 0; i < sections.length; i++) {
      var sec = sections[i] || {};
      var blob = (sec.title || "") + "\n" + (sec.lines || []).join("\n");
      var v = validateLlmText(blob, allowedAtoms);
      if (!v.ok) return { ok: false, reason: "number mismatch", bad: v.bad, sectionId: sec.id };
    }
    return { ok: true };
  }

  /** Strict allowlist body for the edge — never spread raw view. */
  function buildAllowlistedBody(view, opts) {
    opts = opts || {};
    var tier = opts.tier || (view && view.tier) || "half";
    var snapCount = opts.snapCount != null ? opts.snapCount : 0;
    var gameId = (opts.session && opts.session.gameId) || opts.gameId || "";
    var sections = ((view && view.sections) || []).map(function (sec) {
      return {
        id: String(sec.id || ""),
        title: String(sec.title || ""),
        lines: (sec.lines || []).map(function (ln) {
          return String(ln);
        }),
      };
    });
    var sigCore =
      VERSION +
      "|" +
      tier +
      "|" +
      String(gameId || "local") +
      "|" +
      String(snapCount) +
      "|" +
      hashSections(sections);
    return {
      family: FAMILY,
      tier: tier,
      snapCount: snapCount,
      gameId: gameId || null,
      sections: sections,
      signature: FAMILY + "|" + sigCore,
    };
  }

  function hashSections(sections) {
    var s = JSON.stringify(sections || []);
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function bannedIdentityLeak(obj) {
    var json = JSON.stringify(obj);
    var banned = ["playerName", "player_id", "playerId", "jersey", "athleteName", "email"];
    for (var i = 0; i < banned.length; i++) {
      if (json.indexOf('"' + banned[i] + '"') >= 0) return banned[i];
    }
    return null;
  }

  async function fetchPhrasingOnce(body) {
    var cfg = global.OFFGRD_CONFIG || {};
    var base = String(cfg.url || "").replace(/\/$/, "");
    if (!base) throw new Error("no supabase url");
    var sb = global.__OFFRD_SUPABASE__ || null;
    if (!sb || !sb.auth) throw new Error("cloud not ready");
    var s2 = await sb.auth.getSession();
    var tok = s2 && s2.data && s2.data.session && s2.data.session.access_token;
    if (!tok) throw new Error("sign in required for LLM phrasing");

    var r = await fetch(base + "/functions/v1/game-summary-llm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + tok,
        apikey: cfg.anonKey || "",
      },
      body: JSON.stringify(body),
    });
    var out = await r.json().catch(function () {
      return {};
    });
    if (!r.ok) throw new Error(out.error || "phrasing failed");
    return out;
  }

  /**
   * Fire-and-forget phrasing. Never blocks paint.
   * onApplied(viewWithLlmLines) only if validation passes.
   * One retry on failure, then silent keep-template.
   */
  function requestPhrasing(view, opts, onApplied) {
    if (!view || !view.sections || !view.sections.length) return;
    if (isOffline()) return;
    if (opts && opts.tier === "drive") return; /* drive toast template-only */

    var body;
    try {
      body = buildAllowlistedBody(view, opts);
    } catch (e) {
      return;
    }
    var leak = bannedIdentityLeak(body);
    if (leak) {
      try {
        console.warn("[game-summary-llm] blocked identity field", leak);
      } catch (e) {}
      return;
    }

    var allowed = atomsFromView(view);

    function attempt(retried) {
      withTimeout(fetchPhrasingOnce(body), TIMEOUT_MS)
        .then(function (out) {
          var secs = (out && out.sections) || null;
          if (!secs || !secs.length) return;
          var v = validateLlmSections(secs, allowed);
          if (!v.ok) {
            try {
              console.warn("[game-summary-llm] discard —", v.reason, v.bad || "", v.sectionId || "");
            } catch (e) {}
            return;
          }
          var next = applySectionLines(view, secs);
          next.source = "llm";
          next.llmCached = !!(out && out.cached);
          if (typeof onApplied === "function") onApplied(next);
        })
        .catch(function (e) {
          if (!retried) {
            attempt(true);
            return;
          }
          try {
            console.warn("[game-summary-llm] keep template", e && e.message);
          } catch (e2) {}
        });
    }
    attempt(false);
  }

  /**
   * Event-feed one-liner phrasing. Template line paints first; LLM may swap later.
   * Same digit validation + one retry. Never in the per-snap path (caller schedules async).
   */
  function requestEventLine(templateLine, opts, onApplied) {
    opts = opts || {};
    if (!templateLine || isOffline()) return;
    var gameId = (opts.session && opts.session.gameId) || opts.gameId || "";
    var eventId = opts.eventId || "event";
    var view = {
      tier: "event",
      sections: [
        {
          id: "event",
          title: "Event",
          lines: [String(templateLine)],
        },
      ],
      lines: [String(templateLine)],
    };
    /* Cache key: (game, event id) — re-ask same event free; new snaps = new event ids. */
    requestPhrasing(
      view,
      {
        tier: "event",
        snapCount: 1,
        gameId: (gameId || "local") + "|" + eventId,
        session: opts.session,
      },
      function (next) {
        var line =
          next &&
          next.sections &&
          next.sections[0] &&
          next.sections[0].lines &&
          next.sections[0].lines[0];
        if (line && typeof onApplied === "function") onApplied(String(line));
      }
    );
  }

  function applySectionLines(view, llmSections) {
    var byId = Object.create(null);
    (llmSections || []).forEach(function (s) {
      if (s && s.id) byId[s.id] = s;
    });
    var sections = (view.sections || []).map(function (sec) {
      var alt = byId[sec.id];
      if (!alt || !alt.lines || !alt.lines.length) return sec;
      return Object.assign({}, sec, {
        lines: alt.lines.slice(),
        title: alt.title || sec.title,
        source: "llm",
      });
    });
    var flat = [];
    sections.forEach(function (sec) {
      flat.push(sec.title);
      (sec.lines || []).forEach(function (ln) {
        flat.push(ln);
      });
    });
    return Object.assign({}, view, { sections: sections, lines: flat, source: "llm" });
  }

  var api = {
    extractNumericAtoms: extractNumericAtoms,
    asAtomSet: asAtomSet,
    atomsFromView: atomsFromView,
    validateLlmText: validateLlmText,
    validateLlmSections: validateLlmSections,
    buildAllowlistedBody: buildAllowlistedBody,
    bannedIdentityLeak: bannedIdentityLeak,
    requestPhrasing: requestPhrasing,
    requestEventLine: requestEventLine,
    applySectionLines: applySectionLines,
    FAMILY: FAMILY,
  };

  global.OFFGRD_CALLER_SUMMARY_LLM = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
