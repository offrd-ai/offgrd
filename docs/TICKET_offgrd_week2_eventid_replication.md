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
     In-memory fold stays.
   - `POST /api/derive-live` is on preview v371 for a manual check only.
     It ships on the production pin Thursday. Until that pin, after any
     game events land run:
     `node scripts/derive-live-library.cjs --game-id=<uuid> --apply`
   - Trigger SQL (apply after the pin, not before):
     `docs/security/apply-offgrd-live-derive-notify.sql`.
     URL is `https://getoffrd.com/gameday/api/derive-live`
     (`/gameday/*` rewrites to the pinned deployment). Bearer comes from
     Supabase Vault name `derive_live_secret`. No config row. No preview host.
3. **Pin is the game_id.** Derivation keys by `caller_games.id`, then stamps
   opponent/date from the pin/game row — never from `session.opp = 'Live'`.
4. **Empty is unknown.** A successful exact-count `0` may clear a dest.
   `[]` without a count does not.

## Done
- [x] **B1a (2026-09-20):** client Live writers deleted, not no-op'd.
      `planLiveLibraryWrite` and `callerSyncToGames` are gone. O/D refold
      still fills the in-memory log. Season `push()` skips `source=live_call`
      and `week` matching `/^live/i`. Smoke: `scripts/smoke-caller-library-write.cjs`.
- [ ] **B1:** auto-derive within 60s of event ingest. No Friday pin of the
      derive route. It pins with the rest of Build B, one pin, after the
      game-iPad soak is green (not the night the preview deploys). Manual
      derive covered Friday. Matt sets `derive_live_secret` in Vault and
      applies the notify SQL right after that pin, pointed at
      getoffrd.com/gameday/api/derive-live. Green means one logged test
      event and `live_library_gaps` empty within 60s with no manual job.
      Until the pin: manual `derive-live-library.cjs --apply` after events land.
- [x] **B2 (browser 2026-09-23, preview v373):** ack map stores only ids
      this device's push returned. SOAK TEST 6: five snaps offline read
      `5 queued · offline`, nothing green. Network back, no tap: `5 saved · 0 synced`
      at 0s and 5s, then `5 saved · 5 synced` at 10s and it stayed. All 10 event
      ids (5 calls + 5 outcomes) are in this device's push-ack set. Sync button gone.
- [x] **B3 (browser 2026-09-23, preview v373):** client CAS, refuse-shrink,
      refuse-grow, and unpinned `applyRemote` session assignment are deleted.
      SQL refuse-shrink stays.
- [x] **B4 (browser 2026-09-23, preview v373):** census green only when the
      pinned game's snap rows equal this device's push-ack set and the count
      is > 0. Offline reads `N queued · offline` and is never green. The five
      outcomes are acked with the calls; the header counts snaps, so 5 saved
      and 10 acked ids is the same game.
- [x] **Derive Riverview Gardens · Live 2026-09-18** from cloud events
      (no journal): Our offense · 42, Their offense · 31.
      Script: `scripts/apply-riverview-918-bc5118b2.cjs --apply` (2026-09-20).
- [x] Reusable server derive job + CLI (`derive-live-library.cjs`).
- [x] `live_library_gaps` view SQL ready to apply.

## Schedule (corrected 2026-09-23)

No Friday pin of the derive route. It pins with Build B, one pin, after the
game-iPad soak is green. Production stays v370 until then.

- Wed 9/23: preview **v373** is Ready. Browser check passed (ack semantics,
  flap with no tap, census green on its own). Pin 373. Sync button gone.
  Judges gone.
- Then the soak on the game iPads. Any red line holds the Monday pin.
- Fri 9/25: no production pin. Hazelwood East recovered Monday night from the
  D iPad journal: Our offense 22, Their offense 45, under
  `576d2d63-fdbc-4f18-88d9-65819864f5da`. Thursday's test events superseded.
  Thursday's Live tombstones lifted (they blocked the same natural key).
- Production pin, one pin, only after the game-iPad soak is green. Order:
  Build B (B1 derive route, B2, B3, B4, penalty), Scout paging + library
  fallback, picker queued-badge and no pin-replace of a queued session.
  Then Matt sets the Vault secret and applies the notify SQL at
  getoffrd.com. B1 green: one test event, gaps view empty within 60s,
  no manual job. Preview tonight is that exact bit set so the soak matches
  the pin. Production stays v370 until the soak is green.

v372 and v376 are on `park/v372-v376`. They are not in this branch.

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
