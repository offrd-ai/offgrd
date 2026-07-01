/* OFFGRD account bar + cloud sync — shared by Scout and Playbook.
   Each app sets window.OFFGRD_APP = { kind:'playbook'|'scout', get:()=>items, set:(items)=>void } before this loads. */
import { Cloud } from "./OFFGRD-cloud.js";

const A = window.OFFGRD_APP || {};
const acct = document.getElementById("acct");
let TEAM = null;

function style(el){ [].forEach.call(el.querySelectorAll(".cbtn"),b=>{b.style.cssText="border:1px solid #e2e5ea;background:#fff;color:#16181d;padding:6px 10px;border-radius:8px;font-weight:800;font-size:12px;cursor:pointer;margin-left:2px";}); }
function view(user){
  if(!acct) return;
  if(!Cloud.ready){ acct.innerHTML = '<span style="color:#9aa4b2;font-size:12px">cloud not configured</span>'; return; }
  if(!user){
    acct.innerHTML = '<button class="cbtn" id="ci">Sign in</button>';
    style(acct); acct.querySelector("#ci").onclick = login;
  } else {
    acct.innerHTML = '<span style="color:#5b626e;font-size:12px;margin-right:8px">'+user.email+'</span>'+
      '<button class="cbtn" id="cs">Sync ↑</button> <button class="cbtn" id="cd">Load ↓</button> <button class="cbtn" id="co">Sign out</button>';
    style(acct);
    acct.querySelector("#cs").onclick = push;
    acct.querySelector("#cd").onclick = ()=>pull(false);
    acct.querySelector("#co").onclick = ()=>Cloud.signOut();
  }
}
async function login(){
  const email = prompt("Coach email:"); if(!email) return;
  const pw = prompt("Password (6+ characters):"); if(!pw) return;
  let r = await Cloud.signIn(email.trim(), pw);
  if(r.error){
    if(confirm("No account for that email yet — create one?")){
      r = await Cloud.signUp(email.trim(), pw);
      if(r.error){ alert(r.error.message); return; }
      if(!r.data.session){ alert("Account created. If email confirmation is ON in Supabase, confirm the email then Sign in."); return; }
    } else return;
  }
}
async function onUser(u){
  view(u);
  if(!u){ TEAM=null; return; }
  try{ TEAM = await Cloud.ensureTeam("My Program"); await pull(true); }
  catch(e){ console.error(e); }
}
async function pull(silent){
  if(!TEAM) return;
  try{
    if(A.kind==="playbook"){
      const rows = await Cloud.listPlays(TEAM.id);
      const lib = rows.map(r=>Object.assign({}, r.data||{}, {cid:r.id, name:r.name}));
      A.set(lib);
    } else {
      const rows = await Cloud.listGames(TEAM.id);
      const games = rows.map(r=>({key:(r.opponent+"|"+r.week+"|"+r.side).toLowerCase(), opponent:r.opponent, week:r.week, side:r.side, source:r.source, rows:r.rows, cid:r.id}));
      A.set(games);
    }
    if(!silent) alert("Loaded from your program.");
  }catch(e){ if(!silent) alert(e.message||"Load failed"); }
}
async function push(){
  if(!TEAM){ alert("Sign in first."); return; }
  try{
    const items = A.get();
    if(A.kind==="playbook"){
      for(const p of items){ const row = await Cloud.savePlay(TEAM.id, Object.assign({}, p, {id:p.cid, data:p})); p.cid = row.id; }
    } else {
      for(const g of items){ const row = await Cloud.saveGame(TEAM.id, Object.assign({}, g, {id:g.cid})); g.cid = row.id; }
    }
    A.set(items);
    alert("Synced "+items.length+" item"+(items.length===1?"":"s")+" to your program ✓");
  }catch(e){ alert(e.message||"Sync failed"); }
}
Cloud.onAuth(u=>onUser(u));
(async()=>{ try{ onUser(await Cloud.user()); }catch(e){ view(null); } })();
