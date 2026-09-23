/**
 * Build B1 — derive Live library rows when caller_events land.
 *
 * POST /api/derive-live
 *   Authorization: Bearer <DERIVE_LIVE_SECRET>
 *   { "gameId": "<uuid>" }
 *   or a Supabase database-webhook body whose record.game_id is set.
 *
 * Idempotent. Does not run without the secret. This route pins with Build B
 * on Monday, not on a game-day Friday. The DB trigger (Vault secret, not a
 * config row) posts to https://getoffrd.com/gameday/api/derive-live right
 * after that pin. Manual derive covers the game before the pin.
 * Do not point the trigger at a preview host.
 */
"use strict";

const { createClient } = require("@supabase/supabase-js");
const { deriveLiveLibrary } = require("../scripts/lib/derive-live-from-caller-game.cjs");

function gameIdFrom(body) {
  if (!body || typeof body !== "object") return "";
  if (body.gameId) return String(body.gameId);
  if (body.game_id) return String(body.game_id);
  const rec = body.record || body.new || null;
  if (rec && rec.game_id) return String(rec.game_id);
  return "";
}

function authorized(req) {
  const secret = process.env.DERIVE_LIVE_SECRET || "";
  if (!secret) return false;
  const header = String(req.headers.authorization || req.headers.Authorization || "");
  return header === "Bearer " + secret;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "POST only" });
    return;
  }
  if (!authorized(req)) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const gameId = gameIdFrom(body);
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) {
    res.status(400).json({ ok: false, error: "gameId required" });
    return;
  }
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    res.status(500).json({ ok: false, error: "supabase env missing" });
    return;
  }
  process.env.OFFGRD_ROOT = process.env.OFFGRD_ROOT || require("path").join(__dirname, "..");
  const sb = createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: "offgrd" },
  });
  try {
    const result = await deriveLiveLibrary(sb, gameId, { apply: true, log: function () {} });
    const plan = result.plan || {};
    res.status(200).json({
      ok: true,
      gameId: gameId,
      ours: plan.offense && plan.offense.rows,
      off: plan.defense && plan.defense.rows,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e && e.message ? e.message : "derive failed" });
  }
};

module.exports.gameIdFrom = gameIdFrom;
module.exports.authorized = authorized;
