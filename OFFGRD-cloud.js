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
let sb = (typeof window !== "undefined" && window.__OFFRD_SUPABASE__) || null;
if (!sb && createClient) {
  sb = createClient(cfg.url || "", cfg.anonKey || "", {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  if (typeof window !== "undefined") window.__OFFRD_SUPABASE__ = sb;
}
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

let _myTeamsInflight = null;
let _myTeamsRecent = null; /* { data, until } — collapses boot triple within a short TTL */
let _myTeamsLoadCount = 0;
let _myTeamsCountTimer = null;
const MY_TEAMS_RECENT_MS = 2500;
function _noteMyTeamsCall() {
  _myTeamsLoadCount++;
  if (_myTeamsCountTimer) clearTimeout(_myTeamsCountTimer);
  _myTeamsCountTimer = setTimeout(function () {
    try {
      console.log("[Cloud.myTeams] calls per load:", _myTeamsLoadCount);
    } catch (e) {}
    _myTeamsLoadCount = 0;
    _myTeamsCountTimer = null;
  }, 6000);
}
function _invalidateMyTeamsCache() {
  _myTeamsRecent = null;
}

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
    /* odkops.com is the coach door — never create a bare / player-tagged user here. */
    return sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName || "",
          role: "high_school_coach",
          user_type: "high_school_coach",
        },
      },
    });
  },
  async stampHsCoach() {
    return sb.auth.updateUser({
      data: { role: "high_school_coach", user_type: "high_school_coach" },
    });
  },
  async signIn(email, password) { return sb.auth.signInWithPassword({ email, password }); },
  async signOut() {
    _invalidateMyTeamsCache();
    return sb.auth.signOut();
  },
  async user() { const { data } = await sb.auth.getUser(); return data.user || null; },
  async session() { try { const { data } = await sb.auth.getSession(); return (data && data.session) ? data.session.user : null; } catch(e){ return null; } },
  /**
   * Revive/refresh JWT before membership RPCs. Clean-device gameday often races
   * getSession() before the client finishes hydrating storage — without this,
   * myTeams returns [] and never retries.
   */
  async ensureFreshSession() {
    if (!sb) return null;
    try {
      const { data } = await sb.auth.getSession();
      let session = data && data.session ? data.session : null;
      if (!session) return null;
      const exp = session.expires_at ? (session.expires_at * 1000) : 0;
      if (exp && exp - Date.now() < 60000 * 5) {
        try {
          const ref = await sb.auth.refreshSession();
          if (ref && ref.data && ref.data.session) session = ref.data.session;
        } catch (e) {}
      }
      return session.user || null;
    } catch (e) {
      return null;
    }
  },
  onAuth(cb) { return sb.auth.onAuthStateChange((_e, session) => cb(session ? session.user : null)); },

  /* ---------- teams ---------- */
  /**
   * Programs for the signed-in user.
   * Session-first: public.offgrd_my_teams (team_members) does not depend on
   * offgrd schema Accept-Profile or a coach-warmed device cache. Schema select
   * and school membership RPC are fallbacks only.
   */
  async myTeams() {
    if (_myTeamsInflight) return _myTeamsInflight;
    if (_myTeamsRecent && Date.now() < _myTeamsRecent.until) {
      return _myTeamsRecent.data;
    }
    _noteMyTeamsCall();
    _myTeamsInflight = this._myTeamsImpl()
      .then(function (data) {
        _myTeamsRecent = { data: data, until: Date.now() + MY_TEAMS_RECENT_MS };
        return data;
      })
      .finally(function () {
        _myTeamsInflight = null;
      });
    return _myTeamsInflight;
  },
  async _myTeamsImpl() {
    try { await this.ensureFreshSession(); } catch (e) {}

    /* 1) Membership via team_members — works with session alone. */
    try {
      const { data, error } = await sb.rpc("offgrd_my_teams");
      if (error) console.warn("[Cloud.myTeams] offgrd_my_teams", error.message);
      else if (Array.isArray(data) && data.length) {
        try { console.log("[Cloud.myTeams] rpc", data.length, data.map(function (t) { return t && t.id; })); } catch (e) {}
        return data;
      }
    } catch (e) {
      console.warn("[Cloud.myTeams] offgrd_my_teams", e && e.message);
    }

    /* 2) School → program membership snapshot (Team Home path). */
    try {
      const { data: mem, error } = await sb.rpc("offgrd_my_player_membership");
      if (error) throw error;
      try { console.log("[Cloud.myTeams] membership", mem && mem.is_member, mem && mem.team_id, mem && mem.error); } catch (e) {}
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

    /* 3) Direct schema select (coaches / Accept-Profile clients). */
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
    try { console.log("[Cloud.myTeams] schema rows", rows.length); } catch (e) {}
    return rows;
  },
  async createTeam(name) {
    _invalidateMyTeamsCache();
    const { data, error } = await sb.rpc("offgrd_create_team", { team_name: name });
    if (error) throw error;
    try { await this.linkTeamToSchool(data); } catch (e) {}
    return data; // team id
  },
  /** HS school + coach row (same RPC as getoffrd /onboarding/coach-program). */
  async createOwnedProgram({ schoolName, schoolCity, schoolState, coachName, roleTitle }) {
    const { data, error } = await sb.rpc("create_owned_program", {
      p_school_name: String(schoolName || "").trim(),
      p_city: String(schoolCity || "").trim(),
      p_state: String(schoolState || "").trim(),
      p_coach_name: String(coachName || "").trim(),
      p_role_title: String(roleTitle || "Head Coach").trim(),
    });
    if (error) throw error;
    _invalidateMyTeamsCache();
    return data;
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
  /** Team Home membership snapshot — school, team_id, is_member, brand. */
  async playerMembership() {
    try { await this.ensureFreshSession(); } catch (e) {}
    const { data, error } = await sb.rpc("offgrd_my_player_membership");
    if (error) throw error;
    return data || null;
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
    try {
      const { data, error } = await sb.rpc("offgrd_my_role", { t: teamId });
      if (!error && data) return data;
      if (error) console.warn("[Cloud.myRole]", error.message);
    } catch (e) {
      console.warn("[Cloud.myRole]", e && e.message);
    }
    /* Fallback when schema role RPC is empty but membership exists. */
    try {
      const { data: mem } = await sb.rpc("offgrd_my_player_membership");
      if (mem && mem.is_member && mem.team_id === teamId) return "player";
    } catch (e) {}
    return null;
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
  async joinByCode(code) {
    _invalidateMyTeamsCache();
    const { data, error } = await sb.rpc("offgrd_join_by_code", { code });
    if (error) throw error;
    return data;
  },
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

  /* ---------- opponent scout cards (drawn only; shells are derived) ---------- */
  async listOppCards(teamId, opponent) {
    if (!OG || !teamId) return [];
    let q = OG.from("offgrd_opp_cards").select("*").eq("team_id", teamId).order("updated_at", { ascending: false });
    if (opponent) q = q.eq("opponent", opponent);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },
  async upsertOppCard(teamId, card) {
    if (!OG || !teamId) throw new Error("Sign in first.");
    const row = {
      team_id: teamId,
      opponent: card.opponent || "",
      shell_key: card.shell_key || card.shellKey || "",
      card_status: card.card_status || card.cardStatus || "drawn",
      play_state: card.play_state || card.playState || card.data || {},
      play_name: card.play_name != null ? card.play_name : (card.playName || card.play || null),
      formation: card.formation || null,
      backfield: card.backfield != null ? card.backfield : (card.offBackfield || null),
      off_str: card.off_str != null ? card.off_str : (card.offStrength || null),
      play_type: card.play_type != null ? card.play_type : (card.playType || null),
      direction: card.direction || null,
      gap: card.gap || null,
      pass_zone: card.pass_zone != null ? card.pass_zone : (card.passZone || null),
      updated_at: new Date().toISOString(),
    };
    if (card.id) row.id = card.id;
    const { data, error } = await OG.from("offgrd_opp_cards").upsert(row, {
      onConflict: "team_id,opponent,shell_key",
    }).select().single();
    if (error) throw error;
    return data;
  },
  async deleteOppCard(id) {
    const { error } = await OG.from("offgrd_opp_cards").delete().eq("id", id);
    if (error) throw error;
  },
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
    if (error) throw error;
    /* Direct-select fallback: apply tombstones client-side (RPC path filters server-side). */
    const tombs = await this.listGameTombstones(teamId);
    if (!tombs.length) return data || [];
    return (data || []).filter((g) => !tombs.some((t) => {
      if (t.game_id && g.id && String(t.game_id) === String(g.id)) return true;
      return t.natural_key === this.gameNaturalKey(g.opponent, g.week, g.side);
    }));
  },
  /**
   * v212 tombstones — natural key is load-bearing (id rotates on re-INSERT).
   * Matches offgrd.scouting_natural_key / client gameNaturalKey.
   */
  gameNaturalKey(opp, week, side) {
    return String(opp || "?").trim().toLowerCase() + "|" + String(week || "?").trim().toLowerCase() + "|" + String(side || "");
  },
  async listGameTombstones(teamId) {
    if (!OG || !teamId) return [];
    const { data, error } = await OG.from("scouting_game_tombstones")
      .select("id,team_id,natural_key,opponent,week,side,game_id,reason")
      .eq("team_id", teamId);
    if (error) {
      /* Pre-v212 schema: table missing — treat as no tombstones. */
      console.warn("[Cloud.listGameTombstones]", error.message);
      return [];
    }
    return data || [];
  },
  async isGameTombstoned(teamId, game, tombs) {
    if (!teamId || !game) return false;
    const list = Array.isArray(tombs) ? tombs : await this.listGameTombstones(teamId);
    if (!list.length) return false;
    const key = this.gameNaturalKey(game.opponent, game.week, game.side);
    const gid = game.id || game.cid || null;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (gid && t.game_id && String(t.game_id) === String(gid)) return true;
      if (t.natural_key && t.natural_key === key) return true;
    }
    return false;
  },
  _isTombstoneError(err) {
    if (!err) return false;
    if (err.code === "TOMBSTONED" || err.code === "23514") return true;
    const msg = String(err.message || err.details || err.hint || "");
    return /scouting_game tombstoned/i.test(msg) || /tombstoned/i.test(msg);
  },
  async saveGame(teamId, game) {
    if (!OG) throw new Error("offgrd schema unavailable");
    const nk = this.gameNaturalKey(game.opponent, game.week, game.side);
    /* v212: refuse upsert when id OR natural key is tombstoned (id-rotation proof). */
    if (await this.isGameTombstoned(teamId, game)) {
      const err = new Error("scouting_game tombstoned: " + nk);
      err.code = "TOMBSTONED";
      throw err;
    }
    const row = {
      team_id: teamId,
      opponent: game.opponent,
      week: game.week,
      side: game.side,
      source: game.source,
      rows: game.rows,
    };
    if (game.id) row.id = game.id;
    else {
      /* Natural-key resolve — never INSERT a second blob for opponent|week|side. */
      try {
        const { data: existing } = await OG.from("scouting_games")
          .select("id")
          .eq("team_id", teamId)
          .eq("opponent", game.opponent)
          .eq("week", game.week)
          .eq("side", game.side)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing && existing.id) row.id = existing.id;
      } catch (e) {
        /* fall through to upsert; duplicate risk only if lookup fails */
      }
    }

    /*
     * Durability (v249): refuse blind last-writer-wins when the server blob moved
     * since this client last pulled (baseUpdatedAt), or when an old client with no
     * base tries to shrink a larger cloud blob (St Mary's 61→44 clobber class).
     * Intentional shrink after a fresh pull still works — base matches server.
     */
    try {
      let curQ = OG.from("scouting_games")
        .select("id, updated_at, rows")
        .eq("team_id", teamId);
      if (row.id) curQ = curQ.eq("id", row.id);
      else {
        curQ = curQ
          .eq("opponent", game.opponent)
          .eq("week", game.week)
          .eq("side", game.side)
          .order("updated_at", { ascending: false })
          .limit(1);
      }
      const { data: cur } = await curQ.maybeSingle();
      if (cur) {
        if (!row.id) row.id = cur.id;
        const serverN = Array.isArray(cur.rows) ? cur.rows.length : 0;
        const localN = Array.isArray(game.rows) ? game.rows.length : 0;
        const serverT = Date.parse(cur.updated_at || "");
        const baseRaw = game.baseUpdatedAt || game.updatedAt || null;
        const baseT = baseRaw ? Date.parse(baseRaw) : NaN;
        const serverNewer =
          Number.isFinite(serverT) && Number.isFinite(baseT) && serverT > baseT + 750;
        const blindShrink = !Number.isFinite(baseT) && serverN > localN;
        if (serverNewer || blindShrink) {
          const err = new Error(
            "scouting_game stale write: " +
              nk +
              " (server " +
              serverN +
              " rows @ " +
              (cur.updated_at || "?") +
              ")"
          );
          err.code = "STALE_WRITE";
          err.server = { id: cur.id, updated_at: cur.updated_at, n: serverN };
          throw err;
        }
      }
    } catch (eCas) {
      if (eCas && eCas.code === "STALE_WRITE") throw eCas;
      /* CAS lookup failed — fall through to upsert (prefer availability). */
    }

    const { data, error } = await OG.from("scouting_games").upsert(row).select().single();
    if (error) {
      /* Trigger path (stale v211 / tombs not loaded): map to TOMBSTONED — never retry-storm. */
      if (this._isTombstoneError(error)) {
        const err = new Error(error.message || ("scouting_game tombstoned: " + nk));
        err.code = "TOMBSTONED";
        err.cause = error;
        throw err;
      }
      throw error;
    }
    return data;
  },
  async deleteGame(id) { const { error } = await OG.from("scouting_games").delete().eq("id", id); if (error) throw error; },
  /**
   * Deliberate import / Commit to season — remove the natural-key tombstone so upsert
   * can proceed. Tombstones only block passive pull/mergeGames resurrection.
   */
  async clearGameTombstone(teamId, game) {
    if (!OG) throw new Error("offgrd schema unavailable");
    if (!teamId || !game) throw new Error("clearGameTombstone: teamId and game required");
    const opponent = game.opponent != null ? String(game.opponent) : "?";
    const week = game.week != null ? String(game.week) : "?";
    const side = game.side != null ? String(game.side) : "";
    const nk = this.gameNaturalKey(opponent, week, side);
    const { error, count } = await OG.from("scouting_game_tombstones")
      .delete({ count: "exact" })
      .eq("team_id", teamId)
      .eq("natural_key", nk);
    if (error) throw error;
    return { natural_key: nk, cleared: (count == null ? true : count > 0) };
  },
  /**
   * v212: tombstone natural key THEN hard-delete cloud row.
   * Local-only clears resurrect on pull; this is the durable Season Data Manager path.
   * RLS allows INSERT (not UPDATE) on tombstones — duplicate key = already tombstoned (ok).
   */
  async tombstoneGame(teamId, game, reason) {
    if (!OG) throw new Error("offgrd schema unavailable");
    if (!teamId || !game) throw new Error("tombstoneGame: teamId and game required");
    const opponent = game.opponent != null ? String(game.opponent) : "?";
    const week = game.week != null ? String(game.week) : "?";
    const side = game.side != null ? String(game.side) : "";
    const nk = this.gameNaturalKey(opponent, week, side);
    let gameId = game.id || game.cid || null;
    if (!gameId) {
      try {
        const { data: existing } = await OG.from("scouting_games")
          .select("id")
          .eq("team_id", teamId)
          .eq("opponent", opponent)
          .eq("week", week)
          .eq("side", side)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing && existing.id) gameId = existing.id;
      } catch (eLook) {
        /* continue — tombstone by natural key still blocks resurrection */
      }
    }
    const tomb = {
      team_id: teamId,
      natural_key: nk,
      opponent: opponent,
      week: week,
      side: side,
      reason: reason || "user_delete",
    };
    if (gameId) tomb.game_id = gameId;
    const { error: tErr } = await OG.from("scouting_game_tombstones").insert(tomb);
    if (tErr) {
      const code = String(tErr.code || "");
      const msg = String(tErr.message || "");
      const dup = code === "23505" || /duplicate|unique/i.test(msg);
      if (!dup) throw tErr;
    }
    if (gameId) {
      const { error: dErr } = await OG.from("scouting_games").delete().eq("id", gameId);
      if (dErr) throw dErr;
    } else {
      const { error: dErr } = await OG.from("scouting_games")
        .delete()
        .eq("team_id", teamId)
        .eq("opponent", opponent)
        .eq("week", week)
        .eq("side", side);
      if (dErr) throw dErr;
    }
    return { natural_key: nk, game_id: gameId };
  },

  /* ---------- live caller event log (multi-device, append-only) ---------- */
  async activeCallerGame(teamId, side) {
    if (!OG || !teamId) return null;
    const sideKey = side === "defense" ? "defense" : side === "offense" ? "offense" : null;
    let q = OG.from("caller_games").select("*").eq("team_id", teamId).eq("status", "active");
    if (sideKey) q = q.eq("side", sideKey);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return data || null;
  },
  async ensureCallerGame(teamId, meta) {
    if (!OG || !teamId) return null;
    const side = (meta && meta.side) === "defense" ? "defense" : "offense";
    const existing = await this.activeCallerGame(teamId, side);
    if (existing) return existing;
    const row = {
      team_id: teamId,
      opponent: (meta && meta.opponent) || null,
      week: (meta && meta.week) || null,
      game_date: (meta && meta.game_date) || null,
      status: "active",
      created_by: (meta && meta.created_by) || null,
      side: side,
    };
    if (meta && meta.id) row.id = meta.id;
    const { data, error } = await OG.from("caller_games").insert(row).select().single();
    if (error) {
      /* race: another device created active game for this side */
      const again = await this.activeCallerGame(teamId, side);
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
  /**
   * Land proposed Monday Focus payload on the game row (sync path).
   * Never calls start_tracked_focus — coach confirm only.
   */
  async upsertCallerGameMondayFocus(gameId, mondayFocus) {
    if (!OG || !gameId || !mondayFocus) return null;
    const { data, error } = await OG.from("caller_games")
      .update({ monday_focus: mondayFocus })
      .eq("id", gameId)
      .select("id, monday_focus")
      .maybeSingle();
    if (error) throw error;
    return data;
  },
  async getCallerGameMondayFocus(gameId) {
    if (!OG || !gameId) return null;
    const { data, error } = await OG.from("caller_games").select("id, monday_focus").eq("id", gameId).maybeSingle();
    if (error) throw error;
    return (data && data.monday_focus) || null;
  },
  /**
   * Coach-confirmed hand-off — sole write into Focus chain for game tags.
   * Maps to public.start_tracked_focus (tracked cell + next-test up-weight).
   * Does NOT touch focus_today_overrides (headline stays rep-earned).
   */
  async startTrackedFocusFromGame(opts) {
    if (!sb || !opts || !opts.schoolId || !opts.positionGroup || !opts.kind) {
      throw new Error("startTrackedFocusFromGame: schoolId, positionGroup, kind required");
    }
    const { data, error } = await sb.rpc("start_tracked_focus", {
      p_school_id: opts.schoolId,
      p_team_id: opts.teamId || null,
      p_position_group: opts.positionGroup,
      p_kind: opts.kind,
      p_subskill: opts.subskill || null,
      p_baseline_accuracy: opts.baselineAccuracy != null ? opts.baselineAccuracy : null,
      p_player_id: null,
      p_player_name: null,
      p_group_focus_id: null,
      p_source_tag: opts.sourceTag || "livetag_monday",
      p_with_emphasis: opts.withEmphasis !== false,
      p_weight: opts.weight != null ? opts.weight : 2.0,
      p_scheme_type: opts.schemeType || null,
      p_scheme_value: opts.schemeValue || null,
      p_dimension: opts.dimension || null,
      p_baseline_correct: opts.baselineCorrect != null ? opts.baselineCorrect : null,
      p_baseline_attempts: opts.baselineAttempts != null ? opts.baselineAttempts : null,
    });
    if (error) throw error;
    return data;
  },
  /** Archive the live game for a side — frees one-active-per-side for Clear → new session. */
  async archiveActiveCallerGame(teamId, side) {
    if (!OG || !teamId) return null;
    const g = await this.activeCallerGame(teamId, side);
    if (!g || !g.id) return null;
    await this.archiveCallerGame(g.id);
    return g;
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
        side: r.side === "defense" ? "defense" : "offense",
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
        side: e.side === "defense" ? "defense" : "offense",
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
    const u = await this.session();
    if (!u) throw new Error("Sign in to save your score.");
    /* Client-generated id = idempotent retry key for offline queue (no schema change). */
    const id = (r && (r.id || r.clientId)) || null;
    const row = {
      team_id: teamId,
      user_id: u.id,
      quiz: r.quiz || "Test",
      score: r.score|0,
      total: r.total|0,
      detail: r.detail || [],
      rep_context: ctx
    };
    if (id) row.id = id;
    if (ctx === "week_test" && r.week_plan_id) row.week_plan_id = r.week_plan_id;
    if (r.kind) row.kind = r.kind;
    if (r.position) row.position = r.position;
    const { data, error } = await OG.from("qb_results")
      .upsert(row, { onConflict: "id", ignoreDuplicates: true })
      .select()
      .maybeSingle();
    if (error) {
      /* 23505 / unique — already in DB (response lost on dead connection). Treat as synced. */
      const code = error.code;
      const msg = String(error.message || error.details || "");
      if (code === "23505" || /23505|duplicate key|unique constraint|already exists/i.test(msg)) {
        return { id: id || null, deduped: true };
      }
      throw error;
    }
    return data || { id: id || null, deduped: true };
  },
  async listQuizResults(teamId) {
    const { data, error } = await OG.from("qb_results").select("*").eq("team_id", teamId).order("created_at", { ascending: false });
    if (error) throw error; return data || [];
  },

  /** Ticket B — player locker board toggle (default ON). */
  async getLeaderboardEnabled(teamId) {
    if (!sb || !teamId) return true;
    const { data, error } = await sb.rpc("offgrd_leaderboard_enabled", { p_team_id: teamId });
    if (error) { console.warn("[Cloud.getLeaderboardEnabled]", error.message); return true; }
    return data !== false;
  },
  async setLeaderboardEnabled(teamId, enabled) {
    if (!sb || !teamId) throw new Error("Not signed in");
    const { data, error } = await sb.rpc("offgrd_set_leaderboard_enabled", {
      p_team_id: teamId,
      p_enabled: !!enabled
    });
    if (error) throw error;
    return data !== false;
  },
  async positionMasteryStrip(teamId) {
    if (!sb || !teamId) return [];
    const { data, error } = await sb.rpc("offgrd_position_mastery_strip", { p_team_id: teamId });
    if (error) { console.warn("[Cloud.positionMasteryStrip]", error.message); return []; }
    return Array.isArray(data) ? data : [];
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
  },

  /* ---------- Auto-Scout import (scout_snaps / film_column_maps / jobs) ---------- */
  async getFilmColumnMap(teamId, provider) {
    if (!OG || !teamId) return null;
    const { data, error } = await OG.from("film_column_maps")
      .select("id,team_id,provider,map,created_at")
      .eq("team_id", teamId)
      .eq("provider", provider || "hudl-assist")
      .maybeSingle();
    if (error) {
      console.warn("[Cloud.getFilmColumnMap]", error.message);
      return null;
    }
    return data;
  },
  async saveFilmColumnMap(teamId, provider, map) {
    if (!OG) throw new Error("offgrd schema unavailable");
    if (!teamId) throw new Error("team_id required");
    const row = {
      team_id: teamId,
      provider: provider || "hudl-assist",
      map: map || {},
    };
    const { data, error } = await OG.from("film_column_maps")
      .upsert(row, { onConflict: "team_id,provider" })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async createAutoScoutJob(row) {
    if (!OG) throw new Error("offgrd schema unavailable");
    const insert = {
      team_id: row.team_id,
      opponent_id: row.opponent_id || null,
      opponent: row.opponent || null,
      week_plan_id: row.week_plan_id || null,
      source: row.source || "hudl-assist-csv",
      clip_count: row.clip_count || 0,
      done_count: row.done_count || 0,
      skipped_count: row.skipped_count || 0,
      status: row.status || "queued",
    };
    if (row.import_batch_id) insert.import_batch_id = row.import_batch_id;
    if (row.notes != null) insert.notes = row.notes;
    const { data, error } = await OG.from("auto_scout_jobs")
      .insert(insert)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async updateAutoScoutJob(id, patch) {
    if (!OG) throw new Error("offgrd schema unavailable");
    const { data, error } = await OG.from("auto_scout_jobs")
      .update(patch || {})
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  /**
   * List Auto-Scout jobs for readiness chain.
   * Select only columns that exist on offgrd.auto_scout_jobs (no updated_at —
   * that column is on scout_snaps; selecting it 400s the whole request).
   * Scope by team_id in the query; opponent / batch filters are client-side
   * so a missing optional column never breaks the request.
   */
  async listAutoScoutJobs(teamId, opts) {
    if (!OG || !teamId) return [];
    const o = opts || {};
    /* Keep this list tight — every name must exist on auto_scout_jobs. */
    const { data, error } = await OG.from("auto_scout_jobs")
      .select(
        [
          "id",
          "team_id",
          "opponent",
          "opponent_id",
          "import_batch_id",
          "source",
          "status",
          "clip_count",
          "done_count",
          "skipped_count",
          "created_at",
          "finished_at",
        ].join(",")
      )
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(o.limit || 200);
    if (error) throw error;
    let rows = data || [];
    const batchIds = (o.import_batch_ids || []).map(String).filter(Boolean);
    const batchSet = batchIds.length ? new Set(batchIds) : null;
    const wantOpp = o.opponent ? String(o.opponent).trim().toLowerCase() : "";
    if (batchSet || wantOpp) {
      rows = rows.filter(function (j) {
        if (batchSet && j.import_batch_id && batchSet.has(String(j.import_batch_id))) {
          return true;
        }
        if (
          wantOpp &&
          j.opponent &&
          String(j.opponent).trim().toLowerCase() === wantOpp
        ) {
          return true;
        }
        return false;
      });
    }
    return rows;
  },
  /**
   * Prior import batches for the same opponent-scout game key.
   * Used by Assist commit supersede (v212 lesson — new batch id must not dupe).
   */
  async listImportBatchesForGame(teamId, opponent, week, side) {
    if (!OG || !teamId) return [];
    const { data, error } = await OG.from("scout_snaps")
      .select("import_batch_id")
      .eq("team_id", teamId)
      .eq("opponent", opponent)
      .eq("week", week)
      .eq("side", side)
      .eq("tag_source", "import")
      .not("import_batch_id", "is", null);
    if (error) throw error;
    const seen = Object.create(null);
    const ids = [];
    (data || []).forEach(function (r) {
      const id = r && r.import_batch_id;
      if (id && !seen[id]) {
        seen[id] = true;
        ids.push(id);
      }
    });
    return ids;
  },
  async countImportSnapsForGame(teamId, opponent, week, side) {
    if (!OG || !teamId) return 0;
    const { count, error } = await OG.from("scout_snaps")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("opponent", opponent)
      .eq("week", week)
      .eq("side", side)
      .eq("tag_source", "import");
    if (error) throw error;
    return count || 0;
  },
  /** RLS-gated delete of prior import rows for one game key (supersede). */
  async deleteImportSnapsForGame(teamId, opponent, week, side) {
    if (!OG) throw new Error("offgrd schema unavailable");
    const { error } = await OG.from("scout_snaps")
      .delete()
      .eq("team_id", teamId)
      .eq("opponent", opponent)
      .eq("week", week)
      .eq("side", side)
      .eq("tag_source", "import");
    if (error) throw error;
  },
  /**
   * List Auto-Scout import batches for the season manager.
   * One row per import_batch_id (tag_source=import).
   */
  async listImportBatches(teamId) {
    if (!OG || !teamId) return [];
    const { data, error } = await OG.from("scout_snaps")
      .select(
        "import_batch_id, opponent, week, side, created_at, needs_review, prompt_version, confidence, tag_source, clip_ref, raw"
      )
      .eq("team_id", teamId)
      .eq("tag_source", "import")
      .not("import_batch_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(8000);
    if (error) throw error;
    const by = Object.create(null);
    function hasF1(clipRef) {
      if (!clipRef) return false;
      try {
        const j =
          typeof clipRef === "string" && clipRef.charAt(0) === "{"
            ? JSON.parse(clipRef)
            : clipRef;
        return !!(j && (j.f1 || j.F1));
      } catch (e) {
        return false;
      }
    }
    function isSkipped(raw) {
      try {
        const r = typeof raw === "string" ? JSON.parse(raw) : raw;
        return !!(r && r.capture && r.capture.skipped);
      } catch (e2) {
        return false;
      }
    }
    (data || []).forEach(function (r) {
      const id = r && r.import_batch_id;
      if (!id) return;
      if (!by[id]) {
        by[id] = {
          import_batch_id: id,
          opponent: r.opponent || "Unknown",
          week: r.week || "Wk?",
          side: r.side || "",
          n: 0,
          n_review: 0,
          n_f1: 0,
          n_skip: 0,
          n_cv: 0,
          created_at: r.created_at || null,
        };
      }
      by[id].n++;
      if (isSkipped(r.raw)) by[id].n_skip++;
      else if (hasF1(r.clip_ref)) by[id].n_f1++;
      if (r.prompt_version || r.confidence) by[id].n_cv++;
      /* Flagged for CV review: needs_review + CV provenance (merge or legacy) */
      if (
        r.needs_review &&
        (r.prompt_version || r.confidence || r.tag_source === "cv")
      ) {
        by[id].n_review++;
      }
      if (r.created_at && (!by[id].created_at || r.created_at < by[id].created_at)) {
        by[id].created_at = r.created_at;
      }
    });
    return Object.keys(by)
      .map(function (k) {
        return by[k];
      })
      .sort(function (a, b) {
        return String(b.created_at || "").localeCompare(String(a.created_at || ""));
      });
  },
  /** Delete one import batch's scout_snaps rows (tag_source=import). */
  async deleteImportSnapsByBatch(teamId, importBatchId) {
    if (!OG) throw new Error("offgrd schema unavailable");
    if (!teamId || !importBatchId) throw new Error("teamId and importBatchId required");
    const { error } = await OG.from("scout_snaps")
      .delete()
      .eq("team_id", teamId)
      .eq("import_batch_id", importBatchId)
      .eq("tag_source", "import");
    if (error) throw error;
  },
  async upsertScoutSnapImport(pSnap) {
    if (!sb) throw new Error("Supabase unavailable");
    const { data, error } = await sb.schema("offgrd").rpc("upsert_scout_snap_import_v1", {
      p_snap: pSnap,
    });
    if (error) throw error;
    return data;
  },

  /**
   * Import snaps for one batch (capture panel). Ordered by snap_index.
   */
  async listScoutSnapsForBatch(teamId, importBatchId) {
    if (!OG || !teamId || !importBatchId) return [];
    const { data, error } = await OG.from("scout_snaps")
      .select(
        "id, team_id, import_batch_id, snap_index, down, distance, field_zone, hash, formation, formation_family, opponent, week, side, clip_ref, raw, tag_source"
      )
      .eq("team_id", teamId)
      .eq("import_batch_id", importBatchId)
      .eq("tag_source", "import")
      .order("snap_index", { ascending: true })
      .limit(2000);
    if (error) throw error;
    return data || [];
  },

  /** Count import snaps still present for a batch (supersede guard). */
  async countScoutSnapsForBatch(teamId, importBatchId) {
    if (!OG || !teamId || !importBatchId) return 0;
    const { count, error } = await OG.from("scout_snaps")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("import_batch_id", importBatchId)
      .eq("tag_source", "import");
    if (error) throw error;
    return count || 0;
  },

  /**
   * Merge-only capture stamp. NEVER write scout_snaps.raw directly.
   * offgrd.patch_scout_snap_capture_v1(p_key, p_patch)
   */
  async patchScoutSnapCapture(pKey, pPatch) {
    if (!sb) throw new Error("Supabase unavailable");
    const { data, error } = await sb.schema("offgrd").rpc("patch_scout_snap_capture_v1", {
      p_key: pKey,
      p_patch: pPatch || {},
    });
    if (error) throw error;
    return data;
  },

  /**
   * Upload F1/F2 jpeg to private scout-frames bucket.
   * Path: {team_id}/{import_batch_id}/{snap_index}/F1.jpg|F2.jpg
   * Returns storage path (not a signed URL).
   */
  async uploadScoutFrame(teamId, importBatchId, snapIndex, slot, blob) {
    if (!sb) throw new Error("Supabase unavailable");
    if (!teamId || !importBatchId || snapIndex == null) {
      throw new Error("teamId, importBatchId, snapIndex required");
    }
    const s = String(slot || "").toUpperCase() === "F2" ? "F2" : "F1";
    const path =
      teamId + "/" + importBatchId + "/" + String(snapIndex) + "/" + s + ".jpg";
    const up = await sb.storage.from("scout-frames").upload(path, blob, {
      upsert: true,
      contentType: "image/jpeg",
      cacheControl: "3600",
    });
    if (up.error) throw up.error;
    return path;
  },

  /** Signed URL for a scout-frames path (private bucket). */
  async signedScoutFrameUrl(path, expiresSec) {
    if (!sb || !path) return null;
    const { data, error } = await sb.storage
      .from("scout-frames")
      .createSignedUrl(path, expiresSec || 3600);
    if (error) throw error;
    return (data && data.signedUrl) || null;
  },

  /**
   * Queue a vision job for a batch (source=scout-frames).
   * clip_count = snaps with F1 (skips excluded) — caller computes.
   */
  async createScoutFramesJob(row) {
    return this.createAutoScoutJob({
      team_id: row.team_id,
      opponent: row.opponent || null,
      opponent_id: row.opponent_id || null,
      week_plan_id: row.week_plan_id || null,
      import_batch_id: row.import_batch_id,
      source: "scout-frames",
      clip_count: row.clip_count || 0,
      status: "queued",
    });
  },

  /**
   * CV-merge onto an existing import snap (fill-NULLs).
   * offgrd.upsert_cv_scheme_v1(p_key, p_cv) — natural key (team_id, import_batch_id, snap_index).
   */
  async upsertCvScheme(pKey, pCv) {
    if (!sb) throw new Error("Supabase unavailable");
    const { data, error } = await sb.schema("offgrd").rpc("upsert_cv_scheme_v1", {
      p_key: pKey,
      p_cv: pCv,
    });
    if (error) throw error;
    return data;
  },

  /**
   * Worst-confidence-first CV review queue (security_invoker view).
   * Optional filter: import_batch_id.
   */
  async listCvReviewQueue(teamId, opts) {
    if (!OG || !teamId) return [];
    const o = opts || {};
    let q = OG.from("cv_review_queue")
      .select("*")
      .eq("team_id", teamId)
      .order("review_hold", { ascending: false })
      .order("min_core_confidence", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(o.limit || 500);
    if (o.import_batch_id) {
      q = q.eq("import_batch_id", o.import_batch_id);
    }
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  /**
   * Confirm / edit-then-confirm a CV snap.
   * offgrd.resolve_cv_snap — stamps reviewed_by=auth.uid(), needs_review=false.
   */
  async resolveCvSnap(snapId, fixes) {
    if (!sb) throw new Error("Supabase unavailable");
    if (!snapId) throw new Error("snapId required");
    const { error } = await sb.schema("offgrd").rpc("resolve_cv_snap", {
      p_snap_id: snapId,
      p_fixes: fixes || {},
    });
    if (error) throw error;
  },

  /**
   * Review-gated scout_snaps corpus (Predict/Tendencies cutover).
   * public.offgrd_scout_snaps_for_team — needs_review=false + review_hold=false.
   */
  async listScoutSnaps(teamId) {
    if (!sb || !teamId) return [];
    const { data, error } = await sb.rpc("offgrd_scout_snaps_for_team", { t: teamId });
    if (error) {
      console.warn("[Cloud.listScoutSnaps]", error.message);
      throw error;
    }
    return data || [];
  },

  /**
   * Map offgrd.scout_snaps → shape expected by OFFGRD_TENDENCIES / scopedOppRows.
   * Pressure: classic bridge stores 0/1; Assist import stores BLITZ label in pressure —
   * normalize to pressure=0|1 + blitz string so existing blitz-rate math keeps working.
   */
  scoutSnapToRow(s) {
    if (!s) return null;
    const pressureRaw = s.pressure;
    let pressure = 0;
    let blitz = "";
    if (pressureRaw != null && String(pressureRaw).trim() !== "") {
      const t = String(pressureRaw).trim();
      if (/^(0|1)$/.test(t)) {
        pressure = +t;
      } else if (/^(true|false)$/i.test(t)) {
        pressure = /^true$/i.test(t) ? 1 : 0;
      } else {
        pressure = 1;
        blitz = t;
      }
    }
    const mot = s.motion_type;
    const motion =
      mot && String(mot).toLowerCase() !== "none" && String(mot).trim() !== "" ? 1 : 0;
    let success = null;
    if (s.success === true || s.success === 1 || s.success === "1") success = 1;
    else if (s.success === false || s.success === 0 || s.success === "0") success = 0;

    /* Zero-SQL Tier 2 hydration — play_dir / gap / qtr / series live in raw.
       Opponent-card grouping also needs off_strength / backfield / pass_zone. */
    const rawPick = this._rawPickAssist(s.raw, {
      direction: ["play dir", "play direction", "dir", "direction", "play_dir"],
      gap: ["gap", "hole"],
      qtr: ["qtr", "quarter", "q", "period"],
      series: ["series", "drive", "drive #", "drive no", "series #"],
      personnel: [
        "off pers",
        "off personnel",
        "personnel",
        "pers",
        "off_personnel",
      ],
      off_strength: [
        "off str",
        "off strength",
        "offensive strength",
        "strength",
        "str",
      ],
      off_backfield: [
        "backfield",
        "off backfield",
        "offensive backfield",
        "bf",
      ],
      pass_zone: ["pass zone", "pass zon", "passzone"],
    });
    const direction = this._normPlayDir(rawPick.direction);
    const gap = rawPick.gap || "";
    let qtr = null;
    if (rawPick.qtr != null && String(rawPick.qtr).trim() !== "") {
      const qn = parseInt(String(rawPick.qtr).replace(/[^0-9]/g, ""), 10);
      if (!isNaN(qn)) qtr = qn;
    }
    const series = rawPick.series || "";
    const personnel =
      (s.off_personnel && String(s.off_personnel).trim()) ||
      rawPick.personnel ||
      "";
    const offStrength = this._normOffStrength(
      s.off_strength || rawPick.off_strength
    );
    let rawObj = s.raw;
    if (typeof rawObj === "string") {
      try {
        rawObj = JSON.parse(rawObj);
      } catch (e) {
        rawObj = null;
      }
    }
    const offBackfield =
      (rawObj && typeof rawObj === "object" && rawObj._off_backfield
        ? String(rawObj._off_backfield).trim()
        : "") ||
      rawPick.off_backfield ||
      "";
    let offBackCount = null;
    if (s.off_back_count != null && String(s.off_back_count).trim() !== "") {
      const bn = parseInt(s.off_back_count, 10);
      if (!isNaN(bn) && bn >= 0 && bn <= 2) offBackCount = bn;
    }
    if (offBackCount == null) offBackCount = this._backCountFromBackfield(offBackfield);
    const passZone = (s.pass_zone || rawPick.pass_zone || "").trim() || null;
    const offStructure = (s.off_structure || "").trim() || null;

    return {
      id: s.id,
      date: s.play_date || s.week || "",
      opponent: s.opponent || "",
      side: s.side || "",
      week: s.week || "",
      down: s.down,
      distance: s.distance,
      fieldZone: s.field_zone || "",
      hash: s.hash || "",
      coverage: s.coverage || "",
      front: s.front || "",
      pressure: pressure,
      blitz: blitz,
      playType: s.play_type || "",
      play: s.play || "",
      formation: s.formation || "",
      formation_family: s.formation_family || "",
      personnel: personnel,
      offStrength: offStrength,
      offBackfield: offBackfield || null,
      offBackCount: offBackCount,
      offStructure: offStructure,
      passZone: passZone,
      motion: motion,
      motion_type: mot || "",
      gain: s.gain,
      success: success,
      direction: direction || null,
      gap: gap || null,
      qtr: qtr,
      series: series || null,
      snap_index: s.snap_index != null ? s.snap_index : null,
      tag_source: s.tag_source || "",
      clip_hash: s.clip_hash || null,
      /* Provenance for Scout Report badges (RPC already gates unreviewed CV) */
      import_batch_id: s.import_batch_id || null,
      prompt_version: s.prompt_version || null,
      confidence: s.confidence != null ? s.confidence : null,
      reviewed_by: s.reviewed_by || null,
      reviewed_at: s.reviewed_at || null,
    };
  },

  /** Assist-header pick from scout_snaps.raw (zero-SQL Tier 2). */
  _rawPickAssist(raw, fields) {
    const out = {};
    let obj = raw;
    if (typeof obj === "string") {
      try {
        obj = JSON.parse(obj);
      } catch (e) {
        obj = null;
      }
    }
    if (!obj || typeof obj !== "object") {
      Object.keys(fields || {}).forEach((k) => {
        out[k] = "";
      });
      return out;
    }
    const norm = (h) =>
      String(h || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    const byNorm = Object.create(null);
    Object.keys(obj).forEach((k) => {
      if (!k || String(k).charAt(0) === "_") return;
      const n = norm(k);
      if (n && !byNorm[n]) byNorm[n] = k;
    });
    Object.keys(fields || {}).forEach((field) => {
      out[field] = "";
      const aliases = fields[field] || [];
      for (let i = 0; i < aliases.length; i++) {
        const key = byNorm[norm(aliases[i])];
        if (!key) continue;
        const v = obj[key];
        if (v == null || String(v).trim() === "") continue;
        out[field] = String(v).trim();
        break;
      }
    });
    return out;
  },

  _normPlayDir(raw) {
    if (raw == null || String(raw).trim() === "") return null;
    const s = String(raw).trim().toUpperCase();
    if (/^(L|LEFT|LT)\b/.test(s) || s === "L") return "L";
    if (/^(R|RIGHT|RT)\b/.test(s) || s === "R") return "R";
    if (/^(M|MID|MIDDLE|CTR|CENTER)\b/.test(s) || s === "M") return "M";
    const ch = s.charAt(0);
    if (ch === "L" || ch === "R" || ch === "M") return ch;
    return null;
  },

  _normOffStrength(raw) {
    if (raw == null || String(raw).trim() === "") return null;
    const v = String(raw).trim().toLowerCase();
    if (v === "field") return "field";
    if (v === "boundary") return "boundary";
    if (v === "left" || v === "l" || v === "lt") return "left";
    if (v === "right" || v === "r" || v === "rt") return "right";
    if (v === "balanced" || v === "bal" || v === "b") return "balanced";
    return v;
  },

  /** Assist backfield → 0/1/2 only when clean. Unknown → null (never guess). */
  _backCountFromBackfield(raw) {
    if (raw == null) return null;
    const s = String(raw).trim().toLowerCase();
    if (!s) return null;
    if (/^empty$|^0\b|no\s*back/.test(s)) return 0;
    if (/^1\b|single|one\s*back|pistol\s*1|gun\s*1/.test(s)) return 1;
    if (/^2\b|two\s*back|i[\s\-]?form|split\s*backs/.test(s)) return 2;
    const m = s.match(/\b([012])\s*back/);
    if (m) return Number(m[1]);
    return null;
  },
};

if (typeof window !== "undefined") window.Cloud = Cloud;
