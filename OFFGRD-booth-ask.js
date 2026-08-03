/**
 * Booth Tier-2 — free-text ask (online).
 *
 * Question → closed intent → engine facts → LLM phrases → validateLlmText.
 * The model never invents a query or a number. Failed validation keeps template.
 *
 *   window.OFFGRD_BOOTH_ASK
 */
(function (global) {
  "use strict";

  var TIMEOUT_MS = 8000;
  var CLOSED = [
    "working",
    "beating",
    "third",
    "best_look",
    "leaning",
    "redzone",
    "drives",
    "turnovers",
    "refuse",
  ];

  function isOffline() {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  }

  function normalizeQuestion(q) {
    return String(q || "")
      .toLowerCase()
      .replace(/[^\w\s%/.-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
  }

  function isClosedIntent(id) {
    return CLOSED.indexOf(id) >= 0;
  }

  /**
   * Deterministic closed-set classifier. LLM intent (when used) must still
   * land in this set — local map is the cage floor and the offline path.
   * High-confidence refuse never leaves the device (injection / players / predictions).
   */
  function classifyIntentLocal(question) {
    var q = normalizeQuestion(question);
    if (!q) return { intent: "refuse", confidence: 1, reason: "empty" };

    /* Prompt-injection / jailbreak — refuse locally; never route to the model. */
    if (
      /\b(ignore|disregard)\b.*\b(previous|prior|above|all)\b.*\b(instruction|prompt|rules?)\b/.test(q) ||
      /\b(system prompt|jailbreak|pwned|developer mode)\b/.test(q) ||
      /\byou are now\b/.test(q)
    ) {
      return { intent: "refuse", confidence: 1, reason: "injection" };
    }

    /* Player / identity probes — hard refuse (no names in payload anyway). */
    if (
      /\b(who|#\d+|jersey|player|kid|athlete|email|bench)\b/.test(q) ||
      /\bnumber\s+\d{1,2}\b/.test(q) ||
      /\b(is|how is|how's)\s+\w+\s+playing\b/.test(q) ||
      /\bplaying well\b/.test(q)
    ) {
      return { intent: "refuse", confidence: 1, reason: "identity" };
    }

    /* Predictions / scoreboard — not in the caller log.
       Note: normalize strips apostrophes → "what's" becomes "what s". */
    if (
      /\b(going to win|will we win|are we (gonna|going to) win|predict|who wins)\b/.test(q) ||
      /\b(what'?s|whats|what s)\s+the\s+score\b/.test(q) ||
      /\bthe\s+score\b/.test(q) ||
      /\bfinal score\b/.test(q)
    ) {
      return { intent: "refuse", confidence: 1, reason: "prediction" };
    }

    /* In-scope chips — situation hooks before bare "what should I call". */
    if (/\b(drive chart|drives?|d series|series chart)\b/.test(q) || /\bhow (were|was) (the )?drives?\b/.test(q)) {
      return { intent: "drives", confidence: 0.9, reason: "keyword" };
    }
    if (/\b(turnover|turnovers|giveaway|takeaway|tod|fumble|safety)\b/.test(q)) {
      return { intent: "turnovers", confidence: 0.9, reason: "keyword" };
    }
    if (/\b(red\s*zone|rz|goal\s*line|inside the 20|inside the twenty)\b/.test(q)) {
      return { intent: "redzone", confidence: 0.95, reason: "keyword" };
    }
    if (/\b(3rd|third)\b/.test(q)) {
      return { intent: "third", confidence: 0.9, reason: "keyword" };
    }
    if (/\b(best look|vs their|formation|top look|against their)\b/.test(q)) {
      return { intent: "best_look", confidence: 0.9, reason: "keyword" };
    }
    if (/\b(lean|leaning|tendency|tendencies|run.?pass|what are they)\b/.test(q)) {
      return { intent: "leaning", confidence: 0.9, reason: "keyword" };
    }
    if (/\b(beat(ing)? us|what.?s cold|killing us|hurting us|gashed)\b/.test(q)) {
      return { intent: "beating", confidence: 0.95, reason: "keyword" };
    }
    if (/\b(cold|not working|struggling)\b/.test(q)) {
      return { intent: "beating", confidence: 0.8, reason: "keyword" };
    }
    if (/\b(what.?s working|holding|held them|working tonight|our best)\b/.test(q)) {
      return { intent: "working", confidence: 0.95, reason: "keyword" };
    }
    if (/\bworking\b/.test(q)) {
      return { intent: "working", confidence: 0.75, reason: "keyword" };
    }

    /* Pure prescription with no situation hook — decline (decision-aid only). */
    if (
      /\b(what|which)\s+(defense|offense|coverage|front|blitz|call|play)\s+should\b/.test(q) ||
      /\btell me what to (call|run|do)\b/.test(q) ||
      /\bwhat should i (call|run|do)\b/.test(q) ||
      /\bshould i (call|run)\b/.test(q)
    ) {
      return { intent: "refuse", confidence: 1, reason: "prescriptive" };
    }

    return { intent: "refuse", confidence: 0.6, reason: "no_match" };
  }

  /** Honest Booth decline — never "Unknown chip." */
  function refusalLines(reason) {
    var r = reason || "no_match";
    var line;
    if (r === "identity" || r === "prediction" || r === "prescriptive") {
      line =
        "I can only tell you what's been logged tonight — I can't judge individual players or predict outcomes.";
    } else if (r === "injection") {
      line =
        "I only know what's been logged tonight — try a chip, or ask about what's working, 3rd down, or red zone.";
    } else {
      line =
        "I only know what's been logged tonight — try a chip, or ask about what's working, 3rd down, or red zone.";
    }
    return {
      intent: "refuse",
      lines: [line],
      thin: [false],
      refused: true,
      reason: r,
    };
  }

  /**
   * Engine facts for a closed intent. Refuse never calls boothChipAnswer("refuse")
   * (that chip id does not exist → "Unknown chip.").
   */
  function engineAnswer(intent, payload, reason) {
    var id = intent;
    if (id && typeof id === "object") {
      reason = reason || id.reason;
      payload = payload || id.payload;
      id = id.intent;
    }
    id = String(id || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    if (id === "bestlook") id = "best_look";

    if (id === "refuse" || !isClosedIntent(id)) {
      return refusalLines(reason || "no_match");
    }

    var A = global.OFFGRD_CALLER_ANALYSIS;
    if (!A || typeof A.boothChipAnswer !== "function") {
      return {
        intent: id,
        lines: ["Analysis engine not loaded."],
        thin: [false],
        refused: false,
      };
    }

    var ans = A.boothChipAnswer(id, payload || {});
    var lines = (ans && ans.lines) || [];
    /* Guard: unknown chip id must never surface to the coach. */
    if (!lines.length || lines[0] === "Unknown chip.") {
      return refusalLines(reason || "no_match");
    }
    return {
      intent: id,
      lines: lines.slice(0, 4),
      thin: ((ans && ans.thin) || []).slice(0, 4),
      refused: false,
    };
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

  async function fetchBoothIntentOnce(normQ, gameId, snapCount) {
    var Llm = global.OFFGRD_CALLER_SUMMARY_LLM;
    var cfg = global.OFFGRD_CONFIG || {};
    var base = String(cfg.url || "").replace(/\/$/, "");
    if (!base) throw new Error("no supabase url");
    var sb = global.__OFFRD_SUPABASE__ || null;
    if (!sb || !sb.auth) throw new Error("cloud not ready");
    var s2 = await sb.auth.getSession();
    var tok = s2 && s2.data && s2.data.session && s2.data.session.access_token;
    if (!tok) throw new Error("sign in required");

    var sections = [
      {
        id: "closed",
        title: "Closed intents",
        lines: CLOSED.slice(),
      },
      {
        id: "question",
        title: "Question",
        lines: [normQ],
      },
    ];
    var sig =
      "game_summary|v1|booth_intent|" +
      String(gameId || "local") +
      "|" +
      String(snapCount || 0) +
      "|" +
      normQ;

    var body = {
      family: "game_summary",
      tier: "booth_intent",
      snapCount: snapCount || 0,
      gameId: gameId || null,
      sections: sections,
      signature: sig,
    };
    if (Llm && typeof Llm.bannedIdentityLeak === "function") {
      var leak = Llm.bannedIdentityLeak(body);
      if (leak) throw new Error("identity blocked");
    }

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
    if (!r.ok) throw new Error(out.error || "intent failed");
    var intentSec = ((out.sections || []).filter(function (s) {
      return s && s.id === "intent";
    })[0]) || (out.sections && out.sections[0]);
    var raw = intentSec && intentSec.lines && intentSec.lines[0];
    var intent = String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    if (intent === "bestlook") intent = "best_look";
    if (!isClosedIntent(intent)) return { intent: "refuse", source: "llm_invalid" };
    return { intent: intent, source: "llm", cached: !!(out && out.cached) };
  }

  /**
   * Resolve intent: local first.
   * High-confidence refuse never hits the network (injection / players / predictions).
   * High-confidence in-scope stays local. Only ambiguous no_match may ask LLM intent.
   */
  function resolveIntent(question, opts, done) {
    opts = opts || {};
    var local = classifyIntentLocal(question);
    /* Cage floor: confident local answers (including refuse) never leave the device. */
    if (local.confidence >= 0.75) {
      done({ intent: local.intent, source: "local", local: local });
      return;
    }
    if (isOffline() || opts.localOnly) {
      done({ intent: local.intent, source: "local", local: local });
      return;
    }
    var normQ = normalizeQuestion(question);
    var attempts = 0;
    function tryLlm() {
      attempts++;
      withTimeout(
        fetchBoothIntentOnce(normQ, opts.gameId, opts.snapCount),
        TIMEOUT_MS
      )
        .then(function (r) {
          done({
            intent: r.intent,
            source: r.source || "llm",
            local: local,
            cached: r.cached,
          });
        })
        .catch(function () {
          if (attempts < 2) {
            tryLlm();
            return;
          }
          done({ intent: local.intent, source: "local_fallback", local: local });
        });
    }
    tryLlm();
  }

  /**
   * Full ask: paint template from engine, then optional LLM phrasing behind validateLlmText.
   * onUpdate({ status, intent, lines, thin, source, message })
   */
  function ask(question, opts, onUpdate) {
    opts = opts || {};
    var notify = typeof onUpdate === "function" ? onUpdate : function () {};
    var normQ = normalizeQuestion(question);

    if (!normQ) {
      notify({ status: "error", message: "Type a question, or tap a chip.", lines: [], thin: [] });
      return;
    }
    if (isOffline()) {
      notify({
        status: "offline",
        message: "Free questions need a connection — chips work anywhere.",
        lines: [],
        thin: [],
      });
      return;
    }

    notify({ status: "pending", question: normQ, lines: [], thin: [], message: "Asking Booth…" });

    resolveIntent(normQ, opts, function (resolved) {
      var intent = isClosedIntent(resolved.intent) ? resolved.intent : "refuse";
      var reason =
        (resolved.local && resolved.local.reason) ||
        (intent === "refuse" ? "no_match" : null);
      var eng = engineAnswer(intent, opts.payload || {}, reason);
      var finished = false;
      function finish(state) {
        if (finished) return;
        if (state && state.status === "done") finished = true;
        notify(state);
      }

      finish({
        status: "template",
        question: normQ,
        intent: intent,
        intentSource: resolved.source,
        lines: eng.lines.slice(),
        thin: (eng.thin || []).slice(),
        refused: !!eng.refused,
        source: "template",
      });

      /* Refuse / empty: never re-route to LLM phrasing. */
      if (eng.refused || intent === "refuse" || !eng.lines.length) {
        finish({
          status: "done",
          question: normQ,
          intent: "refuse",
          intentSource: resolved.source,
          lines: eng.lines.slice(),
          thin: (eng.thin || []).slice(),
          refused: true,
          reason: eng.reason || reason,
          source: "template",
        });
        return;
      }

      var Llm = global.OFFGRD_CALLER_SUMMARY_LLM;
      if (!Llm || typeof Llm.requestPhrasing !== "function") {
        finish({
          status: "done",
          question: normQ,
          intent: intent,
          lines: eng.lines.slice(),
          thin: (eng.thin || []).slice(),
          source: "template",
        });
        return;
      }

      /* Tier-3 Final: richer fact sections (drives/turnovers) enter the allow-set only. */
      var phraseTier = opts.tier === "final" ? "booth_final" : "booth";
      var sections = [
        {
          id: "booth",
          title: opts.tier === "final" ? "Booth · Final" : "Booth",
          lines: eng.lines.slice(),
        },
      ];
      if (opts.tier === "final" && opts.payload && opts.payload.finalFacts) {
        var ff = opts.payload.finalFacts;
        var ctxLines = [];
        var oD = (ff.drives && ff.drives.offense) || [];
        var dD = (ff.drives && ff.drives.defense) || [];
        if (oD.length) {
          var oSum = 0;
          oD.forEach(function (d) {
            oSum += d.yards || 0;
          });
          ctxLines.push("O drives: " + oD.length + " · " + oSum + " yd");
        }
        if (dD.length) {
          var dSum = 0;
          dD.forEach(function (d) {
            dSum += d.yards || 0;
          });
          ctxLines.push("D series: " + dD.length + " · " + dSum + " yd allowed");
        }
        if (ff.turnovers && ff.turnovers.total) {
          ctxLines.push("Possession changes: " + ff.turnovers.total);
        }
        if (ctxLines.length) {
          sections.push({ id: "final_ctx", title: "Final context", lines: ctxLines.slice(0, 4) });
        }
      }
      var view = {
        tier: phraseTier,
        sections: sections,
        lines: eng.lines.slice(),
      };
      /* Cache: (game, surface, normalized-question, snapCount) */
      var snapCount = opts.snapCount != null ? opts.snapCount : 0;
      var gameId = opts.gameId || "local";
      var surface = opts.tier === "final" ? "booth_final" : "booth";
      Llm.requestPhrasing(
        view,
        {
          tier: phraseTier,
          snapCount: snapCount,
          gameId: String(gameId) + "|" + surface + "|" + normQ,
          session: opts.session,
        },
        function (next) {
          var lines =
            (next &&
              next.sections &&
              next.sections[0] &&
              next.sections[0].lines) ||
            null;
          if (!lines || !lines.length) return;
          finish({
            status: "done",
            question: normQ,
            intent: intent,
            intentSource: resolved.source,
            lines: lines.slice(0, 4),
            thin: (eng.thin || []).slice(0, 4),
            source: "llm",
            llmCached: !!(next && next.llmCached),
          });
        }
      );

      /* Bound: if phrasing never applies, settle on template after window. */
      setTimeout(function () {
        finish({
          status: "done",
          question: normQ,
          intent: intent,
          intentSource: resolved.source,
          lines: eng.lines.slice(),
          thin: (eng.thin || []).slice(),
          source: "template",
          settle: true,
        });
      }, TIMEOUT_MS * 2 + 500);
    });
  }

  var api = {
    CLOSED_INTENTS: CLOSED.slice(),
    normalizeQuestion: normalizeQuestion,
    isClosedIntent: isClosedIntent,
    classifyIntentLocal: classifyIntentLocal,
    engineAnswer: engineAnswer,
    resolveIntent: resolveIntent,
    ask: ask,
  };

  global.OFFGRD_BOOTH_ASK = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
