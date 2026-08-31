# TICKET — O Caller "game mode": tighten the between-snaps loop

Field report (Matt, opener week 1 — WIN): play entry on the iPad "wasn't
perfect." The operator needs to SEE what to enter, TAP it, and MOVE — with
backward/edit/delete when needed — and everything non-integral off the screen.
Play search (already shipped) fixes part of it. This ticket is the rest.

The budget: a varsity offense snaps every ~25–40 seconds. The full loop
(situation → call → look → result) has to fit inside that with attention to
spare for actual football.

## What the loop is today (from field use + screenshots)

Steps 1–4 stacked vertically: Sit (large down/distance/hash/field button
grids + possession/drive-over block) → Expect panel → Blitz trend → Play Call
(BEST NOW + shortlist) → This Play card (Edit last / Undo / Grade) → call log.
Auto-advance exists ("Next 1ST & 10 · Caught up"). Game markers
(Quarter/Half/Final review) and ADVANCED accordion sit mid-column.

## The core problem: reading surface and entry surface are interleaved

Expect + Blitz Trend + Attack notes are READING surfaces (booth/planning
material). Sit + Call + Look + Result are ENTRY surfaces (the operator's job).
On one scrolling column, the operator scrolls past reading material to reach
every entry point — that's the "keep non-integral stuff out of view" friction.

## Proposed: GAME MODE layout (toggle, or auto when a live session is active)

1. **One screen, no scrolling, entry-first.** Sit chips compressed to a single
   row (current selections as compact chips: `2ND · 10+ · L · ANY`, tap a chip
   to change just that one). Expect collapses to ONE line under it
   ("C4 54% · 3-4 · 38% blz" — tap to expand). Shortlist directly below,
   full-width tap targets. Look + Result inline on the This Play card.
2. **Auto-advance the situation from the result.** If yardage is entered on
   play N, pre-fill play N+1's down & distance (2nd & (10 − gain), turnover
   on downs, new set on conversion) — operator CONFIRMS rather than enters.
   If this already exists partially, make the pre-fill visibly obvious so the
   operator trusts it instead of re-tapping. This is the single biggest
   tap-saver available.
3. **Defer-friendly flow.** Look and Result must be skippable mid-drive and
   backfillable at stoppages (already supported — "N plays need results" —
   but make skipping frictionless: call → next sit in two taps flat, no modal
   in the way).
4. **Backward motion, one place:** the This Play card carries Edit last +
   Undo; the call log rows carry Edit. Add DELETE on the log row (fat-finger
   logged the wrong play entirely) with a 5-second undo — no confirm dialog.
5. **Off the game screen entirely** (moved behind a drawer/accordion in game
   mode): Game markers (Quarter/Half/Final review), ADVANCED · STICKY LOOK ·
   LIVE SAMPLE, Attack text block, Playbook button (search covers it),
   possession panel EXCEPT the Drive-over strip which stays (it's flow).
6. **Fat tap targets + dead zones** — the mistap finding from the drills
   (light taps navigating away, step 3 "vanishing") is now field-validated,
   not theoretical. Minimum 44pt targets on every game-mode control, inert
   gaps between rows.

## ANSWERED (Matt, from Thursday's game)

**A. "It seems to lag and scroll sometimes, plus finding the play was tough."**
Two findings:
- **PERFORMANCE is a first-class defect, not a layout nit.** Input lag +
  scroll jank on the game iPad. Independent corroboration: desktop Chrome
  CDP evaluation timed out repeatedly on this page all week ("renderer may
  be frozen") — same symptom, bigger hardware. Suspects: 546KB monolith DOM,
  full-column re-render per tap (the `[play-map] render paint rps` pattern),
  shortlist + full-list rebuild on every situation change. Game mode must
  ALSO be a perf fix: re-render only the entry panel on tap, don't rebuild
  the full play list unless it's open, target <100ms tap-to-paint on the
  actual game iPad. Measure before/after on that device.
- Finding the play: search + recents (since shipped) address it; verify on
  the iPad, in game mode, with gloves-grade tap accuracy.

**B. Operator ran GUIDED mode.** Build target is therefore the evolution of
Guided, not a new toggle — Guided IS game mode; make it one-screen, chip-sit,
auto-advanced, skippable. Advanced stays as-is for booth/desk use.

**C. One person on the iPad, no spotter.** Look/result deferral is the NORM:
solo operator calls and moves; looks get backfilled at stoppages. Design the
default flow as call → next in two taps, with look/result as optional
enrichment, not gate steps.

## Not in scope

- No new data, no ranking changes — layout and flow only.
- Two-device live sync stays fenced until the sync-integrity batch.
- Voice entry / hardware buttons: interesting, later, not this pass.

## Acceptance

- [x] Game mode: sit→call→next-sit in ≤3 taps when auto-advance is right
- [x] Zero scrolling to complete a normal play entry on iPad portrait
- [x] Expect readable in one glance, expandable, never between entry points
- [x] Look/result skippable with no penalty; backfill list reachable at breaks
- [x] Delete-with-undo on log rows
- [x] All game-mode tap targets ≥44pt with dead zones
- [x] Non-integral panels absent from game mode, one tap away
- [ ] Field-tested at a practice or JV game BEFORE a varsity Friday
- [ ] Tap-to-paint measured on the ACTUAL game iPad, before and after —
      target <100ms on entry-panel taps; no full-column re-render per tap
      (readout lives in More · `console` `[caller-paint]`)
- [x] Guided mode IS the new layout (no separate toggle); Advanced unchanged
- [x] Zero `full` paints after an entry tap (hold-full; sync/presence/flash skip)
- [x] Footer ms = entry-scope paint (matches `[caller-paint] entry` / sit / expect)
- [x] Mode controls appear exactly once; Booth state readable in page chrome
- [x] No internal pool codes (EXACT / DOWN ONLY / DISTANCE x/y) in coach copy
- [x] Every header chip has a plain-language label or is gone
- [x] v2 wizard: Call banner → Situation editor → After-snap (auto after every call)
- [x] Skip / Done both return to Call; skipped result flags the banner `?`
- [x] Back on every screen; sit editor shows all four rows; taps delegated / in-place

## Field test follow-up (v342, Aug 30)

P1: entry patches were fast; each tap still scheduled a deferred `full`.
`CALLER_HOLD_FULL` after sit/entry/expect. `renderCaller` no-ops while held
unless `{force:true}` / `callerRenderFull`. Background sync, presence, and
flash use `callerMaybeRender`.

P2: Guided header is `vs Opponent` + Guided/Advanced + Exit. Expect expands
without repeating the glance. Sit chips captioned DOWN · DIST · HASH · ZONE.
BEST NOW folded into the list. Sheet title is `Best for 3rd & 4-6`. Last Play
says `1st & 10`. Empty Caught up gone. Sync/Export/Clear in More → Tools.
More bar is a full-width button.
