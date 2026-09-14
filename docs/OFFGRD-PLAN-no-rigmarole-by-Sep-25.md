# O Caller and D Caller just work — no files, any connectivity — by Sep 25

Written Sunday 2026-09-13. Dates below are confirmed against the calendar
(Sep 13 = Sunday). Build A this week. Build B next week. Nothing else
until then.

## The target process (the only thing a team ever does)

1. Open the OFFGRD icon. Pick tonight's game (logo). Play.
   Wifi on, wifi off, cellular, airplane — doesn't matter. Nothing to set.
2. At home, or whenever the device sees a signal, the game is in the cloud
   by itself. The header says so with numbers (`61 snaps · 61 saved ·
   61 synced`). No Sync button to remember, no "keep?" prompts.
3. Monday: import the film. Live taps retire themselves.

Exports still happen — automatically, silently, to Files — but no coach
ever touches a JSON file again unless a device is physically destroyed.

## Why files exist today (the defect class, all of it)

Everything that touches a game's events AFTER they're written:
adopt/retarget onto a pin, hydrate-from-cloud, remint outcomes, restamp
sessions, blob compare-and-swap with shrink refusals, client-side library
writes, Safari-vs-icon partitions. Both lost games were this list. The
callers themselves logged 65 and 53 clean snaps under game conditions.

## Dates (confirmed)

| When | What |
|---|---|
| Mon 14 – Tue 16 | Cursor: Build A only. Preview URL (protection off) when ready. |
| The day the preview lands | Matt verifies the preview — every after-write path gone, side-scoping, D call = snap, Safari refused — before it goes near an iPad. |
| Wed 16 or Thu 17 | Dirty-iPad soak on the **actual game iPads**. No fresh install before the soak — the history is the test. Green on both → pin Thursday. Then fresh install for Friday. |
| Fri 18 | Icon only. Pick the game. Airplane. File-first one more time. Build A if Thursday was green, v364 if not. |
| Sat 19 – Sun 20 | Read Friday's exports by timestamp. No new work. |
| Mon 21 – Wed 23 | Build B on preview. |
| Thu 24 | Two-device flap soak on the game iPads. Green → pin. Not green → Sep 25 is still file-first. |
| Fri 25 | First no-rigmarole game **only if Thursday was green.** Airplane optional. Silent auto-export stays as insurance. |
| Mon 28+ | Lafayette onboard on Build B. Queue (play-type, folders, nudge, customization) resumes. |

None of those weekdays are wrong. Sep 17 and Sep 24 are Thursdays. Sep 18
and Sep 25 are Fridays.

What *was* wrong, and is superseded by this file:

- `docs/TICKET_offgrd_week2_eventid_replication.md` said start Mon **Sep 14**.
  That is Build B. It starts Mon **Sep 21**. Starting it tomorrow is the
  slip this plan exists to prevent.
- Reliability standard said "Week 2 after Sep 11." Central 9/10 recovery
  ate that week. The work did not move earlier; the calendar did.

## Two weeks, two builds, no features

### Build A — the device is trustworthy (Sep 14–17)

§1 Delete every after-write path: `retargetGameId`, `adoptIfPinned`
   re-keying, `callerHydrateFromGames`, `migrateV1Log` remint, restamp.
   Leftover sessions are archived under their own ids. Period.
§2 Every check side-scoped `(gameId, side)`: next index, open snap, graded,
   census, export.
§3 D call = snap; next call closes the last; yards optional.
   Ticket: `docs/OFFGRD-dcaller-call-is-snap-TICKET.md`.
§4 One identity: iOS Safari is read-only for callers; device id per install.
§5 The dirty-iPad soak, Wednesday or Thursday, on the game iPads
   themselves (two weeks of history — do not fresh-install before the
   soak): pick new game → 0 foreign events; 30 O + 30 D with yards →
   30/30 outcomes; force-quit ×3; wifi → census green; Safari refused.
   Green on both → pin Thursday. Then fresh install for Friday.

Sep 18: icon only, pick the game, airplane, file-first one more time.

Monday film is unchanged and is not code: send the Central film when
the crew has it so the book keeps growing while the foundation is fixed.

### Build B — the cloud is a mirror, not a judge (Sep 21–24)

Week 2 ticket, start **Sep 21**: replicate by `event_id` (push unacked rows,
pull unseen rows, idempotent, retries on flap, runs whenever any
connectivity exists); server derives Live/library rows from events; delete
CAS, shrink/grow refusals, client library writes, keep-prompts, Sync button.
Census compares device ledger to server ack. Two-device soak with flapping
wifi on the game iPads. Green = pin Thu Sep 24.

Sep 25 game: the first no-rigmarole game. Airplane optional. No exports
required (they still fire silently as insurance).

### Then, and only then (Sep 28+)

Onboard the next program on Build B: paste O plays, paste D vocab, set
perspective, done. Lafayette first. The queue resumes.

## Rules that hold until Sep 25

- Cursor works on A then B. Nothing else.
- No production push without a green soak on the **game iPads**.
- Preview is a Vercel preview URL (or an unpinned `main`). Production is
  a pin (`pin-assets` → getoffrd.com chip). Do not invent a `release`
  branch this fortnight — that is other work. The rule is preview ≠ prod.
- Claude verifies each build on the **preview** host before it reaches an
  iPad, then reads every export by timestamp, not by trust. getoffrd.com
  is not the verify host.
- Game iPads: no fresh install before the soak (history is the test).
  After a green Thursday pin: fresh install for Friday. Icon only,
  never Safari, auto-export on, file first after the Sep 18 game.

## What would make this slip, honestly

Another feature or "quick fix" landing in the same two weeks. That is the
only thing that has ever slipped this.
