# OFFGRD support runbook — game-night failure modes and exact fixes

Written 2026-09-15 for a non-engineer running support. Five failure modes,
each with: how you recognize it, what you check, the exact fix, and what
you must NOT do. Sources: the 9/4 and 9/10 postmortems, the airplane SOP,
and `IOS_CALLER_UPDATE.md`. Current for v364 → Build A (v366). Build B
(event replication, target Sep 24) retires the steps marked ⚙.

## The four standing rules (prevent 90% of tickets)

1. **The chip is the only proof.** Tools → build chip must read the pinned
   version before kickoff. Wrong chip → force-quit the home-screen app on
   wifi, reopen, read again. Never clear site data to "refresh."
2. **Home-screen icon only on game devices.** Safari is view-only (Build A
   enforces this with a banner). A Safari tab is a *different device* with
   its own storage — logging there splits the game.
3. **Never clear History/Website Data on a game device.** That deletes the
   ledger. This is the only way to truly lose an un-exported game.
4. ⚙ **Never tap Sync on a second device to "help" a wedged one.** That is
   the second writer that starts the storm. (Build B deletes the Sync
   button entirely.)

## How to read the census line

`O: 61 snaps · 61 saved · 61 synced` on the caller header (Build A: on
every screen, guided included).

- **saved < snaps** → red → the device itself is dropping writes. Export
  immediately, stop using that device, page engineering.
- **synced < saved with connectivity** → amber "syncing" → wait; if it
  never catches up, see Failure 5.
- **offline** → neutral "N queued" → normal. Not a problem.
- Green only when snaps = saved = synced and snaps > 0. **Empty is never
  green.**

---

## Failure 1 — Wrong opponent picked (or mid-game "who are we playing?")

**Looks like:** header says the wrong school; or a coach picked last
week's game from the gameday picker.

**Check:** header crest + "vs {opponent}". Tools → Sessions on this
device shows every session with its event count.

**Fix:**
1. If snaps were logged under the wrong game: **do not clear anything.**
   Finish logging the current drive if the game is live — snaps are worth
   more than labels.
2. Exit → pick the correct game from the picker. The wrong-game session
   stays under its own id (Build A archives leftovers; it never re-parents
   events).
3. Post-game: Tools → Export all sessions. Send the file to engineering
   with a note ("first 12 snaps are actually vs X"). Events are moved on
   the server by reviewed script, never on the device.

**Never:** re-pick games repeatedly mid-game "to fix it," or Clear game
on the wrong session while the real game is live.

## Failure 2 — Stale session (opens onto an old game / old snaps visible)

**Looks like:** open the caller and last week's opponent, count, or log
is on screen.

**Check:** header opponent + census. Tools → Sessions on this device —
is the current session the one with tonight's date?

**Fix:**
1. Pick tonight's game from the picker (Exit → pick if needed). Build A
   scopes everything to `(gameId, side)` — a new game starts at 0 snaps
   with the old game intact under its own id.
2. If the picker itself shows a stale "Live" session as tonight's: pick
   the correct dated game; the leftover archives itself (empty leftovers
   roll; non-empty ones are archived and listed under their real date).
3. Verify: header shows tonight's opponent, census shows 0 snaps before
   the first call, N snaps after N calls.

**Never:** log into whatever session opened "because kickoff is in two
minutes" — 30 seconds of picking saves a Sunday of re-parenting.

## Failure 3 — Device swap mid-game (iPad dies / cracked / taken away)

**Looks like:** the O or D caller device is unusable at halftime.

**Fix:**
1. On the dying device, if it can be operated at all: Tools → **Export all
   sessions** (AirDrop/Files). If it cannot: its journal is still on
   device; do not wipe it — recovery happens after the game.
2. On the replacement device: open the home-screen OFFGRD icon (install
   it if needed — icon, never Safari), check the chip, pick the same game.
3. Log the rest of the game there. Two devices on one game is exactly what
   the fold supports — each device's snaps carry its own deviceId.
4. Post-game: export from BOTH devices. If the dead device revives later,
   export from it before anything else touches it.
5. ⚙ Until Build B: do not tap Sync on either device post-game; file
   first, replay from files (Failure 5's procedure).

**Never:** "restore" the replacement from an iCloud backup mid-game and
trust what appears — export what's there, pick the game fresh, keep going.

## Failure 4 — Safari opened on a game device

**Looks like (Build A):** banner "Open the OFFGRD icon to log. Safari is
view-only." Taps don't write. This is the system working.

**Looks like (v364 and earlier):** no banner; taps DO write — into a
second storage partition under a second device id. This is how the 9/10
D log was lost as snaps.

**Fix:**
1. Close the Safari tab. Open the home-screen icon. Check the chip.
2. If snaps were already logged in Safari (pre-Build A): in that same
   Safari tab, Tools → Export all sessions. That partition's journal only
   exists there — the export file is the game. Then continue on the icon.
3. Send the export to engineering for replay under the right game.

**Never:** clear the Safari tab's data before exporting, or assume the
icon "has" what Safari logged. Different partitions never see each other.

## Failure 5 — Sync looks wrong / cloud missing a game (export & replay)

**Looks like:** census stuck amber with connectivity; or Season manager
shows a game with 0 (or absurd) snaps; or the morning-after check finds a
session with calls and nothing in the cloud.

**The recovery invariant: a coach's export file is always sufficient to
restore a game.** Files are written automatically at halftime, final,
every 25 snaps, and on backgrounding — plus manually via Tools.

**Fix:**
1. Get the newest export: device Files app → newest
   `offgrd-journal-…`/`offgrd-…caller-…` file by timestamp (or Tools →
   Export all sessions now). Read the timestamp, not the filename you
   expect — the newest file is the truth.
2. Tools → **Replay to cloud** → choose that file. Replay pushes events
   under the gameId they were written with — never today's session — and
   upserts by event_id, so replaying twice cannot duplicate.
3. Verify in Season manager: opponent · date · side · snap count matches
   the device census. Counts match → done.
4. Counts don't match → stop. Send the export file to engineering.
   Reviewed scripts (`scripts/apply-central-910-*.cjs` are the pattern) do
   surgical restores. Nobody edits the cloud by hand.

**Never:** ⚙ tap Sync repeatedly to "push it through"; delete the local
game to "re-sync clean"; or replay a file you haven't checked the
timestamp on.

---

## Morning-after check (Saturday, 5 minutes)

1. Season manager: last night's game shows both sides with sane counts.
2. If a side is missing/zero: Failure 5, step 1 — the file exists on the
   device even when the cloud is empty.
3. Once `apply-offgrd-zero-sync-alert.sql` is applied, the zero-sync query
   does this check server-side; until it's wired to a schedule, run
   `SELECT * FROM public.offgrd_zero_sync_alerts();` in the SQL editor.

## Escalation

Engineering gets: the export file(s), the build chip value, which device
(O/D, booth/sideline), and one sentence of what was tapped. The export
file is the whole game state — with it, every failure above is
recoverable except data that was never written (cleared site data,
Failure rule 3).
