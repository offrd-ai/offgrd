/**
 * Build B #1 — derive Live library rows from caller_events for one game.
 *
 * Fold is the same client fold (OFFGRD-caller-log) run server-side against
 * the ledger. Writes offgrd.scouting_games keyed by pin opponent + Live {date}.
 *
 *   const { deriveLiveLibrary } = require("./lib/derive-live-from-caller-game.cjs");
 *   await deriveLiveLibrary(sb, gameId, { apply: true });
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = process.env.OFFGRD_ROOT || path.join(__dirname, "..", "..");

function loadCaller() {
  const sandbox = {
    console,
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  ["OFFGRD-caller-side.js", "OFFGRD-caller-outcome.js", "OFFGRD-caller-log.js"].forEach((f) => {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox);
  });
  return sandbox;
}

function mapEventRow(r) {
  if (!r) return null;
  return {
    eventId: r.event_id,
    gameId: r.game_id,
    playIndex: r.play_index,
    type: r.type,
    payload: r.payload || {},
    deviceId: r.device_id,
    actorId: r.actor_id,
    clientTs: Number(r.client_ts),
    seq: r.seq,
    superseded: !!r.superseded,
    teamId: r.team_id,
    side: r.side === "defense" ? "defense" : r.side === "offense" ? "offense" : null,
  };
}

function dbToNum(db) {
  if (db === "GOAL") return 3;
  if (db === "1-3") return 2;
  if (db === "4-6") return 5;
  if (db === "7-9") return 8;
  if (db === "10+") return 10;
  return null;
}

function toSeasonRow(S, l, opts) {
  opts = opts || {};
  const eventSide = opts.eventSide;
  const opp = opts.opponent;
  const week = opts.week;
  const date = opts.date;
  const base = {
    date: l.date || date,
    opponent: l.opponent || opp,
    down: +l.dn || 1,
    distance: dbToNum(l.db),
    fieldZone: l.zone && l.zone !== "ANY" ? l.zone : "",
    hash: l.hash && l.hash !== "ANY" ? l.hash : "",
    coverage: l.coverage || "",
    front: l.front != null && l.front !== "" ? l.front : null,
    pressure: l.pressure != null && l.pressure !== "" ? l.pressure : null,
    play: l.play,
    playType: l.playType || null,
    gain: l.gain != null ? l.gain : null,
    success: l.success,
    result: l.result || null,
    flag: l.flag || null,
    negated: !!l.negated,
    concept: l.conceptOverride || l.concept || null,
    family: l.family || null,
    play_id: l.play_id || null,
    source: "live_call",
    callId: l.id || l.eventId || null,
    gameWeek: week,
  };
  if (l.penalty) base.penalty = l.penalty;
  return S.stampRow(base, eventSide, l, []);
}

function foldSide(sandbox, evs, gameId, eventSide, meta) {
  const S = sandbox.OFFGRD_CALLER_SIDE;
  const L = sandbox.OFFGRD_CALLER;
  const sideEvs = (evs || []).filter((e) => e && e.side === eventSide && !e.superseded);
  const folded = L.foldCallerEvents(sideEvs, { side: eventSide, gameId: gameId });
  const log = folded.log || [];
  const rows = log.map((l) => toSeasonRow(S, l, Object.assign({ eventSide: eventSide }, meta)));
  const calls = sideEvs.filter((e) => e.type === "call").length;
  return { eventSide: eventSide, dest: S.eventSideToSeasonSide(eventSide), calls: calls, logN: log.length, rows: rows };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb  client with db.schema offgrd OR .schema('offgrd')
 * @param {string} gameId
 * @param {{ apply?: boolean, expect?: { ours?: number, off?: number }, log?: Function }} opts
 */
async function deriveLiveLibrary(sb, gameId, opts) {
  opts = opts || {};
  const apply = !!opts.apply;
  const log = typeof opts.log === "function" ? opts.log : console.log.bind(console);
  const OG = typeof sb.schema === "function" ? sb.schema("offgrd") : sb;

  const { data: game, error: gErr } = await OG.from("caller_games").select("*").eq("id", gameId).maybeSingle();
  if (gErr) throw gErr;
  if (!game) throw new Error("caller_games missing " + gameId);

  const opponent = String(game.opponent || "").trim();
  const gameDate = String(game.game_date || "").slice(0, 10);
  if (!opponent || /^live$/i.test(opponent)) {
    throw new Error("refuse derive: opponent is unset or 'Live' (" + opponent + ")");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(gameDate)) {
    throw new Error("refuse derive: game_date missing/invalid (" + game.game_date + ")");
  }
  const week = "Live " + gameDate;
  const teamId = game.team_id;
  const meta = { opponent: opponent, week: week, date: gameDate };

  const { data: rawEvs, error: eErr } = await OG.from("caller_events")
    .select("*")
    .eq("game_id", gameId)
    .eq("team_id", teamId)
    .order("client_ts", { ascending: true });
  if (eErr) throw eErr;
  const evs = (rawEvs || []).map(mapEventRow);

  const sandbox = loadCaller();
  const o = foldSide(sandbox, evs, gameId, "offense", meta);
  const d = foldSide(sandbox, evs, gameId, "defense", meta);

  if (o.calls !== o.logN) {
    throw new Error("offense fold mismatch calls=" + o.calls + " log=" + o.logN);
  }
  if (d.calls !== d.logN) {
    throw new Error("defense fold mismatch calls=" + d.calls + " log=" + d.logN);
  }
  if (opts.expect) {
    if (opts.expect.ours != null && o.rows.length !== opts.expect.ours) {
      throw new Error("expect ours " + opts.expect.ours + " got " + o.rows.length);
    }
    if (opts.expect.off != null && d.rows.length !== opts.expect.off) {
      throw new Error("expect off " + opts.expect.off + " got " + d.rows.length);
    }
  }

  async function libHit(side) {
    const { data, error } = await OG.from("scouting_games")
      .select("id,opponent,week,side,source,rows")
      .eq("team_id", teamId)
      .eq("opponent", opponent)
      .eq("week", week)
      .eq("side", side);
    if (error) throw error;
    return (data || [])[0] || null;
  }

  const oursHit = await libHit("ours");
  const offHit = await libHit("off");

  const plan = {
    gameId: gameId,
    teamId: teamId,
    opponent: opponent,
    week: week,
    gameDate: gameDate,
    offense: { calls: o.calls, rows: o.rows.length, existing: oursHit ? (oursHit.rows || []).length : null, libId: oursHit && oursHit.id },
    defense: { calls: d.calls, rows: d.rows.length, existing: offHit ? (offHit.rows || []).length : null, libId: offHit && offHit.id },
    apply: apply,
  };
  log(JSON.stringify(plan, null, 2));

  if (!apply) {
    return { dryRun: true, plan: plan, oursRows: o.rows, offRows: d.rows };
  }

  async function upsertLib(side, rows, hit) {
    if (!rows.length) {
      log("skip empty", side);
      return null;
    }
    if (hit && Array.isArray(hit.rows) && hit.rows.length > rows.length) {
      throw new Error(
        "refuse shrink " + side + " " + hit.rows.length + " → " + rows.length + " (set allow via SQL hatch if intentional)"
      );
    }
    const libRow = {
      team_id: teamId,
      opponent: opponent,
      week: week,
      side: side,
      source: "live_call",
      rows: rows,
    };
    if (hit && hit.id) libRow.id = hit.id;
    const { data: saved, error: sErr } = await OG.from("scouting_games")
      .upsert(libRow)
      .select("id,opponent,week,side,rows")
      .single();
    if (sErr) throw sErr;
    const n = Array.isArray(saved.rows) ? saved.rows.length : 0;
    if (n !== rows.length) throw new Error("library " + side + " n=" + n + " expected " + rows.length);
    const label = side === "ours" ? "Our offense" : "Their offense";
    log("VERIFY", saved.opponent + " · " + saved.week + " · " + label + " · " + n);
    return saved;
  }

  const oursSaved = await upsertLib("ours", o.rows, oursHit);
  const offSaved = await upsertLib("off", d.rows, offHit);
  return { dryRun: false, plan: plan, ours: oursSaved, off: offSaved };
}

module.exports = {
  deriveLiveLibrary: deriveLiveLibrary,
  loadCaller: loadCaller,
  mapEventRow: mapEventRow,
  toSeasonRow: toSeasonRow,
};
