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

export const Cloud = {
  ready: !!(createClient && cfg.url && cfg.anonKey),
  sb,

  /* ---------- auth ---------- */
  async signUp(email, password, fullName) {
    return sb.auth.signUp({ email, password, options: { data: { full_name: fullName || "" } } });
  },
  async signIn(email, password) { return sb.auth.signInWithPassword({ email, password }); },
  async signOut() { return sb.auth.signOut(); },
  async user() { const { data } = await sb.auth.getUser(); return data.user || null; },
  async session() { try { const { data } = await sb.auth.getSession(); return (data && data.session) ? data.session.user : null; } catch(e){ return null; } },
  onAuth(cb) { return sb.auth.onAuthStateChange((_e, session) => cb(session ? session.user : null)); },

  /* ---------- teams ---------- */
  async myTeams() {
    const { data, error } = await OG.from("teams").select("*").order("created_at");
    if (error) throw error; return data || [];
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
    const row = {
      team_id: teamId, name: play.name, family: play.family, series: play.series,
      personnel: play.personnel, formation: play.formation, protection: play.protection,
      data: play.data || play
    };
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

  /* ---------- QB reads trainer results ---------- */
  async saveQuizResult(teamId, r) {
    const row = { team_id: teamId, quiz: r.quiz || "Test", score: r.score|0, total: r.total|0, detail: r.detail || [] };
    const { data, error } = await OG.from("qb_results").insert(row).select().single();
    if (error) throw error; return data;
  },
  async listQuizResults(teamId) {
    const { data, error } = await OG.from("qb_results").select("*").eq("team_id", teamId).order("created_at", { ascending: false });
    if (error) throw error; return data || [];
  },

  /* ---------- week plans (Phase A of the education engine) ---------- */
  async activeWeekPlan(teamId) {
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
  async assembleWeeklyPackage(teamId, payload, force) {
    const { data: sess } = await sb.auth.getSession();
    const tok = sess && sess.session && sess.session.access_token;
    if (!tok) throw new Error("Sign in first.");
    const body = Object.assign({ team_id: teamId, force: !!force }, payload || {});
    const ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    const timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 120000) : null;
    let r;
    try {
      r = await fetch(String(cfg.url || "").replace(/\/$/, "") + "/functions/v1/weekly-package", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tok, "apikey": cfg.anonKey },
        body: JSON.stringify(body),
        signal: ctrl ? ctrl.signal : undefined
      });
    } catch (e) {
      if (timer) clearTimeout(timer);
      if (e && e.name === "AbortError") throw new Error("Weekly package timed out (120s). Try Regenerate — briefing may already be saved.");
      throw e;
    }
    if (timer) clearTimeout(timer);
    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(out.error || ("Weekly package failed (" + r.status + ")"));
    return out;
  },

  /* ---------- plan / billing status ---------- */
  async plan(teamId) {
    const { data } = await OG.from("teams").select("plan, plan_status").eq("id", teamId).single();
    return data || { plan: "free", plan_status: "active" };
  }
};
