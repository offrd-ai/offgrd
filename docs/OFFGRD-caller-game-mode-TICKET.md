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

- [ ] Game mode: sit→call→next-sit in ≤3 taps when auto-advance is right
- [ ] Zero scrolling to complete a normal play entry on iPad portrait
- [ ] Expect readable in one glance, expandable, never between entry points
- [ ] Look/result skippable with no penalty; backfill list reachable at breaks
- [ ] Delete-with-undo on log rows
- [ ] All game-mode tap targets ≥44pt with dead zones
- [ ] Non-integral panels absent from game mode, one tap away
- [ ] Field-tested at a practice or JV game BEFORE a varsity Friday
- [ ] Tap-to-paint measured on the ACTUAL game iPad, before and after —
      target <100ms on entry-panel taps; no full-column re-render per tap
- [ ] Guided mode IS the new layout (no separate toggle); Advanced unchanged

---

## FIELD TEST — v342, in-browser (Claude, Aug 30). Structure is right; two problems.

Tested live on getoffrd.com/gameday (O Caller, Guided, Parkway South session,
6 logged plays). The layout matches spec: sit chips → Expect line → BEST NOW →
shortlist → Last Play → Drive over → More drawer. Chip sub-row expansion,
Expect expand, drawer log with Edit/Delete, rollup, and the perf footer all
work. What's wrong:

### P1 — the deferred FULL render is still there, and it's the lag

`[caller-paint]` console proof: entry-scope paints are fast (**sit 15ms ·
entry 40–52ms · expect 8ms**) — the patching works. But **each entry tap also
schedules a deferred FULL render (100–250ms on desktop) that lands seconds
later.** Observed directly: 4 chip taps → hands off for 15s → 4 `full` events
fired during the idle window (135/250/129/127ms). A second idle window fired
zero, so it's tap-scheduled catch-up, not a timer. 18+ `full` events in one
short session.

On the game iPad those blocks are 2–4x longer and they land WHILE the operator
scrolls — that is Matt's "lags and scrolls sometimes." The acceptance item "no
full-column re-render per tap" is not met; it's just been moved off the tap.

Fix: after an entry tap, NO deferred full render. Update the stale regions
incrementally (they're known: Expect, BEST NOW, shortlist — all already have
scoped painters), or defer truing-up to drawer-open/section-reveal. A `full`
should only ever fire on load and explicit view changes.

Also: footer reads "Entry tap 107ms" while console entry events are 40–52ms —
it appears to be including the deferred full. It must report the entry-scope
paint or it will pass/fail the wrong thing on the iPad.

### P2 — labeling (Matt: "confusing with labeling") — verified item by item

1. **Two control bars stacked.** Page chrome (`YO · gear · O Caller ·
   D Caller · Booth: Off (tap→On)`) sits directly above the card header
   (`O CALLER · D CALLER · GUIDED · ADVANCED · Booth · Exit`). O/D Caller
   appears TWICE; **Booth appears twice with different wording** ("Booth:
   Off (tap→On)" vs "Booth"/"Booth on") and no way to tell if they're the
   same state. One row owns mode switching; the other loses its copies.
2. **"Parkway South" + crest reads as OUR identity.** It's the opponent.
   Label it `vs Parkway South`.
3. **Cryptic chips `PLAYED · SNAP 6 · V342`** (no tooltips). SNAP 6
   duplicates the "Play 6 · HAMMER" line below it; V342 is a build number —
   belongs in the More footer, not the game header.
4. **"All synced tap Sync now [Sync now] [Export]"** — self-contradicting
   copy plus two UNSTYLED native buttons that look broken next to everything
   else. One status word; Sync/Export live in More, styled.
5. **Empty "Caught up" box** — a full-width empty panel when nothing needs
   backfill. Collapse it to nothing until it has content.
6. **The two ANY chips are indistinguishable** — no caption, no title/aria
   (verified in DOM). Add micro-captions over the row: DOWN · DIST · HASH ·
   ZONE.
7. **Stats printed twice in BEST NOW**: right cluster `78% · 4 SNAPS · 8 AVG ·
   INCL. 1 CHUNK` AND the line below `EV 56% · 78% · 4 snaps · 8 avg · incl.
   1 chunk`. Keep one; EV can prefix it.
8. **Three vocabularies for one pool on one screen.** With sit = 3rd & 4-6 the
   header said `BEST FROM 3RD DOWN · DOWN ONLY (12)`, the list said
   `3rd & medium`, subtitle `Your best calls`. `DOWN ONLY` / `EXACT` /
   `DISTANCE 10+/7-9` are internal pool-selection codes leaking into coach
   copy. Say it plainly: `Best for 3rd & 4-6` — and when widened: `Not enough
   exact snaps — showing all 3rd down (12)`.
9. **Top play appears twice back-to-back** — BEST NOW hero and shortlist row 1
   are the same play with the same numbers. Start the list at #2 (or fold the
   hero into the list visually).
10. **More bar tap target is text-only.** Tapping the CENTER of the
    `MORE · LOG · MARKS · TOOLS` bar does nothing (reproduced); only the text
    toggles. Whole bar = the summary hit area, ≥44pt. This is the mistap
    finding again.
11. **Expanded Expect keeps the collapsed line visible above it** — same
    numbers twice.
12. **`Clear` button sits at the top of the call log**, adjacent to per-row
    Edit/Delete, one tap from the game record. Not clicked — verify it has a
    guard; it should live in Tools, not next to the log during a game.
13. Last Play bar says `1st & 10+` — bucket label leaking; coaches say
    "1st & 10."

### Acceptance additions

- [ ] Zero `full` paints in console during a 10-tap entry sequence + 30s idle
- [ ] Footer ms = entry-scope paint (matches `[caller-paint] entry`)
- [ ] Mode controls appear exactly once; Booth state readable in one place
- [ ] No internal pool codes (EXACT / DOWN ONLY / DISTANCE x/y) in coach copy
- [ ] Every header chip has a plain-language label or is gone

---

## v343 VERIFIED LIVE (Claude, in-browser re-test, Aug 30)

**PASS — everything testable from here:**
- Zero `[caller-paint] full` across a 10-tap entry sequence + 30s idle
  (console proof; entry 39–42ms, sit 2–44ms). Fulls now occur only at load.
- Footer reports entry-scope ms (39ms, matches console exactly).
- One control card (`vs Parkway South · GUIDED | ADVANCED · Exit`); O/D
  Caller + Booth only on page chrome. Opponent labeled `vs`. PLAYED/SNAP/V
  chips gone; `Synced · v343` + Sync/Export styled in Tools. Empty Caught-up
  box gone (contextual `2 need results` pill instead). DOWN · DIST · HASH ·
  ZONE captions present with aria. No hero duplication — top play listed once
  with `On call`. Pool copy plain: "Not enough exact snaps — showing a wider
  3rd & 10 pool (5)". More bar center-tap works (full-width 44pt). Clear
  lives in Tools. This Play bar says `3rd & 10 L`.

**NEW ISSUES (small, none blocks the practice test):**
1. **Intermittent swallowed chip tap.** The ZONE sit chip ignored two clean
   physical taps (dead center, 169×44 target, verified via DOM rect), then a
   programmatic click worked, then physical taps worked. Down/Dist/Hash never
   dropped one. Suspect the entry patch replaces chip-row nodes while a
   pointer is down → click never fires. Fix: patch chip row in place / attach
   the handler to a stable parent (event delegation). This is likely the
   real cause of the historical "mistap" reports.
2. Copy: "1 older play need results" → "needs" (pluralize properly).
3. Drawer backfill row still says `3rd & 10+ L` (bucket label leak; the This
   Play bar already says `3rd & 10`).
4. Boot fires ~18 `full` renders (45–214ms) before first interaction —
   load-time only, harmless in-game, cleanup later.

**Open question (Matt):** a HOUSTON call (3rd & 10+ L, no result) was already
logged when I opened the page — present BEFORE any of my taps; the last
operator log was HAMMER 158m earlier. If Matt tapped Call while checking the
deploy: fine. If NOT: v343 may have logged a proposed play without a tap —
must be ruled out before Friday.

**Still requires the real device:** footer ms on the game iPad; practice/JV
run before varsity.

HOUSTON call resolved: Matt confirmed he tapped it while checking the deploy.
No phantom-call bug. The test session still must be cleared before Friday.

---

# v2 FLOW — SUPERSEDES the layout above (Matt field-reacted to v343, Aug 30)

Matt's verdict on v343: **regression.** Two specific failures:

1. The chip top line is not intuitive — tap-to-reveal a hidden sub-row
   confused him ("the old way was a little bit cleaner"). Progressive
   disclosure traded clarity for compactness. Wrong trade.
2. **After selecting a play, nothing advances.** Look/result sit passive
   behind "Add look · result (optional)". He wants the app to WALK him
   forward: play → defense shown → result → next situation, "auto advance
   with each step with a back button."

The earlier "deferral is the norm" finding was over-applied. Deferral means
every step is SKIPPABLE IN ONE TAP — not that the app stops advancing. The
flow is a wizard that moves; the operator opts out per step, the app never
waits passively.

Keep from v343: all labeling/copy fixes, the perf model (no deferred fulls,
entry-scope painting, footer ms), 44pt targets, delete-with-undo, search with
recents. What changes is the loop.

## The loop (Guided) — three screens, decided with Matt

### Screen A — CALL (home position)
- **Situation banner** across the top: `2ND & 7 · L · OWN` — auto-advanced
  from the last result. Visually marked as proposed (dashed/yellow) until
  confirmed by use. **Tap the banner → Screen S.** No chips, no sub-rows.
- Below it: the shortlist (cap 5, %/snaps/avg as shipped) + Search (recents).
- **Tapping a play = the call → auto-advance to Screen B.**

### Screen S — SITUATION (only when the banner is tapped)
- The OLD layout, deliberately: all four rows of big buttons visible at once
  — DOWN / DIST / HASH / ZONE with their captions — current values
  highlighted. No hidden rows, nothing to discover.
- Any taps update; **Done** returns to Screen A with the list refreshed.
  Back = Done (no dead ends).

### Screen B — AFTER-SNAP (auto-advances here after every call)
One screen, two blocks, top to bottom:
- Header: `HOUSTON · 2nd & 7` (what was just called).
- **WHAT DID THEY SHOW** — front row, coverage row, blitz row. Big buttons.
- **RESULT** — worked/didn't + yardage pad. As yardage is entered, show the
  computed next situation live ("→ next: 3rd & 3") so the operator sees the
  auto-advance happen.
- **[Skip] [Done]** — both auto-advance to Screen A with the next sit
  proposed. Skip logs the snap with no look/result and increments the
  "N need results" pill.
- **Back** on this screen = wrong play tapped: return to Screen A with this
  snap still open for re-pick (change play keeps sit; full undo also
  available).

### Rules that make it hold together
- **Back exists on every screen, top-left, same place, 44pt.** A → edits the
  last snap (reopens its Screen B); S → A; B → A (re-pick).
- If result was skipped, the next sit can't be computed: banner shows the
  last sit flagged `?` — one tap opens Screen S. Never guess silently.
- Backfill: the "N need results" pill opens the same Screen B per pending
  snap — one interface for live entry and backfill, nothing new to learn.
- Every screen swap is an entry-scope paint. No full renders in the loop.
- **Chip-row tap-swallow fix (event delegation / patch-in-place) applies to
  every button in all three screens** — this is the v343 zone-chip bug and
  it must not recur on Screen B's look buttons.

## Acceptance (v2)
- [ ] Call → look/result → next sit with ZERO navigation taps (auto-advance
      does all screen changes; operator only enters data or Skips)
- [ ] Happy path per snap: tap play, tap 2–4 look/result buttons, tap Done —
      done. Rushed path: tap play, tap Skip — done. Both < 5s.
- [ ] Wrong anything is reachable backwards in ≤2 taps (Back is persistent)
- [ ] Situation editor shows all four dimensions at once, old-style
- [ ] Skipped result → sit banner flagged, one tap to fix, no silent guess
- [ ] No swallowed taps: 20 rapid sequential taps across screens, all land
- [ ] Practice/JV field test BEFORE varsity Friday (unchanged, non-negotiable)

---

## v344 FIELD TEST (Claude, in-browser, Aug 31) — wizard works; TWO DATA BUGS

**PASS — the loop is right:**
- CALL screen: Back + step label, sit banner ("tap to change"), shortlist.
- Tap banner → SITUATION screen: all four rows visible old-style with
  captions, Done, Back. Edits applied and returned cleanly.
- Tap a play → auto-advance to AFTER SNAP: one screen, WHAT DID THEY SHOW
  (front/coverage/blitz) + RESULT (Loss/No gain · 1-3/4-7/8-14/15+ ·
  TD/TO · Moved the chains) + Skip/Done. Exactly the decided design.
- Skip → back to CALL, and the skipped-result rule works: banner shows
  `3rd & 10 · L · RZ ?` dashed, "tap to set" — no silent guess.
- Delete on log row: immediate, permanent after the window. (Undo toast not
  visually confirmed from here — eyeball it on device.)
- "1 needs results" grammar fixed. Footer entry-scope (10ms).

**BUG 1 — CALL RECORDS THE WRONG SITUATION (must fix before any field use).**
I set the banner to `3rd & 10 · L · RZ` via the Situation screen, then called
DINO. The log recorded the snap as **`2nd & 7-9`** — the auto-computed sit,
not the banner sit. The screen shows one situation and records another. Either
the Screen-S edit isn't writing to the sit the call path reads, or
auto-advance overwrote it. The banner IS the sit of record — whatever it
displays at the moment of the call is what the snap must log.

**BUG 2 — SKIP COMMITS THE STICKY LOOK (data contamination).** After Snap
opened with `3-4 · Cover 2 · No blitz` pre-highlighted (carried from the
previous snap). I tapped **Skip** — which must log NOTHING — yet the row
recorded `DINO · 3-4 · Cover 2 · No blitz`. Carried-forward looks recorded as
observed will silently corrupt the vs-coverage success numbers the whole
caller ranks on. Skip = bare snap, no look, no result. Sticky prefill may
only commit on Done — and should render as proposed (dashed?) until touched.

**Minor:**
- Wizard screen swaps log as `full` (34–99ms desktop). Explicit-action fulls
  were Cursor's design; on the iPad, if call→After-Snap feels slow, scope it.
- Live yardage is bucketed (fine — retired by charted import later; avg from
  live snaps is approximate until then).
- Test session now shows HAMMER 0% · 6 snaps etc. in the shortlist — the
  test data is feeding the pool. Clear the session before Friday.

My test snap (DINO 2nd & 7-9) was deleted; session left otherwise untouched.

---

## v345 VERIFIED (Claude, in-browser, Aug 31) — both data bugs fixed

Ran Cursor's exact re-test script on getoffrd.com/gameday:
- **Bug 1 FIXED:** set banner to `3rd & 10 · L · RZ` via Situation screen →
  called DINO → After-Snap header AND the log row both read `3rd & 10 L`.
  The banner is now the sit of record.
- **Bug 2 FIXED:** After-Snap opened with no committed look; tapped Skip →
  log row is play-only (`3rd & 10 L · DINO`, nothing else) while the
  neighboring HAMMER row carries its full look/result. Skip logs bare.
- Test snap deleted after verification; deletion held.

Leftovers (small):
- GAME marks line still says "1 need results" (the pill was fixed to
  "needs"; this second spot wasn't).
- FEED showed `WARN Local fold is thinner than stored game — write refused`
  during my session — the storm-guard protecting the stored game from my
  browser's thinner local copy. Correct behavior, but it means test cleanup
  done in a secondary browser may not persist to cloud. Clear the test
  session from the authoritative device via Tools → Clear game.
- Sticky-look dashed "proposed" rendering: not observed this session (no
  prefill appeared at all). Verify on device that Done-with-untouched-sticky
  still commits it when sticky IS shown.

**Remaining before varsity Friday (all on-device):** clear the test session,
footer tap-to-paint on the game iPad, practice/JV field run.

---

## GUIDED vs ADVANCED head-to-head (Claude, in-browser, Sep 1) + P0 list

Same snap logged in both modes, v345:
- **Guided: 4 taps, 0 manual scrolls** (call → coverage → result → Done).
  Sticky front/blitz dashed, committed only on Done. Rushed path 2 taps
  (call → Skip), logs bare. "→ next" preview correct.
- **Advanced: 2 taps + 1 scroll** — Call it now auto-scrolls to steps 3–4,
  result tap auto-scrolls back with next sit proposed (nice). BUT the 2-tap
  count exists only because **Advanced still pre-commits the sticky look
  SOLID** (front+coverage+blitz written as observed, no confirm step) — the
  pattern the v345 Guided fix outlawed. Honest-operator cost is ~3 taps +
  scroll. Advanced also retains the old labeling (BEST NOW + duplicate stat
  line, PLAYED/SNAP/V chips, unstyled Sync/Export header buttons, `1st & 10+`
  leak) and showed unpainted regions during scroll.
- Recommendation: Guided on the sideline, Advanced for booth/desk. Operator
  10-and-10 at Wednesday practice decides.

### P0 — before Friday: the tap-swallow / layout-shift family (3 repros)
1. ZONE sit chip ate two clean center taps (v343 test; DOM rect verified).
2. Delete click eaten during call-log re-render (v345 test, Sep 1).
3. "→ next" line insertion shifts Skip/Done down mid-entry → missed tap
   (v345 test, Sep 1). Reserve the line's height.
Root pattern: nodes replaced/moved between pointerdown and click. Fix:
event delegation to stable containers + patch-in-place + reserved layout.
This is the under-pressure failure mode; it belongs before Friday.

### Post-Friday queue (from this session)
- Our-game import with 0 def-tagged rows never fires
  `retireLiveLooksForOpponent` → live snaps double-count (hand-cleaned this
  time). Retire must fire off the your-plays side too. Also: one Thursday
  game's live session stamped across three date keys (08-28/29/30).
- Decide Advanced sticky semantics: port dashed-proposal/Done, or document
  the divergence as booth-intent.
- Port Guided's labeling pass to Advanced.
- Copy: "1 snaps" (season manager); `1st & 10+` bucket leak in Advanced +
  drawer backfill rows (Guided This-Play bar already says `1st & 10`).
- Boot fires ~18 full renders before first interaction (load-time only).
- Feature ticket: on Our-game import, MERGE live-logged looks into charted
  rows (by sequence) instead of retiring wholesale — a coverage-less import
  should not discard observed looks. This is the "most teams won't tag
  defenses" answer.

---

## v346 — P0 tap-swallow (Cursor, Sep 1)

Landed before the Friday freeze. Click-on-parent was not enough: replacing
the node between pointerdown and click drops the click even on a stable
host. Guided now records `data-caller-act` on pointerdown and dispatches
on pointerup (20px slop) so the act still fires after a re-render. Call,
Delete, Edit, sit, look, result, Skip, and Done use that path. The
`→ next` line is reserved at 28px so Skip/Done do not shift mid-entry.
Grammar `needResultsBit` rides this pin. Advanced sticky left as-is
(booth decide, not this week). Sideline stays Guided.
