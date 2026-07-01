/* ============================================================
   OFFGRD Cloud — Supabase auth + sync wrapper (ES module)
   Used by OFFGRD.html and OFFGRD-Playbook.html once accounts are on.
   Load AFTER setting window.OFFGRD_CONFIG = { url, anonKey } (see OFFGRD-config.example.js).
   Import:  <script type="module"> import { Cloud } from "./OFFGRD-cloud.js"; </script>
   Offline-first: callers keep writing localStorage as the cache; Cloud syncs when online + logged in.
   ============================================================ */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cfg = (typeof window !== "undefined" && window.OFFGRD_CONFIG) || {};
const sb = createClient(cfg.url || "", cfg.anonKey || "", {
  auth: { persistSession: true, autoRefreshToken: true }
});

export const Cloud = {
  ready: !!(cfg.url && cfg.anonKey),
  sb,

  /* ---------- auth ---------- */
  async signUp(email, password, fullName) {
    return sb.auth.signUp({ email, password, options: { data: { full_name: fullName || "" } } });
  },
  async signIn(email, password) { return sb.auth.signInWithPassword({ email, password }); },
  async signOut() { return sb.auth.signOut(); },
  async user() { const { data } = await sb.auth.getUser(); return data.user || null; },
  onAuth(cb) { return sb.auth.onAuthStateChange((_e, session) => cb(session ? session.user : null)); },

  /* ---------- teams ---------- */
  async myTeams() {
    const { data, error } = await sb.from("teams").select("*").order("created_at");
    if (error) throw error; return data || [];
  },
  async createTeam(name) {
    const { data, error } = await sb.rpc("create_team", { team_name: name });
    if (error) throw error; return data; // team id
  },
  // get the user's first team, creating a default one on first login
  async ensureTeam(defaultName) {
    let teams = await this.myTeams();
    if (!teams.length) { await this.createTeam(defaultName || "My Program"); teams = await this.myTeams(); }
    return teams[0];
  },
  async addMember(teamId, email, role) {
    const { error } = await sb.rpc("add_member", { t: teamId, member_email: email, member_role: role || "coach" });
    if (error) throw error;
  },
  async roster(teamId) {
    const { data, error } = await sb.from("team_members").select("user_id, role").eq("team_id", teamId);
    if (error) throw error; return data || [];
  },

  /* ---------- roster, invites, roles ---------- */
  async teamRoster(teamId) {
    const { data, error } = await sb.rpc("team_roster", { t: teamId });
    if (error) throw error; return data || [];
  },
  async myRole(teamId) {
    const { data, error } = await sb.rpc("my_role", { t: teamId });
    if (error) throw error; return data;
  },
  async inviteMember(teamId, email, role) {
    // returns 'added' (user existed) or 'pending' (will join on signup)
    const { data, error } = await sb.rpc("invite_member", { t: teamId, member_email: email, member_role: role });
    if (error) throw error; return data;
  },
  async listInvites(teamId) {
    const { data, error } = await sb.from("invites").select("*").eq("team_id", teamId).order("created_at");
    if (error) throw error; return data || [];
  },
  async revokeInvite(id) { const { error } = await sb.from("invites").delete().eq("id", id); if (error) throw error; },
  async joinByCode(code) { const { data, error } = await sb.rpc("join_by_code", { code }); if (error) throw error; return data; },
  async setMemberRole(teamId, userId, role) {
    const { error } = await sb.from("team_members").update({ role }).eq("team_id", teamId).eq("user_id", userId);
    if (error) throw error;
  },
  async removeMember(teamId, userId) {
    const { error } = await sb.from("team_members").delete().eq("team_id", teamId).eq("user_id", userId);
    if (error) throw error;
  },
  async rotateCode(teamId) { const { data, error } = await sb.rpc("rotate_join_code", { t: teamId }); if (error) throw error; return data; },

  /* ---------- plays (playbook) ---------- */
  async listPlays(teamId) {
    const { data, error } = await sb.from("plays").select("*").eq("team_id", teamId).order("updated_at", { ascending: false });
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
    const { data, error } = await sb.from("plays").upsert(row).select().single();
    if (error) throw error; return data;
  },
  async deletePlay(id) { const { error } = await sb.from("plays").delete().eq("id", id); if (error) throw error; },

  /* ---------- scouting games (season library) ---------- */
  async listGames(teamId) {
    const { data, error } = await sb.from("scouting_games").select("*").eq("team_id", teamId).order("updated_at", { ascending: false });
    if (error) throw error; return data || [];
  },
  async saveGame(teamId, game) {
    const row = { team_id: teamId, opponent: game.opponent, week: game.week, side: game.side, source: game.source, rows: game.rows };
    if (game.id) row.id = game.id;
    const { data, error } = await sb.from("scouting_games").upsert(row).select().single();
    if (error) throw error; return data;
  },
  async deleteGame(id) { const { error } = await sb.from("scouting_games").delete().eq("id", id); if (error) throw error; },

  /* ---------- plan / billing status ---------- */
  async plan(teamId) {
    const { data } = await sb.from("teams").select("plan, plan_status").eq("id", teamId).single();
    return data || { plan: "free", plan_status: "active" };
  }
};
