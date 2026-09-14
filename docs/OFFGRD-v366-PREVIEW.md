# v366 preview — Build A (device is trustworthy)

Preview only. Production stays **v364** until a green dirty-iPad soak
and a Thursday pin.

Matt verifies this host the day it lands. Not an iPad until that pass.

## What changed
- `retargetGameId` / `retargetLive` / `adoptIfPinned` re-keying are gone.
  Leftover sessions stay under their own ids.
- `callerHydrateFromGames` is a no-op. Library rows do not remint events.
- Restamp archives an empty leftover. It does not rewrite event gameIds.
- Fold / next index / graded / census are `(gameId, side)`.
  65 O outcomes on a game id do not occupy D indexes.
- D call is the snap. Same Run/Pass within 3s amends. Anything else
  opens the next snap. Yards optional.
- iOS Safari is view-only. Home-screen icon writes. Safari mints its
  own device id.

## Verify (desktop / preview host — before any iPad)
1. After-write paths gone: pick a game, leftover history does not appear
   on the new pin. Export: every event keeps the gameId it was written with.
2. Side-scope: a game that already has O snaps, open D, log 10 D snaps →
   10 D calls, indexes 0–9.
3. D call = snap: Run, then Pass (no yards) → two snaps. Run, Run inside
   3s → one snap.
4. Safari refused: open this host in iOS Safari (not the icon) → banner
   "Open the OFFGRD icon to log." Taps do not write.

Fail → stay v364. Do not pin.

## Soak (game iPads, Wed or Thu — no fresh install first)
`docs/OFFGRD-PLAN-no-rigmarole-by-Sep-25.md` §5. History is the test.
Green on both → pin Thursday, then fresh install for Friday.
