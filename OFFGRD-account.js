/* OFFGRD account + team/roster management — shared by Scout and Playbook.
   Each app sets window.OFFGRD_APP = { kind:'playbook'|'scout', get:()=>items, set:(items)=>void }.
   Roles: owner (Admin) · coach_edit · coach_view · player. Edit = owner/coach_edit. */
import { Cloud } from "./OFFGRD-cloud.js?v=49";
import { openAuthModal } from "./OFFGRD-auth.js?v=49";

const A = window.OFFGRD_APP || {};
const SYNCABLE = ["playbook","scout"].includes(A.kind);
const acct = document.getElementById("acct");
let TEAM = null, ROLE = null, TEAMS = [], LINK_STATUS = null, CAN_CREATE_TEAM = false;
const AKEY = "offgrd_team";
const coachPortalUrl = () => (window.OFFGRD_CONFIG && window.OFFGRD_CONFIG.coachPortalUrl) || "https://getoffrd.com/high-school-coach/profile";

const roleLabel = r => ({owner:"Admin", coach_edit:"Coach · Edit", coach_view:"Coach · View", player:"Player", coach:"Coach"}[r] || r);
const canEdit  = () => ["owner","coach_edit","coach"].includes(ROLE);
const isAdmin  = () => ROLE === "owner";
const INVITE_ROLES = [["coach_edit","Coach — can edit"],["coach_view","Coach — view only"],["player","Player — view only"]];
const ALL_ROLES    = [["owner","Admin"],["coach_edit","Coach — Edit"],["coach_view","Coach — View"],["player","Player"]];

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
    ((SYNCABLE && canEdit()) ? ' <button class="cbtn" id="cs">Sync ↑</button>' : '')+
    (SYNCABLE ? ' <button class="cbtn" id="cd">Load ↓</button>' : '')+
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
  if(!Cloud.ready || !(await Cloud.session())){ CAN_CREATE_TEAM = false; return; }
  try{ CAN_CREATE_TEAM = !!(await Cloud.canCreateTeam()); }
  catch(e){ CAN_CREATE_TEAM = false; }
}
function publishProgramRole(){
  window.OFFGRD_PROGRAM = {
    ready: !!(TEAM && ROLE),
    role: ROLE,
    teamId: TEAM && TEAM.id,
    isPlayer: () => ROLE === "player",
    isCoach: () => !!ROLE && ROLE !== "player",
    canCreateTeam: () => CAN_CREATE_TEAM,
  };
  try{ document.dispatchEvent(new CustomEvent("offgrd-program-ready")); }catch(e){}
}
window.OFFGRD_LOAD_PLAYER_WEEK = async function(){
  if(!TEAM) return null;
  return Cloud.playerWeekPlan(TEAM.id);
};
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
    alert("Program linked to your school ✓ Gameday and your getOFFRD coach portal can now see this program.");
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
async function onUser(u){
  if(!u){
    TEAM=null; ROLE=null; TEAMS=[]; CAN_CREATE_TEAM=false; clearInterval(_autoT);
    const likely = !!(window.OFFGRD_HAS_LIKELY_SESSION && window.OFFGRD_HAS_LIKELY_SESSION());
    /* Don't wipe offline cache during auth bootstrap when a token is still present. */
    if(!_sessionResolved && likely){
      publishProgramRole(); bar(null); return;
    }
    try{ if(window.OFFGRD_CLEAR_PROGRAM_CACHE) window.OFFGRD_CLEAR_PROGRAM_CACHE(); }catch(e){}
    try{ if(window.OFFGRD_RESET_IN_MEMORY_PROGRAM) window.OFFGRD_RESET_IN_MEMORY_PROGRAM(); }catch(e){}
    try{ if(window.OFFGRD_SHOW_SIGNED_OUT_GATE) window.OFFGRD_SHOW_SIGNED_OUT_GATE(); }catch(e){}
    publishProgramRole(); bar(null); return;
  }
  try{ if(window.OFFGRD_HIDE_SIGNED_OUT_GATE) window.OFFGRD_HIDE_SIGNED_OUT_GATE(); }catch(e){}
  try{ window.OFFGRD_SESSION_GATED = false; }catch(e){}
  if(switchGuard(u)) return;
  try{
    TEAMS = await Cloud.myTeams();
    if(TEAMS.length){
      let saved = null; try{ saved = localStorage.getItem(AKEY); }catch(e){}
      TEAM = TEAMS.find(t => t.id === saved) || TEAMS[0];
      ROLE = await Cloud.myRole(TEAM.id);
    } else { TEAM = null; ROLE = null; }
    await refreshCreateEligibility();
    await refreshLinkStatus();
    publishProgramRole();
    applyCloudBrand();
    bar(u);
    if(TEAM) await pull(true);
    clearInterval(_autoT); if(TEAM && SYNCABLE) _autoT=setInterval(maybePull, 45000);   /* auto-sync */
    if(!TEAM){ let ob=null; try{ ob=localStorage.getItem("offgrd_onboarded"); }catch(e){} if(!ob) openOnboard(); }
    if(TEAM && canEdit()){ try{ setupState().then(renderChecklist); }catch(e){} }
    try{ if(A.onUser) A.onUser(u.email); }catch(e){}
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
/** Indexed local↔cloud reconcile — O(n) Maps, no nested scans, no full JSON.stringify. */
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
        const next = rows.map(r=>({key:(r.opponent+"|"+r.week+"|"+r.side).toLowerCase(), opponent:r.opponent, week:r.week, side:r.side, source:r.source, rows:r.rows, cid:r.id}));
        let cur=[]; try{ cur=A.get()||[]; }catch(e){}
        if(libSig(next)!==libSig(cur)) A.set(next);
      }
      /* Playbook: never native alert() on Load ↓ — it hard-blocks the renderer. */
      if(!silent && A.kind!=="playbook") alert("Loaded "+TEAM.name+".");
    } else {
      const local = A.get();
      if(local && local.length && canEdit()){ await push(true); if(!silent) alert("This device’s data is now backed up to "+TEAM.name+"."); }
      else if(!silent) alert(TEAM.name+" has no saved data yet.");
    }
    syncStamp();
    if(!silent && A.kind==="playbook"){
      try{ const el=document.getElementById("syncstat"); if(el){ el.textContent="loaded ✓"; el.style.color="#1d7a45"; } }catch(e){}
    }
    try{ if(A.kind==="scout"){ pullWeek(); pushSchedule(); } }catch(e){}
  }catch(e){ if(!silent) alert(e.message||"Load failed"); }
  finally{ _busy=false; }
}
async function push(silent){
  if(!TEAM){ if(!silent) alert("Sign in first."); return; }
  if(!canEdit()){ if(!silent) alert("Your role is view-only, so you can’t save to the program."); return; }
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
      for(const g of items){ const row = await Cloud.saveGame(TEAM.id, Object.assign({}, g, {id:g.cid})); g.cid = row.id; }
      A.set(items);
    }
    syncStamp();
    if(!silent) alert("Synced "+items.length+" item"+(items.length===1?"":"s")+" to "+TEAM.name+" ✓");
  }catch(e){ if(!silent) alert(e.message||"Sync failed"); }
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
  const copy=el('<button class="ogm-b">Copy</button>'); copy.onclick=()=>{ try{ navigator.clipboard.writeText(TEAM.join_code||""); copy.textContent="Copied ✓"; setTimeout(()=>copy.textContent="Copy",1200);}catch(e){} }; codeRow.appendChild(copy);
  if(isAdmin()){ const rot=el('<button class="ogm-b">New code</button>'); rot.onclick=async()=>{ if(!confirm("Generate a new code? The old one stops working."))return; try{ const c=await Cloud.rotateCode(TEAM.id); TEAM.join_code=c; renderTeam(); }catch(e){ alert(e.message);} }; codeRow.appendChild(rot); }
  codeSec.appendChild(codeRow);
  codeSec.appendChild(el('<p class="ogm-note">Share this with players/coaches — they sign up, then enter it under “Join a program”. New members join as Player; change roles below.</p>'));
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
function openOnboard(){ ensureOB().classList.add("show"); if(CAN_CREATE_TEAM) obChoose(); else obPlayer(); }
function obChoose(){
  const b=ensureOB().querySelector("#obBody");
  b.innerHTML='<p class="ogm-note" style="font-size:14px">Let’s get you set up in about a minute. Which are you?</p>';
  const row=el('<div class="ogm-row" style="margin-top:12px"></div>');
  if(CAN_CREATE_TEAM){
    const c=el('<button class="ogm-b go" style="flex:1;min-height:64px;font-size:15px;line-height:1.3">🏈 I’m a coach<br><span style="font-weight:600;font-size:12px">Create our program</span></button>');
    c.onclick=obCoach;
    row.appendChild(c);
  }
  const p=el('<button class="ogm-b'+(CAN_CREATE_TEAM?'':' go')+'" style="flex:1;min-height:64px;font-size:15px;line-height:1.3">🎓 I’m a player<br><span style="font-weight:600;font-size:12px">Join my team with a code</span></button>');
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
   +'<p class="ogm-note">They sign up, tap “I’m a player”, enter this code, and pick their position. Coaches join the same way — promote them under <b>Team</b>.</p></div>'
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
    b.querySelector("#obBrandMsg").innerHTML='<b style="color:#1d7a45">Saved ✓</b> — the suite now wears '+esc(nm)+'’s colors. You can fine-tune any time under <b>Team &amp; logos</b>.';
  };
  b.querySelector("#obCopy").onclick=()=>{ try{ navigator.clipboard.writeText((TEAM&&TEAM.join_code)||""); b.querySelector("#obCopy").textContent="Copied ✓"; }catch(e){} };
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
  if(window.OFFGRD_BRAND){ try{ window.OFFGRD_BRAND(name, brand); return; }catch(e){} }
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
    const b=Object.assign({name:name}, brand||{});
    TEAM.brand=b;
    Cloud.setTeamBrand(TEAM.id, b).catch(()=>{});
  }catch(e){}
}
window.OFFGRD_PUSH_BRAND=pushBrand;   /* Scout's Team & logos editor calls this on save */
function applyCloudBrand(){
  try{
    const b=TEAM && TEAM.brand; if(!b || !b.name) return;
    const brand={abbr:b.abbr||obAbbr(b.name), fg:b.fg||"#ffffff", bg:b.bg||"#13294B", logo:b.logo||""};
    let cur={}; try{ cur=JSON.parse(localStorage.getItem("offgrd_brands")||"{}"); }catch(e){}
    let curId=""; try{ curId=localStorage.getItem("offgrd_identity")||""; }catch(e){}
    if(curId===b.name && JSON.stringify(cur[b.name]||{})===JSON.stringify(brand)) return;   /* already current on this device */
    if(window.OFFGRD_BRAND){ window.OFFGRD_BRAND(b.name, brand); }
    else{
      cur[b.name]=brand;
      localStorage.setItem("offgrd_brands", JSON.stringify(cur));
      localStorage.setItem("offgrd_identity", b.name);
    }
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
window.OFFGRD_WEEK_PLAYS=async function(){
  if(!TEAM) return [];
  try{ const rows=await Cloud.listPlays(TEAM.id);
    return (rows||[]).map(r=>({id:r.id, name:r.name||"Play", formation:r.formation||"", family:r.family||""}));
  }catch(e){ return []; }
};

function obPlayer(){
  const b=ensureOB().querySelector("#obBody");
  b.innerHTML='<p class="ogm-note">Your name (so your coaches see you, not an email address) and the join code from your coach.</p>';
  const r1=el('<div class="ogm-row" style="margin-top:10px"></div>');
  const nm=el('<input class="ogm-in" placeholder="Your name (e.g. Braden Biermann)">');
  r1.appendChild(nm);
  const r2=el('<div class="ogm-row" style="margin-top:8px"></div>');
  const code=el('<input class="ogm-in" placeholder="Join code (e.g. 3DBCC4)" autocapitalize="characters">');
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
  nm.focus();
}
function obPosition(){
  const b=ensureOB().querySelector("#obBody");
  b.innerHTML='<p class="ogm-note" style="font-size:14px">You’re on <b style="color:#13294B">'+esc(TEAM?TEAM.name:"the team")+'</b> ✓</p>'
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
  b.innerHTML='<p class="ogm-note" style="font-size:14px">Locked in: <b style="color:#13294B">'+esc(ps)+'</b>'+gyLine+' ✓ — recruiting profile seeded.</p>'
   +'<div class="ogm-sec"><div class="ogm-lbl">Right now</div><p class="ogm-note">The play freezes pre-snap. Read the defense, hit <b>▶ Snap</b>, watch it develop, make your read. Or open <b>Recruiting</b> to finish your profile.</p></div>'
   +'<div class="ogm-row" style="margin-top:12px;justify-content:flex-end"><a class="ogm-b go" href="OFFGRD-QB.html#train" style="text-decoration:none;display:inline-flex;align-items:center">▶ Take your first reps</a><button class="ogm-b" id="obDone2">Later</button></div>';
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
   +items.map((i,ix)=>'<'+(i.href?'a href="'+i.href+'"':'button type="button"')+' data-ix="'+ix+'" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none;cursor:pointer;border:1px solid '+(i.done?'#b7e0c6':'#cfe0f3')+';background:#fff;border-radius:999px;padding:7px 12px;font-weight:700;font-size:12.5px;color:'+(i.done?'#1d7a45':'#13294B')+'">'+(i.done?'✓':'○')+' '+i.t+'</'+(i.href?'a':'button')+'>').join("")
   +'</div></div>';
  host.querySelector("#ogSetupHide").onclick=()=>{ try{ localStorage.setItem("offgrd_setup_done","1"); }catch(e){} host.remove(); };
  [].forEach.call(host.querySelectorAll("button[data-ix]"),bt=>{ const i=items[+bt.dataset.ix]; if(i&&i.act) bt.onclick=i.act; });
}

function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

let _syncT=null;
window.OFFGRD_SYNC=function(){ if(!(TEAM && SYNCABLE && canEdit())) return; clearTimeout(_syncT); _syncT=setTimeout(()=>{ _syncT=null; push(true); }, 1500); };

/* ---------- auto-sync: pull fresh team data every 45s and on window focus ---------- */
let _busy=false, _lastPull=0, _autoT=null;
function syncStamp(){ try{ const el=document.getElementById("syncstat"); if(!el) return; const d=new Date(); el.textContent="synced "+d.getHours()+":"+String(d.getMinutes()).padStart(2,"0")+" ✓"; el.title="Auto-sync is on — time of last successful sync"; }catch(e){} }
function maybePull(){
  if(!TEAM || !SYNCABLE) return;
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
dbgInfo("sess:…");
Cloud.onAuth(u=>{
  if(!u && !_sessionResolved && window.OFFGRD_HAS_LIKELY_SESSION && window.OFFGRD_HAS_LIKELY_SESSION()) return;
  onUser(u); dbgInfo("auth:"+(u?u.email:"none"));
});
(async()=>{
  try{
    const u = await Cloud.session();
    _sessionResolved = true;
    onUser(u);
    dbgInfo("sess:"+(u?u.email:"none"));
  }catch(e){
    _sessionResolved = true;
    onUser(null);
    dbgInfo("err:"+((e&&e.message)||e));
  }
})();
