/* ============================================================
   OFFGRD season-schedule paste import (v295)
   Coach pastes text or a .csv / .ics file HE already has.
   Never fetches a URL, never loads a third-party host, never
   pulls a logo. Parse only. No guessing of site / time / score.
   ============================================================ */
(function (root) {
  "use strict";

  var URL_MSG = "Paste the schedule text, not a link.";
  var FIELDS = ["date", "opponent", "ha", "site", "time", "us", "them"];
  var MONTHS = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, sept: 9, september: 9,
    oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
  };

  function blankRow() {
    return { date: "", opponent: "", ha: "H", site: "", time: "", us: "", them: "" };
  }

  function seasonYearOf(season) {
    var y = parseInt(season, 10);
    if (y >= 1990 && y <= 2100) return y;
    return new Date().getFullYear();
  }

  function yearAnchorNote(season) {
    var y = seasonYearOf(season);
    return "Dates without a year are anchored to the " + y +
      " season (Aug–Dec → " + y + ", Jan–Jul → " + (y + 1) + ").";
  }

  function anchorYear(month, season) {
    var y = seasonYearOf(season);
    var m = +month;
    if (m >= 8 && m <= 12) return y;
    return y + 1;
  }

  function pad2(n) {
    var s = String(n);
    return s.length < 2 ? "0" + s : s;
  }

  function ymd(y, m, d) {
    if (!y || !m || !d) return "";
    var yy = +y, mm = +m, dd = +d;
    if (yy < 100) yy += 2000;
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return "";
    return yy + "-" + pad2(mm) + "-" + pad2(dd);
  }

  function looksLikeUrl(text) {
    var t = String(text || "").replace(/^\uFEFF/, "").trim();
    if (!t) return false;
    if (/^https?:\/\/\S+$/i.test(t)) return true;
    if (/^www\.\S+$/i.test(t)) return true;
    var lines = t.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (lines.length === 1 && (/^https?:\/\/\S+$/i.test(lines[0]) || /^www\.\S+$/i.test(lines[0]))) return true;
    return false;
  }

  function hostColResolve() {
    return root && typeof root.colResolve === "function" ? root.colResolve : null;
  }

  function hostSplitCsv() {
    return root && typeof root.splitCSVLine === "function" ? root.splitCSVLine : splitCsvFallback;
  }

  function splitCsvFallback(line) {
    var out = [], cur = "", q = false, i, ch;
    for (i = 0; i < line.length; i++) {
      ch = line[i];
      if (q) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else q = false;
        } else cur += ch;
      } else if (ch === ",") {
        out.push(cur); cur = "";
      } else if (ch === '"') {
        q = true;
      } else cur += ch;
    }
    out.push(cur);
    return out;
  }

  function detectDelim(headerLine) {
    var tabs = (headerLine.match(/\t/g) || []).length;
    var commas = (headerLine.match(/,/g) || []).length;
    return tabs > commas ? "\t" : ",";
  }

  function splitLine(line, delim) {
    if (delim === "\t") return String(line).split("\t");
    return hostSplitCsv()(line);
  }

  function unescapeIcs(s) {
    return String(s || "")
      .replace(/\\n/gi, " ")
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .replace(/\\\\/g, "\\");
  }

  function unfoldIcs(text) {
    return String(text || "").replace(/\r/g, "").replace(/\n[ \t]/g, "");
  }

  function icsProp(block, name) {
    var re = new RegExp("(?:^|\\n)" + name + "(?:;[^:\\n]*)?:([^\\n]*)", "i");
    var m = String(block || "").match(re);
    return m ? unescapeIcs(m[1].trim()) : "";
  }

  function formatClock(h, min) {
    var hh = +h, mm = +min || 0;
    if (isNaN(hh) || hh < 0 || hh > 23) return "";
    var am = hh < 12;
    var h12 = hh % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ":" + pad2(mm) + (am ? "AM" : "PM");
  }

  function parseIcsDate(raw) {
    var s = String(raw || "").trim();
    var m = s.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?/);
    if (!m) return { date: "", time: "" };
    return {
      date: ymd(m[1], m[2], m[3]),
      time: m[4] != null ? formatClock(m[4], m[5]) : ""
    };
  }

  function parseDateToken(raw, season) {
    var s = String(raw || "").trim().replace(/,$/, "");
    if (!s) return "";
    var iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) return ymd(iso[1], iso[2], iso[3]);
    var compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compact) return ymd(compact[1], compact[2], compact[3]);
    var mdy = s.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
    if (mdy) {
      var year = mdy[3] ? (mdy[3].length === 2 ? 2000 + (+mdy[3]) : +mdy[3]) : anchorYear(mdy[1], season);
      return ymd(year, mdy[1], mdy[2]);
    }
    var mon = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?$/i);
    if (mon) {
      var mm = MONTHS[mon[1].toLowerCase()];
      if (!mm) return "";
      var yy = mon[3] ? +mon[3] : anchorYear(mm, season);
      return ymd(yy, mm, mon[2]);
    }
    return "";
  }

  function normalizeTime(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    var ap = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (ap) {
      var h = +ap[1];
      var min = ap[2] != null ? +ap[2] : 0;
      var mer = ap[3].toLowerCase();
      if (mer === "pm" && h < 12) h += 12;
      if (mer === "am" && h === 12) h = 0;
      return formatClock(h, min);
    }
    var hf = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (hf) return formatClock(hf[1], hf[2]);
    return "";
  }

  function stripHaTokens(s) {
    return String(s || "")
      .replace(/\b(vs\.?|versus|at|home|away|neutral)\b/gi, " ")
      .replace(/(^|\s)@(?=\s|$|[A-Za-z])/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stripSummaryJunk(s) {
    return String(s || "")
      .replace(/^\s*(varsity|jv|freshman|frosh|soph|football|fb|game)\s*[-–:]\s*/i, "")
      .replace(/^\s*(varsity|jv|freshman|frosh|soph|football|fb)\s+/i, "")
      .trim();
  }

  /* HOME/AWAY: @ / at / Away → A; vs / Home → H.
     Neutral or no token → leave default (caller applies "H") and flag. */
  function parseHaFromText(text) {
    var raw = stripSummaryJunk(text);
    var flagged = false;
    var ha = "";
    if (/\bneutral\b/i.test(raw)) {
      flagged = true;
    } else if (/(^|\s)@(?=\s|$|[A-Za-z])|\bat\b|\baway\b/i.test(raw)) {
      ha = "A";
    } else if (/\bvs\.?\b|\bversus\b|\bhome\b/i.test(raw)) {
      ha = "H";
    } else {
      flagged = true;
    }
    return { ha: ha, opponent: stripHaTokens(raw), flagged: flagged };
  }

  function parseHaCell(raw) {
    var s = String(raw || "").trim();
    if (!s) return { ha: "", flagged: false };
    if (/^n(eutral)?$/i.test(s) || /\bneutral\b/i.test(s)) return { ha: "", flagged: true };
    if (/^a(way)?$/i.test(s) || /^@/.test(s) || /^at$/i.test(s)) return { ha: "A", flagged: false };
    if (/^h(ome)?$/i.test(s) || /^vs\.?$/i.test(s)) return { ha: "H", flagged: false };
    var fromText = parseHaFromText(s);
    return { ha: fromText.ha, flagged: fromText.flagged };
  }

  function parseScorePair(raw) {
    var s = String(raw || "").trim();
    var m = s.match(/^(\d{1,3})\s*[-–]\s*(\d{1,3})$/);
    if (!m) return { us: "", them: "" };
    return { us: String(+m[1]), them: String(+m[2]) };
  }

  function emitRow(partial) {
    var row = blankRow();
    row.date = partial.date || "";
    row.opponent = partial.opponent || "";
    row.ha = partial.ha === "A" || partial.ha === "H" ? partial.ha : "H";
    row.site = partial.site || "";
    row.time = partial.time || "";
    row.us = partial.us == null ? "" : String(partial.us);
    row.them = partial.them == null ? "" : String(partial.them);
    return row;
  }

  function parseIcs(text) {
    var src = unfoldIcs(text);
    var chunks = src.split(/BEGIN:VEVENT/i);
    var rows = [];
    var unparsed = [];
    var flagged = [];
    var i;
    for (i = 1; i < chunks.length; i++) {
      var block = chunks[i].split(/END:VEVENT/i)[0];
      var dt = parseIcsDate(icsProp(block, "DTSTART"));
      var summary = icsProp(block, "SUMMARY");
      var loc = icsProp(block, "LOCATION");
      var haInfo = parseHaFromText(summary);
      if (!dt.date && !haInfo.opponent) {
        unparsed.push(summary || "VEVENT");
        continue;
      }
      var row = emitRow({
        date: dt.date,
        time: dt.time,
        opponent: haInfo.opponent,
        ha: haInfo.ha,
        site: loc
      });
      rows.push(row);
      if (haInfo.flagged) flagged.push({ row: row, reason: "ha-ambiguous", source: summary });
    }
    return { kind: "ics", rows: rows, unparsed: unparsed, flagged: flagged };
  }

  function atCells(cells, col, field) {
    var spec = col[field];
    if (!spec || spec.idx == null || spec.idx < 0) return "";
    return cells[spec.idx] == null ? "" : String(cells[spec.idx]).trim();
  }

  function parseCsv(text, season) {
    var resolve = hostColResolve();
    var lines = String(text || "").replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n").filter(function (l) {
      return l.trim().length;
    });
    var unparsed = [];
    var flagged = [];
    if (!resolve || lines.length < 2) {
      return { kind: "csv", rows: [], unparsed: lines.slice(), flagged: flagged };
    }
    var delim = detectDelim(lines[0]);
    var headers = splitLine(lines[0], delim).map(function (h) { return String(h).trim(); });
    var cols = resolve(headers);
    var hasSched = !!(cols.date || cols.opponent);
    if (!hasSched) {
      return { kind: "csv", rows: [], unparsed: lines.slice(), flagged: flagged };
    }
    var rows = [];
    var li;
    for (li = 1; li < lines.length; li++) {
      var cells = splitLine(lines[li], delim);
      if (!cells.length || cells.join("").trim() === "") continue;
      var dateRaw = atCells(cells, cols, "date");
      var oppRaw = atCells(cells, cols, "opponent");
      var haRaw = atCells(cells, cols, "ha");
      var site = atCells(cells, cols, "site");
      var timeRaw = atCells(cells, cols, "time");
      var us = atCells(cells, cols, "us");
      var them = atCells(cells, cols, "them");
      var scoreRaw = atCells(cells, cols, "score");
      if (!us && !them && scoreRaw) {
        var pair = parseScorePair(scoreRaw);
        us = pair.us;
        them = pair.them;
      }
      var date = parseDateToken(dateRaw, season);
      var haInfo = haRaw ? parseHaCell(haRaw) : parseHaFromText(oppRaw);
      var opponent = haRaw ? String(oppRaw || "").trim() : (haInfo.opponent || String(oppRaw || "").trim());
      if (!date && !opponent) {
        unparsed.push(lines[li]);
        continue;
      }
      var row = emitRow({
        date: date,
        opponent: opponent,
        ha: haInfo.ha,
        site: site,
        time: normalizeTime(timeRaw) || timeRaw,
        us: us,
        them: them
      });
      rows.push(row);
      if (haInfo.flagged) flagged.push({ row: row, reason: "ha-ambiguous", source: lines[li] });
    }
    return { kind: "csv", rows: rows, unparsed: unparsed, flagged: flagged };
  }

  function parseLooseLine(line, season) {
    var original = String(line || "");
    var work = original.replace(/^\uFEFF/, "").trim();
    if (!work) return null;
    if (looksLikeUrl(work)) return { url: true, source: original };

    work = work.replace(/^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\.?\s+/i, "");

    var flagged = /\bneutral\b/i.test(work);
    var date = "";
    var dateRe = /(\d{4}-\d{1,2}-\d{1,2})|(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)|((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)/i;
    var dm = work.match(dateRe);
    if (dm) {
      date = parseDateToken(dm[0], season);
      work = work.replace(dm[0], " ");
    }

    var time = "";
    var tm = work.match(/\b(\d{1,2})(?::(\d{2}))\s*(am|pm)\b|\b(\d{1,2})\s*(am|pm)\b|\b([01]?\d|2[0-3]):([0-5]\d)\b/i);
    if (tm) {
      time = normalizeTime(tm[0]);
      work = work.replace(tm[0], " ");
    }

    var us = "", them = "";
    var sc = work.match(/\b(\d{1,3})\s*[-–]\s*(\d{1,3})\b/);
    if (sc) {
      us = String(+sc[1]);
      them = String(+sc[2]);
      work = work.replace(sc[0], " ");
    }

    var haInfo = parseHaFromText(work);
    if (flagged) {
      haInfo.ha = "";
      haInfo.flagged = true;
      haInfo.opponent = stripHaTokens(work);
    }

    if (!date && !haInfo.opponent) return { unparsed: true, source: original };
    return {
      date: date,
      time: time,
      opponent: haInfo.opponent,
      ha: haInfo.ha,
      site: "",
      us: us,
      them: them,
      flagged: haInfo.flagged,
      source: original
    };
  }

  function parseLoose(text, season) {
    var lines = String(text || "").replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n");
    var rows = [];
    var unparsed = [];
    var flagged = [];
    var i;
    for (i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      var got = parseLooseLine(lines[i], season);
      if (!got || got.unparsed) {
        unparsed.push(lines[i]);
        continue;
      }
      if (got.url) {
        unparsed.push(lines[i]);
        continue;
      }
      var row = emitRow(got);
      rows.push(row);
      if (got.flagged) flagged.push({ row: row, reason: "ha-ambiguous", source: got.source });
    }
    return { kind: "loose", rows: rows, unparsed: unparsed, flagged: flagged };
  }

  function looksLikeCsv(text) {
    var resolve = hostColResolve();
    if (!resolve) return false;
    var lines = String(text || "").replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n").filter(function (l) {
      return l.trim().length;
    });
    if (lines.length < 2) return false;
    var delim = detectDelim(lines[0]);
    var headers = splitLine(lines[0], delim).map(function (h) { return String(h).trim(); });
    var cols = resolve(headers);
    return !!(cols && (cols.date || cols.opponent));
  }

  function looksLikeIcs(text) {
    return /BEGIN:VEVENT/i.test(text) || /BEGIN:VCALENDAR/i.test(text);
  }

  function parseSchedule(text, opts) {
    var season = opts && opts.season != null ? opts.season : null;
    var raw = String(text == null ? "" : text).replace(/^\uFEFF/, "");
    if (!raw.trim()) {
      return {
        kind: "",
        rows: [],
        unparsed: [],
        flagged: [],
        error: "",
        yearAnchor: yearAnchorNote(season)
      };
    }
    if (looksLikeUrl(raw)) {
      return {
        kind: "url",
        rows: [],
        unparsed: [],
        flagged: [],
        error: URL_MSG,
        yearAnchor: yearAnchorNote(season)
      };
    }
    var parsed;
    if (looksLikeIcs(raw)) parsed = parseIcs(raw);
    else if (looksLikeCsv(raw)) parsed = parseCsv(raw, season);
    else parsed = parseLoose(raw, season);
    parsed.error = parsed.error || "";
    parsed.yearAnchor = yearAnchorNote(season);
    parsed.flagged = parsed.flagged || [];
    parsed.unparsed = parsed.unparsed || [];
    parsed.rows = (parsed.rows || []).map(function (r) { return emitRow(r); });
    return parsed;
  }

  function normOpp(s) {
    return String(s || "").trim().toLowerCase().replace(/[.]/g, "").replace(/\s+/g, " ");
  }

  function rowKey(r) {
    return String(r.date || "").trim() + "\0" + normOpp(r.opponent);
  }

  function copyExisting(r) {
    var out = {};
    var k;
    for (k in r) {
      if (Object.prototype.hasOwnProperty.call(r, k)) out[k] = r[k];
    }
    if (!out.ha) out.ha = "H";
    FIELDS.forEach(function (f) {
      if (out[f] == null) out[f] = f === "ha" ? "H" : "";
    });
    return out;
  }

  function applyUpdate(dest, src) {
    var changed = false;
    FIELDS.forEach(function (f) {
      var nv = src[f];
      if (nv == null) nv = "";
      nv = String(nv);
      if (nv === "") {
        return;
      }
      var cur = dest[f] == null ? "" : String(dest[f]);
      if (cur !== nv) {
        dest[f] = nv;
        changed = true;
      }
    });
    return changed;
  }

  function mergeSchedule(existing, incoming, opts) {
    var uid = opts && typeof opts.uid === "function"
      ? opts.uid
      : function () { return "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
    var next = (existing || []).map(copyExisting);
    var index = {};
    next.forEach(function (r, i) {
      var k = rowKey(r);
      if (r.date && r.opponent && index[k] == null) index[k] = i;
    });
    var nNew = 0, nUpdated = 0, nUnchanged = 0;
    (incoming || []).forEach(function (src) {
      var row = emitRow(src);
      if (!row.date && !row.opponent) return;
      var k = rowKey(row);
      var idx = (row.date && row.opponent) ? index[k] : undefined;
      if (idx != null) {
        if (applyUpdate(next[idx], row)) nUpdated += 1;
        else nUnchanged += 1;
      } else {
        var made = copyExisting(row);
        made.id = uid();
        next.push(made);
        if (row.date && row.opponent) index[k] = next.length - 1;
        nNew += 1;
      }
    });
    return {
      rows: next,
      nNew: nNew,
      nUpdated: nUpdated,
      nUnchanged: nUnchanged
    };
  }

  function tokensOf(s) {
    return normOpp(s).split(" ").filter(Boolean);
  }

  function suggestOpponent(name, known) {
    var needle = normOpp(name);
    if (!needle || !known || !known.length) return "";
    var i, best = "", bestScore = 0;
    for (i = 0; i < known.length; i++) {
      var cand = String(known[i] || "").trim();
      var hay = normOpp(cand);
      if (!hay) continue;
      if (hay === needle) return cand;
      var score = 0;
      if (hay.indexOf(needle) === 0 || needle.indexOf(hay) === 0) score = Math.min(needle.length, hay.length);
      else {
        var nt = tokensOf(name);
        var ct = tokensOf(cand);
        var t, hits = 0;
        for (t = 0; t < nt.length; t++) {
          if (ct.some(function (c) { return c === nt[t] || c.indexOf(nt[t]) === 0 || nt[t].indexOf(c) === 0; })) hits += 1;
        }
        if (hits && hits === nt.length) score = hits * 10 + Math.min(needle.length, hay.length);
      }
      if (score > bestScore) {
        bestScore = score;
        best = cand;
      }
    }
    if (best && normOpp(best) !== needle && bestScore >= 2) return best;
    return "";
  }

  root.OFFGRD_SCHEDULE_IMPORT = {
    URL_MSG: URL_MSG,
    blankRow: blankRow,
    emitRow: emitRow,
    looksLikeUrl: looksLikeUrl,
    yearAnchorNote: yearAnchorNote,
    anchorYear: anchorYear,
    parseDateToken: parseDateToken,
    parseHaFromText: parseHaFromText,
    parseIcs: parseIcs,
    parseCsv: parseCsv,
    parseLoose: parseLoose,
    parseSchedule: parseSchedule,
    mergeSchedule: mergeSchedule,
    suggestOpponent: suggestOpponent
  };
})(typeof window !== "undefined" ? window : globalThis);
