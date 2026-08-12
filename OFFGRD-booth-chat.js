/**
 * OFFGRD-booth-chat.js — B1 free-form Ask Booth (online-only, additive).
 *
 * Typed text → booth-chat SSE. Chips stay on closed-intent (OFFGRD_BOOTH_ASK).
 * Digit fail: one silent stricter regenerate → nearest-preset template + notice.
 * Freshness: answers stamped with snapCount; dim after +6 snaps.
 *
 *   window.OFFGRD_BOOTH_CHAT
 */
(function (global) {
  "use strict";

  var TIMEOUT_MS = 12000;
  var STALE_AFTER = 6;
  var HISTORY_MAX = 6;
  var thread = []; /* { id, role, text, snapAt, status, source, notice?, stale? } */

  function isOffline() {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  }

  function teamId() {
    try {
      if (global.TEAM && global.TEAM.id) return global.TEAM.id;
      if (global.Account && typeof global.Account.getTeamId === "function") {
        return global.Account.getTeamId();
      }
      return localStorage.getItem("offgrd_team") || "";
    } catch (e) {
      return "";
    }
  }

  function uid() {
    return "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function getThread() {
    return thread;
  }

  function clearThread() {
    thread = [];
  }

  function markStale(currentSnap) {
    var n = currentSnap != null ? +currentSnap : 0;
    thread.forEach(function (m) {
      if (m.role === "assistant" && m.snapAt != null && n - m.snapAt >= STALE_AFTER) {
        m.stale = true;
      }
    });
  }

  function nearestPresetIntent(question) {
    var B = global.OFFGRD_BOOTH_ASK;
    if (B && typeof B.classifyIntentLocal === "function") {
      var local = B.classifyIntentLocal(question);
      if (local && local.intent && local.intent !== "refuse") return local.intent;
      /* Soft map common free-form to nearest chip even when refuse-confidence. */
    }
    var q = String(question || "").toLowerCase();
    if (/\b(3rd|third)\b/.test(q)) return "third";
    if (/\b(red\s*zone|rz)\b/.test(q)) return "redzone";
    if (/\b(beat|cold|hurting|killing)\b/.test(q)) return "beating";
    if (/\b(lean|tendency|what are they)\b/.test(q)) return "leaning";
    if (/\b(best look|formation)\b/.test(q)) return "best_look";
    if (/\b(drive)\b/.test(q)) return "drives";
    if (/\b(turnover)\b/.test(q)) return "turnovers";
    return "working";
  }

  function templateFallback(question, payload, notice) {
    var B = global.OFFGRD_BOOTH_ASK;
    var intent = nearestPresetIntent(question);
    var eng =
      B && typeof B.engineAnswer === "function"
        ? B.engineAnswer(intent, payload || {})
        : { lines: ["I only know what's been logged tonight — try a chip."], thin: [false] };
    return {
      status: "done",
      question: question,
      intent: intent,
      lines: (eng.lines || []).slice(0, 4),
      thin: eng.thin || [],
      source: "template_fallback",
      notice: notice || "Couldn't verify Booth's numbers — showing the nearest live answer.",
      snapAt: ((payload && payload.offenseLog) || []).length + ((payload && payload.defenseLog) || []).length,
    };
  }

  function validateText(text, atoms) {
    var Llm = global.OFFGRD_CALLER_SUMMARY_LLM;
    if (!Llm || typeof Llm.validateLlmText !== "function") return { ok: true };
    return Llm.validateLlmText(text, atoms || Object.create(null));
  }

  async function getToken() {
    var sb = global.__OFFRD_SUPABASE__ || null;
    if (!sb || !sb.auth) throw new Error("cloud not ready");
    var s2 = await sb.auth.getSession();
    var tok = s2 && s2.data && s2.data.session && s2.data.session.access_token;
    if (!tok) throw new Error("sign in required");
    return tok;
  }

  /**
   * Stream one booth-chat turn. Returns full text.
   * onToken(partialText) optional.
   */
  async function streamOnce(body, onToken, signal) {
    var cfg = global.OFFGRD_CONFIG || {};
    var base = String(cfg.url || "").replace(/\/$/, "");
    if (!base) throw new Error("no supabase url");
    var tok = await getToken();
    var r = await fetch(base + "/functions/v1/booth-chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + tok,
        apikey: cfg.anonKey || "",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
      signal: signal,
    });
    if (!r.ok) {
      var errBody = await r.text().catch(function () {
        return "";
      });
      var msg = "booth-chat failed";
      try {
        var j = JSON.parse(errBody);
        if (j && j.error) msg = j.error;
      } catch (e) {}
      throw new Error(msg);
    }
    if (!r.body || typeof r.body.getReader !== "function") {
      var plain = await r.text();
      if (typeof onToken === "function") onToken(plain);
      return plain;
    }
    var reader = r.body.getReader();
    var dec = new TextDecoder();
    var buf = "";
    var full = "";
    while (true) {
      var step = await reader.read();
      if (step.done) break;
      buf += dec.decode(step.value, { stream: true });
      var parts = buf.split("\n");
      buf = parts.pop() || "";
      for (var i = 0; i < parts.length; i++) {
        var line = parts[i].trim();
        if (!line) continue;
        if (line.indexOf("data:") !== 0) continue;
        var data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          var ev = JSON.parse(data);
          if (ev && typeof ev.t === "string") {
            full += ev.t;
            if (typeof onToken === "function") onToken(full);
          } else if (ev && typeof ev.text === "string") {
            full = ev.text;
            if (typeof onToken === "function") onToken(full);
          } else if (ev && ev.error) {
            throw new Error(ev.error);
          }
        } catch (e) {
          if (e && e.message && e.message !== "Unexpected end of JSON input") {
            if (String(e.message).indexOf("booth") >= 0 || String(e.message).indexOf("rate") >= 0) throw e;
          }
          /* non-JSON data line — treat as raw token */
          if (data && data[0] !== "{" && data !== "[DONE]") {
            full += data;
            if (typeof onToken === "function") onToken(full);
          }
        }
      }
    }
    return full;
  }

  function historyForRequest() {
    var out = [];
    thread
      .filter(function (m) {
        return m.role === "user" || m.role === "assistant";
      })
      .slice(-HISTORY_MAX * 2)
      .forEach(function (m) {
        out.push({ role: m.role, text: String(m.text || "").slice(0, 600) });
      });
    return out;
  }

  function pushUser(question, snapAt) {
    var m = { id: uid(), role: "user", text: question, snapAt: snapAt, status: "done" };
    thread.push(m);
    return m;
  }

  function pushAssistantPlaceholder(snapAt) {
    var m = {
      id: uid(),
      role: "assistant",
      text: "",
      snapAt: snapAt,
      status: "pending",
      source: "stream",
    };
    thread.push(m);
    return m;
  }

  /**
   * Free-form ask. onUpdate({ status, thread, message, lines?, notice? })
   * opts: { payload, side, session, sit, plays, covDist, scoutRows, callSheet, gamePlanFocus, scoutSummary }
   */
  function askFreeform(question, opts, onUpdate) {
    opts = opts || {};
    var notify = typeof onUpdate === "function" ? onUpdate : function () {};
    var q = String(question || "").trim().slice(0, 240);
    if (!q) {
      notify({ status: "error", message: "Type a question, or tap a chip.", thread: thread });
      return;
    }
    if (isOffline()) {
      notify({
        status: "offline",
        message: "Free questions need a connection — chips work anywhere.",
        thread: thread,
      });
      return;
    }

    var Pack = global.OFFGRD_BOOTHPACK;
    if (!Pack || typeof Pack.build !== "function") {
      notify({ status: "error", message: "Booth pack not loaded.", thread: thread });
      return;
    }

    var tid = teamId();
    if (!tid) {
      notify({ status: "error", message: "Sign in with a staff team to ask Booth.", thread: thread });
      return;
    }

    var built = Pack.build({
      side: opts.side || (opts.payload && opts.payload.side) || "defense",
      offenseLog: (opts.payload && opts.payload.offenseLog) || opts.offenseLog || [],
      defenseLog: (opts.payload && opts.payload.defenseLog) || opts.defenseLog || [],
      shifts: (opts.payload && opts.payload.shifts) || opts.shifts || [],
      breaks: (opts.payload && opts.payload.breaks) || opts.breaks || [],
      session: opts.session,
      sit: opts.sit,
      plays: opts.plays,
      covDist: opts.covDist,
      scoutRows: opts.scoutRows,
      callSheet: opts.callSheet,
      gamePlanFocus: opts.gamePlanFocus,
      scoutSummary: opts.scoutSummary,
      gameId: opts.gameId,
    });

    var snapAt = built.snapCount;
    markStale(snapAt);
    pushUser(q, snapAt);
    var assistant = pushAssistantPlaceholder(snapAt);
    notify({ status: "pending", message: "Asking Booth…", thread: thread });

    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer =
      ctrl &&
      setTimeout(function () {
        try {
          ctrl.abort();
        } catch (e) {}
      }, TIMEOUT_MS);

    var bodyBase = {
      team_id: tid,
      game_id: built.gameId,
      snap_count: snapAt,
      question: q,
      pack: built.pack,
      history: historyForRequest().slice(0, -1), /* exclude current pending assistant */
      strict: false,
    };

    function finishFallback(notice) {
      var fb = templateFallback(q, opts.payload || opts, notice);
      assistant.status = "done";
      assistant.source = "template_fallback";
      assistant.notice = fb.notice;
      assistant.text = (fb.lines || []).join("\n");
      assistant.lines = fb.lines;
      assistant.thin = fb.thin;
      assistant.intent = fb.intent;
      notify({ status: "done", thread: thread, notice: fb.notice, lines: fb.lines });
    }

    function run(strict) {
      var body = Object.assign({}, bodyBase, { strict: !!strict });
      return streamOnce(
        body,
        function (partial) {
          assistant.text = partial;
          assistant.status = "streaming";
          notify({ status: "streaming", thread: thread });
        },
        ctrl ? ctrl.signal : undefined
      ).then(function (full) {
        var text = String(full || "").trim();
        var v = validateText(text, built.atoms);
        if (!v.ok) {
          if (!strict) {
            assistant.text = "";
            assistant.status = "pending";
            notify({ status: "pending", message: "Rechecking numbers…", thread: thread });
            return run(true);
          }
          finishFallback("Couldn't verify Booth's numbers — showing the nearest live answer.");
          return;
        }
        assistant.text = text;
        assistant.status = "done";
        assistant.source = "llm";
        assistant.lines = text.split(/\n+/).filter(Boolean).slice(0, 12);
        notify({ status: "done", thread: thread, lines: assistant.lines });
      });
    }

    run(false)
      .catch(function (err) {
        var msg = (err && err.message) || "Couldn't reach Booth — try the chips.";
        if (/abort/i.test(msg) || (err && err.name === "AbortError")) {
          finishFallback("Booth timed out — showing the nearest live answer.");
          return;
        }
        if (/rate|429/i.test(msg)) {
          assistant.status = "error";
          assistant.text = "";
          assistant.notice = msg;
          notify({ status: "error", message: msg, thread: thread });
          return;
        }
        finishFallback(msg);
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
      });
  }

  function reask(messageId, opts, onUpdate) {
    var m = null;
    for (var i = 0; i < thread.length; i++) {
      if (thread[i].id === messageId) {
        /* find preceding user */
        for (var j = i - 1; j >= 0; j--) {
          if (thread[j].role === "user") {
            m = thread[j];
            break;
          }
        }
        break;
      }
    }
    if (!m) {
      if (typeof onUpdate === "function") onUpdate({ status: "error", message: "Nothing to re-ask.", thread: thread });
      return;
    }
    /* Drop stale assistant so re-ask appends fresh. */
    thread = thread.filter(function (x) {
      return x.id !== messageId;
    });
    askFreeform(m.text, opts, onUpdate);
  }

  var api = {
    STALE_AFTER: STALE_AFTER,
    askFreeform: askFreeform,
    reask: reask,
    getThread: getThread,
    clearThread: clearThread,
    markStale: markStale,
    nearestPresetIntent: nearestPresetIntent,
  };

  global.OFFGRD_BOOTH_CHAT = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
