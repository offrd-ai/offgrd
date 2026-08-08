/* ============================================================
   OFFGRD Cloud — Supabase auth + sync wrapper (ES module)
   Used by OFFGRD.html and OFFGRD-Playbook.html once accounts are on.
   Load AFTER setting window.OFFGRD_CONFIG = { url, anonKey } (see OFFGRD-config.example.js).
   Import:  <script type="module"> import { Cloud } from "./OFFGRD-cloud.js"; </script>
   Offline-first: callers keep writing localStorage as the cache; Cloud syncs when online + logged in.
   ============================================================ */
/* Supabase client is loaded locally via <script src="vendor/supabase.js"> (window.supabase) — no external CDN. */
const createClient = (typeof window !== "undefined" && window.supabase && window.supabase.createClient) ? window.supabase.createClient : null;
const cfg = (typeof window !== "undefined" && window.OFFGRD_CONFIG) || {};
const sb = createClient ? createClient(cfg.url || "", cfg.anonKey || "", {
  auth: { persistSession: true, autoRefreshToken: true }
}) : null;
/* Consolidation (Sprint 1 §5): OFFGRD tables now live in the `offgrd` schema of the authority
   project. Table calls go through OG (schema-qualified); RPCs use the public.offgrd_* wrappers. */
const OG = sb ? sb.schema("offgrd") : null;

function projectRefFromUrl(url) {
  const m = String(url || "").match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m ? m[1] : "";
}
function projectRefFromJwt(token) {
  try {
    const part = String(token || "").split(".")[1];
    if (!part || typeof atob !== "function") return "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64 + "===".slice((b64.length + 3) % 4);
    const payload = JSON.parse(atob(pad));
    if (payload && payload.ref) return String(payload.ref);
    const iss = String((payload && payload.iss) || "");
    const m = iss.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
    return m ? m[1] : "";
  } catch (e) { return ""; }
}
/** Drop leftover auth tokens from other Supabase projects (pre-cutover fwsxg…, etc.). */
function purgeForeignAuthTokens(expectedRef) {
  if (!expectedRef || typeof localStorage === "undefined") return 0;
  const keep = "sb-" + expectedRef + "-auth-token";
  const kill = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || "";
      if (/^sb-.*-auth-token$/.test(k) && k !== keep) kill.push(k);
    }
    kill.forEach(function (k) { localStorage.removeItem(k); });
  } catch (e) {}
  return kill.length;
}
const EXPECTED_REF = projectRefFromUrl(cfg.url);

export const Cloud = {
  ready: !!(createClient && cfg.url && cfg.anonKey),
  sb,
  expectedProjectRef: EXPECTED_REF,
  projectRefFromJwt,
  purgeForeignAuthTokens: function () { return purgeForeignAuthTokens(EXPECTED_REF); },

  /* ---------- auth ---------- */
  /**
   * Cross-origin SSO hand-off (offops.app → getoffrd.com).
   * Reads #at= & #rt= from the hash fragment, setSession, then strips the hash.
   * Fail-safe: wrong-project / failed setSession NEVER clears an existing valid session.
   */
  async consumeAuthHandOff() {
    if (!sb || typeof location === "undefined") return false;
    const raw = (location.hash || "").replace(/^#/, "");
    if (!raw) return false;
    const h = new URLSearchParams(raw);
    const at = h.get("at");
    const rt = h.get("rt");
    /* Always strip tokens from the URL so they never linger in history/Referer. */
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    if (!at || !rt) return false;

    purgeForeignAuthTokens(EXPECTED_REF);

    /* Reject tokens issued for a different Supabase project before touching auth state. */
    if (EXPECTED_REF) {
      const tokenRef = projectRefFromJwt(at);
      if (tokenRef && tokenRef !== EXPECTED_REF) {
        try { console.warn("[OFFGRD SSO] hand-off ignored: token project", tokenRef, "!=", EXPECTED_REF); } catch (e) {}
        return false;
      }
    }

    let prior = null;
    try {
      const cur = await sb.auth.getSession();
      prior = cur && cur.data && cur.data.session ? cur.data.session : null;
    } catch (e) { prior = null; }

    try {
      const { data, error } = await sb.auth.setSession({ access_token: at, refresh_token: rt });
      if (error || !(data && data.session)) {
        if (prior && prior.access_token && prior.refresh_token) {
          try { await sb.auth.setSession({ access_token: prior.access_token, refresh_token: prior.refresh_token }); } catch (e2) {}
        }
        return false;
      }
      return true;
    } catch (e) {
      if (prior && prior.access_token && prior.refresh_token) {
        try { await sb.auth.setSession({ access_token: prior.access_token, refresh_token: prior.refresh_token }); } catch (e2) {}
      }
      return false;
    }
  },
  /** True when a session's access token matches this client's project ref. */
  sessionMatchesProject(session) {
    if (!session || !session.access_token || !EXPECTED_REF) return !!session;
    const ref = projectRefFromJwt(session.access_token);
    return !ref || ref === EXPECTED_REF;
  },
  async signUp(email, password, fullName) {
    return sb.auth.signUp({ email, password, options: { data: { full_name: fullName || "" } } });
  },
  async signIn(email, password) { return sb.auth.signInWithPassword({ email, password }); },
  async signOut() { return sb.auth.signOut(); },
  /** Email a recovery link (lands on getOFFRD /reset-password). */
  async resetPassword(email) {
    return sb.auth.resetPasswordForEmail(email, {
      redirectTo: "https://getoffrd.com/reset-password"
    });
  },
  /** Change password for the currently signed-in user. */
  async updatePassword(password) {
    return sb.auth.updateUser({ password });
  },
  async user() { const { data } = await sb.auth.getUser(); return data.user || null; },
  async session() { try { const { data } = await sb.auth.getSession(); return (data && data.session) ? data.session.user : null; } catch(e){ return null; } },
  onAuth(cb) { return sb.auth.onAuthStateChange((_e, session) => cb(session ? session.user : null)); },

  /* ---------- teams ---------- */
  /**
   * Programs for the signed-in user.
   * Prefer schema select; on empty/error fall back to public membership RPCs
   * (same path as getOFFRD Team Home) so clean player devices don't need a
   * prior coach Scout sync to populate local caches.
   */
  async myTeams() {
    let rows = [];
    if (OG) {
      try {
        const { data, error } = await OG.from("teams").select("*").order("created_at");
        if (!error) rows = data || [];
        else console.warn("[Cloud.myTeams] schema", error.message);
      } catch (e) {
        console.warn("[Cloud.myTeams] schema", e && e.message);
      }
    }
    if (rows.length) return rows;

    try {
      const { data: mem, error } = await sb.rpc("offgrd_my_player_membership");
      if (error) throw error;
      if (mem && mem.team_id && mem.is_member) {
        let schedule = [];
        let brand = mem.brand || null;
        let name = mem.team_name || "Program";
        try {
          const { data: pub } = await sb.rpc("offgrd_public_schedule", { t: mem.team_id });
          if (pub) {
            if (Array.isArray(pub.schedule)) schedule = pub.schedule;
            if (pub.brand) brand = pub.brand;
            if (pub.name) name = pub.name;
          }
        } catch (e) {}
        return [{
          id: mem.team_id,
          name: name,
          brand: brand,
          schedule: schedule,
          high_school_id: mem.school_id || null
        }];
      }
    } catch (e) {
      console.warn("[Cloud.myTeams] membership", e && e.message);
    }
    return [];
  },
  async createTeam(name) {
    const { data, error } = await sb.rpc("offgrd_create_team", { team_name: name });
    if (error) throw error; return data; // team id
  },
  /** School-link status from public.offgrd_my_team() — orphan CTA + backfill eligibility. */
  async myTeamStatus() {
    const { data, error } = await sb.rpc("offgrd_my_team");
    if (error) throw error;
    return data || { linked: false };
  },
  /** Link caller-owned orphan team to caller's high_school_coaches.school_id. */
  async linkTeamToSchool(teamId) {
    const { data, error } = await sb.rpc("offgrd_link_team_to_school", { p_team_id: teamId });
    if (error) throw error;
    return data;
  },
  async canCreateTeam() {
    const { data, error } = await sb.rpc("offgrd_can_create_team");
    if (error) throw error;
    return !!data;
  },
  async playerWeekPlan(teamId) {
    const { data, error } = await sb.rpc("offgrd_player_week_plan", { t: teamId });
    if (error) throw error;
    return data;
  },
  async setWeekPlayerShare(teamId, share) {
    const { error } = await sb.rpc("offgrd_set_week_player_share", { t: teamId, share });
    if (error) throw error;
  },
  // get the user's first team, creating a default one on first login
  async ensureTeam(defaultName) {
    let teams = await this.myTeams();
    if (!teams.length) { await this.createTeam(defaultName || "My Program"); teams = await this.myTeams(); }
    return teams[0];
  },
  async addMember(teamId, email, role) {
    const { error } = await sb.rpc("offgrd_add_member", { t: teamId, member_email: email, member_role: role || "coach" });
    if (error) throw error;
  },
  async roster(teamId) {
    const { data, error } = await OG.from("team_members").select("user_id, role").eq("team_id", teamId);
    if (error) throw error; return data || [];
  },

  /* ---------- roster, invites, roles ---------- */
  async teamRoster(teamId) {
    const { data, error } = await sb.rpc("offgrd_team_roster", { t: teamId });
    if (error) throw error; return data || [];
  },
  async myRole(teamId) {
    const { data, error } = await sb.rpc("offgrd_my_role", { t: teamId });
    if (error) throw error; return data;
  },
  async setMyPosition(teamId, pos) {
    const { error } = await sb.rpc("offgrd_set_my_position", { t: teamId, pos });
    if (error) throw error;
  },
  async setMyPositions(teamId, positions) {
    const arr = Array.isArray(positions) ? positions : [];
    const { error } = await sb.rpc("offgrd_set_my_positions", { t: teamId, pos: arr });
    if (error) throw error;
  },
  async setMyName(name) {
    const u = await this.session(); if (!u) return;
    const { error } = await OG.from("profiles").update({ full_name: name }).eq("id", u.id);
    if (error) throw error;
  },
  async setTeamBrand(teamId, brand) {
    const { error } = await sb.rpc("offgrd_set_team_brand", { t: teamId, b: brand });
    if (error) throw error;
  },
  async inviteMember(teamId, email, role) {
    // returns 'added' (user existed) or 'pending' (will join on signup)
    const { data, error } = await sb.rpc("offgrd_invite_member", { t: teamId, member_email: email, member_role: role });
    if (error) throw error; return data;
  },
  async listInvites(teamId) {
    const { data, error } = await OG.from("invites").select("*").eq("team_id", teamId).order("created_at");
    if (error) throw error; return data || [];
  },
  async revokeInvite(id) { const { error } = await OG.from("invites").delete().eq("id", id); if (error) throw error; },
  async joinByCode(code) { const { data, error } = await sb.rpc("offgrd_join_by_code", { code }); if (error) throw error; return data; },
  /** Phase 4: merge roster → public.players (source=team). */
  async seedPlayerFromTeam(opts) {
    const { data, error } = await sb.rpc("offgrd_seed_player_from_team", {
      p_grad_year: (opts && opts.gradYear) || null,
      p_position: (opts && opts.position) || null,
      p_full_name: (opts && opts.fullName) || null,
    });
    if (error) throw error;
    return data;
  },
  async recruitingSnapshot() {
    const { data, error } = await sb.rpc("offgrd_recruiting_snapshot");
    if (error) throw error;
    return data;
  },
  async setMemberRole(teamId, userId, role) {
    const { error } = await OG.from("team_members").update({ role }).eq("team_id", teamId).eq("user_id", userId);
    if (error) throw error;
  },
  async removeMember(teamId, userId) {
    const { error } = await OG.from("team_members").delete().eq("team_id", teamId).eq("user_id", userId);
    if (error) throw error;
  },
  async rotateCode(teamId) { const { data, error } = await sb.rpc("offgrd_rotate_join_code", { t: teamId }); if (error) throw error; return data; },

  /* ---------- plays (playbook) ---------- */
  async listPlays(teamId) {
    const { data, error } = await OG.from("plays").select("*").eq("team_id", teamId).order("updated_at", { ascending: false });
    if (error) throw error; return data || [];
  },
  async savePlay(teamId, play) {
    // play.id optional; data holds the full play state from the designer
    const payload = play.data || play;
    const formation = play.formation || (payload && payload.formation) || "";
    const row = {
      team_id: teamId, name: play.name, family: play.family, series: play.series,
      personnel: play.personnel, formation: play.formation, protection: play.protection,
      data: payload
    };
    /* Resolve formation_id on write — same trailing-(...) strip as SQL backfill
       (OFFGRD_FORMATION_CANON.norm). Defensive fronts (4-3, 3-4, …) stay NULL. */
    try {
      const FC = (typeof globalThis !== "undefined" && globalThis.OFFGRD_FORMATION_CANON) || null;
      if (FC && typeof FC.resolveId === "function") {
        row.formation_id = formation ? (FC.resolveId(formation) || null) : null;
      }
    } catch (_) { /* leave formation_id unset if canon unavailable */ }
    /* Wizard Confirm / Author seeds live on the play — persist columns so Reps Lab "Our plays" can attribute by name. */
    const reads = play.qb_reads || (payload && payload.qb_reads);
    const ol = play.ol_keys || (payload && payload.ol_keys);
    if (reads && typeof reads === "object" && Object.keys(reads).length) row.qb_reads = reads;
    if (ol && typeof ol === "object") row.ol_keys = ol;
    if (play.id) row.id = play.id;
    const { data, error } = await OG.from("plays").upsert(row).select().single();
    if (error) throw error; return data;
  },
  async deletePlay(id) { const { error } = await OG.from("plays").delete().eq("id", id); if (error) throw error; },
  async updatePlayReads(id, qb_reads) {
    const { data, error } = await OG.from("plays").update({ qb_reads }).eq("id", id).select().single();
    if (error) throw error; return data;
  },
  async updatePlayOlKeys(id, ol_keys) {
    const { data, error } = await OG.from("plays").update({ ol_keys }).eq("id", id).select().single();
    if (error) throw error; return data;
  },

  /* ---------- scouting games (season library) ---------- */
  async listGames(teamId) {
    try {
      const { data, error } = await sb.rpc("offgrd_team_scouting", { t: teamId });
      if (!error) return data || [];
      console.warn("[Cloud.listGames] rpc", error.message);
    } catch (e) {
      console.warn("[Cloud.listGames] rpc", e && e.message);
    }
    if (!OG) return [];
    const { data, error } = await OG.from("scouting_games").select("*").eq("team_id", teamId).order("updated_at", { ascending: false });
    if (error) throw error; return data || [];
  },
  async saveGame(teamId, game) {
    const row = { team_id: teamId, opponent: game.opponent, week: game.week, side: game.side, source: game.source, rows: game.rows };
    if (game.id) row.id = game.id;
    const { data, error } = await OG.from("scouting_games").upsert(row).select().single();
    if (error) throw error; return data;
  },
  async deleteGame(id) { const { error } = await OG.from("scouting_games").delete().eq("id", id); if (error) throw error; },

  /* ---------- live caller event log (multi-device, append-only) ---------- */
  async activeCallerGame(teamId) {
    if (!OG || !teamId) return null;
    const { data, error } = await OG.from("caller_games").select("*")
      .eq("team_id", teamId).eq("status", "active").maybeSingle();
    if (error) throw error;
    return data || null;
  },
  async ensureCallerGame(teamId, meta) {
    if (!OG || !teamId) return null;
    const existing = await this.activeCallerGame(teamId);
    if (existing) return existing;
    const row = {
      team_id: teamId,
      opponent: (meta && meta.opponent) || null,
      week: (meta && meta.week) || null,
      game_date: (meta && meta.game_date) || null,
      status: "active",
      created_by: (meta && meta.created_by) || null,
    };
    if (meta && meta.id) row.id = meta.id;
    const { data, error } = await OG.from("caller_games").insert(row).select().single();
    if (error) {
      /* race: another device created active game */
      const again = await this.activeCallerGame(teamId);
      if (again) return again;
      throw error;
    }
    return data;
  },
  async archiveCallerGame(gameId) {
    if (!OG || !gameId) return;
    const { error } = await OG.from("caller_games").update({ status: "archived" }).eq("id", gameId);
    if (error) throw error;
  },
  async listCallerEvents(teamId, gameId) {
    if (!OG || !teamId || !gameId) return [];
    const { data, error } = await OG.from("caller_events").select("*")
      .eq("team_id", teamId).eq("game_id", gameId)
      .order("client_ts", { ascending: true });
    if (error) throw error;
    return (data || []).map(function (r) {
      return {
        eventId: r.event_id,
        gameId: r.game_id,
        playIndex: r.play_index,
        type: r.type,
        payload: r.payload || {},
        deviceId: r.device_id,
        actorId: r.actor_id,
        clientTs: Number(r.client_ts),
        seq: r.seq,
        superseded: !!r.superseded,
        teamId: r.team_id,
      };
    });
  },
  /** Idempotent upsert on event_id — safe to retry after press-box drops. */
  async appendCallerEvents(teamId, events) {
    if (!OG || !teamId || !events || !events.length) return [];
    const rows = events.map(function (e) {
      return {
        event_id: e.eventId,
        team_id: teamId,
        game_id: e.gameId,
        play_index: e.playIndex,
        type: e.type,
        payload: e.payload || {},
        device_id: e.deviceId,
        actor_id: e.actorId || null,
        client_ts: e.clientTs,
        seq: e.seq,
        superseded: !!e.superseded,
      };
    });
    const { data, error } = await OG.from("caller_events").upsert(rows, { onConflict: "event_id", ignoreDuplicates: true }).select("event_id");
    if (error) throw error;
    return data || [];
  },
  async markCallerEventSuperseded(eventId, superseded) {
    if (!OG || !eventId) return;
    const { error } = await OG.from("caller_events").update({ superseded: !!superseded }).eq("event_id", eventId);
    if (error) throw error;
  },

  /* ---------- QB reads trainer results ---------- */
  async saveQuizResult(teamId, r) {
    /* rep_context is entry-point truth: week_test feeds flywheel; practice = Results only. */
    const ctx = (r.rep_context === "week_test" || r.rep_context === "practice")
      ? r.rep_context
      : (r.week_plan_id ? "week_test" : "practice");
    const row = {
      team_id: teamId,
      quiz: r.quiz || "Test",
      score: r.score|0,
      total: r.total|0,
      detail: r.detail || [],
      rep_context: ctx
    };
    if (ctx === "week_test" && r.week_plan_id) row.week_plan_id = r.week_plan_id;
    if (r.kind) row.kind = r.kind;
    if (r.position) row.position = r.position;
    const { data, error } = await OG.from("qb_results").insert(row).select().single();
    if (error) throw error; return data;
  },
  async listQuizResults(teamId) {
    const { data, error } = await OG.from("qb_results").select("*").eq("team_id", teamId).order("created_at", { ascending: false });
    if (error) throw error; return data || [];
  },

  /** Slice 4d Follow-up G: active (non-consumed) focus flags for test-gen up-weight. */
  async getActiveFocusFlags(schoolId) {
    if (!sb || !schoolId) return [];
    const { data, error } = await sb.rpc("get_active_focus_flags", { p_school_id: schoolId });
    if (error) throw error;
    return data || [];
  },

  /* ---------- week plans (Phase A of the education engine) ---------- */
  async activeWeekPlan(teamId) {
    try {
      const { data, error } = await sb.rpc("offgrd_active_week_plan", { t: teamId });
      if (!error) {
        const row = Array.isArray(data) ? data[0] : data;
        if (row) return row;
      } else {
        console.warn("[Cloud.activeWeekPlan] rpc", error.message);
      }
    } catch (e) {
      console.warn("[Cloud.activeWeekPlan] rpc", e && e.message);
    }
    if (!OG) return null;
    const { data, error } = await OG.from("week_plans").select("*")
      .eq("team_id", teamId).eq("status", "active").maybeSingle();
    if (error) throw error; return data || null;
  },
  async startWeekPlan(teamId, opponent, gameDate, buckets) {
    const { data, error } = await sb.rpc("offgrd_start_week_plan",
      { t: teamId, opp: opponent || "", gd: gameDate || null, bks: buckets || [] });
    if (error) throw error; return data;   // new week_plan id
  },
  async saveWeekPlan(id, fields) {          // {opponent?, game_date?, buckets?, notes?}
    const { data, error } = await OG.from("week_plans").update(fields).eq("id", id).select().single();
    if (error) throw error; return data;
  },
  async saveSchedule(teamId, schedule) {    // season schedule stored on teams.schedule (jsonb)
    const { error } = await OG.from("teams").update({ schedule }).eq("id", teamId);
    if (error) throw error; return true;
  },
  async uploadLogo(teamId, key, blob) {     // downscaled logo -> public Storage URL (lean, not base64)
    const path = teamId + "/" + key + ".png";
    const up = await sb.storage.from("logos").upload(path, blob, { upsert: true, contentType: "image/png", cacheControl: "3600" });
    if (up.error) throw up.error;
    const { data } = sb.storage.from("logos").getPublicUrl(path);
    return (data && data.publicUrl ? data.publicUrl : "") + "?t=" + Date.now();
  },
  async listWeekPlans(teamId) {
    const { data, error } = await OG.from("week_plans").select("id,opponent,game_date,status,updated_at")
      .eq("team_id", teamId).order("updated_at", { ascending: false });
    if (error) throw error; return data || [];
  },
  /* Phase D: ask the generate-week Edge Function for the AI briefing (cached in week_plans.gen).
     Plain fetch with the session token — the Anthropic key lives ONLY in the function's secrets. */
  async generateWeek(teamId, force) {
    const { data: sess } = await sb.auth.getSession();
    const tok = sess && sess.session && sess.session.access_token;
    if (!tok) throw new Error("Sign in first.");
    const r = await fetch(String(cfg.url || "").replace(/\/$/, "") + "/functions/v1/generate-week", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tok, "apikey": cfg.anonKey },
      body: JSON.stringify({ team_id: teamId, force: !!force })
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(out.error || ("Briefing generation failed (" + r.status + ")"));
    return out;   // { gen, cached }
  },

  /* Weekly package: generate-week + AI GM situational game-plan draft (server-keyed). */
  async assembleWeeklyPackage(teamId, payload, force, signal) {
    const { data: sess } = await sb.auth.getSession();
    const tok = sess && sess.session && sess.session.access_token;
    if (!tok) throw new Error("Sign in first.");
    const body = Object.assign({ team_id: teamId, force: !!force }, payload || {});
    const ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    const external = signal;
    if (external && ctrl) {
      if (external.aborted) { try { ctrl.abort(); } catch (e) {} }
      else external.addEventListener("abort", function () { try { ctrl.abort(); } catch (e) {} });
    }
    const timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 120000) : null;
    let r;
    try {
      r = await fetch(String(cfg.url || "").replace(/\/$/, "") + "/functions/v1/weekly-package", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tok, "apikey": cfg.anonKey },
        body: JSON.stringify(body),
        signal: ctrl ? ctrl.signal : (external || undefined)
      });
    } catch (e) {
      if (timer) clearTimeout(timer);
      if (e && e.name === "AbortError") throw new Error("Weekly package timed out or was aborted. Try Regenerate — briefing may already be saved.");
      throw e;
    }
    if (timer) clearTimeout(timer);
    /* text then parse — paint frame between network end and JSON.parse of a large gen payload */
    const raw = await r.text().catch(() => "");
    await new Promise(function (resolve) { setTimeout(resolve, 0); });
    let out = {};
    try { out = raw ? JSON.parse(raw) : {}; } catch (e) { out = {}; }
    if (!r.ok) throw new Error(out.error || ("Weekly package failed (" + r.status + ")"));
    return out;
  },

  /* ---------- plan / billing status ---------- */
  async plan(teamId) {
    const { data } = await OG.from("teams").select("plan, plan_status").eq("id", teamId).single();
    return data || { plan: "free", plan_status: "active" };
  }
};

if (typeof window !== "undefined") window.Cloud = Cloud;
