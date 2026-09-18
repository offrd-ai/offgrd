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

## The rule
**The ledger is `caller_events.event_id`.** Devices upsert events. The server
derives Season / Live rows from that ledger. The client does not write
`scouting_games` live rows.

## Design
1. **Upsert by `event_id`.** Same id is the same snap outcome. Remint is a
   no-op. Re-grade updates the row (payload + `client_ts`), it does not insert.
2. **Server-side derivation.** A function or job reads `caller_events` for a
   `game_id` and writes the Live library row (`opponent` + `Live {game_date}` +
   side) from the fold of those events. Client `planLiveLibraryWrite` /
   `callerSyncToGames({ fromCall: true })` becomes a no-op for live dests.
3. **Pin is the game_id.** Derivation keys by `caller_games.id`, then stamps
   opponent/date from the pin/game row — never from `session.opp = 'Live'`.
4. **Empty is unknown.** A successful exact-count `0` may clear a dest.
   `[]` without a count does not.

## Not in order until Build B (Sep 21)
- Do not start this ticket during Build A (Sep 14–17).
- Do not pin anything to production without a green game-iPad soak.
- Do not add new caller surfaces.

## Acceptance
- [ ] Three boots on preview v365: outcome count == graded snaps for the pin id
- [ ] Live ours / off rows for Central exist without a client library write
- [ ] Drill `Live|2026-09-02|ours` stays 21; Friday `ce16f75d` stays 149/65
- [ ] A remint hydrate cannot grow `caller_events` or `scouting_games.rows`
