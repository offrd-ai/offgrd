/* OFFGRD player/coach role gates — enforce UI by offgrd_my_role (§4).
   Plain script; loads after OFFGRD-account.js. Listens for offgrd-program-ready. */
(function(){
  var COACH_VIEWS = { scout:1, plan:1, caller:1, report:1 };
  var PLAYER_VIEWS = { thisweek:1, practice:1, recruiting:1 };

  function prog(){ return window.OFFGRD_PROGRAM || {}; }
  function isPlayer(){ return !!(prog().isPlayer && prog().isPlayer()); }
  function isCoach(){ return !!(prog().isCoach && prog().isCoach()); }

  function hideIds(ids){
    ids.forEach(function(id){
      var el = document.getElementById(id);
      if(el) el.style.display = "none";
    });
  }

  function ensurePlayerViews(){
    if(document.getElementById("view-thisweek")) return;
    var scout = document.getElementById("view-scout");
    ["thisweek","recruiting"].forEach(function(id){
      var d = document.createElement("div");
      d.id = "view-" + id;
      d.style.display = "none";
      if(scout && scout.parentNode) scout.parentNode.insertBefore(d, scout);
      else document.body.appendChild(d);
    });
  }

  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){
      return ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" })[c];
    });
  }

  async function renderPlayerWeek(){
    var host = document.getElementById("view-thisweek");
    if(!host) return;
    host.innerHTML = '<div class="panel"><p class="foot">Loading this week…</p></div>';
    var load = window.OFFGRD_LOAD_PLAYER_WEEK;
    if(!load){ host.innerHTML = '<div class="panel"><p class="foot">Sign in and join your program first.</p></div>'; return; }
    try{
      var wp = await load();
      if(!wp || wp.linked === false){
        host.innerHTML = '<div class="panel"><h3 style="margin:0 0 8px;color:#13294B">This Week</h3><p class="foot">Your coaches haven’t shared a game plan yet. Check back before gameday.</p></div>';
        return;
      }
      var h = '<div class="panel"><h3 style="margin:0 0 8px;color:#13294B">This Week · '+esc(wp.opponent||"Opponent")+'</h3>';
      if(wp.game_date) h += '<p class="foot">Gameday: <b>'+esc(wp.game_date)+'</b></p>';
      if(wp.gen && wp.gen.offense && wp.gen.offense.narrative){
        h += '<div style="margin-top:12px"><div class="lbl">Briefing</div><div style="white-space:pre-wrap;font-size:14px;line-height:1.55">'+esc(wp.gen.offense.narrative)+'</div></div>';
      } else if(wp.gen && wp.gen.narrative){
        h += '<div style="margin-top:12px"><div class="lbl">Briefing</div><div style="white-space:pre-wrap;font-size:14px;line-height:1.55">'+esc(wp.gen.narrative)+'</div></div>';
      }
      if(wp.buckets && wp.buckets.length){
        h += '<div style="margin-top:12px"><div class="lbl">Plays to know</div><ul style="margin:6px 0 0;padding-left:18px">';
        wp.buckets.forEach(function(b){
          (b.plays||[]).forEach(function(p){ h += '<li><b>'+esc(p.name||"Play")+'</b></li>'; });
        });
        h += '</ul></div>';
      }
      if(wp.practice && wp.practice.periods){
        h += '<div style="margin-top:12px"><div class="lbl">Practice script</div><p class="foot">'+wp.practice.periods.length+' period(s) — see <b>Practice</b> tab for your reps.</p></div>';
      }
      h += '<p class="foot" style="margin-top:14px">Read-only view of what your coaches shared. Full scout tools are coach-only.</p></div>';
      host.innerHTML = h;
    }catch(e){
      host.innerHTML = '<div class="panel"><p class="foot">Could not load this week: '+esc(e.message||e)+'</p></div>';
    }
  }

  function renderRecruitingShell(){
    // Recruiting profile lives on getOFFRD — absolute base so offops.app/OFFGRD.html
    // does not resolve /profile/setup relative to the wrong origin (404).
    var REC_BASE = 'https://getoffrd.com';
    var REC_SETUP = REC_BASE + '/profile/setup?from=offgrd&returnTo=/gameday/';
    var host = document.getElementById("view-recruiting");
    if(!host) return;
    host.innerHTML = '<div class="panel"><p class="foot">Loading your recruiting profile…</p></div>';
    var load = window.OFFGRD_LOAD_RECRUITING_SNAPSHOT;
    if(!load){
      host.innerHTML = '<div class="panel"><h3 style="margin:0 0 8px;color:#13294B">Recruiting Profile</h3>'
        +'<p class="foot">Sign in to see your seeded recruiting snapshot.</p>'
        +'<p class="foot" style="margin-top:10px"><a href="'+REC_SETUP+'" style="font-weight:800">Complete my recruiting profile →</a></p></div>';
      return;
    }
    load().then(function(snap){
      if(!snap || snap.ok === false){
        host.innerHTML = '<div class="panel"><h3 style="margin:0 0 8px;color:#13294B">Recruiting Profile</h3>'
          +'<p class="foot">Couldn’t load your profile yet. Join a team or finish signup, then refresh.</p>'
          +'<p class="foot" style="margin-top:10px"><a href="'+REC_SETUP+'" style="font-weight:800">Complete my recruiting profile →</a></p></div>';
        return;
      }
      if(!snap.has_profile){
        host.innerHTML = '<div class="panel"><h3 style="margin:0 0 8px;color:#13294B">Recruiting Profile</h3>'
          +'<p class="foot">Your roster seed isn’t on your recruiting profile yet.</p>'
          +'<p class="foot" style="margin-top:10px"><a href="'+REC_SETUP+'" style="font-weight:800">Complete my recruiting profile →</a></p></div>';
        return;
      }
      var missing = Array.isArray(snap.missing) ? snap.missing.slice(0, 2) : [];
      var missLine = missing.length
        ? ('Finish next: <b>'+esc(missing.join(', '))+'</b>')
        : 'Core fields look solid — add film and academics to climb.';
      var name = [snap.first_name, snap.last_name].filter(Boolean).join(' ') || 'Athlete';
      var meta = [snap.position, snap.graduation_year ? ('Class of '+snap.graduation_year) : null, snap.high_school]
        .filter(Boolean).join(' · ');
      var pct = snap.completeness_pct || 0;
      var score = snap.offrd_score_teaser || 0;
      var matchesLine = pct >= 60
        ? 'College matches unlock from this same profile — open the editor to refine prefs.'
        : 'Complete your profile to unlock college matches.';
      var editUrl = snap.complete_url || REC_SETUP;
      if (!/^https?:\/\//i.test(editUrl)) editUrl = REC_BASE + editUrl;
      host.innerHTML = '<div class="panel">'
        +'<h3 style="margin:0 0 4px;color:#13294B">Recruiting · '+esc(name)+'</h3>'
        +'<p class="foot" style="margin:0 0 12px">'+esc(meta)+'</p>'
        +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'
        +'<div style="flex:1;min-width:120px;background:#eef5fc;border:1px solid #cfe0f3;border-radius:12px;padding:12px">'
        +'<div style="font-size:11px;font-weight:800;color:#5b626e;text-transform:uppercase">Profile strength</div>'
        +'<div style="font-size:28px;font-weight:900;color:#13294B">'+pct+'%</div></div>'
        +'<div style="flex:1;min-width:120px;background:#eef5fc;border:1px solid #cfe0f3;border-radius:12px;padding:12px">'
        +'<div style="font-size:11px;font-weight:800;color:#5b626e;text-transform:uppercase">OFFRD Score</div>'
        +'<div style="font-size:28px;font-weight:900;color:#13294B">'+score+'</div>'
        +'<div class="foot" style="margin:2px 0 0">profile portion</div></div></div>'
        +'<p class="foot" style="margin:0 0 6px">'+missLine+'</p>'
        +'<p class="foot" style="margin:0 0 14px">'+esc(matchesLine)+'</p>'
        +'<a class="btnp" href="'+esc(editUrl)+'" style="display:inline-flex;text-decoration:none;font-weight:800">Complete my recruiting profile →</a>'
        +'<p class="foot" style="margin-top:10px">Same account · same <b>players</b> record · no second login.</p>'
        +'</div>';
    }).catch(function(e){
      console.warn('[recruiting]', e);
      host.innerHTML = '<div class="panel"><p class="foot">Couldn’t load recruiting snapshot.</p></div>';
    });
  }

  function patchSetView(){
    if(!window.setView || window.setView._roleGated) return;
    var orig = window.setView;
    window.setView = function(v){
      if(isPlayer()){
        if(COACH_VIEWS[v]) v = "thisweek";
        if(PLAYER_VIEWS[v]){
          window.CURRENT_VIEW = v;
          ["scout","plan","caller","report","practice","thisweek","recruiting"].forEach(function(id){
            var el = document.getElementById("view-" + id);
            if(el) el.style.display = (id === v) ? "" : "none";
          });
          var nv = document.getElementById("navbar");
          if(nv) [].forEach.call(nv.querySelectorAll("button"), function(b){
            if(b.dataset.view === v) b.classList.add("on"); else b.classList.remove("on");
          });
          if(v === "thisweek") renderPlayerWeek();
          else if(v === "recruiting") renderRecruitingShell();
          else if(v === "practice" && window.refreshView) window.refreshView();
          return;
        }
      }
      return orig(v);
    };
    window.setView._roleGated = true;
  }

  function applyScoutPlayerUI(){
    if(!isPlayer()) return;
    ensurePlayerViews();
    patchSetView();
    hideIds(["importBtn","manageBtn","schedBtn","brandBtn","scoutCardsBtn","tendencyBtn"]);
    var tools = document.getElementById("tools");
    if(tools){
      [].forEach.call(tools.querySelectorAll('a[href="OFFGRD-Playbook.html"]'), function(a){ a.style.display = "none"; });
    }
    var nv = document.getElementById("navbar");
    if(nv){
      nv.innerHTML =
        '<button class="on" data-view="thisweek" onclick="setView(\'thisweek\')">This Week</button>'+
        '<button data-view="practice" onclick="setView(\'practice\')">Practice</button>'+
        '<a class="ghost" href="OFFGRD-QB.html" style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center;font-weight:800;padding:9px 16px;border-radius:10px;border:1px solid var(--line)">Testing</a>'+
        '<button data-view="recruiting" onclick="setView(\'recruiting\')">Recruiting</button>';
    }
    ["scout","plan","caller","report"].forEach(function(id){
      var el = document.getElementById("view-" + id);
      if(el) el.style.display = "none";
    });
    if(window.setView) window.setView("thisweek");
  }

  function applyPlaybookGate(){
    if(isPlayer()) location.replace("OFFGRD-QB.html");
  }

  function applyQbPlayerUI(){
    if(!isPlayer()) return;
    var tb = document.querySelector(".topbar");
    if(tb){
      /* Keep OFFGRD.html (player home). Hide Playbook only — coach authoring tool. */
      [].forEach.call(tb.querySelectorAll('a[href="OFFGRD-Playbook.html"]'), function(a){ a.style.display = "none"; });
    }
  }

  function apply(){
    if(!prog().ready) return;
    var kind = window.OFFGRD_APP && window.OFFGRD_APP.kind;
    if(kind === "playbook") applyPlaybookGate();
    else if(kind === "scout"){ if(isPlayer()) applyScoutPlayerUI(); }
    else if(kind === "qb") applyQbPlayerUI();
  }

  document.addEventListener("offgrd-program-ready", apply);
  if(prog().ready) apply();
  var n = 0, t = setInterval(function(){
    if(prog().ready || ++n > 40){ clearInterval(t); apply(); }
  }, 250);
})();
