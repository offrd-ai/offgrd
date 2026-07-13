/* ============================================================
   OFFGRD-scoutcards.js — Steal A: Scout-Card Generator
   Assembly on OFFGRD-render.js + thumbSvg + window.print().
   Terminology-aware call strip from the play's own fields.
   Flag: ?scoutcards=0|1 | localStorage.offgrd_scoutcards | OFFGRD_CONFIG.scoutCards
   ============================================================ */
(function (root) {
  "use strict";

  const FORMATS = {
    install: { id: "install", label: "Offense install", size: "large", perPageDefault: 4 },
    opponent: { id: "opponent", label: "Opponent scout", size: "small", perPageDefault: 6 }
  };
  const PER_PAGE = [4, 6, 9];

  function isScoutcards() {
    try {
      const q = location.search || "";
      if (/[?&]scoutcards=0(?:&|$)/.test(q)) return false;
      if (/[?&]scoutcards=1(?:&|$)/.test(q)) return true;
      const ls = localStorage.getItem("offgrd_scoutcards");
      if (ls === "0") return false;
      if (ls === "1") return true;
      if (root.OFFGRD_CONFIG && root.OFFGRD_CONFIG.scoutCards === false) return false;
      if (root.OFFGRD_CONFIG && root.OFFGRD_CONFIG.scoutCards) return true;
    } catch (e) {}
    return true; /* default on when config omitted */
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[m]));
  }

  function hasDiagram(play) {
    if (!play) return false;
    if (play.thumbSvg) return true;
    if (root.OFFGRD_RENDER && OFFGRD_RENDER.hasPlayData) return OFFGRD_RENDER.hasPlayData(play);
    const st = play.players ? play : (play.data && play.data.players ? play.data : null);
    return !!(st && st.players && st.players.length);
  }

  function playState(play) {
    if (!play) return null;
    if (root.OFFGRD_RENDER && OFFGRD_RENDER.normalizePlayData) {
      const n = OFFGRD_RENDER.normalizePlayData(play);
      if (n && n.players) return n;
    }
    if (play.players) return play;
    if (play.data && play.data.players) return play.data;
    return null;
  }

  function metaOf(play) {
    const st = playState(play) || play || {};
    const src = play || {};
    return {
      name: src.name || st.name || src.play || src.playType || "Play",
      formation: src.formation || st.formation || "",
      personnel: src.personnel || st.personnel || "",
      protection: src.protection || st.protection || "",
      family: src.family || st.family || "",
      series: src.series || st.series || "",
      down: src.down != null ? src.down : (st.down != null ? st.down : null),
      distance: src.distance != null ? src.distance : (st.distance != null ? st.distance : null),
      hash: src.hash || st.hash || "",
      result: src.result || st.result || "",
      opponent: src.opponent || st.opponent || "",
      week: src.week || st.week || "",
      period: src.period || src.qtr || st.period || ""
    };
  }

  function ddLabel(m) {
    if (m.down == null && m.distance == null) return "";
    const d = m.down != null ? (m.down + ["", "st", "nd", "rd", "th"][Math.min(+m.down, 4)] || "th") : "";
    const dist = m.distance != null ? (" & " + m.distance) : "";
    return (d + dist).trim();
  }

  function callStripHtml(play, format) {
    const m = metaOf(play);
    const bits = [];
    if (format === "opponent") {
      if (m.opponent) bits.push('<span class="sc-opp">' + esc(m.opponent) + (m.week ? (" · " + esc(m.week)) : "") + "</span>");
      const dd = ddLabel(m);
      if (dd) bits.push('<span class="sc-dd">' + esc(dd) + "</span>");
      if (m.hash) bits.push('<span class="sc-hash">' + esc(m.hash) + " hash</span>");
      if (m.result) bits.push('<span class="sc-res">' + esc(m.result) + "</span>");
    }
    const call = '<div class="sc-call"><b>' + esc(m.name) + "</b></div>";
    const sub = [m.formation, m.personnel, format === "install" ? m.protection : ""].filter(Boolean).map(esc).join(" · ");
    const meta = bits.length ? ('<div class="sc-meta">' + bits.join('<span class="sc-sep">·</span>') + "</div>") : "";
    const subHtml = sub ? ('<div class="sc-sub">' + sub + "</div>") : "";
    return call + subHtml + meta;
  }

  function diagramHtml(play, size) {
    const st = playState(play);
    if (size === "small" && play.thumbSvg) {
      return '<div class="sc-diagram sc-thumb">' + play.thumbSvg + "</div>";
    }
    if (st && root.OFFGRD_RENDER && OFFGRD_RENDER.renderMarkup) {
      const inner = OFFGRD_RENDER.renderMarkup(st, { showHandles: false, sel: null, anim: false });
      return '<div class="sc-diagram sc-full"><svg viewBox="0 0 1000 640" xmlns="http://www.w3.org/2000/svg">' + inner + "</svg></div>";
    }
    if (play.thumbSvg) return '<div class="sc-diagram sc-thumb">' + play.thumbSvg + "</div>";
    return '<div class="sc-diagram sc-empty">No diagram</div>';
  }

  function cardHtml(play, format, size) {
    const fmt = FORMATS[format] || FORMATS.install;
    const sz = size || fmt.size;
    return '<article class="sc-card sc-' + esc(fmt.id) + " sc-size-" + esc(sz) + '" data-id="' + esc(play.id || play.name || "") + '">'
      + callStripHtml(play, fmt.id)
      + diagramHtml(play, sz)
      + "</article>";
  }

  function sheetCss() {
    return "<style id=\"sc-print-css\">"
      + ".sc-sheet{font-family:system-ui,Segoe UI,sans-serif;color:#13294B}"
      + ".sc-sheet-title{font-size:18px;font-weight:800;margin:0 0 10px;color:#13294B}"
      + ".sc-grid{display:grid;gap:10px}"
      + ".sc-grid.pp-4{grid-template-columns:repeat(2,1fr)}"
      + ".sc-grid.pp-6{grid-template-columns:repeat(3,1fr)}"
      + ".sc-grid.pp-9{grid-template-columns:repeat(3,1fr)}"
      + ".sc-card{border:1.5px solid #c5ced9;border-radius:10px;padding:8px 10px 10px;background:#fff;break-inside:avoid;page-break-inside:avoid}"
      + ".sc-call{font-size:14px;line-height:1.2;margin-bottom:2px}"
      + ".sc-sub{font-size:11px;color:#5a6575;margin-bottom:4px}"
      + ".sc-meta{font-size:11px;font-weight:700;color:#13294B;margin-bottom:6px;display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center}"
      + ".sc-sep{color:#9aa4b2;font-weight:600}"
      + ".sc-diagram svg{width:100%;height:auto;display:block;background:#0b2e17;border-radius:6px}"
      + ".sc-diagram.sc-empty{min-height:80px;display:flex;align-items:center;justify-content:center;background:#eef2f6;border-radius:6px;color:#7a8494;font-size:12px}"
      + ".sc-size-large .sc-call{font-size:16px}"
      + ".sc-size-small .sc-call{font-size:12px}"
      + ".sc-page-break{break-before:page;page-break-before:always;height:0}"
      + "@media print{"
      + "body *{visibility:hidden!important}"
      + "#scSheetHost,.sc-sheet,#scSheetHost *,.sc-sheet *{visibility:visible!important}"
      + "#scSheetHost{position:absolute;left:0;top:0;width:100%;padding:12px;background:#fff}"
      + ".sc-no-print{display:none!important}"
      + "}"
      + "</style>";
  }

  function chunk(arr, n) {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out.length ? out : [[]];
  }

  function buildSheetHtml(plays, opts) {
    opts = opts || {};
    const format = opts.format || "install";
    const perPage = PER_PAGE.indexOf(+opts.perPage) >= 0 ? +opts.perPage : (FORMATS[format] || FORMATS.install).perPageDefault;
    const size = opts.size || (FORMATS[format] || FORMATS.install).size;
    const title = opts.title || (format === "opponent" ? "Opponent scout cards" : "Install scout cards");
    const pages = chunk(plays.filter(hasDiagram), perPage);
    let html = sheetCss() + '<div class="sc-sheet">';
    pages.forEach((page, pi) => {
      if (pi) html += '<div class="sc-page-break"></div>';
      html += '<div class="sc-sheet-title">' + esc(title) + (pages.length > 1 ? (" · " + (pi + 1) + "/" + pages.length) : "") + "</div>";
      html += '<div class="sc-grid pp-' + perPage + '">';
      page.forEach(p => { html += cardHtml(p, format, size); });
      html += "</div>";
    });
    html += "</div>";
    return { html, count: plays.filter(hasDiagram).length, perPage, format };
  }

  /* ---------- sources ---------- */
  function installPlays(lib) {
    return (lib || []).filter(hasDiagram);
  }

  function opponentPlaysFromGames(games) {
    const out = [];
    (games || []).forEach(g => {
      (g.rows || []).forEach((r, i) => {
        const raw = r.data || r.diagram || (r.players ? r : null);
        if (!raw && !r.thumbSvg) return;
        const play = Object.assign({}, typeof raw === "object" ? raw : {}, {
          id: r.id || ("scout-" + (g.key || g.opponent || "g") + "-" + i),
          name: r.play || r.playType || r.formation || "Opp play",
          formation: r.formation || (raw && raw.formation) || "",
          personnel: r.personnel || (raw && raw.personnel) || "",
          down: r.down, distance: r.distance, hash: r.hash, result: r.result,
          opponent: r.opponent || g.opponent || "",
          week: g.week || r.gameWeek || "",
          period: r.qtr || r.period || "",
          thumbSvg: r.thumbSvg || (raw && raw.thumbSvg) || "",
          data: raw && raw.players ? raw : (raw && raw.data ? raw.data : raw),
          players: (raw && raw.players) || r.players || undefined
        });
        if (hasDiagram(play)) out.push(play);
      });
    });
    return out;
  }

  /** Enrich install plays with matching scout-row D&D when using opponent format. */
  function enrichFromScout(plays, games, opponent) {
    const rows = [];
    (games || []).forEach(g => {
      if (opponent && g.opponent !== opponent) return;
      (g.rows || []).forEach(r => rows.push(Object.assign({ _opp: g.opponent, _week: g.week }, r)));
    });
    return (plays || []).map(p => {
      const form = (p.formation || "").toLowerCase();
      const hit = rows.find(r => form && (r.formation || "").toLowerCase() === form)
        || rows.find(r => (r.play || "").toLowerCase() === (p.name || "").toLowerCase());
      if (!hit) return p;
      return Object.assign({}, p, {
        down: p.down != null ? p.down : hit.down,
        distance: p.distance != null ? p.distance : hit.distance,
        hash: p.hash || hit.hash || "",
        result: p.result || hit.result || "",
        opponent: p.opponent || hit._opp || hit.opponent || "",
        week: p.week || hit._week || ""
      });
    });
  }

  function ensureHost() {
    let host = document.getElementById("scSheetHost");
    if (!host) {
      host = document.createElement("div");
      host.id = "scSheetHost";
      host.style.cssText = "display:none";
      document.body.appendChild(host);
    }
    return host;
  }

  function printSheet(plays, opts) {
    const built = buildSheetHtml(plays, opts);
    if (!built.count) return { ok: false, error: "No plays with diagrams selected." };
    const host = ensureHost();
    host.innerHTML = built.html;
    host.style.display = "block";
    const finish = () => { host.style.display = "none"; };
    window.addEventListener("afterprint", finish, { once: true });
    setTimeout(() => window.print(), 50);
    return { ok: true, count: built.count };
  }

  function previewInto(el, plays, opts) {
    if (!el) return;
    const built = buildSheetHtml(plays, opts);
    el.innerHTML = built.html || '<p class="hint">Select plays that have a diagram.</p>';
    return built;
  }

  function downloadCardPng(play, opts) {
    opts = opts || {};
    const st = playState(play);
    if (!st || !root.OFFGRD_RENDER || !OFFGRD_RENDER.renderMarkup) return false;
    const inner = OFFGRD_RENDER.renderMarkup(st, { showHandles: false });
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 640" width="1000" height="640">' + inner + "</svg>";
    const url = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 1000 * 2; c.height = 640 * 2;
      const ctx = c.getContext("2d");
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      c.toBlob(b => {
        const u = URL.createObjectURL(b);
        const a = document.createElement("a");
        a.href = u;
        a.download = (metaOf(play).name || "card") + ".png";
        a.click();
        URL.revokeObjectURL(u);
      });
    };
    img.src = url;
    return true;
  }

  /* ---------- modal UI factory (Playbook / OFFGRD) ---------- */
  function openModal(opts) {
    opts = opts || {};
    if (!isScoutcards()) {
      if (opts.onBlocked) opts.onBlocked();
      return null;
    }
    const install = installPlays(opts.installLib || []);
    const oppDiag = opponentPlaysFromGames(opts.games || []);
    let format = opts.format || "install";
    let perPage = (FORMATS[format] || FORMATS.install).perPageDefault;
    let selected = new Set((opts.selectedIds || []).map(String));
    if (!selected.size && format === "install") install.slice(0, Math.min(6, install.length)).forEach(p => selected.add(String(p.id || p.name)));

    let ov = document.getElementById("scModal");
    if (ov) ov.remove();
    ov = document.createElement("div");
    ov.id = "scModal";
    ov.className = "ov show";
    ov.style.zIndex = 9990;
    ov.innerHTML = '<div class="ovbox" style="max-width:920px">'
      + '<div class="row" style="justify-content:space-between;align-items:center;gap:8px">'
      + '<b style="font-size:18px;color:var(--navy,#13294B)">Scout cards</b>'
      + '<div class="row sc-no-print" style="gap:6px">'
      + '<button type="button" class="btn" id="scPrint">Print / PDF</button>'
      + '<button type="button" class="btn" id="scPng">PNG (first selected)</button>'
      + '<button type="button" class="btn" id="scClose">Close</button>'
      + "</div></div>"
      + '<p class="hint" style="margin:6px 0 8px">Diagrams from the shared renderer — same play you drew. Call strip uses your playbook names.</p>'
      + '<div class="row sc-no-print" style="flex-wrap:wrap;gap:8px;margin-bottom:8px">'
      + '<span class="lbl">Format</span>'
      + '<button type="button" class="btn" data-fmt="install">Offense install</button>'
      + '<button type="button" class="btn" data-fmt="opponent">Opponent scout</button>'
      + '<span class="lbl" style="margin-left:8px">Per page</span>'
      + '<select id="scPerPage" class="btn">' + PER_PAGE.map(n => '<option value="' + n + '">' + n + "</option>").join("") + "</select>"
      + '<button type="button" class="btn" id="scAll">Select all</button>'
      + '<button type="button" class="btn" id="scNone">Clear</button>'
      + '<span id="scCount" class="tag"></span>'
      + "</div>"
      + '<div class="row" style="align-items:stretch;gap:12px;flex-wrap:wrap">'
      + '<div id="scPick" class="sc-no-print" style="flex:1;min-width:220px;max-height:420px;overflow:auto;border:1px solid var(--line,#d8dee6);border-radius:10px;padding:8px"></div>'
      + '<div id="scPreview" style="flex:2;min-width:280px;max-height:520px;overflow:auto;border:1px solid var(--line,#d8dee6);border-radius:10px;padding:8px;background:#f7f9fb"></div>'
      + "</div></div>";
    document.body.appendChild(ov);

    function sourceList() {
      if (format === "opponent") {
        if (oppDiag.length) return oppDiag;
        /* Fallback: install plays enriched with scout charting (diagram from playbook) */
        return enrichFromScout(install, opts.games || [], opts.opponent || null);
      }
      return install;
    }

    function paintPick() {
      const list = sourceList();
      const host = ov.querySelector("#scPick");
      const note = format === "opponent" && !oppDiag.length
        ? '<p class="hint" style="margin:0 0 8px">No scouting rows with a drawn diagram yet. Showing playbook diagrams; D&amp;D/hash/result fill in when a scout row matches formation. <i>Follow-on: auto-draw from charted tags.</i></p>'
        : "";
      host.innerHTML = note + list.map(p => {
        const id = String(p.id || p.name);
        const on = selected.has(id);
        const m = metaOf(p);
        return '<label style="display:flex;gap:8px;align-items:flex-start;padding:6px 4px;border-bottom:1px solid #e8edf3;cursor:pointer">'
          + '<input type="checkbox" data-id="' + esc(id) + '"' + (on ? " checked" : "") + ">"
          + '<span><b style="font-size:13px">' + esc(m.name) + "</b><br><span class=\"tag\">"
          + esc([m.formation, m.personnel, format === "opponent" ? ddLabel(m) : ""].filter(Boolean).join(" · "))
          + "</span></span></label>";
      }).join("") || '<p class="hint">No diagrammed plays available.</p>';
      host.querySelectorAll("input[data-id]").forEach(inp => {
        inp.onchange = () => {
          if (inp.checked) selected.add(inp.dataset.id);
          else selected.delete(inp.dataset.id);
          paintPreview();
        };
      });
      paintPreview();
    }

    function selectedPlays() {
      const list = sourceList();
      return list.filter(p => selected.has(String(p.id || p.name)));
    }

    function paintPreview() {
      const plays = selectedPlays();
      const title = format === "opponent"
        ? ("Opponent scout" + (opts.opponent ? (" · " + opts.opponent) : ""))
        : "Install cards";
      previewInto(ov.querySelector("#scPreview"), plays, { format, perPage, title });
      const c = ov.querySelector("#scCount");
      if (c) c.textContent = plays.length + " selected";
      ov.querySelectorAll("[data-fmt]").forEach(b => b.classList.toggle("on", b.dataset.fmt === format));
      const sel = ov.querySelector("#scPerPage");
      if (sel) sel.value = String(perPage);
    }

    ov.querySelectorAll("[data-fmt]").forEach(b => {
      b.onclick = () => {
        format = b.dataset.fmt;
        perPage = (FORMATS[format] || FORMATS.install).perPageDefault;
        selected = new Set();
        sourceList().slice(0, Math.min(6, sourceList().length)).forEach(p => selected.add(String(p.id || p.name)));
        paintPick();
      };
    });
    ov.querySelector("#scPerPage").onchange = e => { perPage = +e.target.value; paintPreview(); };
    ov.querySelector("#scAll").onclick = () => { sourceList().forEach(p => selected.add(String(p.id || p.name))); paintPick(); };
    ov.querySelector("#scNone").onclick = () => { selected.clear(); paintPick(); };
    ov.querySelector("#scClose").onclick = () => ov.remove();
    ov.querySelector("#scPrint").onclick = () => {
      const r = printSheet(selectedPlays(), {
        format, perPage,
        title: format === "opponent" ? ("Opponent scout" + (opts.opponent ? (" · " + opts.opponent) : "")) : "Install cards"
      });
      if (!r.ok && opts.onMsg) opts.onMsg(r.error);
    };
    ov.querySelector("#scPng").onclick = () => {
      const plays = selectedPlays();
      if (!plays.length) { if (opts.onMsg) opts.onMsg("Select a play first."); return; }
      downloadCardPng(plays[0]);
    };

    paintPick();
    return ov;
  }

  root.OFFGRD_SCOUTCARDS = {
    FORMATS, PER_PAGE,
    isScoutcards, hasDiagram, metaOf, cardHtml, buildSheetHtml,
    printSheet, previewInto, downloadCardPng,
    installPlays, opponentPlaysFromGames, enrichFromScout, openModal
  };
})(typeof window !== "undefined" ? window : globalThis);
