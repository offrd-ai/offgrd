# Ticket A — scoring semantics LOCK (design note, pre-code)
*Decision date 2026-08-06 · answers the repo-check open questions · goal: zero new schema for A*

## 1. attempt_n — DERIVE, don't store. Drop the column.

The repo check exposed the right move: if `offgrd.reps_results` rows carry play identity
(play/item key + kind + player + created_at — confirm play_key exists; it's the one hard
prerequisite), then attempt number is a pure derivation:

```sql
attempt_n = row_number() over (
  partition by player_id, kind, play_key,
               (created_at at time zone program_tz)::date
  order by created_at
)
```

**Retry identity (locked):** an attempt is the Nth graded rep for
`(player, kind, play_key)` within the same **program-local day**. First rep of the day
on that item = attempt 1 (correct → **10**). Any later rep on the same item that day =
retry (correct → **4**). Incorrect = **1** always. **Next day resets to attempt 1** —
re-earning full points tomorrow is spaced repetition, which is exactly the behavior we
want, and it matches "rep-earned."

Why derive: no migration, no OFFGRD write-path change, no client-trust question (client
never sends attempt_n; server window-functions it), fully recomputable — the
deterministic-math principle enforced by construction. The camp-week phasing problem
("default to 1 until the write path lands") disappears: retry scoring is correct from
day one.

Session-based identity is rejected: sessions are fuzzy offline, days are not.

## 2. Streak freeze — AUTO-APPLIED, derived. No streak_freezes table.

**Locked rule:** a day counts toward the streak with **≥5 graded reps** (any kind).
Within each program week (Mon–Sun, program TZ), the **first** zero/short day while a
streak is alive is automatically treated as frozen — no player action, no stored state:

```
streak alive entering day D, reps(D) < 5, no prior freeze this week  →  D = frozen (streak continues)
second short day in the same week  →  streak breaks
```

Derivable from rep rows + the week boundary, so the whole streak is recomputable from
scratch. No freeze-consume RPC, no player-writable anything. UI shows the freeze
explicitly ("streak protected · Tue") so it reads as a feature, not a bug.

Game Fridays: no special case — the freeze absorbs one light day; a kid who reps
Sat–Thu keeps his streak through game day. If real usage shows two structurally
zero days/week, revisit with data, not guesses.

## 3. Program timezone

All day/week boundaries use one program-level TZ (from program settings; default
America/Chicago). Never device-local — a bus trip across a line must not kill a streak.
This is the single scoring input that isn't a rep row, so pin it in the RPC signature.

## 4. Net schema impact for A

**Nothing.** No attempt_n column, no streak_freezes, no counters. One scoring
RPC/view over `offgrd.reps_results` (weekly points · last-50 %-correct · streak with
auto-freeze) + Team Home card + OFFGRD post-grade toast. `program_settings.
leaderboard_enabled` moves to Ticket B where it belongs.

**Hard prerequisite to confirm before code:** rep rows reliably carry `play_key` (or
equivalent item identity) for all three kinds. If any kind lacks it, that kind scores
attempt 1 always until its write path adds the key — degrade gracefully, don't block.

## 5. Verify additions (beyond spec)

- Same item, same day: correct→correct scores 10 then 4; miss→correct scores 1 then 4;
  next-day correct scores 10.
- Two short days in one week breaks the streak; one does not, and UI labels the freeze.
- TZ edge: reps at 11:58pm vs 12:02am program time land on different days; device set
  to another TZ changes nothing.
- Full recompute from raw rows reproduces every displayed number exactly.

## Next → implement A
Migration-free: scoring RPC + Team Home card (TeamHome.tsx / loadTeamHome.ts) + OFFGRD
finish-path toast, verify per checklist. B's settings table rides in B's PR.
