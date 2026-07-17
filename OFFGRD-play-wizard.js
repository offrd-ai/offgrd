/* ============================================================
   OFFGRD-play-wizard.js — Guided play / defense builder
   Orchestration only: mutates Playbook STATE via host hooks.
   Skill pref: localStorage.offgrd_build_skill = guided|expert
   ============================================================ */
(function (root) {
  "use strict";

  const SKILL_KEY = "offgrd_build_skill";
  const DEF_CALLS_KEY = "offgrd_pb_def_calls_v1";

  const OFF_TEMPLATES = [
    { name: "2x2 Smash", formation: "2x2 Doubles (Gun)", personnel: "10", concept: "Smash", protection: "Slide R", family: "Smash", series: "Dropback" },
    { name: "2x2 Mesh", formation: "2x2 Doubles (Gun)", personnel: "10", concept: "Mesh", protection: "BOB", family: "Mesh", series: "Dropback" },
    { name: "2x2 Four Verts", formation: "2x2 Doubles (Gun)", personnel: "10", concept: "Four Verts", protection: "Slide R", family: "Verts", series: "Dropback" },
    { name: "2x2 Curl-Flat", formation: "2x2 Doubles (Gun)", personnel: "10", concept: "Curl-Flat", protection: "BOB", family: "Curl", series: "Dropback" },
    { name: "Trips Stick", formation: "Trips Rt (Gun)", personnel: "10", concept: "Stick", protection: "BOB", family: "Quick Game", series: "Quick" },
    { name: "Trips Flood", formation: "Trips Rt (Gun)", personnel: "10", concept: "Flood", protection: "Slide L", family: "Flood", series: "Dropback" },
    { name: "Empty Four Verts", formation: "Empty 3x2 (Gun)", personnel: "00", concept: "Four Verts", protection: "BOB", family: "Verts", series: "Dropback" }
  ];

  const DEF_TEMPLATES = [
    { name: "Nickel · Cover 3 · Nickel Fire", front: "Nickel", cov: "Cover 3", pressure: "nickel-fire" },
    { name: "4-2-5 · Cover 1", front: "4-2-5", cov: "Cover 1", pressure: "none" },
    { name: "4-3 · Cover 3", front: "4-3", cov: "Cover 3", pressure: "none" },
    { name: "3-3-5 · Cover 4", front: "3-3-5 (Tite)", cov: "Cover 4", pressure: "none" },
    { name: "Nickel · Cover 0 · Mike A", front: "Nickel", cov: "Cover 0", pressure: "mike-a" }
  ];

  const ALIGN_FAMS = ["2x2", "3x1", "empty", "bunch"];
  const MOTION_RULES = ["bump", "spin", "lock", "check"];
  const PRESSURES = [
    { id: "none", name: "No pressure" },
    { id: "mike-a", name: "Mike A-gap" },
    { id: "de-loop", name: "DE Loop" },
    { id: "will-cross", name: "Will Cross-Dog" },
    { id: "dt-twist", name: "DT Twist" },
    { id: "nickel-fire", name: "Nickel Fire" }
  ];
  const MOTIONS = [
    { id: "jet", name: "Jet / Fly", type: "jet" },
    { id: "orbit", name: "Orbit", type: "orbit" },
    { id: "across", name: "Across / Zip", type: "across" },
    { id: "shift", name: "Shift strength", type: "shift" },
    { id: "tight-slot", name: "Tight → Slot", type: "tight-to-slot" }
  ];
  const PROTS = ["none", "BOB", "Slide R", "Slide L", "Half-Slide R", "Half-Slide L", "6-Man (RB)"];
  const FRONTS = ["4-3", "3-4", "4-2-5", "Nickel", "Bear (46)", "3-3-5 (Tite)", "Dime (4-1-6)"];
  const COVS = ["Cover 0", "Cover 1", "2-Man", "Cover 2", "Cover 3", "Cover 4", "Cover 6", "Tampa 2"];

  let H = null; /* host hooks */
  let WZ = null;
  let skill = "guided";

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function defaultSkill() {
    const saved = lsGet(SKILL_KEY);
    if (saved === "guided" || saved === "expert") return saved;
    /* Anyone who already built plays → Expert; brand-new → Guided */
    try {
      if (H && typeof H.libCount === "function" && H.libCount() > 0) return "expert";
    } catch (e) {}
    return "guided";
  }

  function getSkill() { return skill; }

  function setSkill(next, opts) {
    opts = opts || {};
    if (next !== "guided" && next !== "expert") return skill;
    skill = next;
    lsSet(SKILL_KEY, skill);
    try {
      if (H && H.onSkillChange) H.onSkillChange(skill);
    } catch (e) {}
    document.body.classList.toggle("skill-guided", skill === "guided");
    document.body.classList.toggle("skill-expert", skill === "expert");
    const g = document.getElementById("skillGuided");
    const e = document.getElementById("skillExpert");
    if (g) g.classList.toggle("on", skill === "guided");
    if (e) e.classList.toggle("on", skill === "expert");
    const dock = document.getElementById("wizDock");
    if (dock) {
      if (skill === "guided") {
        dock.style.display = "";
        if (!WZ) open({ quiet: true });
        else render();
      } else {
        if (!opts.keepOpen) {
          WZ = null;
          dock.style.display = "none";
        }
      }
    }
    return skill;
  }

  function chips(items, current, onpick) {
    const w = document.createElement("div");
    w.className = "row";
    w.style.flexWrap = "wrap";
    items.forEach(function (it) {
      const v = Array.isArray(it) ? it[0] : it;
      const lbl = Array.isArray(it) ? it[1] : it;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn" + (current === v ? " go" : "");
      b.style.minWidth = "70px";
      b.textContent = lbl;
      b.onclick = function () { onpick(v); };
      w.appendChild(b);
    });
    return w;
  }

  function note(host, html) {
    const p = document.createElement("p");
    p.className = "hint";
    p.style.margin = "0 0 10px";
    p.innerHTML = html;
    host.appendChild(p);
  }

  function eligibles() {
    const st = H.getState();
    if (!st) return [];
    return (st.players || []).filter(function (p) {
      return p && !p.ol && p.type !== "qb" && (p.type === "route" || p.type === "rb" || p.type === "block");
    });
  }

  function routeNames() {
    return H.routeNames ? H.routeNames() : ["Hitch", "Slant", "Curl", "Out", "Dig", "Corner", "Post", "Go", "Flat", "Drag", "Stick", "Seam", "Screen"];
  }

  function formations() {
    return H.formations ? H.formations() : ["2x2 Doubles (Gun)", "Trips Rt (Gun)", "Empty 3x2 (Gun)"];
  }

  function personnelCodes() {
    return H.personnelCodes ? H.personnelCodes() : ["00", "10", "11", "12", "20"];
  }

  function concepts() {
    return H.concepts ? H.concepts() : ["Four Verts", "Smash", "Mesh", "Flood", "Stick", "Curl-Flat"];
  }

  function callName() {
    const bits = [WZ.front, WZ.cov];
    const p = PRESSURES.find(function (x) { return x.id === WZ.pressure; });
    if (p && p.id !== "none") bits.push(p.name);
    return bits.filter(Boolean).join(" ");
  }

  function applyPressureHeuristic() {
    const st = H.getState();
    if (!st || !st.defs || !st.defs.length) return;
    const id = WZ.pressure || "none";
    st.defs.forEach(function (d) {
      if (d.role === "rush") { d.role = null; d.route = []; }
    });
    if (id === "none") return;
    let target = null;
    if (id === "mike-a" || id === "nickel-fire") {
      target = st.defs.find(function (d) { return /^(M|MIKE|N|NB)$/i.test(d.lab || ""); })
        || st.defs.find(function (d) { return d.group === "LB"; });
    } else if (id === "will-cross") {
      target = st.defs.find(function (d) { return /^(W|WILL)$/i.test(d.lab || ""); })
        || st.defs.find(function (d) { return d.group === "LB"; });
    } else if (id === "de-loop") {
      target = st.defs.find(function (d) { return /^(RE|LE|DE)$/i.test(d.lab || ""); })
        || st.defs.find(function (d) { return d.group === "DL"; });
    } else if (id === "dt-twist") {
      target = st.defs.find(function (d) { return /^(NT|DT|T)$/i.test(d.lab || ""); })
        || st.defs.find(function (d) { return d.group === "DL"; });
    }
    if (!target) target = st.defs[Math.floor(st.defs.length / 2)];
    if (!target) return;
    target.role = "rush";
    const los = 380;
    target.route = [
      { x: target.x + (target.x < 500 ? 18 : -18), y: Math.min(target.y + 40, los + 20), cx: null, cy: null },
      { x: target.x + (target.x < 500 ? 8 : -8), y: los - 8, cx: null, cy: null }
    ];
  }

  function snapshotAlignFamily(fam) {
    const st = H.getState();
    if (!st || !st.defs) return;
    WZ.align_by_family = WZ.align_by_family || {};
    const map = {};
    st.defs.forEach(function (d, i) {
      map[i] = { x: d.x, y: d.y, leverage: "head-up", depth: d.group === "DB" ? (d.y < 280 ? 12 : 7) : 7 };
    });
    WZ.align_by_family[fam] = map;
  }

  function seedMotionRule(cov, type) {
    if (cov === "Cover 0" || cov === "Cover 1" || cov === "2-Man") return "lock";
    if (type === "jet" || type === "across") return "bump";
    if (type === "orbit") return "spin";
    return "check";
  }

  function buildDefCall() {
    const st = H.getState();
    const defs = (st && st.defs) ? JSON.parse(JSON.stringify(st.defs)) : [];
    const assigns = {};
    const stunt = {};
    defs.forEach(function (d, i) {
      assigns[i] = {
        resp: d.role === "rush" ? "Rush A-gap" : (d.group === "DB" || d.group === "LB" ? "Zone drop" : "Rush A-gap"),
        align: { x: d.x, y: d.y },
        move: (d.route && d.route.length) ? { path: JSON.parse(JSON.stringify(d.route)), kind: d.role === "rush" ? "rush" : "drop" } : null
      };
      if (d.role === "rush" && d.route && d.route.length) stunt[i] = JSON.parse(JSON.stringify(d.route));
    });
    const motion = MOTIONS.find(function (m) { return m.id === WZ.motionId; });
    const adjusters = { motion: Object.assign({ default: WZ.motionRule || "bump" }, WZ.adjusters && WZ.adjusters.motion || {}) };
    if (motion) adjusters.motion[motion.type] = WZ.motionRule || seedMotionRule(WZ.cov, motion.type);
    return {
      id: "call-" + Date.now(),
      name: WZ.name || callName(),
      front: WZ.front,
      coverage: WZ.cov,
      pressure: WZ.pressure || "none",
      note: "",
      defs: defs.map(function (d) { return { lab: d.lab, x: d.x, y: d.y, color: d.color, pos: d.pos || d.lab, group: d.group }; }),
      stunt: stunt,
      assigns: assigns,
      align_by_family: WZ.align_by_family || {},
      adjusters: adjusters,
      v: 2
    };
  }

  function seedOffenseReview() {
    const st = H.getState();
    const AD = root.OFFGRD_AUTODERIVE;
    let reads = null, ol = null;
    if (AD) {
      try { reads = AD.deriveReads(st, { playName: WZ.name || st.name }); } catch (e) {}
      try { ol = AD.deriveOlKeys(st); } catch (e) {}
    }
    const hasRoutes = (st.players || []).some(function (p) { return p && ((p.route && p.route.length) || p.rname); });
    const hasProt = !!(st.protection && st.protection !== "none");
    return [
      { k: "reads", label: "QB reads", ok: !!(reads && reads.reads && Object.keys(reads.reads).length), data: reads, hint: "Progression vs Cover 0–4 from routes" },
      { k: "protect", label: "OL keys / protection", ok: !!(ol && ol.keys && Object.keys(ol.keys).length) || hasProt, data: ol, hint: st.protection || "Set protection" },
      { k: "routes", label: "Receiver routes", ok: hasRoutes, data: null, hint: hasRoutes ? "Routes drawn" : "Assign routes first" },
      { k: "coverage", label: "Coverage ID (vs look)", ok: !!(st.coverage && st.coverage !== "none"), data: st.coverage, hint: st.coverage && st.coverage !== "none" ? st.coverage : "Optional — place a defense to ID vs" }
    ];
  }

  function seedDefenseReview() {
    const call = buildDefCall();
    const hasAlign = Object.keys(call.align_by_family || {}).length > 0 || (call.defs && call.defs.length);
    const hasBlitz = call.pressure && call.pressure !== "none" || Object.keys(call.stunt || {}).length;
    const hasMotion = !!(call.adjusters && call.adjusters.motion && Object.keys(call.adjusters.motion).length > 1);
    return [
      { k: "align", label: "Alignment (per family)", ok: hasAlign, data: call.align_by_family, hint: hasAlign ? Object.keys(call.align_by_family).join(", ") || "base look" : "Confirm a family align" },
      { k: "coverage", label: "Coverage-as-defender", ok: !!(call.coverage && call.coverage !== "none"), data: call.coverage, hint: call.coverage || "Pick coverage" },
      { k: "blitz", label: "Blitz / pressure", ok: !!hasBlitz || call.pressure === "none", data: call.pressure, hint: call.pressure === "none" ? "No pressure (ok)" : (PRESSURES.find(function (p) { return p.id === call.pressure; }) || {}).name || call.pressure },
      { k: "motion", label: "Motion adjust", ok: hasMotion || !!WZ.motionId, data: call.adjusters, hint: WZ.motionId ? (WZ.motionId + " → " + (WZ.motionRule || "bump")) : "Optional — skip if none" }
    ];
  }

  function confirmTests() {
    const st = H.getState();
    if (!st) return;
    if (WZ.track === "offense") {
      const rows = seedOffenseReview();
      const readsRow = rows.find(function (r) { return r.k === "reads"; });
      const olRow = rows.find(function (r) { return r.k === "protect"; });
      if (readsRow && readsRow.data) {
        st.qb_reads = readsRow.data.reads || readsRow.data;
        if (readsRow.data.concept) st.concept = readsRow.data.concept;
        if (readsRow.data.prog) st.qb_prog = readsRow.data.prog;
      }
      if (olRow && olRow.data) st.ol_keys = olRow.data;
      else if (st.protection) st.ol_keys = st.ol_keys || { keys: {}, protection: st.protection };
      st.test_seeded = true;
      WZ.confirmed = true;
      H.msg("Tests confirmed — save the play to lock answer keys.");
    } else {
      const call = buildDefCall();
      st.def_call = call;
      st.front = call.front;
      st.coverage = call.coverage;
      st.test_seeded = true;
      WZ.confirmed = true;
      try {
        const raw = lsGet(DEF_CALLS_KEY);
        const list = raw ? JSON.parse(raw) : [];
        const arr = Array.isArray(list) ? list : [];
        const i = arr.findIndex(function (c) { return c && c.name === call.name; });
        if (i >= 0) arr[i] = call; else arr.push(call);
        lsSet(DEF_CALLS_KEY, JSON.stringify(arr));
      } catch (e) {}
      H.msg("Defense tests confirmed — call saved to local def library.");
    }
    render();
  }

  function stepsFor() {
    if (!WZ) return [];
    if (!WZ.mode) return ["entry"];
    if (WZ.track === "offense") {
      if (WZ.mode === "template") return ["entry", "template", "tweak", "name", "tests"];
      return ["entry", "formation", "personnel", "concept", "tweak", "protection", "name", "tests"];
    }
    if (WZ.mode === "template") return ["entry", "template", "align", "motion", "name", "tests"];
    return ["entry", "front", "coverage", "pressure", "align", "motion", "name", "tests"];
  }

  function liveApplyOffenseBase() {
    if (!WZ.formation) return;
    H.snap();
    H.newPlay(WZ.formation);
    if (WZ.personnel) H.placePersonnel(WZ.personnel);
    if (WZ.concept) H.applyConcept(WZ.concept);
    if (WZ.protection && WZ.protection !== "none") H.applyProtection(WZ.protection);
    syncMetaPartial();
    H.renderAll();
  }

  function liveApplyDefenseBase() {
    if (!WZ.front) return;
    H.snap();
    H.placeDefense(WZ.front, WZ.cov || "none");
    applyPressureHeuristic();
    const st = H.getState();
    if (st && WZ.cov && WZ.cov !== "none") {
      st.showZones = true;
      const sz = document.getElementById("showZones");
      if (sz) sz.checked = true;
    }
    H.renderAll();
  }

  function applyTemplate(t) {
    if (WZ.track === "offense") {
      WZ.formation = t.formation;
      WZ.personnel = t.personnel || "";
      WZ.concept = t.concept || "";
      WZ.protection = t.protection || "none";
      WZ.name = t.name || "";
      WZ.family = t.family || "";
      WZ.series = t.series || "";
      liveApplyOffenseBase();
      H.msg("Template: " + t.name);
    } else {
      WZ.front = t.front;
      WZ.cov = t.cov;
      WZ.pressure = t.pressure || "none";
      WZ.name = t.name || "";
      liveApplyDefenseBase();
      H.msg("Template: " + t.name);
    }
  }

  function syncMetaPartial() {
    if (WZ.name) H.set("m-name", WZ.name);
    if (WZ.family) H.set("m-family", WZ.family);
    if (WZ.series) H.set("m-series", WZ.series);
    if (WZ.personnel) H.set("m-pers", WZ.personnel);
    if (WZ.formation) H.set("m-form", WZ.formation);
    if (WZ.protection) H.set("m-prot", WZ.protection === "none" ? "" : WZ.protection);
    H.readMeta();
  }

  function open(opts) {
    opts = opts || {};
    WZ = {
      track: opts.track || "offense",
      mode: null,
      i: 0,
      formation: formations()[0] || "2x2 Doubles (Gun)",
      personnel: "",
      concept: "",
      protection: "none",
      name: "",
      family: "",
      series: "",
      tweakIdx: 0,
      front: "Nickel",
      cov: "Cover 3",
      pressure: "none",
      alignFam: "2x2",
      align_by_family: {},
      motionId: null,
      motionRule: "bump",
      adjusters: { motion: { default: "bump" } },
      confirmed: false,
      save: true
    };
    const dock = document.getElementById("wizDock");
    if (dock) dock.style.display = "";
    if (!opts.quiet) H.msg("Guided build — pick Offense or Defense to start.");
    render();
  }

  function close() {
    WZ = null;
    const dock = document.getElementById("wizDock");
    if (skill === "guided") {
      open({ quiet: true });
    } else if (dock) {
      dock.style.display = "none";
    }
  }

  function titles() {
    return {
      entry: "How do you want to start?",
      template: WZ.track === "offense" ? "Pick an offense template" : "Pick a defense template",
      formation: "Formation",
      personnel: "Personnel",
      concept: "Concept / base",
      tweak: "Per-player tweak",
      protection: "Protection",
      front: "Front",
      coverage: "Coverage",
      pressure: "Pressure / blitz",
      align: "Alignment adjust",
      motion: "Motion adjust",
      name: "Name it",
      tests: "Review tests"
    };
  }

  function renderDots(host, order) {
    const row = document.createElement("div");
    row.className = "row";
    row.style.cssText = "gap:6px;margin:6px 0 10px";
    order.forEach(function (_, idx) {
      const d = document.createElement("span");
      d.style.cssText = "width:9px;height:9px;border-radius:50%;background:" + (idx === WZ.i ? "var(--accent)" : (idx < WZ.i ? "var(--good)" : "var(--line)"));
      row.appendChild(d);
    });
    host.appendChild(row);
  }

  function render() {
    const dock = document.getElementById("wizDock");
    if (!dock || !WZ) return;
    const order = stepsFor();
    if (WZ.i >= order.length) WZ.i = order.length - 1;
    if (WZ.i < 0) WZ.i = 0;
    const id = order[WZ.i];
    const head = document.getElementById("wizDockHead");
    const body = document.getElementById("wizDockBody");
    const trackLbl = WZ.track === "defense" ? "Defense" : "Offense";
    if (head) {
      head.innerHTML = "";
      const t = document.createElement("div");
      t.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap";
      t.innerHTML = "<b style=\"font-size:16px;color:var(--navy)\">Guided · " + trackLbl + "</b>"
        + "<span class=\"hint\" style=\"font-weight:800;margin:0\">Step " + (WZ.i + 1) + " of " + order.length + " — " + (titles()[id] || id) + "</span>";
      head.appendChild(t);
      renderDots(head, order);
      const trackRow = chips(
        [["offense", "Offense"], ["defense", "Defense"]],
        WZ.track,
        function (v) {
          if (WZ.track === v) return;
          WZ.track = v;
          WZ.mode = null;
          WZ.i = 0;
          WZ.confirmed = false;
          render();
        }
      );
      head.appendChild(trackRow);
    }
    body.innerHTML = "";

    if (id === "entry") {
      note(body, "Novices: start from a template. Experts-in-training: build from scratch. Both write the same play object.");
      body.appendChild(chips(
        [["template", "Start from a template"], ["scratch", "Build from scratch"]],
        WZ.mode,
        function (v) { WZ.mode = v; WZ.i = 1; render(); }
      ));
    } else if (id === "template") {
      const list = WZ.track === "offense" ? OFF_TEMPLATES : DEF_TEMPLATES;
      note(body, "One tap drops a near-complete call on the field — tweak next.");
      body.appendChild(chips(
        list.map(function (t) { return [t.name, t.name]; }),
        WZ.name,
        function (v) {
          const t = list.find(function (x) { return x.name === v; });
          if (t) applyTemplate(t);
          render();
        }
      ));
    } else if (id === "formation") {
      note(body, "Pick your base alignment — you can flip or edit later.");
      body.appendChild(chips(formations(), WZ.formation, function (v) {
        WZ.formation = v;
        liveApplyOffenseBase();
        render();
      }));
    } else if (id === "personnel") {
      note(body, "Optional grouping. Skip keeps the formation as drawn.");
      body.appendChild(chips([["", "Skip"]].concat(personnelCodes().map(function (p) { return [p, p]; })), WZ.personnel, function (v) {
        WZ.personnel = v;
        liveApplyOffenseBase();
        render();
      }));
    } else if (id === "concept") {
      note(body, "Routes get assigned to your receivers. Or Custom to draw yourself in the tweak step.");
      body.appendChild(chips([["", "Custom (I'll draw)"]].concat(concepts().map(function (c) { return [c, c]; })), WZ.concept, function (v) {
        WZ.concept = v;
        liveApplyOffenseBase();
        render();
      }));
    } else if (id === "tweak") {
      const elig = eligibles();
      if (!elig.length) {
        note(body, "No eligibles yet — go back and pick a formation.");
      } else {
        if (WZ.tweakIdx >= elig.length) WZ.tweakIdx = 0;
        const p = elig[WZ.tweakIdx];
        H.selectPlayer(p);
        note(body, "Set <b>" + (p.lab || "?") + "</b>'s route (" + (WZ.tweakIdx + 1) + " of " + elig.length + "). Suggested from the concept — tap to change.");
        body.appendChild(chips(routeNames(), p.rname || "", function (v) {
          H.snap();
          H.rebuildRoute(p, v);
          H.renderAll();
          render();
        }));
        const nav = document.createElement("div");
        nav.className = "row";
        nav.style.marginTop = "10px";
        const prev = document.createElement("button");
        prev.className = "btn";
        prev.textContent = "Prev player";
        prev.disabled = WZ.tweakIdx === 0;
        prev.onclick = function () { WZ.tweakIdx--; render(); };
        const nextP = document.createElement("button");
        nextP.className = "btn";
        nextP.textContent = "Next player";
        nextP.disabled = WZ.tweakIdx >= elig.length - 1;
        nextP.onclick = function () { WZ.tweakIdx++; render(); };
        nav.appendChild(prev);
        nav.appendChild(nextP);
        body.appendChild(nav);
      }
    } else if (id === "protection") {
      note(body, "Protection for the line & back — also seeds OL keys.");
      body.appendChild(chips(PROTS.map(function (p) { return [p, p === "none" ? "None" : p]; }), WZ.protection, function (v) {
        WZ.protection = v;
        H.snap();
        H.applyProtection(v);
        const pr = document.getElementById("protSel");
        if (pr) pr.value = v;
        syncMetaPartial();
        H.renderAll();
        render();
      }));
    } else if (id === "front") {
      note(body, "Drop our front on the field.");
      body.appendChild(chips(FRONTS, WZ.front, function (v) {
        WZ.front = v;
        liveApplyDefenseBase();
        render();
      }));
    } else if (id === "coverage") {
      note(body, "Coverage roles + man matchups apply automatically.");
      body.appendChild(chips(COVS, WZ.cov, function (v) {
        WZ.cov = v;
        liveApplyDefenseBase();
        render();
      }));
    } else if (id === "pressure") {
      note(body, "Optional pressure — marks a rusher with a red path. Or none.");
      body.appendChild(chips(PRESSURES.map(function (p) { return [p.id, p.name]; }), WZ.pressure, function (v) {
        WZ.pressure = v;
        liveApplyDefenseBase();
        render();
      }));
    } else if (id === "align") {
      note(body, "Pick a formation family, drag defenders on the field (Move tool), then tap <b>Confirm align</b> for that look.");
      H.setMode("move");
      body.appendChild(chips(ALIGN_FAMS.map(function (f) { return [f, f]; }), WZ.alignFam, function (v) {
        WZ.alignFam = v;
        render();
      }));
      const conf = document.createElement("button");
      conf.className = "btn go";
      conf.style.marginTop = "10px";
      const done = WZ.align_by_family && WZ.align_by_family[WZ.alignFam];
      conf.textContent = done ? "✓ Confirmed " + WZ.alignFam : "Confirm align for " + WZ.alignFam;
      conf.onclick = function () {
        snapshotAlignFamily(WZ.alignFam);
        H.msg("Saved " + WZ.alignFam + " alignment.");
        render();
      };
      body.appendChild(conf);
      const doneList = Object.keys(WZ.align_by_family || {});
      if (doneList.length) note(body, "Confirmed: " + doneList.join(", "));
    } else if (id === "motion") {
      note(body, "Pick a motion (or Skip) and the adjust rule. Auto-seeded from coverage — confirm or change.");
      body.appendChild(chips([["", "Skip / none"]].concat(MOTIONS.map(function (m) { return [m.id, m.name]; })), WZ.motionId || "", function (v) {
        WZ.motionId = v || null;
        if (v) {
          const m = MOTIONS.find(function (x) { return x.id === v; });
          WZ.motionRule = seedMotionRule(WZ.cov, m && m.type);
        }
        render();
      }));
      if (WZ.motionId) {
        note(body, "Adjust rule when offense motions:");
        body.appendChild(chips(MOTION_RULES.map(function (r) { return [r, r]; }), WZ.motionRule, function (v) {
          WZ.motionRule = v;
          const m = MOTIONS.find(function (x) { return x.id === WZ.motionId; });
          WZ.adjusters = WZ.adjusters || { motion: { default: "bump" } };
          WZ.adjusters.motion = WZ.adjusters.motion || { default: "bump" };
          if (m) WZ.adjusters.motion[m.type] = v;
          render();
        }));
      }
    } else if (id === "name") {
      if (WZ.track === "defense" && !WZ.name) WZ.name = callName();
      note(body, WZ.track === "defense" ? "Call name (regenerated from front + coverage + pressure)." : "Name it — you'll confirm tests next.");
      const mk = function (lbl, key, ph) {
        const w = document.createElement("label");
        w.style.cssText = "display:flex;flex-direction:column;font-size:12px;font-weight:800;color:#5b626e;gap:4px;margin-bottom:10px";
        w.appendChild(document.createTextNode(lbl));
        const inp = document.createElement("input");
        inp.value = WZ[key] || "";
        inp.placeholder = ph || "";
        inp.oninput = function (e) { WZ[key] = e.target.value; };
        inp.style.minHeight = "40px";
        w.appendChild(inp);
        body.appendChild(w);
      };
      mk(WZ.track === "defense" ? "Call name" : "Play name", "name", WZ.track === "defense" ? "e.g. Nickel Cover 3 Fire" : "e.g. DINO");
      if (WZ.track === "offense") {
        mk("Family (optional)", "family", "e.g. Smash");
        mk("Series (optional)", "series", "e.g. Dropback");
      }
      const sv = document.createElement("label");
      sv.style.cssText = "display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px;margin-top:2px";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = WZ.save;
      cb.onchange = function (e) { WZ.save = e.target.checked; };
      sv.appendChild(cb);
      sv.appendChild(document.createTextNode(WZ.track === "defense" ? "Save defense call locally" : "Save to my playbook when finished"));
      body.appendChild(sv);
    } else if (id === "tests") {
      note(body, "Auto-seeded from what you built. Confirm to write answer keys (same pattern as Author).");
      const rows = WZ.track === "offense" ? seedOffenseReview() : seedDefenseReview();
      const card = document.createElement("div");
      card.style.cssText = "border:1px solid var(--line);border-radius:12px;padding:12px;background:#fafbfc";
      rows.forEach(function (r) {
        const row = document.createElement("div");
        row.className = "row";
        row.style.cssText = "justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)";
        row.innerHTML = "<div><b>" + (r.ok ? "✓ " : "○ ") + r.label + "</b><div class=\"hint\" style=\"margin:2px 0 0\">" + (r.hint || "") + "</div></div>"
          + "<span style=\"font-weight:800;color:" + (r.ok ? "var(--good)" : "var(--muted)") + "\">" + (r.ok ? "ready" : "needs work") + "</span>";
        card.appendChild(row);
      });
      body.appendChild(card);
      const conf = document.createElement("button");
      conf.className = "btn go";
      conf.style.cssText = "margin-top:12px;min-width:140px";
      conf.textContent = WZ.confirmed ? "✓ Confirmed" : "Confirm tests";
      conf.onclick = confirmTests;
      body.appendChild(conf);
    }

    const back = document.getElementById("wizDockBack");
    const next = document.getElementById("wizDockNext");
    const skip = document.getElementById("wizDockSkip");
    if (back) back.style.visibility = WZ.i === 0 ? "hidden" : "visible";
    if (skip) {
      const optional = id === "personnel" || id === "pressure" || id === "motion" || id === "coverage" && WZ.mode === "scratch";
      skip.style.display = optional ? "" : "none";
    }
    if (next) {
      const last = WZ.i >= order.length - 1;
      next.textContent = last ? (WZ.save ? "Save ✓" : "Finish ✓") : "Next";
    }
  }

  function nav(d) {
    if (!WZ) return;
    const order = stepsFor();
    const id = order[WZ.i];
    if (d > 0 && id === "entry" && !WZ.mode) {
      H.msg("Pick template or scratch first.");
      return;
    }
    if (d > 0 && id === "template" && WZ.track === "offense" && !WZ.concept && !WZ.name) {
      H.msg("Pick a template.");
      return;
    }
    if (d > 0 && id === "template" && WZ.track === "defense" && !WZ.front) {
      H.msg("Pick a template.");
      return;
    }
    const ni = WZ.i + d;
    if (ni < 0) return;
    if (ni >= order.length) {
      finish();
      return;
    }
    WZ.i = ni;
    /* entering tweak: reset index */
    if (order[WZ.i] === "tweak") WZ.tweakIdx = 0;
    if (order[WZ.i] === "align") H.setMode("move");
    render();
  }

  function skip() {
    if (!WZ) return;
    nav(1);
  }

  function finish() {
    if (!WZ) return;
    syncMetaPartial();
    if (!WZ.confirmed) confirmTests();
    const st = H.getState();
    if (WZ.track === "offense") {
      if (WZ.name) {
        H.set("m-name", WZ.name);
        if (WZ.family) H.set("m-family", WZ.family);
        if (WZ.series) H.set("m-series", WZ.series);
        H.readMeta();
      }
      H.renderAll();
      if (WZ.save && (WZ.name || (st && st.name))) {
        if (!st.name && WZ.name) { st.name = WZ.name; H.set("m-name", WZ.name); H.readMeta(); }
        H.savePlay();
      } else {
        H.msg("Play built — edit on the field or Save when ready.");
      }
    } else {
      if (st) {
        st.name = WZ.name || callName();
        st.def_call = st.def_call || buildDefCall();
        H.set("m-name", st.name);
        H.readMeta();
      }
      H.renderAll();
      if (WZ.save) {
        try {
          const call = st.def_call || buildDefCall();
          const raw = lsGet(DEF_CALLS_KEY);
          const list = raw ? JSON.parse(raw) : [];
          const arr = Array.isArray(list) ? list : [];
          arr.push(call);
          lsSet(DEF_CALLS_KEY, JSON.stringify(arr));
          H.msg("Defense call saved: " + call.name);
        } catch (e) {
          H.msg("Defense built on the field.");
        }
      } else {
        H.msg("Defense built — edit on the field.");
      }
    }
    if (skill === "guided") {
      WZ.mode = null;
      WZ.i = 0;
      WZ.confirmed = false;
      render();
    } else {
      WZ = null;
      const dock = document.getElementById("wizDock");
      if (dock) dock.style.display = "none";
    }
  }

  /** Expert-mode one-shot: seed tests from current STATE without the stepper. */
  function autoBuildTests() {
    const st = H.getState();
    if (!st) { H.msg("No play on the field."); return; }
    const hasDefs = st.defs && st.defs.length;
    const hasRoutes = (st.players || []).some(function (p) { return p && ((p.route && p.route.length) || p.rname); });
    if (hasDefs && !hasRoutes) {
      WZ = {
        track: "defense", mode: "scratch", i: 0, front: st.front, cov: st.coverage,
        pressure: (st.def_call && st.def_call.pressure) || "none",
        name: st.name || "", align_by_family: (st.def_call && st.def_call.align_by_family) || {},
        motionId: null, motionRule: "bump", adjusters: (st.def_call && st.def_call.adjusters) || { motion: { default: "bump" } },
        confirmed: false, save: false
      };
      snapshotAlignFamily("2x2");
      confirmTests();
    } else {
      WZ = {
        track: "offense", mode: "scratch", i: 0, name: st.name || "", concept: st.concept || "",
        formation: st.formation, personnel: st.personnel, protection: st.protection || "none",
        confirmed: false, save: false, align_by_family: {}, adjusters: { motion: { default: "bump" } }
      };
      confirmTests();
    }
    H.renderAll();
    showReviewModal();
  }

  function showReviewModal() {
    const rows = WZ && WZ.track === "defense" ? seedDefenseReview() : seedOffenseReview();
    let ov = document.getElementById("wizTestOv");
    if (!ov) {
      ov = document.createElement("div");
      ov.className = "ov show";
      ov.id = "wizTestOv";
      document.body.appendChild(ov);
    }
    ov.classList.add("show");
    ov.innerHTML = "<div class=\"ovbox\" style=\"max-width:520px\"><div class=\"row\" style=\"justify-content:space-between\"><b style=\"font-size:17px;color:var(--navy)\">Auto-built tests</b><button class=\"btn\" id=\"wizTestX\">Close</button></div>"
      + "<p class=\"hint\">Confirm writes answer keys onto this play / defense call.</p><div id=\"wizTestRows\"></div>"
      + "<div class=\"row\" style=\"margin-top:14px;justify-content:flex-end\"><button class=\"btn go\" id=\"wizTestConfirm\">Confirm</button></div></div>";
    const host = document.getElementById("wizTestRows");
    rows.forEach(function (r) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line);font-weight:700";
      row.innerHTML = "<span>" + (r.ok ? "✓ " : "○ ") + r.label + "</span><span style=\"color:" + (r.ok ? "var(--good)" : "var(--muted)") + "\">" + (r.hint || "") + "</span>";
      host.appendChild(row);
    });
    document.getElementById("wizTestX").onclick = function () { ov.classList.remove("show"); };
    ov.onclick = function (e) { if (e.target === ov) ov.classList.remove("show"); };
    document.getElementById("wizTestConfirm").onclick = function () {
      confirmTests();
      ov.classList.remove("show");
      H.msg("Tests confirmed.");
    };
  }

  function init(host) {
    H = host || {};
    skill = defaultSkill();
    document.body.classList.toggle("skill-guided", skill === "guided");
    document.body.classList.toggle("skill-expert", skill === "expert");

    const g = document.getElementById("skillGuided");
    const e = document.getElementById("skillExpert");
    if (g) g.onclick = function () { setSkill("guided"); };
    if (e) e.onclick = function () { setSkill("expert"); };
    if (g) g.classList.toggle("on", skill === "guided");
    if (e) e.classList.toggle("on", skill === "expert");

    const back = document.getElementById("wizDockBack");
    const next = document.getElementById("wizDockNext");
    const skipBtn = document.getElementById("wizDockSkip");
    if (back) back.onclick = function () { nav(-1); };
    if (next) next.onclick = function () { nav(1); };
    if (skipBtn) skipBtn.onclick = skip;

    const autoBtn = document.getElementById("autoTestsBtn");
    if (autoBtn) autoBtn.onclick = autoBuildTests;

    const dock = document.getElementById("wizDock");
    if (dock) {
      if (skill === "guided") {
        dock.style.display = "";
        open({ quiet: true });
      } else {
        dock.style.display = "none";
      }
    }
    try { if (H.onSkillChange) H.onSkillChange(skill); } catch (err) {}
  }

  root.OFFGRD_PLAY_WIZARD = {
    init: init,
    open: open,
    close: close,
    setSkill: setSkill,
    getSkill: getSkill,
    autoBuildTests: autoBuildTests,
    OFF_TEMPLATES: OFF_TEMPLATES,
    DEF_TEMPLATES: DEF_TEMPLATES,
    SKILL_KEY: SKILL_KEY
  };
})(typeof window !== "undefined" ? window : globalThis);
