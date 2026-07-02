/* OFFGRD account + team/roster management — shared by Scout and Playbook.
   Each app sets window.OFFGRD_APP = { kind:'playbook'|'scout', get:()=>items, set:(items)=>void }.
   Roles: owner (Admin) · coach_edit · coach_view · player. Edit = owner/coach_edit. */
import { Cloud } from "./OFFGRD-cloud.js?v=8";
import { openAuthModal } from "./OFFGRD-auth.js?v=8";

const A = window.OFFGRD_APP || {};
const SYNCABLE = ["playbook","scout"].includes(A.kind);
const acct = document.getElementById("acct");
let TEAM = null, ROLE = null, TEAMS = [];
const AKEY = "offgrd_team";

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
  .ogm-note{font-size:12px;color:#5b626e;margin:6px 0 0}`;
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
    acct.innerHTML = '<span style="color:#5b626e;font-size:12px;margin-right:6px">'+user.email+'</span> <button class="cbtn" id="csetup">Set up program</button> <button class="cbtn" id="co">Sign out</button>';
    styleBtns();
    acct.querySelector("#csetup").onclick = openTeam;
    acct.querySelector("#co").onclick = () => Cloud.signOut();
    return;
  }
  const badge = ROLE ? '<span class="cbtn" style="cursor:default;background:#dce7f6;border-color:#dce7f6;color:#13294B">'+roleLabel(ROLE)+'</span>' : '';
  acct.innerHTML =
    '<span style="color:#5b626e;font-size:12px;margin-right:6px">'+user.email+'</span>'+ badge +
    ' <button class="cbtn" id="cteam">Team</button>'+
    ((SYNCABLE && canEdit()) ? ' <button class="cbtn" id="cs">Sync ↑</button>' : '')+
    (SYNCABLE ? ' <button class="cbtn" id="cd">Load ↓</button>' : '')+
    ' <button class="cbtn" id="co">Sign out</button>';
  styleBtns();
  acct.querySelector("#cteam").onclick = openTeam;
  const cs = acct.querySelector("#cs"); if(cs) cs.onclick = ()=>push();
  const cd = acct.querySelector("#cd"); if(cd) cd.onclick = () => pull(false);
  acct.querySelector("#co").onclick = () => Cloud.signOut();
}
function styleBtns(){ [].forEach.call(acct.querySelectorAll(".cbtn"), b => { if(!b.style.padding) b.style.cssText="border:1px solid #e2e5ea;background:#fff;color:#16181d;padding:6px 10px;border-radius:8px;font-weight:800;font-size:12px;cursor:pointer;margin-left:2px"; }); }

function login(){ openAuthModal(); }

/* ---------- session / active team ---------- */
async function onUser(u){
  if(!u){ TEAM=null; ROLE=null; TEAMS=[]; bar(null); return; }
  try{
    TEAMS = await Cloud.myTeams();
    if(TEAMS.length){
      let saved = null; try{ saved = localStorage.getItem(AKEY); }catch(e){}
      TEAM = TEAMS.find(t => t.id === saved) || TEAMS[0];
      ROLE = await Cloud.myRole(TEAM.id);
    } else { TEAM = null; ROLE = null; }
    bar(u);
    if(TEAM) await pull(true);
    try{ if(A.onUser) A.onUser(u.email); }catch(e){}
  }catch(e){ console.error(e); bar(u); }
}
async function setActiveTeam(id){
  TEAM = TEAMS.find(t => t.id === id) || TEAM; if(!TEAM) return;
  try{ localStorage.setItem(AKEY, TEAM.id); }catch(e){}
  ROLE = await Cloud.myRole(TEAM.id);
  bar(await Cloud.user());
  await pull(false);
}

/* ---------- sync ---------- */
async function pull(silent){
  if(!TEAM || !SYNCABLE) return;
  try{
    let rows;
    if(A.kind==="playbook") rows = await Cloud.listPlays(TEAM.id);
    else rows = await Cloud.listGames(TEAM.id);
    if(rows && rows.length){
      if(A.kind==="playbook") A.set(rows.map(r=>Object.assign({}, r.data||{}, {cid:r.id, name:r.name})));
      else A.set(rows.map(r=>({key:(r.opponent+"|"+r.week+"|"+r.side).toLowerCase(), opponent:r.opponent, week:r.week, side:r.side, source:r.source, rows:r.rows, cid:r.id})));
      if(!silent) alert("Loaded "+TEAM.name+".");
    } else {
      const local = A.get();
      if(local && local.length && canEdit()){ await push(true); if(!silent) alert("This device\u2019s data is now backed up to "+TEAM.name+"."); }
      else if(!silent) alert(TEAM.name+" has no saved data yet.");
    }
  }catch(e){ if(!silent) alert(e.message||"Load failed"); }
}
async function push(silent){
  if(!TEAM){ if(!silent) alert("Sign in first."); return; }
  if(!canEdit()){ if(!silent) alert("Your role is view-only, so you can’t save to the program."); return; }
  try{
    const items = A.get();
    if(A.kind==="playbook"){ for(const p of items){ const row = await Cloud.savePlay(TEAM.id, Object.assign({}, p, {id:p.cid, data:p})); p.cid = row.id; } }
    else { for(const g of items){ const row = await Cloud.saveGame(TEAM.id, Object.assign({}, g, {id:g.cid})); g.cid = row.id; } }
    A.set(items);
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
  body.appendChild(el('<p class="ogm-note">You’re signed in. Create your program to become its Admin, or join an existing one with a code.</p>'));
  const cs=el('<div class="ogm-sec"><div class="ogm-lbl">Create a program</div></div>');
  const crow=el('<div class="ogm-row"></div>');
  const nm=el('<input class="ogm-in" placeholder="Program name (e.g. Parkway West)">');
  const cb=el('<button class="ogm-b go">Create</button>');
  cb.onclick=async()=>{ const n=nm.value.trim()||"My Program"; cb.disabled=true; try{ const tid=await Cloud.createTeam(n); TEAMS=await Cloud.myTeams(); await setActiveTeam(tid); renderTeam(); }catch(e){ alert(e.message||"Couldn’t create"); cb.disabled=false; } };
  crow.appendChild(nm); crow.appendChild(cb); cs.appendChild(crow); body.appendChild(cs);
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
    row.appendChild(el('<span class="nm">'+esc(m.full_name||m.email||"—")+(m.user_id===myId?' <span class="ogm-note" style="font-weight:600">(you)</span>':'')+'</span>'));
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

function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

let _syncT=null;
window.OFFGRD_SYNC=function(){ if(!(TEAM && SYNCABLE && canEdit())) return; clearTimeout(_syncT); _syncT=setTimeout(()=>push(true), 1500); };
Cloud.onAuth(u=>onUser(u));
(async()=>{ try{ onUser(await Cloud.user()); }catch(e){ bar(null); } })();
