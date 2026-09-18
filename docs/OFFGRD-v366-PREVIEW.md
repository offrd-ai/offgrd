# v366 preview — Build A (device is trustworthy)

Preview only. Production stays **v364** until a green dirty-iPad soak
and a Thursday pin (target Thu Sep 17).

Matt verifies this host the day it lands. Not an iPad until that pass.

## What changed
- After-write paths **deleted, not no-op'd**: `retargetGameId`,
  `retargetLive`, `adoptIfPinned`, `callerHydrateFromGames`,
  `migrateV1Log`, `restampStaleSession` no longer exist. Smokes assert
  absence. Leftover sessions stay under their own ids and real dates;
  pick() is the only place a session takes an identity.
- Fold / next index / graded / census are `(gameId, side)`.
  65 O outcomes on a game id do not occupy D indexes.
- D call is the snap. Same Run/Pass within 3s amends. Anything else
  opens the next snap. Yards optional.
- iOS Safari is view-only. Home-screen icon writes. Safari mints its
  own device id.
- Census strip + pending pill in the header on every caller screen,
  guided included.
- Maple Lake fix: the picker with zero games offers both "add opponent
  from the library" and "enter tonight's opponent." A fallback opponent
  ("Live"/"ANY") can never pin; a caller never opens on "Live."

## Verify (desktop / preview host — before any iPad)
1. After-write paths gone: pick a game, leftover history does not appear
   on the new pin. Export: every event keeps the gameId it was written with.
2. Side-scope: a game that already has O snaps, open D, log 10 D snaps →
   10 D calls, indexes 0–9.
3. D call = snap: Run, then Pass (no yards) → two snaps. Run, Run inside
   3s → one snap.
4. Safari refused: open this host in iOS Safari (not the icon) → banner
   "Open the OFFGRD icon to log." Taps do not write.
5. Empty picker: clear schedule → picker shows library cards and the
   tonight's-opponent input; typing "Live" does not start a game.

Fail → stay v364. Do not pin.

## Soak (game iPads, Wed or Thu — no fresh install first)
The six-scenario gate in `docs/OFFGRD-PLAN-no-rigmarole-by-Sep-25.md`
(Build A → "The soak that gates each pin"). History is the test.
Any red line = no pin. Green on both → pin Thursday, then fresh
install for Friday.
