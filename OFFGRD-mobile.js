/* OFFGRD mobile layer — collapsible sections + phone-friendly controls.
   Plain script (no module). Desktop is untouched: the accordion headers only
   appear at <=820px; above that, every section renders exactly as before. */
(function(){
  var MQ = "(max-width:820px)";

  /* ---------- responsive CSS (safe on desktop; scoped to the breakpoint) ---------- */
  var css = document.createElement("style");
  css.textContent = [
    ".acc-head{display:none}",                 /* hidden on desktop */
    "#appnav{display:none}",                   /* app switcher: phones only */
    "@media "+MQ+"{",
      "body{-webkit-text-size-adjust:100%}",
      /* stop sideways scroll and let grid/flex children shrink */
      "html,body{overflow-x:hidden;max-width:100%}",
      "*{box-sizing:border-box}",
      /* stack every multi-column grid */
      ".grid{grid-template-columns:1fr!important;gap:10px!important}",
      ".repcols{grid-template-columns:1fr!important}",
      ".meta{grid-template-columns:1fr 1fr!important}",
      ".grid>*,.row>*,.meta>*,.meta label{min-width:0}",
      ".meta label{display:flex;flex-direction:column}",
      "input,select,textarea{max-width:100%}",
      ".meta input,.meta select{width:100%}",
      "textarea{width:100%!important;min-width:0!important}",
      /* dense button toolbars become swipeable strips instead of exploding vertically */
      ".seg,.presetrow,.modebar,#conceptBar,#blockBar{flex-wrap:nowrap!important;overflow-x:auto!important;-webkit-overflow-scrolling:touch;padding-bottom:4px;scrollbar-width:thin}",
      ".seg::-webkit-scrollbar,.presetrow::-webkit-scrollbar,.modebar::-webkit-scrollbar{height:5px}",
      ".seg button,.presetrow .preset,.modebar .btn{flex:0 0 auto;white-space:nowrap}",
      /* comfortable tap targets */
      ".btn,.preset,.seg button,select{min-height:40px}",
      "select,.gamepick select{max-width:100%;width:100%}",
      ".gamepick{width:100%}",
      /* the play field scales to the screen */
      "#field{width:100%;height:auto}",
      /* account bar wraps under the title instead of overflowing */
      "#acct{margin-left:0!important;flex-basis:100%;margin-top:6px;display:flex;flex-wrap:wrap;gap:6px}",
      ".topbar{flex-wrap:wrap}",
      /* tighten page padding */
      ".wrap,main,body>.container{padding-left:10px!important;padding-right:10px!important}",
      /* accordion */
      ".acc-head{display:flex;align-items:center;gap:8px;width:100%;cursor:pointer;",
        "background:var(--panel,#fff);border:0;border-bottom:1px solid var(--line,#e2e5ea);",
        "margin:-14px -16px 12px;padding:13px 16px;border-radius:12px 12px 0 0;",
        "font-weight:900;font-size:15px;color:var(--accent2,var(--navy,#13294B));text-align:left}",
      /* phone app switcher (injected on Playbook / QB pages) */
      "#appnav{position:fixed;left:0;right:0;bottom:0;z-index:60;display:flex;gap:4px;",
        "background:var(--panel,#fff);border-top:1px solid var(--line,#e2e5ea);",
        "padding:6px 8px calc(6px + env(safe-area-inset-bottom))}",
      "#appnav a{flex:1;text-align:center;text-decoration:none;color:var(--ink,#16181d);font-weight:800;",
        "font-size:13.5px;min-height:48px;display:flex;align-items:center;justify-content:center;border-radius:10px}",
      "#appnav a.on{background:var(--accent,var(--carolina,#4B9CD3));color:#fff}",
      "body.has-appnav{padding-bottom:calc(72px + env(safe-area-inset-bottom))}",
      ".acc-head .chev{margin-left:auto;transition:transform .18s ease;font-size:13px;color:#7BAFD4}",
      ".panel.collapsed .acc-head{margin-bottom:-14px;border-bottom:0;border-radius:12px}",
      ".panel.collapsed .acc-head .chev{transform:rotate(-90deg)}",
      ".panel.collapsed .acc-body{display:none}",
    "}"
  ].join("");
  document.head.appendChild(css);

  var mq = window.matchMedia(MQ);

  /* ---------- section titles by signature ---------- */
  function titleFor(panel){
    if(panel.dataset.sec) return panel.dataset.sec;
    var q = function(s){return panel.querySelector(s);};
    // Scout (static)
    if(q("#seg-scoutmode")) return "Scout mode & opponent";
    if(q("#seg-down")||q("[data-preset]")) return "Situation & filters";
    // Playbook
    if(q("#formSel")) return "Setup & tools";
    if(panel.id==="routePanel") return "Routes · concepts · blocks";
    if(q("#m-name")) return "Play info · save · export";
    if(q("#playList")) return "Your playbook";
    // generic: first label / bold / heading
    var h = panel.querySelector(".lbl, h1,h2,h3,h4, b");
    if(h){ var t=(h.textContent||"").trim(); if(t && t.length<=42) return t; }
    return null;
  }

  function skip(panel){
    if(panel.dataset.accDone) return true;
    if(panel.dataset.accSkip!=null) return true;           // opted out (e.g. game-night caller panels)
    if(panel.classList.contains("result")) return true;   // prediction output stays open
    if(panel.querySelector("#field")) return true;         // the play field stays open
    if(panel.querySelector("summary")) return true;        // native <details> already collapses
    return false;
  }

  function keyFor(title){ return "offgrd_sec_"+title.toLowerCase().replace(/[^a-z0-9]+/g,"_"); }

  function enhance(panel){
    if(skip(panel)) return;
    var title = titleFor(panel);
    if(!title){ panel.dataset.accDone="1"; return; }
    panel.dataset.accDone="1";

    var body = document.createElement("div");
    body.className = "acc-body";
    while(panel.firstChild) body.appendChild(panel.firstChild);

    var head = document.createElement("button");
    head.type = "button";
    head.className = "acc-head";
    head.innerHTML = '<span>'+title+'</span><span class="chev">▼</span>';
    panel.appendChild(head);
    panel.appendChild(body);

    var k = keyFor(title);
    var saved = null; try{ saved = localStorage.getItem(k); }catch(e){}
    if(saved==="open") panel.classList.remove("collapsed");
    else panel.classList.add("collapsed");

    head.addEventListener("click", function(){
      var nowCollapsed = panel.classList.toggle("collapsed");
      try{ localStorage.setItem(k, nowCollapsed ? "closed" : "open"); }catch(e){}
    });
  }

  function pass(){
    if(!mq.matches) return;                 // only build the accordion on phones
    var panels = document.querySelectorAll(".panel:not([data-acc-done])");
    for(var i=0;i<panels.length;i++) enhance(panels[i]);
  }

  /* ---------- phone app switcher (Playbook / QB pages; Scout has its own tabs) ---------- */
  function appnav(){
    if(!mq.matches) return;
    if(document.getElementById("navbar") || document.getElementById("appnav")) return;
    if(!(window.OFFGRD_APP && window.OFFGRD_APP.kind)) return;
    var k=window.OFFGRD_APP.kind;
    var el=document.createElement("div");
    el.id="appnav"; el.className="no-print";
    el.innerHTML=
      '<a href="OFFGRD.html">Scout</a>'+
      '<a href="OFFGRD-Playbook.html"'+(k==="playbook"?' class="on"':'')+'>Playbook</a>'+
      '<a href="OFFGRD-QB.html"'+(k==="qb"?' class="on"':'')+'>Reps</a>';
    document.body.appendChild(el);
    document.body.classList.add("has-appnav");
  }

  function start(){
    pass();
    appnav();
    var obs = new MutationObserver(function(muts){
      for(var m=0;m<muts.length;m++){
        for(var n=0;n<muts[m].addedNodes.length;n++){
          var nd = muts[m].addedNodes[n];
          if(nd.nodeType===1 && ((nd.classList&&nd.classList.contains("panel")) || (nd.querySelector&&nd.querySelector(".panel:not([data-acc-done])")))){
            pass(); return;
          }
        }
      }
    });
    obs.observe(document.body, {childList:true, subtree:true});
    var onmq=function(){ pass(); appnav(); };
    if(mq.addEventListener) mq.addEventListener("change", onmq);
    else if(mq.addListener) mq.addListener(onmq);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
