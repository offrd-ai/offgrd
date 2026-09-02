/* OFFGRD shared auth modal — sign in / create account / forgot / change password.
   Self-contained (own styles). Used by the apps (via OFFGRD-account.js) and the landing page. */
import { Cloud } from "./OFFGRD-cloud.js?v=353";

let root = null;
function injectStyles(){
  if(document.getElementById("oga-styles")) return;
  const s = document.createElement("style"); s.id="oga-styles";
  s.textContent = `
  .oga-ov{position:fixed;inset:0;background:rgba(9,18,34,.62);backdrop-filter:blur(3px);display:none;align-items:center;justify-content:center;padding:18px;z-index:10000}
  .oga-ov.show{display:flex}
  .oga-card{background:#fff;color:#16181d;width:100%;max-width:420px;border-radius:18px;padding:26px;box-shadow:0 30px 80px rgba(0,0,0,.4);font:15px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif}
  .oga-top{display:flex;align-items:center;gap:10px;margin-bottom:4px}
  .oga-logo{width:36px;height:36px;border-radius:9px;background:#0a1220;object-fit:cover;display:block}
  .oga-brand{font-weight:900;letter-spacing:2px;color:#13294B;font-size:13px}
  .oga-h{font-size:21px;font-weight:900;color:#13294B;margin:14px 0 2px}
  .oga-sub{color:#5b626e;font-size:13px;margin:0 0 16px}
  .oga-f{display:block;font-size:12px;font-weight:800;color:#5b626e;margin:12px 0 5px;letter-spacing:.3px}
  .oga-in{width:100%;box-sizing:border-box;border:1px solid #d7dbe2;border-radius:10px;padding:12px 13px;font-size:15px}
  .oga-in:focus{outline:none;border-color:#7BAFD4;box-shadow:0 0 0 3px rgba(123,175,212,.28)}
  .oga-in:disabled{background:#f3f5f8;color:#5b626e}
  .oga-go{width:100%;margin-top:18px;background:#13294B;color:#fff;border:0;border-radius:10px;padding:13px;font-weight:800;font-size:15px;cursor:pointer;min-height:48px}
  .oga-go:disabled{opacity:.6;cursor:default}
  .oga-alt{text-align:center;margin-top:14px;font-size:13px;color:#5b626e}
  .oga-link{color:#2c6fb3;font-weight:800;cursor:pointer;background:none;border:0;font-size:13px;padding:0}
  .oga-err{color:#b3261e;font-size:13px;margin-top:12px;min-height:16px;font-weight:600}
  .oga-ok{color:#1d7a45}
  .oga-x{margin-left:auto;border:0;background:none;font-size:20px;color:#9aa4b2;cursor:pointer;line-height:1}
  .oga-row-links{display:flex;justify-content:flex-end;margin-top:8px}`;
  document.head.appendChild(s);
}
function ensure(){
  if(root) return root;
  injectStyles();
  root = document.createElement("div"); root.className="oga-ov"; root.id="ogaModal";
  root.innerHTML = `<div class="oga-card">
    <div class="oga-top"><img class="oga-logo" src="logo-mark.png" alt="OFFGRD" /><div class="oga-brand">OFFGRD</div><button class="oga-x" id="ogaX" type="button" aria-label="Close">\u00d7</button></div>
    <div class="oga-h" id="ogaTitle">Sign in</div>
    <p class="oga-sub" id="ogaSub">Welcome back \u2014 sign in to your program.</p>
    <label class="oga-f" for="ogaEmail" id="ogaEmailLbl">Email</label>
    <input class="oga-in" id="ogaEmail" type="email" autocomplete="email" placeholder="you@school.org">
    <div id="ogaPwBlock">
      <label class="oga-f" for="ogaPw" id="ogaPwLbl">Password</label>
      <input class="oga-in" id="ogaPw" type="password" autocomplete="current-password" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022">
      <div class="oga-row-links" id="ogaForgotRow">
        <button type="button" class="oga-link" id="ogaForgot">Forgot password?</button>
      </div>
    </div>
    <div id="ogaPw2Block" style="display:none">
      <label class="oga-f" for="ogaPw2">Confirm new password</label>
      <input class="oga-in" id="ogaPw2" type="password" autocomplete="new-password" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022">
    </div>
    <div id="ogaNameBlock" style="display:none">
      <label class="oga-f" for="ogaMyName">Your name</label>
      <input class="oga-in" id="ogaMyName" type="text" autocomplete="name" placeholder="Coach Smith">
      <button type="button" class="oga-link" id="ogaSaveName" style="margin-top:8px">Save name</button>
    </div>
    <div id="ogaProgramBlock" style="display:none">
      <label class="oga-f" for="ogaCoachName">Your name</label>
      <input class="oga-in" id="ogaCoachName" type="text" autocomplete="name" placeholder="Coach Smith">
      <label class="oga-f" for="ogaSchool">School / program name</label>
      <input class="oga-in" id="ogaSchool" type="text" autocomplete="organization" placeholder="Parkway West">
    </div>
    <div class="oga-err" id="ogaErr"></div>
    <button class="oga-go" id="ogaGo" type="button">Sign in</button>
    <div class="oga-alt" id="ogaAlt"></div>
  </div>`;
  document.body.appendChild(root);
  root.querySelector("#ogaX").onclick=close;
  root.onclick=e=>{ if(e.target===root) close(); };
  return root;
}
function close(){ if(root) root.classList.remove("show"); }

let mode="signin", onOk=null;

function setErr(msg, ok){
  const err=root.querySelector("#ogaErr");
  err.textContent=msg||"";
  err.classList.toggle("oga-ok", !!ok);
}

function paint(){
  const t=root.querySelector("#ogaTitle"), sub=root.querySelector("#ogaSub"), go=root.querySelector("#ogaGo"),
        alt=root.querySelector("#ogaAlt"), pw=root.querySelector("#ogaPw"),
        pwBlock=root.querySelector("#ogaPwBlock"), pw2Block=root.querySelector("#ogaPw2Block"),
        progBlock=root.querySelector("#ogaProgramBlock"),
        nameBlock=root.querySelector("#ogaNameBlock"),
        forgotRow=root.querySelector("#ogaForgotRow"), emailEl=root.querySelector("#ogaEmail"),
        emailLbl=root.querySelector("#ogaEmailLbl"),
        pwLbl=root.querySelector("#ogaPwLbl");
  setErr("");
  emailEl.disabled = false;
  emailEl.style.display = "";
  if(emailLbl) emailLbl.style.display = "";
  pw2Block.style.display = "none";
  pwBlock.style.display = "";
  if(progBlock) progBlock.style.display = "none";
  if(nameBlock) nameBlock.style.display = "none";
  forgotRow.style.display = "none";

  const forgotBtn=root.querySelector("#ogaForgot");
  if(forgotBtn) forgotBtn.textContent="Forgot password?";

  if(mode==="signin"){
    t.textContent="Sign in";
    sub.textContent="Welcome back \u2014 sign in to your program.";
    go.textContent="Sign in";
    pw.autocomplete="current-password";
    pwLbl.textContent="Password";
    forgotRow.style.display="";
    alt.innerHTML='New to OFFGRD? <button type="button" class="oga-link" id="ogaSwap">Create an account</button>';
  } else if(mode==="signup"){
    t.textContent="Create your coach account";
    sub.textContent="odkops is for coaches. Next you\u2019ll name your program and start the 14-day trial.";
    go.textContent="Create account";
    pw.autocomplete="new-password";
    pwLbl.textContent="Password";
    alt.innerHTML='Already have an account? <button type="button" class="oga-link" id="ogaSwap">Sign in</button>';
  } else if(mode==="forgot"){
    t.textContent="Reset password";
    sub.textContent="We\u2019ll email you a link to choose a new password.";
    go.textContent="Send reset link";
    pwBlock.style.display="none";
    alt.innerHTML='<button type="button" class="oga-link" id="ogaSwap">Back to sign in</button>';
  } else if(mode==="program"){
    t.textContent="Name your program";
    sub.textContent="This starts your 14-day trial. Invite staff after you\u2019re in.";
    go.textContent="Create program & open app";
    emailEl.style.display = "none";
    if(emailLbl) emailLbl.style.display = "none";
    pwBlock.style.display = "none";
    if(progBlock) progBlock.style.display = "";
    alt.innerHTML="";
  } else if(mode==="account"){
    t.textContent="Account";
    sub.textContent="Your name is what the staff list shows. Change your password here too.";
    go.textContent="Update password";
    if(nameBlock) nameBlock.style.display = "";
    pw.autocomplete="new-password";
    pwLbl.textContent="New password";
    pw2Block.style.display="";
    emailEl.disabled = true;
    forgotRow.style.display="";
    root.querySelector("#ogaForgot").textContent="Email me a reset link instead";
    alt.innerHTML='<button type="button" class="oga-link" id="ogaSwap">Close</button>';
  }

  const swap=root.querySelector("#ogaSwap");
  if(swap){
    swap.onclick=()=>{
      if(mode==="account"){ close(); return; }
      if(mode==="forgot"){ mode="signin"; paint(); return; }
      mode = mode==="signin"?"signup":"signin";
      paint();
    };
  }
  const forgot=root.querySelector("#ogaForgot");
  if(forgot){
    forgot.onclick=()=>{
      if(mode==="account"){ sendResetFromAccount(); return; }
      mode="forgot"; paint();
      setTimeout(()=>root.querySelector("#ogaEmail").focus(),30);
    };
  }
}

async function sendResetFromAccount(){
  const email=root.querySelector("#ogaEmail").value.trim();
  const go=root.querySelector("#ogaGo");
  if(!email){ setErr("No email on this session."); return; }
  if(!Cloud || !Cloud.ready){ setErr("Cloud isn\u2019t loaded \u2014 reload the page."); return; }
  go.disabled=true; setErr("");
  try{
    const r = await Cloud.resetPassword(email);
    if(r.error){ setErr(r.error.message); go.disabled=false; return; }
    setErr("Reset link sent to "+email+". Check your inbox.", true);
  }catch(e){ setErr(e.message||"Could not send reset email."); }
  go.disabled=false;
}

function hasPendingInvite(){
  try{ return !!sessionStorage.getItem("offgrd_pending_invite"); }catch(e){ return false; }
}

async function finishAuth(){
  const go=root.querySelector("#ogaGo");
  if(hasPendingInvite() || (function(){ try{ return localStorage.getItem("offgrd_joined_via_invite")==="1"; }catch(e){ return false; } })()){
    close(); go.disabled=false;
    if(typeof onOk==="function") onOk();
    return;
  }
  let teams=[];
  try{ teams=await Cloud.myTeams(); }catch(e){}
  if(teams && teams.length){
    close(); go.disabled=false;
    if(typeof onOk==="function") onOk();
    return;
  }
  mode="program";
  paint();
  go.disabled=false;
  setTimeout(()=>{ const el=root.querySelector("#ogaSchool"); if(el) el.focus(); },30);
}

async function submit(){
  const email=root.querySelector("#ogaEmail").value.trim();
  const pw=root.querySelector("#ogaPw").value;
  const pw2=root.querySelector("#ogaPw2").value;
  const go=root.querySelector("#ogaGo");
  if(!Cloud || !Cloud.ready){ setErr("Cloud isn\u2019t loaded \u2014 reload the page. If it persists, the supabase.js file hasn\u2019t deployed yet."); return; }

  if(mode==="program"){
    const coachName=(root.querySelector("#ogaCoachName").value||"").trim();
    const schoolName=(root.querySelector("#ogaSchool").value||"").trim();
    if(!schoolName || schoolName.length<3){ setErr("Enter the full school or program name."); return; }
    go.disabled=true; setErr("");
    try{
      try{ if(Cloud.stampHsCoach) await Cloud.stampHsCoach(); }catch(e){}
      await Cloud.createOwnedProgram({ schoolName, coachName, roleTitle:"Head Coach" });
      try{ await Cloud.createTeam(schoolName); }catch(e){}
      close(); go.disabled=false;
      if(typeof onOk==="function") onOk();
    }catch(e){ setErr(e.message||"Could not create the program."); go.disabled=false; }
    return;
  }

  if(!email){ setErr("Enter your email."); return; }

  go.disabled=true; setErr("");
  try{
    if(mode==="forgot"){
      const r = await Cloud.resetPassword(email);
      if(r.error){ setErr(r.error.message); go.disabled=false; return; }
      setErr("Reset link sent to "+email+". Open it to set a new password.", true);
      go.disabled=false;
      return;
    }

    if(mode==="account"){
      if(!pw || pw.length<6){ setErr("Password must be at least 6 characters."); go.disabled=false; return; }
      if(pw !== pw2){ setErr("Passwords do not match."); go.disabled=false; return; }
      const r = await Cloud.updatePassword(pw);
      if(r.error){ setErr(r.error.message); go.disabled=false; return; }
      setErr("Password updated.", true);
      root.querySelector("#ogaPw").value="";
      root.querySelector("#ogaPw2").value="";
      go.disabled=false;
      setTimeout(close, 900);
      return;
    }

    if(!pw || pw.length<6){ setErr("Password must be at least 6 characters."); go.disabled=false; return; }

    let r;
    if(mode==="signin"){
      r = await Cloud.signIn(email, pw);
      if(r.error){ setErr(/invalid/i.test(r.error.message) ? "Wrong email or password." : r.error.message); go.disabled=false; return; }
    } else {
      r = await Cloud.signUp(email, pw);
      if(r.error){ setErr(r.error.message); go.disabled=false; return; }
      if(!r.data.session){
        setErr("Account created. If email confirmation is on, confirm it, then sign in.", true);
        mode="signin";
        setTimeout(()=>{ setErr(""); paint(); },2200);
        go.disabled=false;
        return;
      }
    }
    await finishAuth();
  }catch(e){ setErr(e.message||"Something went wrong."); go.disabled=false; }
}

function bindSubmit(){
  root.querySelector("#ogaGo").onclick=submit;
  const submitOnEnter=e=>{ if(e.key==="Enter") submit(); };
  root.querySelector("#ogaEmail").onkeydown=submitOnEnter;
  root.querySelector("#ogaPw").onkeydown=submitOnEnter;
  root.querySelector("#ogaPw2").onkeydown=submitOnEnter;
  const cn=root.querySelector("#ogaCoachName"), sc=root.querySelector("#ogaSchool");
  if(cn) cn.onkeydown=submitOnEnter;
  if(sc) sc.onkeydown=submitOnEnter;
}

export function openAuthModal(onSuccess, startMode, opts){
  ensure(); onOk=onSuccess||null;
  mode = startMode==="signup" ? "signup" : (startMode==="forgot" ? "forgot" : (startMode==="program" ? "program" : "signin"));
  paint();
  if(opts && opts.teamName && (mode==="signup" || mode==="signin")){
    const sub=root.querySelector("#ogaSub");
    if(sub){
      sub.textContent = mode==="signup"
        ? ("Create your account to join " + opts.teamName + ".")
        : ("Sign in to join " + opts.teamName + ".");
    }
  }
  if(opts && opts.email){
    const emailEl=root.querySelector("#ogaEmail");
    if(emailEl) emailEl.value = opts.email;
  }
  bindSubmit();
  root.classList.add("show");
  setTimeout(()=>{
    const el = mode==="program"
      ? root.querySelector("#ogaSchool")
      : (mode==="forgot" || mode==="signin" || mode==="signup"
        ? (opts && opts.email ? root.querySelector("#ogaPw") : root.querySelector("#ogaEmail"))
        : root.querySelector("#ogaPw"));
    if(el && el.focus) el.focus();
  },30);
}

/** Signed-in account sheet: change password or email a reset link. */
export async function openAccountModal(){
  ensure(); onOk=null; mode="account";
  let email="";
  try{
    const u = await Cloud.session();
    email = (u && u.email) || "";
  }catch(e){}
  if(!email){
    openAuthModal(null, "forgot");
    return;
  }
  paint();
  root.querySelector("#ogaEmail").value = email;
  root.querySelector("#ogaPw").value = "";
  root.querySelector("#ogaPw2").value = "";
  bindSubmit();
  const nameEl=root.querySelector("#ogaMyName");
  const saveName=root.querySelector("#ogaSaveName");
  if(nameEl){
    nameEl.value="";
    try{
      if(Cloud.myName) nameEl.value = await Cloud.myName();
    }catch(e){}
  }
  if(saveName){
    saveName.onclick=async()=>{
      const nm=(nameEl && nameEl.value || "").trim();
      if(!nm || nm.length<2){ setErr("Enter your name."); return; }
      saveName.disabled=true; setErr("");
      try{
        await Cloud.setMyName(nm);
        setErr("Name saved. The staff list will show "+nm+".", true);
      }catch(e){ setErr(e.message||"Could not save your name."); }
      saveName.disabled=false;
    };
  }
  root.classList.add("show");
  setTimeout(()=>{ const el=root.querySelector("#ogaMyName")||root.querySelector("#ogaPw"); if(el) el.focus(); },30);
}

try{ window.openOffgrdAccountModal = openAccountModal; }catch(e){}
try{ window.openOffgrdAuthModal = openAuthModal; }catch(e){}
