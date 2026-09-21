# TICKET — Week 2: replicate by eventId, derive the library on the server

Start Monday **2026-09-21** (Build B). Not Sep 14 — that week is Build A
(device trust) per `docs/OFFGRD-PLAN-no-rigmarole-by-Sep-25.md`.
This ticket is the proof that live library rows never depend on a client fold.

## Why
v364 reminted outcomes on every `GAMES` hydrate and wrote them as new
`eventId`s. Client `callerSyncToGames` then merged those packs into the wrong
Season key (`Live|Live 2026-09-02|ours` went 24 → 86). Per-opponent retire
and Central ours never saw the pin. Fold hid it (one outcome per snap on
screen) while cloud counts drifted mid-session.

**Riverview 9/18 (caught Sep 20):** `caller_events` on game
`bc5118b2-cc21-45bd-89f9-2fd205c779cd` had O 42 / D 31 calls, but no
`scouting_games` Live rows. Build A removed after-write re-parent paths;
client library writes still exist but did not land for this game. Manual
gap until server derivation owns the write.

## The rule
**The ledger is `caller_events.event_id`.** Devices upsert events. The server
derives Season / Live rows from that ledger. The client does not write
`scouting_games` live rows.

## Design
1. **Upsert by `event_id`.** Same id is the same snap outcome. Remint is a
   no-op. Re-grade updates the row (payload + `client_ts`), it does not insert.
2. **Server-side derivation (deliverable #1 — started Sep 20).** Job reads
   `caller_events` for a `game_id`, folds with the same
   `OFFGRD-caller-log` fold, writes Live library rows
   (`opponent` + `Live {game_date}` + `ours`/`off`) from pin fields on
   `caller_games` — never from `session.opp = 'Live'`.
   - Module: `scripts/lib/derive-live-from-caller-game.cjs`
   - CLI: `node scripts/derive-live-library.cjs --game-id=<uuid> [--apply]`
   - Gap view (Matt apply): `docs/security/apply-offgrd-live-library-gaps-view.sql`
   - Client `planLiveLibraryWrite` / `callerSyncToGames` are **deleted** (B1a).
     In-memory fold stays. Auto-derive on ingest is Monday (B1).
3. **Pin is the game_id.** Derivation keys by `caller_games.id`, then stamps
   opponent/date from the pin/game row — never from `session.opp = 'Live'`.
4. **Empty is unknown.** A successful exact-count `0` may clear a dest.
   `[]` without a count does not.

## Done
- [x] **B1a (2026-09-20):** client Live writers deleted, not no-op'd.
      `planLiveLibraryWrite` and `callerSyncToGames` are gone. O/D refold
      still fills the in-memory log. Season `push()` skips `source=live_call`
      and `week` matching `/^live/i`. Smoke: `scripts/smoke-caller-library-write.cjs`.
- [ ] **B1 (Mon AM):** auto-derive within 60s of event ingest. Not green until
      `live_library_gaps` empties with nobody running the Node job.
- [x] **Derive Riverview Gardens · Live 2026-09-18** from cloud events
      (no journal): Our offense · 42, Their offense · 31.
      Script: `scripts/apply-riverview-918-bc5118b2.cjs --apply` (2026-09-20).
- [x] Reusable server derive job + CLI (`derive-live-library.cjs`).
- [x] `live_library_gaps` view SQL ready to apply.

## Not in order until Build B (Sep 21)
- Do not pin anything to production without a green game-iPad soak.
- Do not add new caller surfaces.
- Client live-library write → no-op only after derive is on the post-sync path.

## Acceptance
- [x] Riverview Live ours / off exist without a client library write (server job)
- [ ] Three boots on preview: outcome count == graded snaps for the pin id
- [ ] Live ours / off rows for Central still 53 / reconstructed D without drift
- [ ] Drill `Live|2026-09-02|ours` stays 21; Friday `ce16f75d` stays 149/65
- [ ] A remint hydrate cannot grow `caller_events` or `scouting_games.rows`
- [ ] Client `fromCall` live writes are no-ops; gaps view stays empty after games
