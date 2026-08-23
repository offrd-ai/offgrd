/* Shared invite-list parsing for the Program modal. No network.
   Also owns the email Join-button URL contract (gameday accept route). */
export const PLAYER_IMPORT_CAP = 200;
export const ROLES = ["owner", "coach_edit", "coach_view", "player"];
export const GAMEDAY_ACCEPT_ORIGIN = "https://getoffrd.com";
export const GAMEDAY_ACCEPT_PATH = "/gameday/OFFGRD.html";
export const SAFE_REDIRECT_HOSTS = ["getoffrd.com", "www.getoffrd.com", "offops.app", "www.offops.app"];

export function isSafeAppRedirect(raw) {
  const s = String(raw || "").trim();
  if (!s) return false;
  if (s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\")) {
    if (s.indexOf("://") >= 0) return false;
    return true;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = String(u.hostname || "").toLowerCase();
    return SAFE_REDIRECT_HOSTS.indexOf(host) >= 0;
  } catch (e) {
    return false;
  }
}

export function safeAppRedirect(raw) {
  return isSafeAppRedirect(raw) ? String(raw).trim() : null;
}

export function inviteAcceptUrl(token) {
  const base = GAMEDAY_ACCEPT_ORIGIN + GAMEDAY_ACCEPT_PATH;
  const t = String(token || "").trim();
  if (!t) return base;
  return base + "?invite=" + encodeURIComponent(t);
}

export function readInviteToken(search) {
  try {
    const q = new URLSearchParams(String(search || "").replace(/^\?/, ""));
    return String(q.get("invite") || "").trim();
  } catch (e) {
    return "";
  }
}

export function isInviteToken(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

export function isGamedayInviteAcceptUrl(href) {
  try {
    const u = new URL(String(href || ""), GAMEDAY_ACCEPT_ORIGIN);
    if (u.hostname !== "getoffrd.com") return false;
    if (u.pathname !== GAMEDAY_ACCEPT_PATH) return false;
    if (/select-role/i.test(u.pathname + u.search + u.hash)) return false;
    if (u.pathname === "/" || u.pathname === "/auth/select-role") return false;
    return true;
  } catch (e) {
    return false;
  }
}

export function normalizeInviteEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function isInviteEmail(value) {
  const e = normalizeInviteEmail(value);
  return e.length > 3 && e.length < 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function splitLoose(text) {
  return String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/[\n\r,;]+/)
    .map(function (part) { return part.trim(); })
    .filter(Boolean);
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; }
      else q = !q;
    } else if ((ch === "," || ch === "\t") && !q) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

/**
 * Paste: one email per line, or comma/semicolon separated.
 * Returns unique valid emails plus skip counts.
 */
export function parseInviteEmailList(text) {
  const seen = Object.create(null);
  const rows = [];
  let skippedBlank = 0;
  let skippedInvalid = 0;
  let skippedDupes = 0;
  const parts = String(text || "").replace(/^\uFEFF/, "").split(/[\n\r]+/);
  if (parts.length === 1 && /[,;]/.test(parts[0])) {
    return finalizeList(splitLoose(parts[0]), seen, rows, skippedBlank, skippedInvalid, skippedDupes);
  }
  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i].trim();
    if (!raw) { skippedBlank++; continue; }
    const emails = raw.indexOf(",") >= 0 || raw.indexOf(";") >= 0 ? splitLoose(raw) : [raw];
    for (let j = 0; j < emails.length; j++) {
      const e = normalizeInviteEmail(emails[j]);
      if (!e) { skippedBlank++; continue; }
      if (!isInviteEmail(e)) { skippedInvalid++; continue; }
      if (seen[e]) { skippedDupes++; continue; }
      seen[e] = true;
      rows.push({ email: e, name: "" });
    }
  }
  return { rows: rows, skippedBlank: skippedBlank, skippedInvalid: skippedInvalid, skippedDupes: skippedDupes };
}

function finalizeList(parts, seen, rows, skippedBlank, skippedInvalid, skippedDupes) {
  for (let i = 0; i < parts.length; i++) {
    const e = normalizeInviteEmail(parts[i]);
    if (!e) { skippedBlank++; continue; }
    if (!isInviteEmail(e)) { skippedInvalid++; continue; }
    if (seen[e]) { skippedDupes++; continue; }
    seen[e] = true;
    rows.push({ email: e, name: "" });
  }
  return { rows: rows, skippedBlank: skippedBlank, skippedInvalid: skippedInvalid, skippedDupes: skippedDupes };
}

function headerKind(cell) {
  const c = String(cell || "").trim().toLowerCase().replace(/^\uFEFF/, "");
  if (c === "email" || c === "e-mail" || c === "email address") return "email";
  if (c === "name" || c === "full name" || c === "player" || c === "player name") return "name";
  return "";
}

/**
 * CSV: tolerate `name,email` or `email,name`. Header optional.
 * If the first row has no header words, treat a cell that looks like an email as email.
 */
export function parseInviteCsv(text) {
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter(function (ln) { return ln.trim(); });
  const seen = Object.create(null);
  const rows = [];
  let skippedBlank = 0;
  let skippedInvalid = 0;
  let skippedDupes = 0;
  if (!lines.length) {
    return { rows: rows, skippedBlank: 0, skippedInvalid: 0, skippedDupes: 0 };
  }

  let emailIdx = -1;
  let nameIdx = -1;
  const first = parseCsvLine(lines[0]);
  const kinds = first.map(headerKind);
  if (kinds.indexOf("email") >= 0) {
    emailIdx = kinds.indexOf("email");
    nameIdx = kinds.indexOf("name");
    lines.shift();
  } else {
    for (let i = 0; i < first.length; i++) {
      if (isInviteEmail(first[i])) { emailIdx = i; break; }
    }
    if (emailIdx < 0) emailIdx = first.length > 1 ? 1 : 0;
    nameIdx = emailIdx === 0 ? 1 : 0;
    if (nameIdx >= first.length) nameIdx = -1;
  }

  for (let i = 0; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const email = normalizeInviteEmail(emailIdx >= 0 ? cols[emailIdx] : "");
    const name = nameIdx >= 0 ? String(cols[nameIdx] || "").trim() : "";
    if (!email && !name) { skippedBlank++; continue; }
    if (!isInviteEmail(email)) { skippedInvalid++; continue; }
    if (seen[email]) { skippedDupes++; continue; }
    seen[email] = true;
    rows.push({ email: email, name: name });
  }
  return { rows: rows, skippedBlank: skippedBlank, skippedInvalid: skippedInvalid, skippedDupes: skippedDupes };
}

/**
 * lookup: { existing: Set|string[], members: Set|string[], pending: Set|string[] }
 * existing = has an OFFGRD account. members = already on this roster.
 */
export function describeInvitePreview(parsed, lookup) {
  const rows = (parsed && parsed.rows) || [];
  const existing = toSet(lookup && lookup.existing);
  const members = toSet(lookup && lookup.members);
  const pending = toSet(lookup && lookup.pending);
  let alreadyAccount = 0;
  let alreadyMember = 0;
  let alreadyInvited = 0;
  let willInvite = 0;
  for (let i = 0; i < rows.length; i++) {
    const e = rows[i].email;
    if (members.has(e)) { alreadyMember++; continue; }
    if (pending.has(e)) { alreadyInvited++; continue; }
    if (existing.has(e)) { alreadyAccount++; continue; }
    willInvite++;
  }
  const skipped = (parsed.skippedDupes || 0) + (parsed.skippedInvalid || 0);
  return {
    total: rows.length,
    alreadyAccount: alreadyAccount,
    alreadyMember: alreadyMember,
    alreadyInvited: alreadyInvited,
    willInvite: willInvite,
    skippedDupes: parsed.skippedDupes || 0,
    skippedInvalid: parsed.skippedInvalid || 0,
    skipped: skipped,
    overCap: rows.length > PLAYER_IMPORT_CAP,
    cap: PLAYER_IMPORT_CAP,
  };
}

export function invitePreviewSentence(p) {
  if (!p.total) return "No valid emails in that list.";
  if (p.overCap) {
    return "That's " + p.total + " players. Import up to " + p.cap + " at a time.";
  }
  const bits = [p.total + " player" + (p.total === 1 ? "" : "s")];
  if (p.alreadyAccount) bits.push(p.alreadyAccount + " already have accounts");
  if (p.willInvite) bits.push(p.willInvite + " will be invited");
  if (p.alreadyMember) bits.push(p.alreadyMember + " already on the roster");
  if (p.alreadyInvited) bits.push(p.alreadyInvited + " already invited");
  let s = bits[0] + " — " + bits.slice(1).join(", ") + ".";
  if (p.skippedDupes) s += " " + p.skippedDupes + " duplicate" + (p.skippedDupes === 1 ? "" : "s") + " skipped.";
  if (p.skippedInvalid) s += " " + p.skippedInvalid + " invalid skipped.";
  return s;
}

function toSet(v) {
  const s = new Set();
  if (!v) return s;
  const arr = v instanceof Set ? Array.from(v) : (Array.isArray(v) ? v : []);
  for (let i = 0; i < arr.length; i++) s.add(normalizeInviteEmail(arr[i]));
  return s;
}
