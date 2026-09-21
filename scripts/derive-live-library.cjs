/**
 * Build B #1 CLI — derive Live library from caller_events.
 *
 *   node scripts/derive-live-library.cjs --game-id=bc5118b2-cc21-45bd-89f9-2fd205c779cd
 *   node scripts/derive-live-library.cjs --game-id=... --apply
 *   node scripts/derive-live-library.cjs --game-id=... --apply --expect-ours=42 --expect-off=31
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { deriveLiveLibrary } = require("./lib/derive-live-from-caller-game.cjs");

const ROOT_ENV = process.env.OFFGRD_ENV || "D:/mattb/OFFRD FILES 25/.env.local";

function loadEnv(p) {
  const out = {};
  if (!fs.existsSync(p)) return out;
  fs.readFileSync(p, "utf8").split(/\n/).forEach((line) => {
    const s = line.trim();
    if (!s || s[0] === "#") return;
    const i = s.indexOf("=");
    if (i < 1) return;
    let v = s.slice(i + 1).trim();
    if ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'")) {
      v = v.slice(1, -1);
    }
    out[s.slice(0, i).trim()] = v;
  });
  return out;
}

function arg(name) {
  const hit = process.argv.find((a) => a.indexOf("--" + name + "=") === 0);
  return hit ? hit.slice(name.length + 3) : null;
}

(async function main() {
  const gameId = arg("game-id") || arg("game");
  if (!gameId) {
    console.error("Usage: node scripts/derive-live-library.cjs --game-id=<uuid> [--apply] [--expect-ours=N] [--expect-off=N]");
    process.exit(2);
  }
  const apply = process.argv.indexOf("--apply") >= 0;
  const expect = {};
  if (arg("expect-ours") != null) expect.ours = +arg("expect-ours");
  if (arg("expect-off") != null) expect.off = +arg("expect-off");

  const env = Object.assign(
    {},
    loadEnv("D:/mattb/OFFRD FILES 25/.env"),
    loadEnv(ROOT_ENV),
    process.env
  );
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("no SUPABASE_URL / SERVICE_ROLE_KEY");

  const { createClient } = require("D:/mattb/OFFRD FILES 25/node_modules/@supabase/supabase-js");
  const sb = createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: "offgrd" },
  });

  const result = await deriveLiveLibrary(sb, gameId, {
    apply: apply,
    expect: Object.keys(expect).length ? expect : null,
  });
  if (result.dryRun) {
    console.log("Dry-run. Pass --apply to write scouting_games.");
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
