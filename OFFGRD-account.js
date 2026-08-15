/* OFFGRD account + team/roster management — shared by Scout and Playbook.
   Each app sets window.OFFGRD_APP = { kind:'playbook'|'scout', get:()=>items, set:(items)=>void }.
   Roles: owner (Admin) · coach_edit · coach_view · player. Edit = owner/coach_edit. */
import { Cloud } from "./OFFGRD-cloud.js?v=279";
import { openAuthModal } from "./OFFGRD-auth.js?v=279";

const A = window.OFFGRD_APP || {};
const SYNCABLE = ["playbook","scout"].includes(A.kind);
const acct = document.getElementById("acct");
let TEAM = null, ROLE = null, TEAMS = [], LINK_STATUS = null, CAN_CREATE_TEAM = false;
let SESSION_USER = null;
let _eligibilityChecked = false;
const AKEY = "offgrd_team";
const ROLE_KEY = "offgrd_my_role";
const coachPortalUrl = () => (window.OFFGRD_CONFIG && window.OFFGRD_CONFIG.coachPortalUrl) || "https://getoffrd.com/high-school-coach/profile";
function isOffline(){ return typeof navigator !== "undefined" && navigator.onLine === false; }
function isSidelinePinned(){
  try{
    const v = localStorage.getItem("offgrd_view") || "";
    if(v === "dcaller" || v === "caller") return true;
    const d = localStorage.getItem("offgrd_dcaller_events_v2");
    const o = localStorage.getItem("offgrd_caller_events_v2");
    if((d && d.length > 20) || (o && o.length > 20)) return true;
  }catch(e){}
  return false;
}
function persistRole(r){
  if(!r) return;
  try{ localStorage.setItem(ROLE_KEY, r); }catch(e){}
}
function persistedShellPin(){
  try{
    const pin = localStorage.getItem("offgrd_shell_role") || "";
    if(pin === "coach" || pin === "player") return pin;
  }catch(e){}
  return "";
}
/** Local-only program hydrate — no network RPCs. Used offline and for first paint. */
function hydrateOfflineTeam(){
  let tid = null;
  try{ tid = localStorage.getItem(AKEY); }catch(e){}
  let name = "Program";
  try{ name = localStorage.getItem("offgrd_identity") || name; }catch(e){}
  let schedule = [];
  try{ schedule = JSON.parse(localStorage.getItem("offgrd_schedule_v1") || "[]") || []; }catch(e){}
  let brand = null;
  try{
    const bs = JSON.parse(localStorage.getItem("offgrd_brands") || "{}") || {};
    if(name && bs[name]) brand = Object.assign({}, bs[name], { name: name });
  }catch(e){}
  if(tid){
    TEAM = { id: tid, name: name, schedule: schedule, brand: brand };
    TEAMS = [TEAM];
  }
  let role = null;
  try{ role = localStorage.getItem(ROLE_KEY); }catch(e){}
  if(role) ROLE = role;
  else if(persistedShellPin() === "coach" || isSidelinePinned()) ROLE = "coach_edit";
  else if(persistedShellPin() === "player") ROLE = "player";
  if(ROLE) persistRole(ROLE);
  if(ROLE && ROLE !== "player"){
    try{ localStorage.setItem("offgrd_shell_role", "coach"); }catch(e){}
  } else if(ROLE === "player"){
    try{ localStorage.setItem("offgrd_shell_role", "player"); }catch(e){}
  }
  return !!(TEAM && ROLE) || !!persistedShellPin() || isSidelinePinned();
}
/** Sync first paint from LS — before any await / RPC. Network may upgrade later. */
function paintFromPersistedState(){
  try{
    hydrateOfflineTeam();
    publishProgramRole();
    try{ applyCloudBrand(); }catch(e){}
    try{
      const v = localStorage.getItem("offgrd_view") || "";
      if((v === "dcaller" || v === "caller") && typeof setView === "function" && window.CURRENT_VIEW !== v){
        setView(v);
      }
    }catch(e2){}
    if(isOffline()) showOfflineBanner();
  }catch(e3){}
}
function withTimeout(promise, ms){
  return Promise.race([
    promise,
    new Promise(function(resolve){ setTimeout(function(){ resolve(null); }, ms); })
  ]);
}
function showOfflineBanner(){
  try{
    if(document.getElementById("ogOfflineBanner")) return;
    const host = document.createElement("div");
    host.id = "ogOfflineBanner";
    host.className = "no-print";
    host.innerHTML =
      '<div style="background:#eef3fb;border:1px solid #b7c6de;border-radius:12px;padding:10px 14px;margin:10px 0 12px;font:13px/1.45 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#13294B">' +
      "<b>Offline</b> — using saved data on this device. Sync resumes when you\u2019re back online." +
      "</div>";
    const tb = document.querySelector(".topbar");
    if(tb && tb.parentNode) tb.parentNode.insertBefore(host, tb.nextSibling);
    else document.body.insertBefore(host, document.body.firstChild);
  }catch(e){}
}

const roleLabel = r => ({owner:"Admin", coach_edit:"Coach · Edit", coach_view:"Coach · View", player:"Player", coach:"Coach"}[r] || r);
const canEdit  = () => ["owner","coach_edit","coach"].includes(ROLE);
const isAdmin  = () => ROLE === "owner";
const INVITE_ROLES = [["coach_edit","Coach — can edit"],["coach_view","Coach — view only"],["player","Player — view only"]];
const ALL_ROLES    = [["owner","Admin"],["coach_edit","Coach — Edit"],["coach_view","Coach — View"],["player","Player"]];
/** Signed-in, not a coach role, cannot create a program → player chrome (avoids coach nav while ROLE is still null). */
function assumePlayerChrome(){
  if(ROLE === "player") return true;
  if(ROLE && ROLE !== "player") return false;
  return !!(SESSION_USER && !CAN_CREATE_TEAM);
}

/* ---------- styles (injected once) ---------- */
(function(){
  const s = document.createElement("style");
  s.textContent = `
  .ogm-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:flex-start;justify-content:center;padding:18px;z-index:9999;overflow:auto}
  .ogm-ov.show{display:flex}
  .ogm-box{background:#fff;color:#16181d;border-radius:14px;max-width:560px;width:100%;padding:20px;box-shadow:0 24px 70px rgba(0,0,0,.35);font:14px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif}
  .ogm-box h3{margin:0;font-size:19px;color:#13294B}
  .ogm-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .ogm-sec{margin-top:16px;padding-top:14px;border-top:1px solid #e2e5ea}
  .ogm-lbl{font-size:11px;font-weight:800;letter-spacing:.5px;color:#7a8494;text-transform:uppercase;margin:0 0 6px}
  .ogm-b{border:1px solid #d7dbe2;background:#fff;color:#16181d;padding:8px 12px;border-radius:9px;font-weight:800;font-size:13px;cursor:pointer}
  .ogm-b.go{background:#13294B;border-color:#13294B;color:#fff}
  .ogm-b.dz{color:#b3261e;border-color:#f0c4c0}
  .ogm-in,.ogm-sel{border:1px solid #d7dbe2;border-radius:9px;padding:9px 10px;font-size:14px;min-height:40px;box-sizing:border-box}
  .ogm-in{flex:1;min-width:150px}
  .ogm-code{font-size:24px;font-weight:900;letter-spacing:3px;color:#13294B;background:#eef3fb;border:1px dashed #b7c6de;border-radius:10px;padding:8px 14px}
  .ogm-badge{font-size:11px;font-weight:800;color:#13294B;background:#dce7f6;border-radius:999px;padding:3px 9px}
  .ogm-mem{display:flex;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid #eef0f3}
  .ogm-mem .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
  .ogm-note{font-size:12px;color:#5b626e;margin:6px 0 0}
  .ogm-link{background:#fff8e8;border:1px solid #e8c96a;border-radius:12px;padding:12px 14px;margin-bottom:12px;font:13px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif}
  .ogm-link b{color:#13294B}
  .ogm-link .ogm-row{margin-top:8px}`;
  document.head.appendChild(s);
})();

/* ---------- account bar ---------- */
function bar(user){
  if(!acct) return;
  if(!Cloud.ready){ acct.innerHTML = '<span style="color:#9aa4b2;font-size:12px">cloud not configured</span>'; return; }
  if(!user){
    acct.innerHTML = '<button class="cbtn" id="ci">Sign in</button>'; styleBtns();
    acct.querySelector("#ci").onclick = login; return;
  }
  if(!TEAM){
    acct.innerHTML = '<span style="color:#5b626e;font-size:12px;margin-right:6px">'+user.email+'</span> <button class="cbtn" id="csetup">Get started</button> <button class="cbtn" id="co">Sign out</button>';
    styleBtns();
    acct.querySelector("#csetup").onclick = openOnboard;
    acct.querySelector("#co").onclick = () => doSignOut();
    return;
  }
  const badge = ROLE ? '<span class="cbtn" style="cursor:default;background:#dce7f6;border-color:#dce7f6;color:#13294B">'+roleLabel(ROLE)+'</span>' : '';
  acct.innerHTML =
    '<span style="color:#5b626e;font-size:12px;margin-right:6px">'+user.email+'</span>'+ badge +
    ' <button class="cbtn" id="cteam">Team</button>'+
    ((SYNCABLE && canEdit()) ? ' <button class="cbtn" id="cs">Sync â†‘</button>' : '')+
    (SYNCABLE ? ' <button class="cbtn" id="cd">Load â†“</button>' : '')+
    (SYNCABLE ? ' <span id="syncstat" style="font-size:11px;color:#9aa4b2;font-weight:700;margin-left:2px"></span>' : '')+
    ' <button class="cbtn" id="co">Sign out</button>';
  styleBtns();
  acct.querySelector("#cteam").onclick = openTeam;
  const cs = acct.querySelector("#cs"); if(cs) cs.onclick = ()=>push();
  const cd = acct.querySelector("#cd"); if(cd) cd.onclick = () => pull(false);
  acct.querySelector("#co").onclick = () => doSignOut();
}
async function doSignOut(){
  try{ if(window.OFFGRD_CLEAR_PROGRAM_CACHE) window.OFFGRD_CLEAR_PROGRAM_CACHE(); }catch(e){}
  try{ await Cloud.signOut(); }catch(e){}
  try{ location.reload(); }catch(e){}
}
function styleBtns(){ [].forEach.call(acct.querySelectorAll(".cbtn"), b => { if(!b.style.padding) b.style.cssText="border:1px solid #e2e5ea;background:#fff;color:#16181d;padding:6px 10px;border-radius:8px;font-weight:800;font-size:12px;cursor:pointer;margin-left:2px"; }); }

function login(){ openAuthModal(function(){ (async()=>{ try{ onUser(await Cloud.session()); }catch(e){} })(); }); }

/* ---------- school link (orphan team recovery) ---------- */
async function refreshCreateEligibility(){
  if(!Cloud.ready || !(await Cloud.session())){ CAN_CREATE_TEAM = false; _eligibilityChecked = true; return; }
  try{ CAN_CREATE_TEAM = !!(await Cloud.canCreateTeam()); }
  catch(e){ CAN_CREATE_TEAM = false; }
  _eligibilityChecked = true;
}
/** True once we know player vs coach chrome. Persisted pin/role counts — never block paint on RPC. */
function isRoleResolved(){
  const pin = persistedShellPin();
  if(pin || ROLE) return true;
  try{
    if(localStorage.getItem(ROLE_KEY)) return true;
  }catch(e){}
  if(isOffline() && (isSidelinePinned() || (function(){ try{ return !!localStorage.getItem(AKEY); }catch(e2){ return false; } })())){
    return true;
  }
  if(!SESSION_USER){
    const likely = !!(window.OFFGRD_HAS_LIKELY_SESSION && window.OFFGRD_HAS_LIKELY_SESSION());
    if(likely && !_sessionResolved) return false;
    return true;
  }
  if(ROLE && ROLE !== "player") return true;
  if(ROLE === "player") return true;
  if(_eligibilityChecked) return true;
  return false;
}
function shellRole(){
  /* Paint from persisted pin before network. Neutral only when online + no pin + auth still open. */
  const pin = persistedShellPin();
  if(!isRoleResolved()){
    if(pin) return pin;
    if(isSidelinePinned()) return "coach";
    try{
      const r = localStorage.getItem(ROLE_KEY) || "";
      if(r === "player") return "player";
      if(r || localStorage.getItem(AKEY)) return "coach";
    }catch(e){}
    if(isOffline()) return "coach";
    return "neutral";
  }
  if(ROLE === "player" || assumePlayerChrome()){
    try{ localStorage.setItem("offgrd_shell_role", "player"); }catch(e){}
    return "player";
  }
  if(ROLE && ROLE !== "player"){
    try{ localStorage.setItem("offgrd_shell_role", "coach"); }catch(e){}
    return "coach";
  }
  if(pin) return pin;
  if(isSidelinePinned() || isOffline()) return "coach";
  if(!SESSION_USER){
    const likely = !!(window.OFFGRD_HAS_LIKELY_SESSION && window.OFFGRD_HAS_LIKELY_SESSION());
    if(likely && !_sessionResolved) return "neutral";
    return "coach";
  }
  try{ localStorage.setItem("offgrd_shell_role", "coach"); }catch(e){}
  return "coach";
}
function publishCallerBridge(){
  /* Sideline sync bridge — was never wired before; OC sync was a silent no-op. */
  try{
    window.OFFGRD_CALLER_BRIDGE = {
      getTeamId: function(){ return TEAM && TEAM.id ? TEAM.id : null; },
      getSchoolId: function(){ return TEAM && (TEAM.high_school_id || TEAM.school_id) || null; },
      canEdit: function(){ return canEdit(); },
      /* Staff coaches (incl. coach_view) may push/pull; players never. */
      canSync: function(){
        if(ROLE === "player") return false;
        if(ROLE && ROLE !== "player") return true;
        try{ if(localStorage.getItem("offgrd_shell_role") === "coach") return true; }catch(e){}
        return false;
      },
      getActorId: function(){ return SESSION_USER && SESSION_USER.id ? SESSION_USER.id : null; },
      cloud: Cloud
    };
  }catch(e){}
}
let _programReadyFp = "";
function publishProgramRole(){
  publishCallerBridge();
  const ready = !!(TEAM && ROLE);
  const teamId = TEAM && TEAM.id;
  const fp = [teamId || "", ROLE || "", ready ? "1" : "0", shellRole(), isRoleResolved() ? "1" : "0"].join("|");
  const changed = fp !== _programReadyFp;
  _programReadyFp = fp;
  window.OFFGRD_PROGRAM = {
    ready: ready,
    role: ROLE,
    roleResolved: isRoleResolved(),
    shellRole: shellRole(),
    teamId: teamId,
    isPlayer: () => ROLE === "player" || assumePlayerChrome(),
    isCoach: () => !!ROLE && ROLE !== "player",
    canCreateTeam: () => CAN_CREATE_TEAM,
  };
  /* Same team/role fingerprint — skip log + event (boot often publishes 2–3×). */
  if(!changed) return;
  try{
    console.log("[program-ready]", {
      ready: ready,
      teamId: teamId,
      role: ROLE,
      playerChrome: assumePlayerChrome(),
      roleResolved: isRoleResolved(),
      shellRole: shellRole(),
      cachedTeam: (function(){ try{ return localStorage.getItem(AKEY); }catch(e){ return null; } })()
    });
  }catch(e){}
  try{ document.dispatchEvent(new CustomEvent("offgrd-program-ready")); }catch(e){}
  try{
    if(window.OFFGRD_REDESIGN && OFFGRD_REDESIGN.rebuildShellIfNeeded) OFFGRD_REDESIGN.rebuildShellIfNeeded();
  }catch(e){}
}
const PLAYER_WEEK_CACHE_KEY = "offgrd_player_week_v1";

function readPlayerWeekCache(tid){
  try{
    const raw = localStorage.getItem(PLAYER_WEEK_CACHE_KEY);
    if(!raw) return null;
    const o = JSON.parse(raw);
    if(!o || !o.plan || !o.plan.id) return null;
    if(tid && o.teamId && o.teamId !== tid) return null;
    return o;
  }catch(e){ return null; }
}
/** Coach device warm cache (offgrd_week_v1) — usable if shape has id/opponent. */
function readCoachWeekFallback(tid){
  try{
    const raw = localStorage.getItem("offgrd_week_v1");
    if(!raw) return null;
    const plan = JSON.parse(raw);
    if(!plan || !plan.id) return null;
    return { teamId: tid || null, cachedAt: plan.updatedAt || plan.updated_at || null, plan: plan };
  }catch(e){ return null; }
}
function writePlayerWeekCache(tid, plan){
  if(!plan || !plan.id || plan.linked === false) return;
  try{
    const slim = {
      linked: true,
      _role: plan._role || "player",
      id: plan.id,
      opponent: plan.opponent || "",
      game_date: plan.game_date || null,
      status: plan.status || "active",
      buckets: plan.buckets || [],
      gen: plan.gen || null,
      test_spec: plan.test_spec || null,
      def_aligns: plan.def_aligns || {},
      notes: plan.notes || null,
      practice: plan.practice || null,
      player_share: plan.player_share || null
    };
    localStorage.setItem(PLAYER_WEEK_CACHE_KEY, JSON.stringify({
      teamId: tid || null,
      cachedAt: Date.now(),
      plan: slim
    }));
  }catch(e){}
}
function stampWeekFromCache(entry){
  if(!entry || !entry.plan) return null;
  const plan = Object.assign({}, entry.plan, {
    linked: entry.plan.linked !== false,
    _fromCache: true,
    _cachedAt: entry.cachedAt || null
  });
  return plan;
}
function formatWeekCacheAge(ts){
  if(!ts) return "";
  try{
    const d = new Date(ts);
    if(isNaN(d.getTime())) return "";
    return d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
  }catch(e){ return ""; }
}

async function resolveWeekTeamId(){
  if(TEAM && TEAM.id) return TEAM.id;
  let saved = null;
  try{ saved = localStorage.getItem(AKEY); }catch(e){}
  /* Offline: never block on myTeams / JWT refresh — LS team id is enough for cache. */
  if(isOffline()) return saved || null;
  if(!Cloud.ready) return saved || null;
  try{ if(Cloud.ensureFreshSession) await Cloud.ensureFreshSession(); }catch(e){}
  let teams = [];
  try{ teams = await Cloud.myTeams(); }catch(e){ teams = []; }
  if(!teams.length && Cloud.playerMembership){
    try{
      const mem = await Cloud.playerMembership();
      if(mem && mem.team_id && mem.is_member) return mem.team_id;
    }catch(e){}
  }
  if(!teams.length) return saved || null;
  const t = teams.find(x => x.id === saved) || teams[0];
  return t && t.id;
}
function normalizePlayerWeekPlan(pw, role){
  if(!pw || pw.linked === false || !pw.id) return pw;
  return {
    linked: true,
    _role: role || "player",
    id: pw.id,
    opponent: pw.opponent || "",
    game_date: pw.game_date || null,
    status: pw.status || "active",
    buckets: pw.buckets || [],
    gen: pw.gen || null,
    test_spec: pw.test_spec || null,
    def_aligns: pw.def_aligns || {},
    notes: pw.notes || null,
    practice: pw.practice || null,
    player_share: pw.player_share || null
  };
}
function normalizeCoachWeekPlan(wp){
  if(!wp || !wp.id) return { linked: false, _role: "coach" };
  return {
    linked: true,
    _role: "coach",
    id: wp.id,
    opponent: wp.opponent || "",
    game_date: wp.game_date || null,
    status: wp.status || "active",
    buckets: wp.buckets || [],
    gen: wp.gen || null,
    test_spec: wp.test_spec || null,
    def_aligns: wp.def_aligns || {},
    notes: wp.notes || null,
    practice: wp.practice || null,
    player_share: wp.player_share || null
  };
}
async function fetchWeekPlanNetwork(tid){
  let role = ROLE || null;
  try{ if(!role) role = await Cloud.myRole(tid); }catch(e){}
  if(!role){
    try{
      const mem = Cloud.playerMembership ? await Cloud.playerMembership() : null;
      if(mem && mem.is_member && mem.team_id === tid) role = "player";
    }catch(e){}
  }
  const asPlayer = role === "player" || (!role && persistedShellPin() === "player");
  if(asPlayer){
    const pw = await Cloud.playerWeekPlan(tid);
    if(!pw) return null;
    if(pw.linked === false) return Object.assign({ _role: "player" }, pw);
    return normalizePlayerWeekPlan(pw, "player");
  }
  const wp = await Cloud.activeWeekPlan(tid);
  if(!wp || !wp.id) return { linked: false, _role: "coach" };
  return normalizeCoachWeekPlan(wp);
}
/** Single week resolver — network first; offline/timeout → local cache. Never hangs. */
async function resolveWeekPlan(){
  const tid = await resolveWeekTeamId();
  const cached = readPlayerWeekCache(tid) || readCoachWeekFallback(tid);

  if(isOffline()){
    return stampWeekFromCache(cached);
  }

  if(!tid){
    return stampWeekFromCache(cached);
  }

  try{
    const plan = await withTimeout(fetchWeekPlanNetwork(tid), 5000);
    if(plan && plan.id && plan.linked !== false){
      writePlayerWeekCache(tid, plan);
      return plan;
    }
    if(plan && plan.linked === false) return plan;
    return stampWeekFromCache(cached) || plan;
  }catch(e){
    try{ console.warn("[resolveWeekPlan] network fail — cache", e && e.message); }catch(e2){}
    return stampWeekFromCache(cached);
  }
}
window.OFFGRD_LOAD_WEEK_PLAN = resolveWeekPlan;
window.OFFGRD_LOAD_PLAYER_WEEK = resolveWeekPlan;
try{ document.dispatchEvent(new CustomEvent("offgrd-week-bridge-ready")); }catch(eBridge){}
window.OFFGRD_RESOLVE_WEEK_TEAM_ID = resolveWeekTeamId;
window.OFFGRD_READ_WEEK_CACHE = readPlayerWeekCache;
window.OFFGRD_WEEK_CACHE_AGE = formatWeekCacheAge;
window.OFFGRD_WRITE_WEEK_CACHE = writePlayerWeekCache;
window.OFFGRD_LOAD_RECRUITING_SNAPSHOT = async function(){
  if(!Cloud.recruitingSnapshot) return null;
  return Cloud.recruitingSnapshot();
};
window.OFFGRD_WEEK_PLAYER_SHARE = async function(share){
  if(!TEAM || !canEdit() || !Cloud.setWeekPlayerShare) return;
  await Cloud.setWeekPlayerShare(TEAM.id, share);
  if(window.WEEK) window.WEEK.player_share = share;
};
async function refreshLinkStatus(){
  if(!Cloud.ready){ LINK_STATUS=null; renderLinkBanner(); return; }
  try{
    const u = await Cloud.session();
    if(!u){ LINK_STATUS=null; renderLinkBanner(); return; }
    LINK_STATUS = await Cloud.myTeamStatus();
  }catch(e){
    console.warn("link status", e);
    LINK_STATUS = null;
  }
  renderLinkBanner();
}
function orphanLinkInfo(){
  if(!LINK_STATUS || LINK_STATUS.linked || !LINK_STATUS.orphan_team_id) return null;
  return LINK_STATUS;
}
function renderSchoolLinkSection(compact){
  const st = orphanLinkInfo();
  if(!st) return null;
  const name = esc(st.orphan_team_name || "your program");
  const sec = el('<div class="ogm-link"></div>');
  if(st.can_link_to_school){
    sec.innerHTML = '<p class="ogm-note" style="margin:0;font-size:13px"><b>'+name+'</b> isn’t linked to your school yet. Link it so <b>Gameday</b> and your <b>getOFFRD</b> coach portal see this program.</p>'
      +'<div class="ogm-row"><button type="button" class="ogm-b go" id="ogLinkGo">Link to my school</button></div>';
    sec.querySelector("#ogLinkGo").onclick = ()=> linkTeamToSchoolAction(st.orphan_team_id);
  } else if(st.link_blocked_reason === "no_hs_coach_profile"){
    sec.innerHTML = '<p class="ogm-note" style="margin:0;font-size:13px"><b>'+name+'</b> was created but isn’t tied to a school. Finish your <b>high school coach profile</b> on getOFFRD first — we’ll link automatically, or you can link here after.</p>'
      +'<div class="ogm-row"><a class="ogm-b go" href="'+esc(coachPortalUrl())+'" target="_blank" rel="noopener" style="text-decoration:none;display:inline-flex;align-items:center">Open coach profile</a></div>';
  } else if(st.link_blocked_reason === "school_already_linked"){
    sec.innerHTML = '<p class="ogm-note" style="margin:0;font-size:13px"><b>'+name+'</b> can’t be linked — your school already has another OFFGRD program. Contact support if you need to merge accounts.</p>';
  } else {
    sec.innerHTML = '<p class="ogm-note" style="margin:0;font-size:13px"><b>'+name+'</b> isn’t linked to a school program yet.</p>';
  }
  if(compact) sec.style.marginBottom = "0";
  return sec;
}
function renderLinkBanner(){
  let host = document.getElementById("ogLinkSchool");
  const st = orphanLinkInfo();
  if(!st){
    if(host) host.remove();
    return;
  }
  if(!host){
    host = document.createElement("div");
    host.id = "ogLinkSchool";
    host.className = "no-print";
    const tb = document.querySelector(".topbar");
    if(tb && tb.parentNode) tb.parentNode.insertBefore(host, tb.nextSibling);
    else document.body.prepend(host);
  }
  host.innerHTML = "";
  const box = renderSchoolLinkSection(false);
  if(box) host.appendChild(box);
}
async function linkTeamToSchoolAction(teamId){
  if(!teamId) return;
  const btn = document.querySelector("#ogLinkGo");
  if(btn) btn.disabled = true;
  try{
    await Cloud.linkTeamToSchool(teamId);
    await refreshLinkStatus();
    TEAMS = await Cloud.myTeams();
    await setActiveTeam(teamId, true);
    alert("Program linked to your school \u2713 Gameday and your getOFFRD coach portal can now see this program.");
    if(modal && modal.classList.contains("show")) renderTeam();
  }catch(e){
    alert(e.message || "Could not link program to school.");
  }finally{
    if(btn) btn.disabled = false;
  }
}

/* ---------- session / active team ---------- */
/* Different account on the same device? Wipe the previous account's local app data
   (games, plays, identity, logos, offrd:* schedule keys) so nothing leaks between
   users on shared computers. Supabase auth tokens (sb-*) are kept. */
function switchGuard(u){
  let prev=null; try{ prev=localStorage.getItem("offgrd_uid"); }catch(e){}
  if(prev && u && prev!==u.id){
    try{
      if(window.OFFGRD_CLEAR_PROGRAM_CACHE) window.OFFGRD_CLEAR_PROGRAM_CACHE();
      else {
        const kill=[];
        for(let i=0;i<localStorage.length;i++){
          const k=localStorage.key(i);
          if(!k) continue;
          if(k.indexOf("offgrd_")===0 || k.indexOf("offrd:")===0 || k.indexOf("offrd_")===0) kill.push(k);
        }
        kill.forEach(k=>localStorage.removeItem(k));
      }
      localStorage.setItem("offgrd_uid", u.id);
    }catch(e){}
    location.reload();
    return true;
  }
  try{ if(u) localStorage.setItem("offgrd_uid", u.id); }catch(e){}
  return false;
}
let _sessionResolved = false;
let _sessionRetryT = null;
let _sessionRetryN = 0;
let _teamRetryT = null;
let _teamRetryN = 0;
let _teamRetryGaveUp = false;

function clearSessionRetry(){
  if(_sessionRetryT){ clearTimeout(_sessionRetryT); _sessionRetryT = null; }
}
function clearTeamRetry(){
  if(_teamRetryT){ clearTimeout(_teamRetryT); _teamRetryT = null; }
}
function resetProgramRetries(){
  clearSessionRetry();
  clearTeamRetry();
  _sessionRetryN = 0;
  _teamRetryN = 0;
  _teamRetryGaveUp = false;
  try{
    const el = document.getElementById("ogTeamUnreachable");
    if(el) el.remove();
  }catch(e){}
}
function showTeamUnreachable(){
  /* Airplane mode: never cover the sideline with a "can't reach" modal. */
  if(isOffline()){ showOfflineBanner(); return; }
  try{
    let host = document.getElementById("ogTeamUnreachable");
    if(!host){
      host = document.createElement("div");
      host.id = "ogTeamUnreachable";
      host.className = "no-print";
      host.innerHTML =
        '<div style="background:#fff8e8;border:1px solid #e8c96a;border-radius:12px;padding:14px 16px;margin:12px 0 14px;font:14px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif">' +
        '<b style="color:#13294B">Can\u2019t reach your team</b>' +
        '<p style="margin:6px 0 10px;color:#5b626e;font-size:13px">We couldn\u2019t load your program from this session. Check your connection, then try again.</p>' +
        '<button type="button" class="ogm-b go" id="ogTeamRetryBtn" style="border:1px solid #13294B;background:#13294B;color:#fff;padding:8px 12px;border-radius:9px;font-weight:800;font-size:13px;cursor:pointer">Try again</button>' +
        "</div>";
      const tb = document.querySelector(".topbar");
      if(tb && tb.parentNode) tb.parentNode.insertBefore(host, tb.nextSibling);
      else document.body.insertBefore(host, document.body.firstChild);
      host.querySelector("#ogTeamRetryBtn").onclick = function(){
        _teamRetryGaveUp = false;
        _teamRetryN = 0;
        try{ host.remove(); }catch(e){}
        if(SESSION_USER) onUser(SESSION_USER);
        else scheduleSessionRetry("manual");
      };
    }
  }catch(e){}
}
/** Auth hydrate only — capped exponential backoff. Never tight-loops onUser. */
function scheduleSessionRetry(reason){
  if(isOffline()){
    try{ console.warn("[onUser] skip session retry offline", reason || ""); }catch(e){}
    hydrateOfflineTeam();
    publishProgramRole();
    showOfflineBanner();
    return;
  }
  if(_sessionRetryT) return;
  if(_sessionRetryN >= 8){
    try{ console.warn("[onUser] session hydrate gave up", reason || ""); }catch(e){}
    showTeamUnreachable();
    return;
  }
  const delay = Math.min(30000, 500 * Math.pow(2, _sessionRetryN));
  _sessionRetryN++;
  try{ console.warn("[onUser] session retry", _sessionRetryN, "in", delay + "ms", reason || ""); }catch(e){}
  _sessionRetryT = setTimeout(async function(){
    _sessionRetryT = null;
    try{
      const u = (Cloud.ensureFreshSession ? await Cloud.ensureFreshSession() : await Cloud.session());
      if(u){
        _sessionRetryN = 0;
        onUser(u);
        return;
      }
    }catch(e){}
    scheduleSessionRetry(reason || "still-null");
  }, delay);
}
/** Team membership retry — separate from auth; capped backoff; terminal banner. */
function scheduleTeamRetry(reason){
  if(isOffline()){
    try{ console.warn("[onUser] skip team retry offline", reason || ""); }catch(e){}
    hydrateOfflineTeam();
    publishProgramRole();
    showOfflineBanner();
    return;
  }
  if(_teamRetryGaveUp) return;
  if(_teamRetryT) return;
  if(_teamRetryN >= 8){
    _teamRetryGaveUp = true;
    try{ console.warn("[onUser] team hydrate gave up after", _teamRetryN, reason || ""); }catch(e){}
    showTeamUnreachable();
    return;
  }
  const delay = Math.min(30000, 500 * Math.pow(2, _teamRetryN));
  _teamRetryN++;
  try{ console.warn("[onUser] team retry", _teamRetryN, "in", delay + "ms", reason || ""); }catch(e){}
  _teamRetryT = setTimeout(async function(){
    _teamRetryT = null;
    if(!SESSION_USER){ scheduleSessionRetry("lost-user"); return; }
    try{
      const ok = await hydrateTeamsFromSession(SESSION_USER, { fromRetry: true });
      if(ok) await finishProgramHydrate(SESSION_USER);
    }catch(e){
      try{ console.warn("[onUser] team retry err", e && e.message); }catch(e2){}
      scheduleTeamRetry("error");
    }
  }, delay);
}

async function hydrateTeamsFromSession(u, opts){
  const fromRetry = !!(opts && opts.fromRetry);
  if(isOffline()){
    const ok = hydrateOfflineTeam();
    try{ console.log("[onUser] offline hydrate", ok, TEAM && TEAM.id, ROLE); }catch(e){}
    showOfflineBanner();
    return ok;
  }
  try{ if(Cloud.ensureFreshSession) await Cloud.ensureFreshSession(); }catch(e){}
  let teams = await Cloud.myTeams();
  try{ console.log("[onUser] myTeams", teams.length, u.id, fromRetry ? "(retry)" : ""); }catch(e){}
  if(!teams.length && !fromRetry){
    /* One short immediate retry on first paint only — not a loop. */
    await new Promise(function(r){ setTimeout(r, 400); });
    try{ if(Cloud.ensureFreshSession) await Cloud.ensureFreshSession(); }catch(e){}
    teams = await Cloud.myTeams();
    try{ console.log("[onUser] myTeams once-more", teams.length); }catch(e){}
  }
  if(!teams.length && Cloud.playerMembership){
    try{
      const mem = await Cloud.playerMembership();
      try{ console.log("[onUser] membership gate", mem && mem.is_member, mem && mem.team_id, mem && mem.error); }catch(e){}
      if(mem && mem.team_id && mem.is_member){
        teams = [{
          id: mem.team_id,
          name: mem.team_name || "Program",
          brand: mem.brand || null,
          schedule: [],
          high_school_id: mem.school_id || null
        }];
      }
    }catch(e){ console.warn("[onUser] membership", e && e.message); }
  }

  TEAMS = teams || [];
  if(TEAMS.length){
    let saved = null; try{ saved = localStorage.getItem(AKEY); }catch(e){}
    TEAM = TEAMS.find(t => t.id === saved) || TEAMS[0];
    try{ if(TEAM && TEAM.id) localStorage.setItem(AKEY, TEAM.id); }catch(e){}
    ROLE = await Cloud.myRole(TEAM.id);
    if(!ROLE){
      await new Promise(function(r){ setTimeout(r, 300); });
      ROLE = await Cloud.myRole(TEAM.id);
    }
    if(!ROLE) ROLE = "player";
    persistRole(ROLE);
    try{ if(obEl) obEl.classList.remove("show"); }catch(e){}
    _teamRetryN = 0;
    _teamRetryGaveUp = false;
    clearTeamRetry();
    try{
      const el = document.getElementById("ogTeamUnreachable");
      if(el) el.remove();
    }catch(e){}
    return true;
  }

  TEAM = null;
  ROLE = null;
  if(!fromRetry){
    /* First failure — schedule backoff; do not open join for known members. */
    let mem = null;
    try{ mem = Cloud.playerMembership ? await Cloud.playerMembership() : null; }catch(e){}
    if(mem && mem.is_member && mem.team_id){
      scheduleTeamRetry("member-but-empty-myTeams");
    } else if(mem && mem.ok === false && mem.error === "not_authenticated"){
      scheduleSessionRetry("membership-unauth");
    } else {
      scheduleTeamRetry("no-team");
      let ob=null; try{ ob=localStorage.getItem("offgrd_onboarded"); }catch(e){}
      if(!ob && mem && mem.team_id && mem.is_member === false){
        setTimeout(function(){ if(!TEAM) openOnboard(); }, 1200);
      } else if(!ob && mem && !mem.team_id && !mem.school_id){
        setTimeout(function(){ if(!TEAM) openOnboard(); }, 1200);
      } else if(!ob && !mem){
        setTimeout(function(){ if(!TEAM) openOnboard(); }, 2000);
      }
    }
  } else {
    scheduleTeamRetry("still-empty");
  }
  return false;
}

async function finishProgramHydrate(u){
  if(isOffline()){
    publishProgramRole();
    try{ applyCloudBrand(); }catch(e){}
    bar(u || SESSION_USER);
    showOfflineBanner();
    try{ if(A.onUser && u) A.onUser(u.email); }catch(e){}
    return;
  }
  await refreshCreateEligibility();
  await refreshLinkStatus();
  publishProgramRole();
  /* Init order: cloud module loaded (static import) → TEAM hydrated → persist brand → CSS hook */
  applyCloudBrand();
  try{
    if(TEAM && Array.isArray(TEAM.schedule)){
      localStorage.setItem("offgrd_schedule_v1", JSON.stringify(TEAM.schedule));
    }
  }catch(e){}
  try{
    if(TEAM && Cloud.listGames){
      const tombs = await loadTombstones(TEAM.id);
      const games = await Cloud.listGames(TEAM.id).catch(function(){ return []; });
      let local=[]; try{ local=JSON.parse(localStorage.getItem("offgrd_season_v2")||"[]"); }catch(e2){ local=[]; }
      /* Keyed upsert — never write undeduped cloud list (duplicate Live blobs). */
      let mapped = mergeGames(games || [], Array.isArray(local)?local:[]);
      /* v212: purge tombstoned (natural key) so dirty partitions self-clean. */
      mapped = purgeTombstonedGames(mapped, tombs);
      localStorage.setItem("offgrd_season_v2", JSON.stringify(mapped));
    }
  }catch(e){}
  try{ if(typeof window.OFFGRD_RESOLVE_WEEK === "function") window.OFFGRD_RESOLVE_WEEK(); }catch(e){}
  bar(u);
  /* pull() already refreshes scout snaps for scout pages — do not double-hydrate. */
  if(TEAM) await pull(true);
  clearInterval(_autoT); if(TEAM && SYNCABLE) _autoT=setInterval(maybePull, 45000);
  if(TEAM && canEdit()){ try{ setupState().then(renderChecklist); }catch(e){} }
  try{ if(A.onUser) A.onUser(u.email); }catch(e){}
}

async function onUser(u){
  if(!u){
    /* Offline + sideline: never wipe caller state / never signed-out gate. */
    if(isOffline() && isSidelinePinned()){
      try{ console.warn("[onUser] offline sideline — keep local program"); }catch(e){}
      hydrateOfflineTeam();
      publishProgramRole();
      showOfflineBanner();
      bar(null);
      return;
    }
    SESSION_USER=null; TEAM=null; ROLE=null; TEAMS=[]; CAN_CREATE_TEAM=false; _eligibilityChecked=false; clearInterval(_autoT);
    const likely = !!(window.OFFGRD_HAS_LIKELY_SESSION && window.OFFGRD_HAS_LIKELY_SESSION());
    /* Token in storage but hydrate returned null — never wipe, keep retrying (capped). */
    if(likely){
      try{ console.warn("[onUser] null user with likely session — retrying hydrate"); }catch(e){}
      publishProgramRole(); bar(null); scheduleSessionRetry("likely-session"); return;
    }
    if(!_sessionResolved){
      publishProgramRole(); bar(null); return;
    }
    resetProgramRetries();
    try{ if(window.OFFGRD_CLEAR_PROGRAM_CACHE) window.OFFGRD_CLEAR_PROGRAM_CACHE(); }catch(e){}
    try{ if(window.OFFGRD_RESET_IN_MEMORY_PROGRAM) window.OFFGRD_RESET_IN_MEMORY_PROGRAM(); }catch(e){}
    try{ if(window.OFFGRD_SHOW_SIGNED_OUT_GATE) window.OFFGRD_SHOW_SIGNED_OUT_GATE(); }catch(e){}
    publishProgramRole(); bar(null); return;
  }
  SESSION_USER = u;
  _eligibilityChecked = false;
  publishProgramRole();
  clearSessionRetry();
  _sessionRetryN = 0;
  try{ if(window.OFFGRD_HIDE_SIGNED_OUT_GATE) window.OFFGRD_HIDE_SIGNED_OUT_GATE(); }catch(e){}
  try{ window.OFFGRD_SESSION_GATED = false; }catch(e){}
  if(switchGuard(u)) return;
  try{
    await hydrateTeamsFromSession(u, { fromRetry: false });
    await finishProgramHydrate(u);
  }catch(e){ console.error(e); bar(u); }
}
async function setActiveTeam(id, silent){
  TEAM = TEAMS.find(t => t.id === id) || TEAM; if(!TEAM) return;
  try{ localStorage.setItem(AKEY, TEAM.id); }catch(e){}
  ROLE = await Cloud.myRole(TEAM.id);
  publishProgramRole();
  bar(await Cloud.user());
  await pull(!!silent);
}

/* ---------- sync ---------- */
function playSig(p){
  if(!p) return "";
  return [p.cid||"", p.id||"", p.name||"", p.formation||"", p.updatedAt||0, (p.tags&&p.tags.length)||0, (p.thumbSvg&&p.thumbSvg.length)||0, (p.players&&p.players.length)||0].join("\t");
}
function libSig(arr){
  if(!arr||!arr.length) return "0";
  let s=String(arr.length);
  for(let i=0;i<arr.length;i++) s+="|"+playSig(arr[i]);
  return s;
}

/** Season game natural key — must match OFFGRD.html gameKey (trim + lower). */
function gameNaturalKey(opp, week, side){
  return String(opp||"?").trim().toLowerCase()+"|"+String(week||"?").trim().toLowerCase()+"|"+String(side||"");
}
/**
 * Per-snap identity inside a game blob — live prefers callId; scout uses composite.
 * Defense imports often leave play/gain empty and share 1st&10 / same coverage /
 * OWN zone — the short key used to collapse distinct snaps on hydrate (St Mary's
 * 61→44). Include front/formation/qtr/result/playNum so mergeGames stays idempotent
 * without dropping real snaps.
 */
function seasonRowPlayNum(r){
  if(!r) return "";
  if(r.playNum!=null&&r.playNum!=="") return r.playNum;
  if(r["PLAY #"]!=null&&r["PLAY #"]!=="") return r["PLAY #"];
  return "";
}
function seasonRowIdentity(r){
  if(!r) return "∅";
  if(r.callId) return "c:"+String(r.callId);
  if(r.source==="live_call" && r.id) return "c:"+String(r.id);
  const playNum=seasonRowPlayNum(r);
  return ["s", r.date||"", r.down||"", r.distance||"", r.play||"", r.hash||"", (r.gain!=null?r.gain:""), r.source||"", r.coverage||"", r.fieldZone||"", r.front||"", r.formation||"", r.qtr||"", r.result||"", playNum].join("|");
}
/**
 * Merge by identity, then drop legacy no-playNum survivors when any playNum-keyed
 * row is present (St Mary's over-merge: collapsed 44 + restored 61 → 105).
 */
function mergeSeasonRows(a, b){
  const map=new Map();
  (a||[]).forEach(function(r){ map.set(seasonRowIdentity(r), r); });
  (b||[]).forEach(function(r){ map.set(seasonRowIdentity(r), r); });
  const out=Array.from(map.values());
  const hasPlayNum=out.some(function(r){ return seasonRowPlayNum(r)!==""; });
  if(!hasPlayNum) return out;
  return out.filter(function(r){ return seasonRowPlayNum(r)!==""; });
}
function gameSig(g){
  if(!g) return "";
  const n=(g.rows&&g.rows.length)||0;
  let rowFp=n;
  if(n){
    /* Light fingerprint — count + first/last identities (not full JSON). */
    rowFp+=":"+seasonRowIdentity(g.rows[0])+":"+seasonRowIdentity(g.rows[n-1]);
  }
  return [g.cid||"", gameNaturalKey(g.opponent,g.week,g.side), g.source||"", rowFp].join("\t");
}
function gameLibSig(arr){
  if(!arr||!arr.length) return "0";
  let s=String(arr.length);
  for(let i=0;i<arr.length;i++) s+="|"+gameSig(arr[i]);
  return s;
}
/**
 * Keyed season upsert — cid first, then natural key. Collapses duplicate cloud
 * blobs for the same opponent|week|side. Rows merge by seasonRowIdentity.
 * Reloading N times must equal loading once (idempotent).
 */
function mergeGames(cloudRows, local){
  const byCid=new Map();
  const byKey=new Map();

  function adopt(g){
    if(!g) return;
    const key=gameNaturalKey(g.opponent, g.week, g.side);
    const cid=g.cid?String(g.cid):null;
    const rows=Array.isArray(g.rows)?g.rows:[];
    let prev=null;
    if(cid && byCid.has(cid)) prev=byCid.get(cid);
    else if(byKey.has(key)) prev=byKey.get(key);
    if(prev){
      prev.rows=mergeSeasonRows(prev.rows, rows);
      if(!prev.cid && cid){ prev.cid=cid; byCid.set(cid, prev); }
      if(prev.source==="live_call" && g.source && g.source!=="live_call") prev.source=g.source;
      /* Keep canonical display fields from the survivor that already has a key slot. */
      if(!prev.opponent && g.opponent) prev.opponent=g.opponent;
      if(!prev.week && g.week) prev.week=g.week;
      /* Prefer the newer cloud timestamp when merging (durability / CAS base). */
      if(g.updatedAt){
        const prevT=Date.parse(prev.updatedAt||"");
        const nextT=Date.parse(g.updatedAt||"");
        if(!Number.isFinite(prevT) || (Number.isFinite(nextT) && nextT>=prevT)) prev.updatedAt=g.updatedAt;
      }
      prev.key=key;
      byKey.set(key, prev);
      return;
    }
    const next={
      key:key,
      opponent:g.opponent,
      week:g.week,
      side:g.side,
      source:g.source||"import",
      rows:rows.slice(),
      cid:cid,
      updatedAt:g.updatedAt||null
    };
    byKey.set(key, next);
    if(cid) byCid.set(cid, next);
  }

  (cloudRows||[]).forEach(function(r){
    adopt({
      opponent:r.opponent,
      week:r.week,
      side:r.side,
      source:r.source,
      rows:r.rows,
      cid:r.id||r.cid||null,
      updatedAt:r.updated_at||r.updatedAt||null
    });
  });
  (local||[]).forEach(function(g){
    adopt({
      opponent:g.opponent,
      week:g.week,
      side:g.side,
      source:g.source,
      rows:g.rows,
      cid:g.cid||g.id||null,
      updatedAt:g.updatedAt||g.updated_at||null
    });
  });
  return Array.from(byKey.values());
}
/**
 * v212 — drop tombstoned season blobs (id OR natural key).
 * Dirty partitions self-clean on next signed-in boot/hydrate.
 */
function purgeTombstonedGames(games, tombs){
  if(!Array.isArray(games) || !games.length) return Array.isArray(games) ? games : [];
  if(!Array.isArray(tombs) || !tombs.length) return games;
  const byKey=new Set();
  const byId=new Set();
  tombs.forEach(function(t){
    if(t && t.natural_key) byKey.add(String(t.natural_key));
    if(t && t.game_id) byId.add(String(t.game_id));
  });
  return games.filter(function(g){
    if(!g) return false;
    const cid=g.cid || g.id || null;
    if(cid && byId.has(String(cid))) return false;
    const key=gameNaturalKey(g.opponent, g.week, g.side);
    if(byKey.has(key)) return false;
    return true;
  });
}
function isGameTombstonedLocal(g, tombs){
  if(!g || !Array.isArray(tombs) || !tombs.length) return false;
  const cid=g.cid || g.id || null;
  const key=gameNaturalKey(g.opponent, g.week, g.side);
  for(let i=0;i<tombs.length;i++){
    const t=tombs[i];
    if(cid && t.game_id && String(t.game_id)===String(cid)) return true;
    if(t.natural_key && t.natural_key===key) return true;
  }
  return false;
}
let _tombstones=[];
let _tombstonesTeamId=null;
async function loadTombstones(teamId){
  if(!teamId || !Cloud.listGameTombstones){ _tombstones=[]; _tombstonesTeamId=null; return []; }
  try{
    _tombstones = await Cloud.listGameTombstones(teamId);
    _tombstonesTeamId = teamId;
  }catch(e){
    _tombstones = [];
    _tombstonesTeamId = teamId;
  }
  try{
    window.OFFGRD_GAME_TOMBSTONES = _tombstones;
    window.OFFGRD_IS_GAME_TOMBSTONED = function(opp, week, side, cid){
      return isGameTombstonedLocal({ opponent:opp, week:week, side:side, cid:cid }, _tombstones);
    };
  }catch(e2){}
  return _tombstones;
}
try{
  window.OFFGRD_MERGE_GAMES=mergeGames;
  window.OFFGRD_GAME_NATURAL_KEY=gameNaturalKey;
  window.OFFGRD_SEASON_ROW_ID=seasonRowIdentity;
  window.OFFGRD_PURGE_TOMBSTONED_GAMES=purgeTombstonedGames;
  window.OFFGRD_LOAD_TOMBSTONES=loadTombstones;
}catch(e){}

/** Indexed localâ†”cloud reconcile — O(n) Maps, no nested scans, no full JSON.stringify. */
function mergePlaybook(cloudRows, local){
  const cloud = (cloudRows||[]).map(r=>Object.assign({}, r.data||{}, {cid:r.id, name:r.name||((r.data&&r.data.name)||"")}));
  const byId=new Map(), byKey=new Map();
  for(let i=0;i<cloud.length;i++){
    const c=cloud[i];
    if(c.id) byId.set(String(c.id), c);
    const k=(c.key||((c.name||"")+"|"+(c.formation||""))).toLowerCase();
    if(k && k!=="|") byKey.set(k, c);
  }
  const unsynced=[];
  for(let i=0;i<(local||[]).length;i++){
    const p=local[i];
    if(p.cid) continue; /* already tied to a cloud row */
    if(p.id && byId.has(String(p.id))) continue;
    const k=(p.key||((p.name||"")+"|"+(p.formation||""))).toLowerCase();
    if(k && k!=="|" && byKey.has(k)) continue;
    unsynced.push(p);
  }
  /* Prefer cloud thumb when present; else keep a matching local thumb so pull doesn't wipe cache. */
  const locByCid=new Map(), locById=new Map();
  for(let i=0;i<(local||[]).length;i++){
    const p=local[i];
    if(p.cid) locByCid.set(String(p.cid), p);
    if(p.id) locById.set(String(p.id), p);
  }
  for(let i=0;i<cloud.length;i++){
    const c=cloud[i];
    if(c.thumbSvg) continue;
    const prev=(c.cid&&locByCid.get(String(c.cid)))||(c.id&&locById.get(String(c.id)));
    if(prev&&prev.thumbSvg) c.thumbSvg=prev.thumbSvg;
  }
  return cloud.concat(unsynced);
}
async function pull(silent){
  if(!TEAM || !SYNCABLE) return;
  if(isOffline()) return;
  if(_busy) return; _busy=true; _lastPull=Date.now();
  try{
    let rows;
    if(A.kind==="playbook") rows = await Cloud.listPlays(TEAM.id);
    else rows = await Cloud.listGames(TEAM.id);
    if(rows && rows.length){
      if(A.kind==="playbook"){
        let local=[]; try{ local=A.get()||[]; }catch(e){ local=[]; }
        const next = mergePlaybook(rows, local);
        const unsynced = next.filter(p=>!p.cid);
        if(libSig(next)!==libSig(local)) A.set(next);   /* light fingerprint — never full JSON.stringify */
        if(unsynced.length && canEdit()) await push(true);
      }
      else{
        let cur=[]; try{ cur=A.get()||[]; }catch(e){ cur=[]; }
        const tombs = await loadTombstones(TEAM.id);
        let next = mergeGames(rows, cur);
        next = purgeTombstonedGames(next, tombs);
        if(gameLibSig(next)!==gameLibSig(cur)) A.set(next);
        else if(next.length!==cur.length){
          /* Tombstone-only shrink — still persist clean local. */
          if(typeof A.touch==="function") A.touch(next);
          else A.set(next);
        }
      }
      /* Playbook: never native alert() on Load â†“ — it hard-blocks the renderer. */
      if(!silent && A.kind!=="playbook") alert("Loaded "+TEAM.name+".");
    } else {
      const local = A.get();
      if(local && local.length && canEdit()){ await push(true); if(!silent) alert("This device’s data is now backed up to "+TEAM.name+"."); }
      else if(!silent) alert(TEAM.name+" has no saved data yet.");
    }
    syncStamp();
    if(!silent && A.kind==="playbook"){
      try{ const el=document.getElementById("syncstat"); if(el){ el.textContent="loaded \u2713"; el.style.color="#1d7a45"; } }catch(e){}
    }
    try{ if(A.kind==="scout"){ pullWeek(); pushSchedule(); await refreshScoutSnaps(); } }catch(e){}
  }catch(e){ if(!silent) alert(e.message||"Load failed"); }
  finally{ _busy=false; }
}
async function push(silent){
  if(!TEAM){
    const err=new Error("Sign in first.");
    if(!silent) alert(err.message);
    throw err;
  }
  if(!canEdit()){
    const err=new Error("Your role is view-only, so you can’t save to the program.");
    if(!silent) alert(err.message);
    throw err;
  }
  const rejected=[];
  try{
    const items = A.get();
    if(A.kind==="playbook"){
      for(const p of items){
        /* Persist play JSON but omit nothing critical; cid stays the upsert key */
        const row = await Cloud.savePlay(TEAM.id, Object.assign({}, p, {id:p.cid, data:p}));
        p.cid = row.id;
      }
      /* Update cids in place — avoid a second full migrate+library rebuild when possible */
      if(typeof A.touch==="function") A.touch(items);
      else A.set(items);
    }
    else {
      const tombs = await loadTombstones(TEAM.id);
      for(const g of items){
        if(isGameTombstonedLocal(g, tombs)){ rejected.push(Object.assign({reason:"TOMBSTONED"}, g)); continue; }
        try{
          const row = await Cloud.saveGame(TEAM.id, Object.assign({}, g, {
            id:g.cid,
            baseUpdatedAt:g.updatedAt||g.updated_at||null
          }));
          g.cid = row.id;
          g.key = gameNaturalKey(g.opponent, g.week, g.side);
          if(row.updated_at) g.updatedAt = row.updated_at;
        }catch(eSave){
          /* Fire-and-forget: tombstone = skip this game, continue batch. No retry. */
          if(eSave && (eSave.code==="TOMBSTONED" || (Cloud._isTombstoneError && Cloud._isTombstoneError(eSave)))){
            rejected.push(Object.assign({reason:"TOMBSTONED"}, g));
            try{ console.warn("[push] tombstoned skip", gameNaturalKey(g.opponent,g.week,g.side)); }catch(eW){}
            continue;
          }
          /* Stale client vs newer server blob — pull that game, merge, retry once. */
          if(eSave && eSave.code==="STALE_WRITE"){
            try{
              const cloudAll = await Cloud.listGames(TEAM.id);
              const key = gameNaturalKey(g.opponent, g.week, g.side);
              const server = (cloudAll||[]).find(function(r){
                return gameNaturalKey(r.opponent, r.week, r.side)===key;
              });
              if(!server){ throw eSave; }
              const mergedOne = mergeGames([server], [g])[0] || g;
              const row2 = await Cloud.saveGame(TEAM.id, Object.assign({}, mergedOne, {
                id:server.id||mergedOne.cid||g.cid,
                baseUpdatedAt:server.updated_at||server.updatedAt||null
              }));
              g.cid = row2.id;
              g.rows = mergedOne.rows;
              g.key = key;
              if(row2.updated_at) g.updatedAt = row2.updated_at;
              try{ console.warn("[push] stale write recovered", key, "→", (g.rows&&g.rows.length)||0, "rows"); }catch(eW2){}
              continue;
            }catch(eRec){
              rejected.push(Object.assign({reason:"STALE_WRITE"}, g));
              try{ console.warn("[push] stale write skip", gameNaturalKey(g.opponent,g.week,g.side), eRec&&eRec.message); }catch(eW3){}
              continue;
            }
          }
          throw eSave;
        }
      }
      /* Drop tombstoned (+ trigger-rejected) from local so the next Sync ↑ is quiet.
         Explicit Commit clears tombstones first — rejected here means clear failed. */
      let cleaned = purgeTombstonedGames(items, tombs);
      if(rejected.length){
        const rejKeys=new Set(rejected.map(function(g){ return gameNaturalKey(g.opponent,g.week,g.side); }));
        cleaned = cleaned.filter(function(g){ return !rejKeys.has(gameNaturalKey(g.opponent,g.week,g.side)); });
      }
      /* Patch cids in place — never A.set (re-enters hydrate → sync → duplicate Live). */
      if(typeof A.touch==="function") A.touch(cleaned);
      else {
        try{ localStorage.setItem("offgrd_season_v2", JSON.stringify(cleaned)); }catch(e){}
      }
    }
    syncStamp();
    /* Classic import → scouting_games → sync trigger → scout_snaps; re-fetch for Predict. */
    try{ if(A.kind==="scout") await refreshScoutSnaps(); }catch(eSnap){}
    if(rejected.length){
      const labels=rejected.map(function(g){
        return (g.opponent||"?")+" · "+(g.week||"?")+" · "+(g.side||"?")+" ("+(g.reason||"blocked")+")";
      });
      const err=new Error("Could not sync "+rejected.length+" game(s): "+labels.slice(0,6).join("; "));
      err.code="PUSH_REJECTED";
      err.rejected=rejected;
      if(!silent) throw err;
      return { ok:false, rejected:rejected, error:err.message, code:"PUSH_REJECTED" };
    }
    if(!silent) alert("Synced "+items.length+" item"+(items.length===1?"":"s")+" to "+TEAM.name+" \u2713");
    return { ok:true, rejected:rejected };
  }catch(e){
    /* Silent auto-push: swallow — never schedule a retry (Daily Check storm lesson). */
    if(!silent){
      if(e && e.code==="PUSH_REJECTED") throw e;
      alert(e.message||"Sync failed");
      throw e;
    }
    else try{ console.warn("[push] silent fail (no retry)", e && e.message); }catch(e2){}
    return { ok:false, rejected:rejected, error:(e && e.message) || String(e) };
  }
}

/* ---------- team modal ---------- */
let modal=null;
function ensureModal(){
  if(modal) return modal;
  modal = document.createElement("div"); modal.className="ogm-ov"; modal.id="ogmModal";
  modal.innerHTML='<div class="ogm-box"><div class="ogm-row" style="justify-content:space-between"><h3>Program</h3><button class="ogm-b" id="ogmX">Close</button></div><div id="ogmBody"></div></div>';
  document.body.appendChild(modal);
  modal.querySelector("#ogmX").onclick=()=>modal.classList.remove("show");
  modal.onclick=e=>{ if(e.target===modal) modal.classList.remove("show"); };
  return modal;
}
function openTeam(){ ensureModal().classList.add("show"); renderTeam(); }

function el(html){ const d=document.createElement("div"); d.innerHTML=html; return d.firstElementChild; }

function joinSection(){
  const jsec=el('<div class="ogm-sec"><div class="ogm-lbl">Join a program</div></div>');
  const jrow=el('<div class="ogm-row"></div>');
  const jcode=el('<input class="ogm-in" placeholder="Enter a join code">');
  const jbtn=el('<button class="ogm-b go">Join</button>');
  const jstat=el('<p class="ogm-note"></p>');
  jbtn.onclick=async()=>{ const c=jcode.value.trim(); if(!c){jstat.textContent="Enter a code.";return;} jbtn.disabled=true; try{ const tid=await Cloud.joinByCode(c); TEAMS=await Cloud.myTeams(); await setActiveTeam(tid); openTeam(); }catch(e){ jstat.textContent=e.message||"Couldn’t join"; jbtn.disabled=false; } };
  jrow.appendChild(jcode); jrow.appendChild(jbtn); jsec.appendChild(jrow); jsec.appendChild(jstat);
  return jsec;
}
function renderSetup(body){
  body.innerHTML="";
  if(CAN_CREATE_TEAM){
    body.appendChild(el('<p class="ogm-note">You’re signed in. Create your program to become its Admin, or join an existing one with a code.</p>'));
    const cs=el('<div class="ogm-sec"><div class="ogm-lbl">Create a program</div></div>');
    const crow=el('<div class="ogm-row"></div>');
    const nm=el('<input class="ogm-in" placeholder="Program name (e.g. Parkway West)">');
    const cb=el('<button class="ogm-b go">Create</button>');
    cb.onclick=async()=>{ const n=nm.value.trim()||"My Program"; cb.disabled=true; try{ const tid=await Cloud.createTeam(n); TEAMS=await Cloud.myTeams(); await setActiveTeam(tid); await refreshLinkStatus(); renderTeam(); }catch(e){ alert(e.message||"Couldn’t create"); cb.disabled=false; } };
    crow.appendChild(nm); crow.appendChild(cb); cs.appendChild(crow); body.appendChild(cs);
  } else {
    body.appendChild(el('<p class="ogm-note">You’re signed in. Enter your team’s join code from your coach — players don’t create programs.</p>'));
  }
  body.appendChild(joinSection());
}

async function renderTeam(){
  const body = ensureModal().querySelector("#ogmBody");
  if(!TEAM){ renderSetup(body); return; }
  body.innerHTML = '<p class="ogm-note">Loading…</p>';
  let roster=[], invites=[];
  try{ roster = await Cloud.teamRoster(TEAM.id); }catch(e){}
  if(isAdmin()){ try{ invites = await Cloud.listInvites(TEAM.id); }catch(e){} }
  body.innerHTML="";

  const linkSec = renderSchoolLinkSection(true);
  if(linkSec) body.appendChild(linkSec);

  // program name + role + team switcher
  const head = el('<div class="ogm-row" style="justify-content:space-between;margin-top:6px"></div>');
  head.appendChild(el('<div><div style="font-size:17px;font-weight:900;color:#13294B">'+esc(TEAM.name)+'</div><div class="ogm-note">You are: <b>'+roleLabel(ROLE)+'</b></div></div>'));
  if(TEAMS.length>1){
    const sel=document.createElement("select"); sel.className="ogm-sel";
    TEAMS.forEach(t=>{ const o=document.createElement("option"); o.value=t.id; o.textContent=t.name; if(t.id===TEAM.id)o.selected=true; sel.appendChild(o); });
    sel.onchange=e=>setActiveTeam(e.target.value).then(renderTeam);
    const w=el('<div><div class="ogm-lbl">Active program</div></div>'); w.appendChild(sel); head.appendChild(w);
  }
  body.appendChild(head);

  // join code
  const codeSec = el('<div class="ogm-sec"><div class="ogm-lbl">Program join code</div></div>');
  const codeRow = el('<div class="ogm-row"></div>');
  codeRow.appendChild(el('<span class="ogm-code">'+esc(TEAM.join_code||"——")+'</span>'));
  const copy=el('<button class="ogm-b">Copy</button>'); copy.onclick=()=>{ try{ navigator.clipboard.writeText(TEAM.join_code||""); copy.textContent="Copied \u2713"; setTimeout(()=>copy.textContent="Copy",1200);}catch(e){} }; codeRow.appendChild(copy);
  if(isAdmin()){ const rot=el('<button class="ogm-b">New code</button>'); rot.onclick=async()=>{ if(!confirm("Generate a new code? The old one stops working."))return; try{ const c=await Cloud.rotateCode(TEAM.id); TEAM.join_code=c; renderTeam(); }catch(e){ alert(e.message);} }; codeRow.appendChild(rot); }
  codeSec.appendChild(codeRow);
  codeSec.appendChild(el('<p class="ogm-note">Share this with players/coaches — they sign up, then enter it under â€œJoin a programâ€. New members join as Player; change roles below.</p>'));
  body.appendChild(codeSec);

  // admin: invite + pending + roster ; non-admin: roster read-only
  if(isAdmin()){
    const inv = el('<div class="ogm-sec"><div class="ogm-lbl">Invite by email</div></div>');
    const irow = el('<div class="ogm-row"></div>');
    const email=el('<input class="ogm-in" type="email" placeholder="coach@school.org">');
    const rsel=document.createElement("select"); rsel.className="ogm-sel"; INVITE_ROLES.forEach(([v,l])=>{const o=document.createElement("option");o.value=v;o.textContent=l;rsel.appendChild(o);});
    const send=el('<button class="ogm-b go">Invite</button>');
    const stat=el('<p class="ogm-note"></p>');
    send.onclick=async()=>{ const em=email.value.trim(); if(!em){stat.textContent="Enter an email.";return;} send.disabled=true; try{ const res=await Cloud.inviteMember(TEAM.id, em, rsel.value); stat.textContent = res==="added" ? em+" was added now." : em+" is invited — they’ll join when they sign up."; email.value=""; renderTeamKeep(stat.textContent); }catch(e){ stat.textContent=e.message||"Invite failed"; } send.disabled=false; };
    irow.appendChild(email); irow.appendChild(rsel); irow.appendChild(send); inv.appendChild(irow); inv.appendChild(stat);
    body.appendChild(inv);

    if(invites.length){
      const pend=el('<div class="ogm-sec"><div class="ogm-lbl">Pending invites</div></div>');
      invites.forEach(iv=>{ const r=el('<div class="ogm-mem"></div>'); r.appendChild(el('<span class="nm">'+esc(iv.email)+'</span>')); r.appendChild(el('<span class="ogm-badge">'+roleLabel(iv.role)+'</span>')); const rv=el('<button class="ogm-b dz">Revoke</button>'); rv.onclick=async()=>{ try{ await Cloud.revokeInvite(iv.id); renderTeam(); }catch(e){ alert(e.message);} }; r.appendChild(rv); pend.appendChild(r); });
      body.appendChild(pend);
    }
  }

  // roster
  const rsec = el('<div class="ogm-sec"><div class="ogm-lbl">Roster ('+roster.length+')</div></div>');
  const me = (await Cloud.user()); const myId = me ? me.id : null;
  roster.forEach(m=>{
    const row=el('<div class="ogm-mem"></div>');
    row.appendChild(el('<span class="nm">'+esc(m.full_name||m.email||"—")+(m.position?' <span class="ogm-badge" style="background:#eef3fb">'+esc(m.position)+'</span>':'')+(m.user_id===myId?' <span class="ogm-note" style="font-weight:600">(you)</span>':'')+'</span>'));
    if(isAdmin() && m.role!=="owner"){
      const rs=document.createElement("select"); rs.className="ogm-sel"; rs.style.minWidth="120px";
      ALL_ROLES.filter(([v])=>v!=="owner").forEach(([v,l])=>{const o=document.createElement("option");o.value=v;o.textContent=l;if(v===m.role)o.selected=true;rs.appendChild(o);});
      rs.onchange=async()=>{ try{ await Cloud.setMemberRole(TEAM.id,m.user_id,rs.value); }catch(e){ alert(e.message); renderTeam(); } };
      row.appendChild(rs);
      const rm=el('<button class="ogm-b dz">Remove</button>'); rm.onclick=async()=>{ if(!confirm("Remove "+(m.full_name||m.email)+"?"))return; try{ await Cloud.removeMember(TEAM.id,m.user_id); renderTeam(); }catch(e){ alert(e.message);} }; row.appendChild(rm);
    } else {
      row.appendChild(el('<span class="ogm-badge">'+roleLabel(m.role)+'</span>'));
    }
    rsec.appendChild(row);
  });
  body.appendChild(rsec);

  // join another program (everyone)
  body.appendChild(joinSection());
}
let _keepMsg=null;
function renderTeamKeep(msg){ _keepMsg=msg; renderTeam(); }

/* ---------- onboarding: coach & player flows ---------- */
const POSITIONS=["QB","WR","RB","TE","OL","DL","LB","DB"];
let obEl=null;
function ensureOB(){
  if(obEl) return obEl;
  obEl=document.createElement("div"); obEl.className="ogm-ov"; obEl.id="obModal";
  obEl.innerHTML='<div class="ogm-box"><div class="ogm-row" style="justify-content:space-between"><h3>Welcome to OFFGRD</h3><button class="ogm-b" id="obX">Close</button></div><div id="obBody"></div></div>';
  document.body.appendChild(obEl);
  obEl.querySelector("#obX").onclick=()=>{ obEl.classList.remove("show"); markOB(); };
  obEl.onclick=e=>{ if(e.target===obEl){ obEl.classList.remove("show"); markOB(); } };
  return obEl;
}
function markOB(){ try{ localStorage.setItem("offgrd_onboarded","1"); }catch(e){} }
function openOnboard(){ ensureOB().classList.add("show"); obChoose(); }
function obChoose(){
  const b=ensureOB().querySelector("#obBody");
  b.innerHTML='<p class="ogm-note" style="font-size:14px">Let’s get you set up in about a minute. Which are you?</p>';
  const row=el('<div class="ogm-row" style="margin-top:12px"></div>');
  const c=el('<button class="ogm-b go" style="flex:1;min-height:64px;font-size:15px;line-height:1.3">I\u2019m a coach<br><span style="font-weight:600;font-size:12px">Create our program</span></button>');
  c.onclick=CAN_CREATE_TEAM ? obCoach : function(){ location.href="https://getoffrd.com/login/high-school-coach"; };
  row.appendChild(c);
  const p=el('<button class="ogm-b" style="flex:1;min-height:64px;font-size:15px;line-height:1.3">I\u2019m a player<br><span style="font-weight:600;font-size:12px">Join my team with a code</span></button>');
  p.onclick=obPlayer;
  row.appendChild(p); b.appendChild(row);
}
function obCoach(){
  const b=ensureOB().querySelector("#obBody");
  b.innerHTML='<p class="ogm-note">Two quick things — your name (so your roster knows who you are) and your program.</p>';
  const r1=el('<div class="ogm-row" style="margin-top:10px"></div>');
  const nm=el('<input class="ogm-in" placeholder="Your name (e.g. Coach Biermann)">');
  r1.appendChild(nm);
  const r2=el('<div class="ogm-row" style="margin-top:8px"></div>');
  const pn=el('<input class="ogm-in" placeholder="Program name (e.g. Parkway West)">');
  const go=el('<button class="ogm-b go">Create program</button>');
  const stat=el('<p class="ogm-note"></p>');
  go.onclick=async()=>{ const n=pn.value.trim()||"My Program"; go.disabled=true;
    try{
      if(nm.value.trim()){ try{ await Cloud.setMyName(nm.value.trim()); }catch(e){} }
      const tid=await Cloud.createTeam(n); TEAMS=await Cloud.myTeams(); await setActiveTeam(tid, true); await refreshLinkStatus(); obCoachDone();
    }catch(e){ stat.textContent=e.message||"Couldn’t create the program."; go.disabled=false; } };
  r2.appendChild(pn); r2.appendChild(go);
  b.appendChild(r1); b.appendChild(r2); b.appendChild(stat);
  nm.focus();
}
function obCoachDone(){
  const b=ensureOB().querySelector("#obBody"); markOB();
  const linkNote = orphanLinkInfo() ? '<div class="ogm-sec"><p class="ogm-note" style="margin:0">Tip: link this program to your school from the banner at the top (or under <b>Team</b>) so Gameday works in getOFFRD.</p></div>' : '';
  let _logo="";
  b.innerHTML='<p class="ogm-note" style="font-size:14px"><b style="color:#13294B">'+esc(TEAM?TEAM.name:"Your program")+'</b> is live. Do these in any order — the <b>setup checklist</b> at the top of every page tracks your progress until you’re game-ready:</p>'
   +linkNote
   +'<div class="ogm-sec"><div class="ogm-lbl">1 · Invite staff &amp; players</div>'
   +'<div class="ogm-row"><span class="ogm-code">'+esc((TEAM&&TEAM.join_code)||"——")+'</span><button class="ogm-b" id="obCopy">Copy code</button></div>'
   +'<p class="ogm-note">They sign up, tap â€œI’m a playerâ€, enter this code, and pick their position. Coaches join the same way — promote them under <b>Team</b>.</p></div>'
   +'<div class="ogm-sec"><div class="ogm-lbl">2 · Make it yours — logo &amp; colors</div>'
   +'<div class="ogm-row" style="align-items:center;margin-top:6px">'
   +'<span id="obCrest" style="display:inline-flex;width:42px;height:42px;border-radius:9px;align-items:center;justify-content:center;font-weight:900;font-size:13px;overflow:hidden;flex:none;box-shadow:0 1px 2px rgba(0,0,0,.25)"></span>'
   +'<input class="ogm-in" id="obTeamNm" placeholder="Display name (e.g. Test High Tigers)" style="flex:1;min-width:170px">'
   +'</div>'
   +'<div class="ogm-row" style="margin-top:8px;align-items:center">'
   +'<label style="font-size:12px;font-weight:800;display:inline-flex;align-items:center;gap:5px">Primary <input type="color" id="obC1" value="#13294B" style="width:38px;height:30px;border:0;padding:0;background:none;cursor:pointer"></label>'
   +'<label style="font-size:12px;font-weight:800;display:inline-flex;align-items:center;gap:5px">Text <input type="color" id="obC2" value="#7BAFD4" style="width:38px;height:30px;border:0;padding:0;background:none;cursor:pointer"></label>'
   +'<button class="ogm-b" id="obLogo">Upload logo</button>'
   +'<button class="ogm-b go" id="obBrandSave">Save look</button>'
   +'<input type="file" id="obLogoFile" accept="image/*" style="display:none">'
   +'</div><p class="ogm-note" id="obBrandMsg">Your crest and colors show across the whole suite and on printed reports.</p></div>'
   +'<div class="ogm-sec"><div class="ogm-lbl">3 · Load your plays</div><p class="ogm-note">Open the <a href="OFFGRD-Playbook.html" style="font-weight:800">Playbook</a> — take the 12-play starter book and rename it to your terminology, or draw your own. Plays sync to the whole program and power player testing.</p></div>'
   +'<div class="ogm-sec"><div class="ogm-lbl">4 · Scout your first opponent</div><p class="ogm-note"><a href="OFFGRD.html#import" style="font-weight:800">Import a breakdown</a> — upload your Hudl/QwikCut export as-is. Predictions appear instantly.</p></div>'
   +'<div class="ogm-row" style="margin-top:12px;justify-content:flex-end"><button class="ogm-b go" id="obDone">Let’s go</button></div>';
  const nmIn=b.querySelector("#obTeamNm"), c1=b.querySelector("#obC1"), c2=b.querySelector("#obC2");
  nmIn.value=(TEAM&&TEAM.name)||"";
  const crestPrev=()=>{ const cEl=b.querySelector("#obCrest"); if(!cEl) return;
    cEl.style.background=c1.value; cEl.style.color=c2.value;
    if(_logo){ cEl.innerHTML='<img src="'+_logo+'" style="width:100%;height:100%;object-fit:contain">'; }
    else { cEl.textContent=obAbbr(nmIn.value); } };
  nmIn.oninput=crestPrev; c1.oninput=crestPrev; c2.oninput=crestPrev; crestPrev();
  b.querySelector("#obLogo").onclick=()=>b.querySelector("#obLogoFile").click();
  b.querySelector("#obLogoFile").onchange=e=>{ const f=e.target.files[0]; if(!f) return; obReadLogo(f,url=>{ _logo=url; crestPrev(); }); };
  b.querySelector("#obBrandSave").onclick=()=>{
    const nm=nmIn.value.trim()||((TEAM&&TEAM.name)||"My Team");
    obApplyBrand(nm, c1.value, c2.value, _logo);
    b.querySelector("#obBrandMsg").innerHTML='<b style="color:#1d7a45">Saved \u2713</b> — the suite now wears '+esc(nm)+'’s colors. You can fine-tune any time under <b>Team &amp; logos</b>.';
  };
  b.querySelector("#obCopy").onclick=()=>{ try{ navigator.clipboard.writeText((TEAM&&TEAM.join_code)||""); b.querySelector("#obCopy").textContent="Copied \u2713"; }catch(e){} };
  b.querySelector("#obDone").onclick=()=>{ obEl.classList.remove("show"); try{ setupState().then(renderChecklist); }catch(e){} };
}
function obAbbr(name){ return ((name||"").split(/\s+/).map(w=>w[0]||"").join("").slice(0,3).toUpperCase())||"TM"; }
function obReadLogo(file, cb){
  const rd=new FileReader();
  rd.onload=()=>{ const img=new Image();
    img.onload=()=>{ try{ const s=Math.min(1, 128/Math.max(img.width,img.height)); const c=document.createElement("canvas"); c.width=Math.max(1,Math.round(img.width*s)); c.height=Math.max(1,Math.round(img.height*s)); c.getContext("2d").drawImage(img,0,0,c.width,c.height); cb(c.toDataURL("image/png")); }catch(e){ cb(rd.result); } };
    img.onerror=()=>cb(rd.result); img.src=rd.result; };
  rd.readAsDataURL(file);
}
function obApplyBrand(name, bg, fg, logo){
  const brand={abbr:obAbbr(name), fg:fg, bg:bg, logo:logo||""};
  pushBrand(name, brand);   /* cloud: whole staff sees the same crest */
  if(window.OFFGRD_persistBrand){ window.OFFGRD_persistBrand(name, brand); }
  else if(window.OFFGRD_BRAND){ try{ window.OFFGRD_BRAND(name, brand); return; }catch(e){} }
  /* not on the Scout page: write the same storage Scout reads on next load */
  try{
    const bs=JSON.parse(localStorage.getItem("offgrd_brands")||"{}");
    bs[name]=brand;
    localStorage.setItem("offgrd_brands", JSON.stringify(bs));
    localStorage.setItem("offgrd_identity", name);
  }catch(e){}
}

/* ---------- team brand in the cloud: one look for the whole program ---------- */
function pushBrand(name, brand){
  try{
    if(!TEAM || !canEdit() || !Cloud.setTeamBrand) return;
    const prev=TEAM.brand||{};
    const b=Object.assign({}, prev, brand||{}, {name:name});
    /* Keep position glossary unless the caller explicitly sets it */
    if(brand && !brand.posGlossary && prev.posGlossary) b.posGlossary=prev.posGlossary;
    TEAM.brand=b;
    Cloud.setTeamBrand(TEAM.id, b).catch(()=>{});
  }catch(e){}
}
window.OFFGRD_PUSH_BRAND=pushBrand;   /* Scout's Team & logos editor calls this on save */
let _brandHydrateFp = "";
function applyCloudBrand(){
  try{
    const b=TEAM && TEAM.brand;
    const brandName = (b && b.name) || (TEAM && TEAM.name) || "";
    if(!brandName){
      try{ console.warn("[brand] empty: no team name (teamId=", TEAM && TEAM.id, ")"); }catch(e){}
      return;
    }
    if(!b || !b.bg){
      try{
        console.warn(
          "[brand] empty cache: team",
          brandName,
          "has no brand.bg from session (teamId=",
          TEAM && TEAM.id,
          ") — accent will use fallback until coach saves Team & logos or RPC returns brand"
        );
      }catch(e){}
      return;
    }
    const brand={
      abbr: (b.abbr && String(b.abbr).trim()) || obAbbr(brandName),
      fg: b.fg || "#ffffff",
      bg: b.bg || "#13294B",
      logo: b.logo || "",
    };
    const brandFp = [brandName, brand.abbr, brand.fg, brand.bg, brand.logo ? String(brand.logo).length : "0"].join("|");
    if(brandFp === _brandHydrateFp) return;
    const persist = window.OFFGRD_persistBrand;
    if(!persist){
      try{ console.warn("[brand] OFFGRD_persistBrand missing — load OFFGRD-brand-persist.js before account"); }catch(e){}
      return;
    }
    const entry = persist(brandName, brand);
    if(!entry) return;
    _brandHydrateFp = brandFp;
    try{ console.log("[brand] hydrated", brandName, entry.bg, "abbr=", entry.abbr); }catch(e){}
    /* CSS-only hook on QB (redesign wrapper); Scout hook also updates in-page crest */
    if(window.OFFGRD_BRAND){ window.OFFGRD_BRAND(brandName, entry); }
    /* Program position glossary (display-only labels) */
    try{
      if(b.posGlossary && window.OFFGRD_POS_GLOSSARY_ON_BRAND) window.OFFGRD_POS_GLOSSARY_ON_BRAND(b);
      else if(b.posGlossary && window.OFFGRD_POS_GLOSSARY) window.OFFGRD_POS_GLOSSARY.apply(b.posGlossary,{skipCloud:true,silent:true});
      else if(window.OFFGRD_POS_GLOSSARY) window.OFFGRD_POS_GLOSSARY.pullFromTeam();
    }catch(e2){}
  }catch(e){}
}
/* ---------- week plan bridge (Phase A of the education engine) ----------
   Scout registers window.OFFGRD_WEEK = { set:(plan|null, canEdit)=>void } at top level.
   We feed it the active week plan on every pull, and expose push/start/plays helpers. */
let WEEK_ID=null, _weekT=null;
async function pullWeek(){
  try{
    if(_weekT) return;   /* an edit is about to push — don't clobber it with a stale pull */
    if(!TEAM || A.kind!=="scout" || !window.OFFGRD_WEEK || !Cloud.activeWeekPlan) return;
    const wp = await Cloud.activeWeekPlan(TEAM.id);
    WEEK_ID = wp ? wp.id : null;
    window.OFFGRD_WEEK.set(wp||null, canEdit());
  }catch(e){}
}
window.OFFGRD_WEEK_PUSH=function(fields){
  if(!TEAM || !WEEK_ID || !canEdit()) return;
  clearTimeout(_weekT);
  _weekT=setTimeout(()=>{ _weekT=null; Cloud.saveWeekPlan(WEEK_ID, fields).then(()=>syncStamp()).catch(()=>{}); }, 1500);
};
/* ---------- season schedule bridge (shared to the OFFRD recruiting page) ---------- */
let _schedT=null;
function pushSchedule(){ try{ if(A.kind==="scout" && window.OFFGRD_SCHEDULE && TEAM) window.OFFGRD_SCHEDULE.set(TEAM.schedule||[], canEdit(), TEAM.id); }catch(e){} }
window.OFFGRD_SCHEDULE_PUSH=function(schedule){
  if(!TEAM || !canEdit()) return;
  TEAM.schedule = schedule;   /* keep the local team copy fresh so a pull doesn't clobber a fresh edit */
  clearTimeout(_schedT);
  _schedT=setTimeout(()=>{
    _schedT=null;
    Cloud.saveSchedule(TEAM.id, schedule)
      .then(()=>{ syncStamp(); try{ setupState().then(renderChecklist); }catch(e){} })
      .catch(()=>{});
  }, 1200);
};
/* Upload a downscaled logo blob to the public 'logos' Storage bucket; resolves to a URL (or null on failure/not-signed-in). */
window.OFFGRD_UPLOAD_LOGO=function(key, blob){
  if(!TEAM || !canEdit() || !Cloud.uploadLogo || !blob) return Promise.resolve(null);
  return Cloud.uploadLogo(TEAM.id, key, blob).catch(function(){ return null; });
};
window.OFFGRD_WEEK_START=async function(opp, gameDate, buckets){
  if(!TEAM) throw new Error("Sign in and join a program first.");
  if(!canEdit()) throw new Error("Only coaches can start a week plan.");
  const id=await Cloud.startWeekPlan(TEAM.id, opp, gameDate, buckets);
  await pullWeek();
  return id;
};
window.OFFGRD_WEEK_GEN=async function(force){
  if(!TEAM) throw new Error("Sign in and join a program first.");
  if(!canEdit()) throw new Error("Only coaches can generate the briefing.");
  const res=await Cloud.generateWeek(TEAM.id, force);
  await pullWeek();
  return res && res.gen;
};
window.OFFGRD_WEEKLY_PACKAGE_GEN=async function(force, payload, signal){
  if(!TEAM) throw new Error("Sign in and join a program first.");
  if(!canEdit()) throw new Error("Only coaches can generate the weekly package.");
  if(typeof navigator!=="undefined" && navigator.onLine===false) throw new Error("AI game-plan draft requires a connection. Tendencies and scout cards still work offline.");
  const res=await Cloud.assembleWeeklyPackage(TEAM.id, payload||{}, force, signal);
  /* Merge draft into the in-memory week immediately so Section 2 can paint before pull finishes. */
  try{
    if(window.OFFGRD_WEEKLY_PACKAGE&&OFFGRD_WEEKLY_PACKAGE.mergeGenFromResult) OFFGRD_WEEKLY_PACKAGE.mergeGenFromResult(res);
  }catch(e){}
  /* pullWeek is scheduled by runGenerate AFTER progressive fill + endBusy — never here. */
  return res;
};
/* Allow weeklypackage schedulePullWeek to refresh without importing account internals. */
window.OFFGRD_WEEK_PULL=function(){ return pullWeek(); };
window.OFFGRD_WEEK_PLAYS=async function(){
  if(!TEAM) return [];
  try{ const rows=await Cloud.listPlays(TEAM.id);
    /* Keep diagram + Step-3 fields so Package Install can match calls and derive reads. */
    return (rows||[]).map(r=>({
      id:r.id, name:r.name||"Play", formation:r.formation||"", family:r.family||"",
      personnel:r.personnel||"", protection:r.protection||"",
      data:r.data||null, qb_reads:r.qb_reads||null, ol_keys:r.ol_keys||null,
      thumbSvg:r.thumbSvg||r.thumb_svg||null
    }));
  }catch(e){ return []; }
};

function obPlayer(){
  const b=ensureOB().querySelector("#obBody");
  b.innerHTML='<p class="ogm-note">Your name (so your coaches see you, not an email address) and the join code from your coach.</p>';
  const r1=el('<div class="ogm-row" style="margin-top:10px"></div>');
  /* Generic examples only — never use a real athlete/join code (that looked like live context). */
  const nm=el('<input class="ogm-in" placeholder="Your name (e.g. Alex Rivera)">');
  r1.appendChild(nm);
  const r2=el('<div class="ogm-row" style="margin-top:8px"></div>');
  const code=el('<input class="ogm-in" placeholder="Join code from your coach" autocapitalize="characters">');
  const go=el('<button class="ogm-b go">Join team</button>');
  const stat=el('<p class="ogm-note"></p>');
  go.onclick=async()=>{ const cd=code.value.trim(); if(!cd){ stat.textContent="Enter the code."; return; } go.disabled=true;
    try{
      if(nm.value.trim()){ try{ await Cloud.setMyName(nm.value.trim()); }catch(e){} }
      const tid=await Cloud.joinByCode(cd); TEAMS=await Cloud.myTeams(); await setActiveTeam(tid, true);
      try{ if(Cloud.seedPlayerFromTeam) await Cloud.seedPlayerFromTeam({ fullName: nm.value.trim()||null }); }catch(e){}
      obPosition();
    }catch(e){ stat.textContent=e.message||"Couldn’t join — double-check the code."; go.disabled=false; } };
  r2.appendChild(code); r2.appendChild(go);
  b.appendChild(r1); b.appendChild(r2); b.appendChild(stat);
  b.appendChild(el('<p class="ogm-note" style="margin-top:14px">Starting a program? <a href="https://getoffrd.com/login/high-school-coach" style="font-weight:800;color:#2c6fb3">I\u2019m a coach \u2014 set up on getOFFRD</a></p>'));
  nm.focus();
}
function obPosition(){
  const b=ensureOB().querySelector("#obBody");
  b.innerHTML='<p class="ogm-note" style="font-size:14px">You’re on <b style="color:#13294B">'+esc(TEAM?TEAM.name:"the team")+'</b> \u2713</p>'
   +'<div class="ogm-sec"><div class="ogm-lbl">What position do you play?</div></div>';
  const grid=el('<div class="ogm-row" style="margin-top:8px"></div>');
  POSITIONS.forEach(ps=>{
    const bt=el('<button class="ogm-b" style="min-width:62px;min-height:44px">'+ps+'</button>');
    bt.onclick=async()=>{
      try{ await Cloud.setMyPosition(TEAM.id, ps); }catch(e){}
      try{ localStorage.setItem("offgrd_pos", ps); }catch(e){}
      obGradYear(ps);
    };
    grid.appendChild(bt);
  });
  b.appendChild(grid);
}
function obGradYear(ps){
  const b=ensureOB().querySelector("#obBody");
  const yr=new Date().getFullYear();
  const years=[]; for(let y=yr; y<=yr+5; y++) years.push(String(y));
  b.innerHTML='<p class="ogm-note" style="font-size:14px">Position: <b style="color:#13294B">'+esc(ps)+'</b></p>'
   +'<div class="ogm-sec"><div class="ogm-lbl">Graduation year</div><p class="ogm-note">Seeds your recruiting profile so you don’t re-type it later.</p></div>';
  const grid=el('<div class="ogm-row" style="margin-top:8px"></div>');
  years.forEach(gy=>{
    const bt=el('<button class="ogm-b" style="min-width:72px;min-height:44px">'+gy+'</button>');
    bt.onclick=async()=>{
      try{ localStorage.setItem("offgrd_grad", gy); }catch(e){}
      try{
        if(Cloud.seedPlayerFromTeam){
          await Cloud.seedPlayerFromTeam({ position: ps, gradYear: gy });
        }
      }catch(e){ console.warn("seed recruiting", e); }
      obPlayerDone(ps, gy);
    };
    grid.appendChild(bt);
  });
  const skip=el('<button class="ogm-b" style="margin-top:8px">Skip for now</button>');
  skip.onclick=async()=>{
    try{ if(Cloud.seedPlayerFromTeam) await Cloud.seedPlayerFromTeam({ position: ps }); }catch(e){}
    obPlayerDone(ps, null);
  };
  b.appendChild(grid);
  b.appendChild(skip);
}
function obPlayerDone(ps, gy){
  const b=ensureOB().querySelector("#obBody"); markOB();
  const gyLine = gy ? ' · Class of <b style="color:#13294B">'+esc(gy)+'</b>' : '';
  b.innerHTML='<p class="ogm-note" style="font-size:14px">Locked in: <b style="color:#13294B">'+esc(ps)+'</b>'+gyLine+' \u2713 — recruiting profile seeded.</p>'
   +'<div class="ogm-sec"><div class="ogm-lbl">Right now</div><p class="ogm-note">The play freezes pre-snap. Read the defense, hit <b>â–¶ Snap</b>, watch it develop, make your read. Or open <b>Recruiting</b> to finish your profile.</p></div>'
   +'<div class="ogm-row" style="margin-top:12px;justify-content:flex-end"><a class="ogm-b go" href="OFFGRD-QB.html#train" style="text-decoration:none;display:inline-flex;align-items:center">â–¶ Take your first reps</a><button class="ogm-b" id="obDone2">Later</button></div>';
  b.querySelector("#obDone2").onclick=()=>{ obEl.classList.remove("show"); };
}

/* ---------- setup checklist: lives at the top of every page for coaches until the program is game-ready ---------- */
function openScheduleFromSetup(){
  if(typeof window.openSchedule === "function"){ window.openSchedule(); return; }
  location.href = "OFFGRD.html#schedule";
}
async function setupState(){
  const s={roster:0,plays:0,games:0,schedule:0,identity:false};
  try{ s.identity=!!localStorage.getItem("offgrd_identity"); }catch(e){}
  if(!TEAM) return s;
  try{ const r=await Cloud.teamRoster(TEAM.id); s.roster=(r||[]).length; }catch(e){}
  try{ const p=await Cloud.listPlays(TEAM.id); s.plays=(p||[]).length; }catch(e){}
  try{ const g=await Cloud.listGames(TEAM.id); s.games=(g||[]).length; }catch(e){}
  try{
    const sched = Array.isArray(TEAM.schedule) ? TEAM.schedule : [];
    s.schedule = sched.length;
  }catch(e){}
  return s;
}
function renderChecklist(s){
  let hidden=null; try{ hidden=localStorage.getItem("offgrd_setup_done"); }catch(e){}
  let host=document.getElementById("ogSetup");
  const items=[
    {t:"Invite staff & players", done:s.roster>=2, act:openTeam},
    {t:"Load your playbook", done:s.plays>=1, href:"OFFGRD-Playbook.html"},
    {t:"Set colors & logo", done:s.identity, href:"OFFGRD.html#brand"},
    {t:"Add your schedule", done:s.schedule>=1, act:openScheduleFromSetup},
    {t:"Import a breakdown", done:s.games>=1, href:"OFFGRD.html#import"}
  ];
  const doneN=items.filter(i=>i.done).length;
  /* v36: re-show if schedule step incomplete (new step after coaches hid at 4/4) */
  if(hidden && s.schedule < 1){ try{ localStorage.removeItem("offgrd_setup_done"); }catch(e){} hidden=null; }
  if(hidden || doneN===items.length){
    if(doneN===items.length){ try{ localStorage.setItem("offgrd_setup_done","1"); }catch(e){} }
    if(host) host.remove(); return;
  }
  if(!host){
    host=document.createElement("div"); host.id="ogSetup"; host.className="no-print";
    const tb=document.querySelector(".topbar");
    if(tb&&tb.parentNode) tb.parentNode.insertBefore(host, tb.nextSibling); else document.body.prepend(host);
  }
  host.innerHTML='<div style="background:#eef5fc;border:1px solid #cfe0f3;border-radius:12px;padding:10px 14px;margin-bottom:12px;font:13px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif">'
   +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><b style="color:#13294B">Program setup · '+doneN+'/'+items.length+'</b><span style="flex:1"></span><button id="ogSetupHide" style="border:0;background:none;color:#5b626e;font-weight:800;cursor:pointer;font-size:12px">Hide</button></div>'
   +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">'
   +items.map((i,ix)=>'<'+(i.href?'a href="'+i.href+'"':'button type="button"')+' data-ix="'+ix+'" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none;cursor:pointer;border:1px solid '+(i.done?'#b7e0c6':'#cfe0f3')+';background:#fff;border-radius:999px;padding:7px 12px;font-weight:700;font-size:12.5px;color:'+(i.done?'#1d7a45':'#13294B')+'">'+(i.done?'\u2713':'\u25CB')+' '+i.t+'</'+(i.href?'a':'button')+'>').join("")
   +'</div></div>';
  host.querySelector("#ogSetupHide").onclick=()=>{ try{ localStorage.setItem("offgrd_setup_done","1"); }catch(e){} host.remove(); };
  [].forEach.call(host.querySelectorAll("button[data-ix]"),bt=>{ const i=items[+bt.dataset.ix]; if(i&&i.act) bt.onclick=i.act; });
}

function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

let _syncT=null;
window.OFFGRD_SYNC=function(){ if(!(TEAM && SYNCABLE && canEdit())) return; clearTimeout(_syncT); _syncT=setTimeout(()=>{ _syncT=null; push(true); }, 1500); };
/** Awaitable push for Commit-to-season — returns {ok, rejected, error} (never silent on failure). */
window.OFFGRD_PUSH=async function(silent){
  try{
    const r = await push(!!silent);
    return r && typeof r === "object" ? r : { ok:true, rejected:[] };
  }catch(e){
    return {
      ok:false,
      error:(e && e.message) || String(e),
      rejected:(e && e.rejected) || [],
      code:e && e.code
    };
  }
};

/** Cheap fingerprint of scout_snaps RPC rows — length + max updatedAt + id mix. */
function scoutCorpusFp(raw){
  const a = raw || [];
  let maxU = "";
  let mix = a.length * 2654435761;
  for(let i = 0; i < a.length; i++){
    const r = a[i];
    if(!r) continue;
    const id = String(r.id || "");
    const u = String(r.updated_at || r.updatedAt || r.reviewed_at || "");
    if(u > maxU) maxU = u;
    mix = (mix + id.length * (i + 1) + (r.coverage || "").length * 17 + (r.front || "").length * 31) | 0;
    for(let j = 0; j < id.length; j++) mix = (mix + id.charCodeAt(j) * (j + 1)) | 0;
  }
  return a.length + "@" + maxU + "#" + (mix >>> 0);
}
let _lastScoutCorpusFp = "";
let _lastScoutCorpusTeam = "";
let _scoutCorpusHydrated = false;

/** Pull review-gated scout_snaps → SNAP_CORPUS for Predict/Tendencies cutover. */
async function refreshScoutSnaps(){
  if(!TEAM || !Cloud.listScoutSnaps || !Cloud.scoutSnapToRow) return;
  if(isOffline()) return;
  try{
    const raw = await Cloud.listScoutSnaps(TEAM.id);
    const fp = scoutCorpusFp(raw);
    const sameTeam = _lastScoutCorpusTeam === (TEAM.id || "");
    if(sameTeam && _scoutCorpusHydrated && fp === _lastScoutCorpusFp){
      /* Sync poll / duplicate boot — corpus unchanged; skip full report rebuild. */
      return;
    }
    _lastScoutCorpusFp = fp;
    _lastScoutCorpusTeam = TEAM.id || "";
    _scoutCorpusHydrated = true;
    const mapped = (raw || []).map(function(s){ return Cloud.scoutSnapToRow(s); }).filter(Boolean);
    if(typeof window.OFFGRD_SET_SNAP_CORPUS === "function"){
      window.OFFGRD_SET_SNAP_CORPUS(mapped);
    } else if(window.OFFGRD_APP && typeof window.OFFGRD_APP.setSnapCorpus === "function"){
      window.OFFGRD_APP.setSnapCorpus(mapped);
    }
    try{ if(typeof window.refreshView === "function") window.refreshView(); }catch(eR){}
    try{ if(typeof window.buildControls === "function") window.buildControls(); }catch(eB){}
    try{ if(typeof window.updateDatBadge === "function") window.updateDatBadge(); }catch(eD){}
  }catch(e){
    try{ console.warn("[refreshScoutSnaps]", e && e.message); }catch(e2){}
  }
}
window.OFFGRD_REFRESH_SCOUT_SNAPS = refreshScoutSnaps;

/* ---------- auto-sync: pull fresh team data every 45s and on window focus ---------- */
let _busy=false, _lastPull=0, _autoT=null;
function syncStamp(){ try{ const el=document.getElementById("syncstat"); if(!el) return; const d=new Date(); el.textContent="synced "+d.getHours()+":"+String(d.getMinutes()).padStart(2,"0")+" \u2713"; el.title="Auto-sync is on — time of last successful sync"; }catch(e){} }
function maybePull(){
  if(!TEAM || !SYNCABLE) return;
  if(isOffline()) return;
  if(document.hidden) return;                      /* tab in background */
  if(_syncT || _busy) return;                      /* a save is being pushed — don't pull over it */
  if(Date.now()-_lastPull<10000) return;           /* throttle */
  pull(true);
}
window.addEventListener("focus", maybePull);
document.addEventListener("visibilitychange", function(){ if(!document.hidden) maybePull(); });
/* ---------- mobile debug line (shows on small screens or with ?debug in URL) ---------- */
const DBG_V = "12";
function dbgInfo(extra){
  try{
    const show = /[?&#]debug/.test(location.href);   /* add ?debug to the URL to show diagnostics */
    if(!show) return;
    let ls="N", tok="N";
    try{
      localStorage.setItem("__og","1"); localStorage.removeItem("__og"); ls="Y";
      for(let i=0;i<localStorage.length;i++){ if(/^sb-.*auth-token/.test(localStorage.key(i)||"")){ tok="Y"; break; } }
    }catch(e){ ls="ERR"; }
    let d = document.getElementById("ogDbg");
    if(!d){
      d = document.createElement("div"); d.id="ogDbg";
      d.style.cssText="position:fixed;left:0;right:0;bottom:0;z-index:99999;font:10px/1.6 ui-monospace,Menlo,monospace;color:#5b626e;background:rgba(255,255,255,.94);border-top:1px solid #e2e5ea;padding:2px 8px;white-space:nowrap;overflow:auto";
      document.body.appendChild(d);
    }
    d.textContent = "dbg v"+DBG_V+" · lib:"+(window.supabase?"Y":"N")+" · ready:"+(Cloud.ready?"Y":"N")+" · ls:"+ls+" · tok:"+tok+(extra?" · "+extra:"");
  }catch(e){}
}

try{ bar(null); }catch(e){}   /* instant paint so the bar is never blank while auth loads */
/* First chrome from LS — before Cloud.session / my_role / any await. */
try{ paintFromPersistedState(); }catch(e){}
dbgInfo("sess:…");
Cloud.onAuth(u=>{
  if(!u && !_sessionResolved && window.OFFGRD_HAS_LIKELY_SESSION && window.OFFGRD_HAS_LIKELY_SESSION()) return;
  if(!u && isOffline() && (isSidelinePinned() || persistedShellPin() || (window.OFFGRD_HAS_LIKELY_SESSION && window.OFFGRD_HAS_LIKELY_SESSION()))){
    hydrateOfflineTeam();
    publishProgramRole();
    showOfflineBanner();
    dbgInfo("auth:offline-sideline");
    return;
  }
  onUser(u); dbgInfo("auth:"+(u?u.email:"none"));
});
(async()=>{
  try{
    /* Drop stale auth tokens from other Supabase projects (pre-cutover leftovers). */
    try{ if(Cloud.purgeForeignAuthTokens) Cloud.purgeForeignAuthTokens(); }catch(e){}
    if(!isOffline()){
      try{ await Cloud.consumeAuthHandOff(); }catch(e){}
    }
    let u = null;
    if(isOffline()){
      /* Local session only — bound wait so hung getSession cannot black-screen. */
      try{ u = await withTimeout(Cloud.session(), 900); }catch(e){}
      _sessionResolved = true;
      if(u){
        onUser(u);
      } else {
        hydrateOfflineTeam();
        publishProgramRole();
        showOfflineBanner();
        bar(null);
        try{
          if(window.OFFGRD_REDESIGN && OFFGRD_REDESIGN.applyRedesignShell) OFFGRD_REDESIGN.applyRedesignShell();
        }catch(e2){}
      }
      dbgInfo("sess:"+(u?u.email:"offline"));
      return;
    }
try{ u = Cloud.ensureFreshSession ? await Cloud.ensureFreshSession() : await Cloud.session(); }catch(e){}
    if(!u){ try{ u = await Cloud.session(); }catch(e){} }
    _sessionResolved = true;
    onUser(u);
    dbgInfo("sess:"+(u?u.email:"none"));
  }catch(e){
    _sessionResolved = true;
    if(isOffline() && isSidelinePinned()){
      hydrateOfflineTeam();
      publishProgramRole();
      showOfflineBanner();
      bar(null);
    } else {
      onUser(null);
    }
    dbgInfo("err:"+((e&&e.message)||e));
  }
})();

