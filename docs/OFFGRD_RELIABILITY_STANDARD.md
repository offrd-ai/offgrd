# OFFGRD RELIABILITY STANDARD — ledger-first game logging

Matt (Sep 8, after losing the 9/4 D log): "we are trying to commercialize
this product and this unreliability is unacceptable. It needs to run on
normal WiFi or cellular, or airplane mode and work. This is for FOOTBALL."

This document is the bar and the design that meets it. It supersedes the
"sync-integrity batch" that has been queued since August; that batch was
fencing the problem. This replaces the thing being fenced.

Feature freeze until the ledger ships. Queued surfaces (play-type polish,
D-vocab, folders, post-game nudge) resume after Week 2.

## The bar (product promise, testable)

1. **A tap is permanent the instant it lands.** Power loss, force-quit,
   crash, or update one second later — the snap exists. No exceptions.
2. **Connectivity is irrelevant to correctness.** WiFi, cellular, flapping
   cellular, airplane, or a stadium with 12,000 phones: the log is the
   same. Sync is a background copy, never a gate and never an arbiter.
3. **Two devices, one game, no rules to remember.** O iPad + D iPad + a
   booth laptop all log the same game simultaneously and merge without
   prompts, storms, or "never Sync from the second device."
4. **Nothing is ever silently empty.** The screen always shows what is
   saved and what is synced, as numbers. A green banner means the numbers
   reconcile; otherwise it isn't green.
5. **A build update can't touch a game.** Session identity is fixed at
   creation. No restamp, no re-key, no migration that rewrites a ledger.
6. **Every game leaves the device as a file automatically** — halftime,
   final, and on demand — so recovery never depends on the app.

## The design: an append-only ledger is the source of truth

### Storage (device)

- **IndexedDB journal**, one row per event, `eventId` primary key,
  written in a transaction *before* anything else reacts to the tap.
  Immutable: rows are never updated or deleted. Corrections, undos, and
  clears are *new rows* that reference the eventId they affect.
- A synchronous localStorage mirror (`offgrd_caller_journal_ls_v1`) is
  written in the same tap turn so iOS force-quit cannot lose the row
  while IndexedDB is still committing.
- The current "store" (`offgrd_caller_events_v2` etc.) becomes a
  **derived view** rebuilt from the journal on boot. It can be corrupted,
  restamped, or wiped and the game still exists.
- Game identity: `gameId` assigned once at session creation, stored on
  every row. No code path may reassign it. A new opponent is a new
  game: end the prior session and mint a new `gameId`. The view and
  census rebuild from that `gameId` only — never the whole journal.
  Week 2 deletes restamp as a concept; a stale session is simply
  *listed* under its real date.
- Clear = a `clear` row (tombstone) with a 30-minute Undo. The journal
  keeps everything; the view hides it.

### Sync (cloud) — Week 2

- **Replication, not reconciliation.** Push = every journal row not yet
  acknowledged by the server, in order, idempotent by `eventId`. Pull =
  every server row for the team's games this device hasn't seen. Union
  by `eventId`. That is the entire protocol.
- No blob writes, no compare-and-swap on a game object, no "library
  thinner than stored — refused," no empty-is-unknown heuristics. The
  server is an append-only table of events keyed by eventId (it already
  nearly is: `caller_events`). Derived rows (`scouting_games` counts,
  Live rows) are recomputed server-side from events, never written by
  clients.
- Runs continuously when any connectivity exists; queues when none;
  retries on flap. Airplane mode becomes a *preference* for battery and
  focus, not a data-safety rule.
- Multi-device: two devices logging the same game produce two streams
  with distinct deviceIds; the fold orders by clientTs and playIndex per
  side. No prompts. "Keep?" dialogs are removed.

### Visibility (screen)

- Persistent census on every caller screen:
  `O: 61 snaps · 61 saved · 58 synced · last 9:02 PM`.
  Saved ≠ snaps → red. Synced < saved with connectivity → amber with
  "syncing"; without connectivity → neutral "offline, N queued".
- "All synced" / green is rendered only when saved == synced == snaps
  **and snaps > 0**. Empty is never green.

### Backups (files)

- Automatic export of the *journal* at halftime, final whistle, every
  25 snaps, and on app background. One tap to AirDrop/share.
- Export cannot be empty while a game has journal rows.

## Sequencing

**v361 rolled back (Mon 2026-09-07).** Opening O Caller for Parkway
Central rebuilt the view from the whole journal (Friday South 65 +
Wednesday drill 19) because hydrate was not scoped by `session.gameId`
and the still-open Friday session (`ce16f75d`, `inProgress: true`) was
inherited. Census counted the journal, not the active game.

**Pinned v362 (Mon 2026-09-07 night, Matt: soak on getoffrd.com).**
Rebuild filters by the active `gameId` only; a new opponent mints a
new `gameId` and ends the prior session; census `saved`/`synced` are
calls for that game, the same unit as snaps. Chip must read **v362**.

- **Soak on the home-screen app.** Scenario 1: airplane, 60 snaps
  across O and D, force-quit mid-game, reopen → count = 60. Scenario
  2-lite: reconnect on wifi against the live cloud (South row +
  Wednesday drill already there) → still 60, cloud 60, census green.
  Open a *different* opponent: header and log are empty for that
  gameId; Friday stays in the journal under its own id. Either fail →
  roll back to v360; keep the export files.
- **Wednesday practice** is the gate for Friday: both callers, DC
  included, census line visible, a halftime auto-export that actually
  lands in Files.
- **Thursday freeze. Friday Sep 11 on v362 only if soak passed.**
- **Week 2 starts after Sep 11:** replication sync + server-side
  derivation + remove restamp / CAS / keep-prompts + soak suite in CI.
- Feature freeze holds through all of it. No new caller surfaces.

The sentence that is the bar: *an empty or restamped store cannot erase
a game that still has journal rows.* Friday's D log would have survived
that.

- No pin ships with a red soak. Full soak that would have caught 9/4:

  1. Airplane, log 60 snaps across O and D, force-quit mid-game, reopen,
     count = 60.
  2. Advance clock 3 days, deploy a new build, reopen on wifi against a
     cloud with stale/empty/conflicting state → count = 60, cloud = 60.
  3. Two devices, same game, both logging, both flapping wifi → union
     correct, zero prompts.
  4. Kill the app during a save → journal has the row or doesn't; never a
     half-written store.
  5. Clear + Undo within 30 min → full restore.

## Why this is the commercial line

A coach will forgive a clumsy button. He will not forgive losing a game.
The product's promise is "we remember what you saw." Everything above is
the minimum for that sentence to be true under stadium conditions, and
it is the difference between a beta with friendly users and a product
that can be sold to a program that doesn't know you.
