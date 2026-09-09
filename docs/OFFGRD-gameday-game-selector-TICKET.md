# TICKET — Gameday game selector: pick tonight's game once, lock it, show the logo

Matt (Sep 8, mid-soak): Scout page on Parkway Central → Gameday opens on
Central → after a refresh/reopen the caller flips to Parkway North.
"There needs to be a selector on game day to make sure the person is in
the correct game and they can see the logo of who they're playing."

## Why this matters more than it looks
The caller currently RE-RESOLVES the opponent on every boot/refresh
(schedule "next game" / scout selection / last session — whichever wins).
That resolver flipped Central ↔ North tonight. v362's session rotation
treats an opponent change as a new game and mints a new gameId — so a
bouncing resolver fragments a live game across ids (tonight's O soak:
14 saved → 1 saved → 0 snaps / 1 queued). The resolver is the trigger.

## The rule
**The caller never guesses the opponent.** A session is pinned to
(opponent, gameId, side) at the moment the operator confirms it, and
nothing re-resolves it until Exit.

## Design
1. **Gameday landing = game picker.** Cards for the schedule's games around
   today (yesterday → +7 days), each with the opponent LOGO, name, date,
   home/away, and a Live badge if a session already exists for it. The
   scheduled game nearest today is pre-highlighted, never auto-entered.
   One tap → "Start / Resume · vs Parkway Central" → caller opens.
2. **Header shows the logo + name of the pinned opponent** on both callers,
   large enough to read from arm's length. If the operator is in the wrong
   game, that is visible in one glance.
3. **Pinned means pinned.** Refresh, force-quit, reopen, build update, sync
   pull — all restore the pinned session by gameId. No resolver runs while
   a session is pinned. Changing opponent requires Exit → pick again; that
   is the ONLY path that may rotate a gameId.
4. **Resume.** If a pinned session exists with snaps, the picker shows
   "Resume · vs Central · 22 snaps · started 6:41 PM" on that card and
   opens it. A second card "Start new game" is available but never default.
5. **Both callers share the pin.** Picking the game once pins it for O and
   D on that device; a second device picks independently (same gameId via
   schedule key opponent+date, so they merge).
6. **Scout page selection does not drive the caller.** Scout has its own
   opponent selector for prep; the caller's pin comes only from the picker.

## Not in scope
- Multi-game days (JV/varsity same night) beyond the picker showing both.
- Anything about the ledger/rotation internals — this ticket removes the
  trigger; the rotation fix (rotate only on explicit Exit→pick) is Cursor's
  v363 item.

## Acceptance
- [ ] Gameday opens to the picker with logos; nothing auto-enters a caller
- [ ] Refresh / force-quit / reopen / build update → same opponent, same
      gameId, same snaps (verified in the soak, both sides)
- [ ] Scout page set to any opponent does not change the pinned caller game
- [ ] Only Exit → pick can change the opponent; doing so is the only
      gameId rotation
- [ ] Header shows opponent logo + name on O and D callers
- [ ] Two devices picking "vs Central · Sep 10" land on the same gameId
- [ ] Export-all shows opponent = Parkway Central on every O and D event,
      never `Live`. Both stores carry the pinned opponent (v360 O opened
      with `session.opp = 'Live'` and tagged 48 events that way; D on the
      same device was Central. A Live library row never matches
      per-opponent retire.)
