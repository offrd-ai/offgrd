/* OFFGRD shared auth modal — sign in / create account. Self-contained (own styles).
   Used by the apps (via OFFGRD-account.js) and the landing page. */
import { Cloud } from "./OFFGRD-cloud.js";

let root = null;
function injectStyles(){
  if(document.getElementById("oga-styles")) return;
  const s = document.createElement("style"); s.id="oga-styles";
  s.textContent = `
  .oga-ov{position:fixed;inset:0;background:rgba(9,18,34,.62);backdrop-filter:blur(3px);display:none;align-items:center;justify-content:center;padding:18px;z-index:10000}
  .oga-ov.show{display:flex}
  .oga-card{background:#fff;color:#16181d;width:100%;max-width:420px;border-radius:18px;padding:26px;box-shadow:0 30px 80px rgba(0,0,0,.4);font:15px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif}
  .oga-top{display:flex;align-items:center;gap:10px;margin-bottom:4px}
  .oga-logo{width:36px;height:36px;border-radius:9px;background:#7BAFD4;color:#13294B;display:grid;place-items:center;font-weight:900;font-size:15px;letter-spacing:-1px}
  .oga-brand{font-weight:900;letter-spacing:2px;color:#13294B;font-size:13px}
  .oga-h{font-size:21px;font-weight:900;color:#13294B;margin:14px 0 2px}
  .oga-sub{color:#5b626e;font-size:13px;margin:0 0 16px}
  .oga-f{display:block;font-size:12px;font-weight:800;color:#5b626e;margin:12px 0 5px;letter-spacing:.3px}
  .oga-in{width:100%;box-sizing:border-box;border:1px solid #d7dbe2;border-radius:10px;padding:12px 13px;font-size:15px}
  .oga-in:focus{outline:none;border-color:#7BAFD4;box-shadow:0 0 0 3px rgba(123,175,212,.28)}
  .oga-go{width:100%;margin-top:18px;background:#13294B;color:#fff;border:0;border-radius:10px;padding:13px;font-weight:800;font-size:15px;cursor:pointer}
  .oga-go:disabled{opacity:.6;cursor:default}
  .oga-alt{text-align:center;margin-top:14px;font-size:13px;color:#5b626e}
  .oga-link{color:#2c6fb3;font-weight:800;cursor:pointer;background:none;border:0;font-size:13px}
  .oga-err{color:#b3261e;font-size:13px;margin-top:12px;min-height:16px;font-weight:600}
  .oga-x{margin-left:auto;border:0;background:none;font-size:20px;color:#9aa4b2;cursor:pointer;line-height:1}`;
  document.head.appendChild(s);
}
function ensure(){
  if(root) return root;
  injectStyles();
  root = document.createElement("div"); root.className="oga-ov"; root.id="ogaModal";
  root.innerHTML = `<div class="oga-card">
    <div class="oga-top"><div class="oga-logo">OG</div><div class="oga-brand">OFFGRD</div><button class="oga-x" id="ogaX">×</button></div>
    <div class="oga-h" id="ogaTitle">Sign in</div>
    <p class="oga-sub" id="ogaSub">Welcome back — sign in to your program.</p>
    <label class="oga-f" for="ogaEmail">Email</label>
    <input class="oga-in" id="ogaEmail" type="email" autocomplete="email" placeholder="you@school.org">
    <label class="oga-f" for="ogaPw">Password</label>
    <input class="oga-in" id="ogaPw" type="password" autocomplete="current-password" placeholder="••••••••">
    <div class="oga-err" id="ogaErr"></div>
    <button class="oga-go" id="ogaGo">Sign in</button>
    <div class="oga-alt" id="ogaAlt"></div>
  </div>`;
  document.body.appendChild(root);
  root.querySelector("#ogaX").onclick=close;
  root.onclick=e=>{ if(e.target===root) close(); };
  return root;
}
function close(){ if(root) root.classList.remove("show"); }

let mode="signin", onOk=null;
function paint(){
  const t=root.querySelector("#ogaTitle"), sub=root.querySelector("#ogaSub"), go=root.querySelector("#ogaGo"),
        alt=root.querySelector("#ogaAlt"), pw=root.querySelector("#ogaPw"), err=root.querySelector("#ogaErr");
  err.textContent="";
  if(mode==="signin"){
    t.textContent="Sign in"; sub.textContent="Welcome back — sign in to your program."; go.textContent="Sign in"; pw.autocomplete="current-password";
    alt.innerHTML='New to OFFGRD? <button class="oga-link" id="ogaSwap">Create an account</button>';
  } else {
    t.textContent="Create your account"; sub.textContent="Set up your login. A head coach can start a program next."; go.textContent="Create account"; pw.autocomplete="new-password";
    alt.innerHTML='Already have an account? <button class="oga-link" id="ogaSwap">Sign in</button>';
  }
  root.querySelector("#ogaSwap").onclick=()=>{ mode = mode==="signin"?"signup":"signin"; paint(); };
}
async function submit(){
  const email=root.querySelector("#ogaEmail").value.trim();
  const pw=root.querySelector("#ogaPw").value;
  const err=root.querySelector("#ogaErr"), go=root.querySelector("#ogaGo");
  if(!email){ err.textContent="Enter your email."; return; }
  if(!pw || pw.length<6){ err.textContent="Password must be at least 6 characters."; return; }
  go.disabled=true; err.textContent="";
  try{
    let r;
    if(mode==="signin"){
      r = await Cloud.signIn(email, pw);
      if(r.error){ err.textContent = /invalid/i.test(r.error.message) ? "Wrong email or password." : r.error.message; go.disabled=false; return; }
    } else {
      r = await Cloud.signUp(email, pw);
      if(r.error){ err.textContent = r.error.message; go.disabled=false; return; }
      if(!r.data.session){ err.style.color="#1d7a45"; err.textContent="Account created. If email confirmation is on, confirm it, then sign in."; mode="signin"; setTimeout(()=>{err.style.color="";paint();},2200); go.disabled=false; return; }
    }
    close(); go.disabled=false;
    if(typeof onOk==="function") onOk();
  }catch(e){ err.textContent = e.message||"Something went wrong."; go.disabled=false; }
}
export function openAuthModal(onSuccess, startMode){
  ensure(); onOk=onSuccess||null; mode = startMode==="signup"?"signup":"signin"; paint();
  root.querySelector("#ogaGo").onclick=submit;
  const submitOnEnter=e=>{ if(e.key==="Enter") submit(); };
  root.querySelector("#ogaEmail").onkeydown=submitOnEnter;
  root.querySelector("#ogaPw").onkeydown=submitOnEnter;
  root.classList.add("show");
  setTimeout(()=>root.querySelector("#ogaEmail").focus(),30);
}
