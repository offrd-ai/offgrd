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

  function isDefPos(pos){
    return pos === "DL" || pos === "LB" || pos === "DB";
  }
  function isOlPos(pos){ return pos === "OL"; }

  /** Unique plays across situation buckets, with situation tags. */
  function uniquePlaysFromBuckets(buckets){
    var map = {};
    var order = [];
    (buckets || []).forEach(function(b){
      var sit = b.name || b.label || b.situation || b.title || "";
      (b.plays || []).forEach(function(p){
        var nm = (p && (p.name || p.play_name)) || "";
        var key = String(nm || (p && p.id) || "").toLowerCase().trim();
        if(!key) return;
        if(!map[key]){
          map[key] = { name: nm || "Play", id: p && p.id, situations: [], play: p };
          order.push(key);
        }
        if(sit && map[key].situations.indexOf(sit) < 0) map[key].situations.push(sit);
      });
    });
    return order.map(function(k){ return map[k]; });
  }

  async function resolvePlayerPositions(){
    var me = null;
    try{
      if(window.Cloud && Cloud.ready){
        var tid = null;
        try{ tid = localStorage.getItem("offgrd_team"); }catch(e){}
        var u = await Cloud.user();
        var teams = await Cloud.myTeams();
        var team = (teams || []).find(function(t){ return t.id === tid; }) || (teams && teams[0]);
        if(team && u){
          var roster = await Cloud.teamRoster(team.id).catch(function(){ return []; });
          me = (roster || []).find(function(m){ return m.user_id === u.id; });
        }
      }
    }catch(e){}
    var AT = window.OFFGRD_WEEK_AUTOTEST;
    if(me && AT && AT.parseMemberPositions){
      var parsed = AT.parseMemberPositions(me);
      if(parsed.length) return parsed;
    }
    var fallback = "";
    if(!fallback) try{ fallback = localStorage.getItem("offgrd_pos") || ""; }catch(e){}
    if(AT && AT.parseMemberPositions && fallback){
      return AT.parseMemberPositions({ position: fallback });
    }
    return [];
  }
  async function resolvePlayerPos(){
    var ps = await resolvePlayerPositions();
    return ps[0] || "";
  }

  async function loadMyQuizRows(teamId, userId){
    if(!teamId || !userId || !window.Cloud || !Cloud.listQuizResults) return [];
    try{
      var all = await Cloud.listQuizResults(teamId);
      return (all || []).filter(function(r){ return r.user_id === userId; });
    }catch(e){ return []; }
  }

  function coverageList(wp){
    var list = [];
    var def = (wp.def_aligns && typeof wp.def_aligns === "object") ? wp.def_aligns : {};
    Object.keys(def).forEach(function(k){
      if(k && list.indexOf(k) < 0) list.push(k);
    });
    var looks = wp.gen && wp.gen.defense && wp.gen.defense.looks;
    if(Array.isArray(looks)){
      looks.forEach(function(L){
        var n = (L && (L.coverage || L.name || L)) || "";
        n = String(n);
        if(n && list.indexOf(n) < 0) list.push(n);
      });
    }
    var aligns = wp.gen && wp.gen.defense && wp.gen.defense.alignments;
    if(aligns && typeof aligns === "object"){
      Object.keys(aligns).forEach(function(k){
        if(k && list.indexOf(k) < 0) list.push(k);
      });
    }
    return list.slice(0, 8);
  }

  function frontList(wp){
    var list = [];
    var top = wp.gen && wp.gen.defense && wp.gen.defense.top_front;
    if(top) list.push(String(top));
    var looks = wp.gen && wp.gen.defense && wp.gen.defense.looks;
    if(Array.isArray(looks)){
      looks.forEach(function(L){
        var n = (L && (L.front || L.name)) || "";
        n = String(n);
        if(n && list.indexOf(n) < 0) list.push(n);
      });
    }
    return list.slice(0, 6);
  }

  /** Filter unique install plays to what this position owns. */
  function playsForPos(unique, pos, gen){
    if(isDefPos(pos)) return [];
    var g = gen || {};
    if(isOlPos(pos)){
      var ol = g.ol && typeof g.ol === "object" ? g.ol : {};
      var olNames = Object.keys(ol);
      if(olNames.length){
        var set = {};
        olNames.forEach(function(n){ set[String(n).toLowerCase()] = 1; });
        var filtered = unique.filter(function(u){ return set[String(u.name).toLowerCase()]; });
        if(filtered.length) return filtered;
      }
      return unique;
    }
    /* QB / skill: full unique install (deduped) — they throw / run the concepts */
    return unique;
  }

  function playsForPositions(unique, positions, gen){
    var set = {}, out = [];
    (positions || []).forEach(function(pos){
      playsForPos(unique, pos, gen).forEach(function(u){
        var k = String(u.name || "").toLowerCase();
        if(k && !set[k]){ set[k] = 1; out.push(u); }
      });
    });
    return out;
  }

  function renderAssignedStripHtml(wp, positions, rows){
    var AT = window.OFFGRD_WEEK_AUTOTEST;
    positions = positions || [];
    if(!AT || !wp.test_spec || !positions.length) return "";
    var spec = AT.unionSpecForPlayer ? AT.unionSpecForPlayer(positions, wp.test_spec) : null;
    if(!spec || !spec.kinds || !spec.kinds.length) return "";
    var comp = AT.completionForPlayer(spec, rows || [], wp.id, wp.opponent);
    var chips = (comp.items || []).map(function(i){
      var mark = i.passed ? "\u2713" : (i.started ? "\u25D0" : "\u25A2");
      var col = i.passed ? "#1d7a45" : (i.started ? "#b8860b" : "#7a8494");
      var lab = String(i.label || i.kind).replace(" test", "").replace(" ID", "");
      return '<span style="font-weight:800;color:'+col+';margin-right:10px">'+mark+' '+esc(lab)+(i.pct != null ? (" "+i.pct+"%") : "")+'</span>';
    }).join("");
    var stLabel = comp.status === "passed" ? "Ready" : (comp.status === "started" ? "In progress" : "Not started");
    var stCol = comp.status === "passed" ? "#1d7a45" : (comp.status === "started" ? "#b8860b" : "#7a8494");
    var posLabel = positions.join(" + ");
    return '<div style="background:#eef5fc;border:1px solid #cfe0f3;border-radius:12px;padding:12px;margin:10px 0">'
      +'<div style="font-size:11px;font-weight:800;color:#5b626e;text-transform:uppercase;letter-spacing:.04em">Your week test · '+esc(posLabel)+'</div>'
      +'<div style="margin-top:6px">'+chips+'</div>'
      +'<div style="margin-top:8px;font-size:13px"><b style="color:'+stCol+'">'+esc(stLabel)+'</b>'
      +' · '+comp.passed+'/'+comp.assigned+' passed'
      +(spec.incomplete ? ' <span class="foot" style="color:#b8860b"> · some drills need coach keys</span>' : "")
      +'</div>'
      +'<p class="foot" style="margin:8px 0 0"><a href="OFFGRD-QB.html" style="font-weight:800">Open Testing →</a></p>'
      +'</div>';
  }

  function renderPlayerNoteHtml(wp, pos){
    var g = wp.gen;
    if(!g) return "";
    var isDef = isDefPos(pos);
    var src = (isDef && g.defense) ? g.defense : g;
    var posMap = (isDef && g.defense && g.defense.positions) ? g.defense.positions : (g.positions || {});
    var posNote = pos && posMap[pos] ? posMap[pos] : null;
    /* Also try raw roster codes if positions keyed that way */
    if(!posNote && posMap){
      Object.keys(posMap).forEach(function(k){
        var AT = window.OFFGRD_WEEK_AUTOTEST;
        var nk = AT && AT.normPos ? AT.normPos(k) : String(k).toUpperCase();
        if(nk === pos && posMap[k]) posNote = posMap[k];
      });
    }
    var h = "";
    if(posNote){
      h += '<div style="margin-top:12px"><div class="lbl">Your job this week</div>'
        +'<div style="background:#eef5fc;border:1px solid #cfe0f3;border-radius:10px;padding:10px 12px;font-size:14px;line-height:1.5">'
        +esc(posNote)+'</div></div>';
    }
    if(Array.isArray(src.keys) && src.keys.length){
      h += '<div style="margin-top:12px"><div class="lbl">Keys</div>';
      src.keys.slice(0, 4).forEach(function(k, i){
        h += '<div style="font-weight:700;font-size:14px;margin:2px 0">'+(i+1)+'. '+esc(k)+'</div>';
      });
      h += '</div>';
    }
    return h;
  }

  function renderPosTeachingHtml(wp, pos, unique){
    var g = wp.gen || {};
    var h = "";
    if(pos === "QB" || pos === "RB" || pos === "LB" || pos === "DB"){
      var covs = coverageList(wp);
      if(covs.length){
        h += '<div style="margin-top:12px"><div class="lbl">'+(isDefPos(pos) ? "Coverages to play" : "Coverages they show")+'</div>'
          +'<p style="margin:4px 0 0;font-size:14px;font-weight:700">'+covs.map(function(c){ return esc(c); }).join(" · ")+'</p></div>';
      }
    }
    if(isOlPos(pos)){
      var fronts = frontList(wp);
      if(fronts.length){
        h += '<div style="margin-top:12px"><div class="lbl">Fronts this week</div>'
          +'<p style="margin:4px 0 0;font-size:14px;font-weight:700">'+fronts.map(function(c){ return esc(c); }).join(" · ")+'</p></div>';
      }
      if(g.ol && typeof g.ol === "object" && Object.keys(g.ol).length){
        h += '<div style="margin-top:12px"><div class="lbl">Your protections</div>';
        Object.keys(g.ol).forEach(function(nm){
          var o = g.ol[nm] || {};
          h += '<div style="font-size:13px;margin:4px 0"><b>'+esc(nm)+(o.front ? (" vs "+esc(o.front)) : "")+'</b> — '+esc(o.why || "")
            +(o.coaching ? ' <span class="foot">'+esc(o.coaching)+'</span>' : "")+'</div>';
        });
        h += '</div>';
      }
    }
    if(pos === "QB" && g.plays && typeof g.plays === "object"){
      var mine = playsForPos(unique, pos, g);
      var shown = 0;
      h += '<div style="margin-top:12px"><div class="lbl">Your reads / why these calls</div>';
      mine.forEach(function(u){
        var p = g.plays[u.name];
        if(!p) return;
        shown++;
        h += '<div style="font-size:13px;margin:4px 0"><b>'+esc(u.name)+'</b> — '+esc(p.why || "")
          +(p.coaching ? ' <span class="foot">'+esc(p.coaching)+'</span>' : "")+'</div>';
      });
      if(!shown) h += '<p class="foot">Open Testing for coverage ID + reads drills.</p>';
      h += '</div>';
    }
    if((pos === "WR" || pos === "TE" || pos === "RB" || pos === "FB") && g.plays && typeof g.plays === "object"){
      var skill = playsForPos(unique, pos, g);
      var n = 0;
      h += '<div style="margin-top:12px"><div class="lbl">Concepts you\'re in</div>';
      skill.forEach(function(u){
        var p = g.plays[u.name];
        if(!p) return;
        n++;
        h += '<div style="font-size:13px;margin:4px 0"><b>'+esc(u.name)+'</b> — '+esc(p.why || p.coaching || "Run your route; know the concept.")+'</div>';
      });
      if(!n) h += '<p class="foot">See Plays to know below, then drill routes in Testing.</p>';
      h += '</div>';
    }
    if(isDefPos(pos)){
      var d = g.defense || {};
      if(d.situations && typeof d.situations === "object"){
        var sitKeys = Object.keys(d.situations).slice(0, 4);
        if(sitKeys.length){
          h += '<div style="margin-top:12px"><div class="lbl">Situation answers</div>';
          sitKeys.forEach(function(nm){
            if(d.situations[nm]) h += '<div style="font-size:13px;margin:4px 0"><b>'+esc(nm)+'</b> — '+esc(d.situations[nm])+'</div>';
          });
          h += '</div>';
        }
      }
    }
    return h;
  }

  function renderPlaysToKnowHtml(unique, positions){
    positions = positions || [];
    if(!positions.length || positions.every(isDefPos)) return "";
    if(!unique || !unique.length) return "";
    var h = '<div style="margin-top:12px"><div class="lbl">Plays to know</div><ul style="margin:6px 0 0;padding-left:18px">';
    unique.forEach(function(u){
      var tag = u.situations && u.situations.length
        ? (' <span class="foot">· '+esc(u.situations.slice(0, 3).join(", "))+(u.situations.length > 3 ? "…" : "")+'</span>')
        : "";
      h += '<li><b>'+esc(u.name)+'</b>'+tag+'</li>';
    });
    h += '</ul><p class="foot" style="margin:6px 0 0">'+unique.length+' unique play'+(unique.length === 1 ? "" : "s")+'</p></div>';
    return h;
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
      var positions = await resolvePlayerPositions();
      var uid = null, tid = null;
      try{
        if(window.Cloud && Cloud.ready){
          var u = await Cloud.user();
          uid = u && u.id;
          try{ tid = localStorage.getItem("offgrd_team"); }catch(e){}
          if(!tid){
            var teams = await Cloud.myTeams();
            tid = teams && teams[0] && teams[0].id;
          }
        }
      }catch(e){}
      var rows = await loadMyQuizRows(tid, uid);

      var allUnique = uniquePlaysFromBuckets(wp.buckets);
      var myPlays = playsForPositions(allUnique, positions, wp.gen);
      var posLabel = positions.join(" + ");

      var h = '<div class="panel"><h3 style="margin:0 0 4px;color:#13294B">This Week · '+esc(wp.opponent||"Opponent")+'</h3>';
      if(wp.game_date) h += '<p class="foot" style="margin:0 0 4px">Gameday: <b>'+esc(wp.game_date)+'</b>'+(posLabel ? (' · <b>'+esc(posLabel)+'</b>') : "")+'</p>';
      else if(posLabel) h += '<p class="foot" style="margin:0 0 4px">Your position(s): <b>'+esc(posLabel)+'</b></p>';

      h += renderAssignedStripHtml(wp, positions, rows);

      if(wp.gen){
        positions.forEach(function(pos){
          h += renderPlayerNoteHtml(wp, pos);
          h += renderPosTeachingHtml(wp, pos, allUnique);
        });
        if(!positions.length) h += renderPlayerNoteHtml(wp, "");
      }

      if(wp.buckets && wp.buckets.length){
        h += renderPlaysToKnowHtml(myPlays, positions);
      }

      if(wp.practice && wp.practice.periods){
        h += '<div style="margin-top:12px"><div class="lbl">Practice</div><p class="foot">'+wp.practice.periods.length+' period(s) — see the <b>Practice</b> tab for your reps.</p></div>';
      }

      if(!positions.length){
        h += '<p class="foot" style="margin-top:12px">Set your position in <a href="OFFGRD-QB.html" style="font-weight:800">Testing</a> so this page can tailor to your job.</p>';
      }
      h += '<p class="foot" style="margin-top:14px">Built for your position. Scout cards + playbook are view-only; authoring stays with coaches.</p></div>';
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

  function openPlayerScoutCards(){
    if(!(window.OFFGRD_SCOUTCARDS && OFFGRD_SCOUTCARDS.isScoutcards && OFFGRD_SCOUTCARDS.isScoutcards())){
      alert("Scout cards are off for this program.");
      return;
    }
    function open(lib){
      OFFGRD_SCOUTCARDS.openModal({
        installLib: Array.isArray(lib) ? lib : [],
        games: [],
        format: "install",
        viewOnly: true,
        onMsg: function(t){ try{ console.warn("[scout]", t); }catch(e){} }
      });
    }
    var lib = [];
    try{ lib = JSON.parse(localStorage.getItem("offgrd_playbook_v1") || "[]"); }catch(e){}
    if(lib && lib.length){ open(lib); return; }
    if(window.Cloud && Cloud.ready && Cloud.listPlays){
      Cloud.myTeams().then(function(teams){
        var tid = null;
        try{ tid = localStorage.getItem("offgrd_team"); }catch(e){}
        var team = (teams || []).find(function(t){ return t.id === tid; }) || (teams && teams[0]);
        if(!team){ open([]); return; }
        return Cloud.listPlays(team.id).then(function(plays){ open(plays || []); });
      }).catch(function(){ open([]); });
      return;
    }
    open([]);
  }

  function applyScoutPlayerUI(){
    if(!isPlayer()) return;
    ensurePlayerViews();
    patchSetView();
    /* Keep scout cards viewable for players; hide coach-only tools */
    hideIds(["importBtn","manageBtn","schedBtn","brandBtn","tendencyBtn"]);
    var scBtn = document.getElementById("scoutCardsBtn");
    if(scBtn){
      scBtn.style.display = "";
      scBtn.onclick = function(ev){ if(ev) ev.preventDefault(); openPlayerScoutCards(); };
    }
    var tools = document.getElementById("tools");
    if(tools){
      /* Playbook is now viewable for players — keep the link */
      [].forEach.call(tools.querySelectorAll('a[href="OFFGRD-Playbook.html"]'), function(a){
        a.style.display = "";
        a.title = "View playbook (read-only)";
      });
    }
    var nv = document.getElementById("navbar");
    if(nv){
      nv.innerHTML =
        '<button class="on" data-view="thisweek" onclick="setView(\'thisweek\')">This Week</button>'+
        '<button data-view="practice" onclick="setView(\'practice\')">Practice</button>'+
        '<a class="ghost" href="OFFGRD-QB.html" style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center;font-weight:800;padding:9px 16px;border-radius:10px;border:1px solid var(--line)">Testing</a>'+
        '<a class="ghost" href="OFFGRD-Playbook.html" style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center;font-weight:800;padding:9px 16px;border-radius:10px;border:1px solid var(--line)">Playbook</a>'+
        '<button type="button" id="playerScoutCardsNav" style="font-weight:800;padding:9px 16px;border-radius:10px;border:1px solid var(--line);background:#fff;cursor:pointer">Scout cards</button>'+
        '<button data-view="recruiting" onclick="setView(\'recruiting\')">Recruiting</button>';
      var psc = document.getElementById("playerScoutCardsNav");
      if(psc) psc.onclick = openPlayerScoutCards;
    }
    ["scout","plan","caller","report"].forEach(function(id){
      var el = document.getElementById("view-" + id);
      if(el) el.style.display = "none";
    });
    if(window.setView) window.setView("thisweek");
  }

  function applyPlaybookPlayerUI(){
    if(!isPlayer()) return;
    window.OFFGRD_PLAYER_READONLY = true;
    document.documentElement.classList.add("offgrd-player-ro");
    if(!document.getElementById("offgrdPlayerRoCss")){
      var st = document.createElement("style");
      st.id = "offgrdPlayerRoCss";
      st.textContent = [
        "html.offgrd-player-ro #routePanel,",
        "html.offgrd-player-ro #asnPanel,",
        "html.offgrd-player-ro .panel[data-sec='Offense'],",
        "html.offgrd-player-ro .panel[data-sec='Defense'],",
        "html.offgrd-player-ro #wizBtn,",
        "html.offgrd-player-ro #saveBtn,",
        "html.offgrd-player-ro #newBtn,",
        "html.offgrd-player-ro #exportLib,",
        "html.offgrd-player-ro #importLib,",
        "html.offgrd-player-ro #installBtn,",
        "html.offgrd-player-ro #telestrateBtn,",
        "html.offgrd-player-ro #clearRoutes,",
        "html.offgrd-player-ro #clearAll,",
        "html.offgrd-player-ro #addWR,",
        "html.offgrd-player-ro #imgBtn,",
        "html.offgrd-player-ro #selPanel,",
        "html.offgrd-player-ro #undoBtn,",
        "html.offgrd-player-ro #redoBtn,",
        "html.offgrd-player-ro #undoBtn2,",
        "html.offgrd-player-ro #redoBtn2,",
        "html.offgrd-player-ro .modebar,",
        "html.offgrd-player-ro button[data-act='dup'],",
        "html.offgrd-player-ro button[data-act='del']{display:none!important}",
        "html.offgrd-player-ro #field{pointer-events:none}",
        "html.offgrd-player-ro #playerRoBanner{display:block}"
      ].join("");
      document.head.appendChild(st);
    }
    var field = document.getElementById("field");
    if(field) field.style.pointerEvents = "none";
    var banner = document.getElementById("playerRoBanner");
    if(!banner){
      banner = document.createElement("div");
      banner.id = "playerRoBanner";
      banner.style.cssText = "background:#eef5fc;border:1px solid #cfe0f3;border-radius:10px;padding:10px 12px;margin:0 0 12px;font-size:13px;color:#111827;font-weight:700";
      banner.textContent = "View only — open any play to study it. Drawing and saving stay with coaches.";
      var wrap = document.querySelector(".wrap") || document.body;
      if(wrap.firstChild) wrap.insertBefore(banner, wrap.firstChild);
      else wrap.appendChild(banner);
    }
    function blockAuthor(fnName, label){
      if(typeof window[fnName] !== "function" || window[fnName]._playerRo) return;
      window[fnName] = function(){
        if(typeof msg === "function") msg("View only — " + label);
        else alert("View only — " + label);
      };
      window[fnName]._playerRo = true;
    }
    blockAuthor("savePlay", "coaches save plays.");
    blockAuthor("delPlayId", "coaches delete plays.");
    blockAuthor("delPlay", "coaches delete plays.");
    blockAuthor("dupPlayId", "coaches duplicate plays.");
    blockAuthor("dupPlay", "coaches duplicate plays.");
    try{ if(typeof dismissStarterPrompt === "function") dismissStarterPrompt(); }catch(e){}
    var scBtn = document.getElementById("scoutCardsBtn");
    if(scBtn){
      scBtn.style.display = "";
      scBtn.onclick = function(){
        if(!(window.OFFGRD_SCOUTCARDS && OFFGRD_SCOUTCARDS.isScoutcards())) return;
        var lib = (typeof LIB !== "undefined" && Array.isArray(LIB)) ? LIB : [];
        OFFGRD_SCOUTCARDS.openModal({ installLib: lib, games: [], format: "install", viewOnly: true, onMsg: (typeof msg === "function" ? msg : function(){}) });
      };
    }
  }

  function applyPlaybookGate(){
    if(isPlayer()) applyPlaybookPlayerUI();
  }

  function applyQbPlayerUI(){
    if(!isPlayer()) return;
    var tb = document.querySelector(".topbar");
    if(tb){
      /* Keep Playbook link — players get full view access */
      [].forEach.call(tb.querySelectorAll('a[href="OFFGRD-Playbook.html"]'), function(a){
        a.style.display = "";
        a.title = "View playbook (read-only)";
      });
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
