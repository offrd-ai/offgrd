# OFFGRD Gamification — build spec v1 (post-FootballU teardown)

**Timing:** camp opens Aug 10, first game ~Aug 28. A + B are pre-first-game shippable (UI over existing data). C is the season's marquee feature. D is small. E is marketing, parallel track.

**Design principles (apply to every ticket):**
- **Rep-earned, never given.** Points/streaks/boards only ever reflect graded reps that already exist in Results. No login bonuses, no decorative XP. Same philosophy as the flywheel: kids earn the headline by drilling.
- **Deterministic math.** All scoring computed from stored rep rows; recomputable from scratch; no mutable "points balance" that can drift.
- **Offline-first.** Reps already queue offline; score surfaces render from local cache and reconcile on sync (duplicate-as-success, same as caller snaps).
- **Minors on a leaderboard = care required.** Celebrate tops, never rank bottoms publicly. Full ordering is coach-only.
- **RLS on day one.** Every new table ships with RLS enabled + scoped policies in the same migration (see Aug 3 advisor incident — never again).

---

## Ticket A — Player Score Surface + Streaks  *(size: S — mostly UI; ship in camp week)*

**Goal:** Reps Lab grades everything and celebrates nothing. Give every player a home-screen card: **points · weekly reps · % correct · streak**.

**Scoring (deterministic, from existing rep rows):**
- Points: correct first attempt = **10**, correct on retry = **4**, incorrect = **1** (showing up counts, barely). Weekly points = sum over program week (Mon 00:00 local → Sun).
- % correct: rolling last 50 graded reps (stabilizes early-week swings).
- Streak: a day counts with **≥5 graded reps**. One **freeze day per week** auto-applied (bus rides, game day) — streaks motivate until they punish; the freeze keeps a 9-day streak from dying on a Friday.
- All derived via views/RPC over rep rows — no stored counters.

**UI:** card at top of player home (points this week, streak flame + day count, % correct, reps this week vs team median). Post-test toast: "+10 · 3 correct in a row." No sounds, no confetti physics — varsity, not Candy Crush.

**Data:** zero new tables if rep rows carry (player, test_type, correct, attempt_n, created_at) — confirm; else add `attempt_n`. Optional `offgrd.streak_freezes` (player_id, week, used_at) — RLS: player reads own, staff reads team.

**Verify:** score card matches hand-computed totals for a seeded player; airplane-mode reps update card locally and reconcile once after sync; streak freeze consumes exactly once; Results board unregressed.

---

## Ticket B — Position-Group Boards  *(size: S-M; ship before game 1)*

**Goal:** make the Results board competitive fuel and coach-actionable in one view.

**Coach view (Results):** position-group mastery strip — e.g. **WR 94% routes · DB 71% Cover-ID · OL 88% fits** — computed on the current week's assigned tests. Cells link to the existing per-player drill-down. This is the Wednesday "dial the plan" surface: the weak cell IS the practice focus candidate (tie-in: surface it beside flywheel-proposed focuses).
**Player view (locker room):** weekly **top-5 by points** + "most improved" (biggest %-correct delta, min 20 reps). Resets Monday. **Never** shows full ranking or bottom names. Position-normalized: rank within position group so linemen aren't buried by QB reps.
**Coach toggle:** `leaderboard_enabled` per program (some coaches will hate it; default ON, one tap off).

**Data:** views over rep rows + `offgrd.program_settings.leaderboard_enabled`. RLS: players read top-5 view only (security_invoker view over policy-scoped rows); staff read all.

**Verify:** top-5 matches manual computation; player client cannot fetch full ranking (test with player JWT); toggle hides player view instantly; position normalization (seed 1 QB with 200 reps vs 5 OL with 40 — OL board unaffected).

---

## Ticket C — "Walk Your Assignment" rep mode  *(size: L — the marquee; target mid-September)*

**Goal:** FootballU's one novel interaction, out-done. Player **drags his own position dot through the play**; OFFGRD grades the path against the drawn assignment — which we can do **coverage-aware**, because our plays are data.

**Loop:** pick play (from assigned install/test) → field renders pre-snap via shared renderer, player's dot highlighted → optional look at the defense (Reads tie-in) → **Snap:** other 21 animate on the existing timeline; player drags his dot in real time → grade.

**Grading (deterministic):** sample assigned path P (from play `data` — route/pull/drop, post-motion) and player trace T at 100ms ticks; score = mean normalized distance, gated by **checkpoints** (route landmarks: break depth ±1.5yd, direction after break; OL: correct gap/pull path; QB: drop depth). Grade = checkpoints hit (pass ≥ threshold) + path score as %. **Coverage-aware:** if play carries a defense and the assignment branches (hot vs blitz, sit vs zone / run vs man), grade against the correct branch — *this is the moat; FootballU cannot grade this.*
**Feedback:** replay overlay — intended path (grad line) vs player trace (yellow), diverging at the miss. One retry at reduced points (attempt_n reuse from A).
**Scoring:** clean first walk = 10 (+2 all checkpoints), retry = 4. Same pipeline → feeds A and B automatically.
**Guardrails:** reuse `OFFGRD-render.js` — **no second renderer** (same drift rule as scout cards). New `rep_type='walk'` in existing rep rows — no new grading tables. Touch-first; 60fps on school iPads; offline like every other rep.

**Verify:** perfect drag ≥95%; wrong-break drag flagged at the right checkpoint; hot-route branch graded correctly under blitz look; airplane-mode walk-rep syncs once; existing three test types unregressed.

---

## Ticket D — Install Assignments with due dates  *(size: S)*

**Goal:** the explicit homework wrapper coaches recognize: "Install 2 — due Thursday."

**Coach:** select plays (existing pickers) → name, due date, positions, test types (default: walk + reads). Assign → notifies players; completion board (name × play grid, green/yellow/red) on Results; auto-nag day before due (reuse digest path).
**Player:** "Due Thursday: Install 2 — 4 plays, 12 reps" card ordered by due date; completing tests marks progress. Points for on-time completion = the A pipeline (no separate bonus economy; on-time yields the reps anyway).
**Data:** `offgrd.assignments` + `offgrd.assignment_items` (or JSONB items) — team_id, RLS scoped staff-write/team-read, in the migration.
**Tie-in:** Sunday gameplan night → "assign this week's install" is one tap from the plan; the week's tests (weekAutotest) attach to the assignment so the whole Tue–Thu loop hangs off one object.

**Verify:** player sees assignment only for own team/position scope; completion grid matches rep rows; due-date nag fires once; RLS: player JWT cannot write assignments.

---

## Ticket E — Free animated whiteboard funnel  *(marketing track, decoupled)*

**Goal:** beat their best growth trick. `odkops.com/draw` — no signup: formation template → drag → draw routes → **Play** (the animation is the wow FootballU can't match) → watermarked GIF/PNG export → "Save this play → create your free program" (play imports into the new program's book).
**Guardrails:** stripped bundle (renderer + minimal wizard, no cloud writes until convert); rate-limited exports; page cached at edge; OG tags so exported clips link back.
**Verify:** draw→animate→export in <60s cold; converted play appears in new program library; no auth surface exposed.

---

## Order & why

1. **A** (camp week) — cheapest win, players feel it day one of camp.
2. **B** (before game 1) — coach value + locker-room pull, feeds the Wednesday dial-in story.
3. **D** (early season) — small, makes Sunday-night installs concrete.
4. **C** (mid-September) — big, marquee, worth doing right; lands mid-season when kids are grinding weekly installs.
5. **E** — parallel with marketing whenever there's slack; no app-risk.

A+B+C together close the entire FootballU gamification story inside a system they can't follow into scouting, calling, or the flywheel.
