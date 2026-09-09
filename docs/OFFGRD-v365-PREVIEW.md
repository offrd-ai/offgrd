# v365 preview — deterministic outcomes, no hydrate under a pin

Preview only. Production stays **v364** through Thursday.

`https://offgrd-git-preview-v365-outcome-ids-offrd.vercel.app/OFFGRD.html`

Chip may say **v365** on this host. Home-screen getoffrd.com stays v364.

## What changed
- Outcome `eventId` = `outcomeEventId(gameId, side, playIndex)` (deterministic UUID).
  Remint and three boots write the same id. `ignoreDuplicates` is a no-op.
- `callerHydrateFromGames` returns immediately when a gameday pin exists.

## Soak (device, before any production pin)
1. Safari against the preview host (empty origin LS). Do not Clear History.
2. Pick Parkway Central. Log N snaps. Grade them.
3. Force-quit / reopen three times on wifi (this host may hydrate — that is the test).
4. Export-all: opponent is Parkway Central on every event, never `Live`.
5. **DB check:** `caller_events` for the pin id, `type = outcome` count == graded snaps.
   Not 4× the snaps. Not a leftover South/North gameId.

Fail → stay v364. Do not pin-assets on `main`.
