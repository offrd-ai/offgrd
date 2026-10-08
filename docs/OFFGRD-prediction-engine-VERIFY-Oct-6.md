# Prediction engine — preview verification, Oct 6 (commit c5a0b8b, chip v381)

URL: offgrd-git-preview-prediction-engine-offrd.vercel.app · O Caller vs Hazelwood East · 1st & 10+

## Result: engine PASS, wiring FAIL

PASS — BEST NOW == shortlist row 1, byte for byte (both modes):
  `3X1 KAR WST COMBO · 50% · VS C0: 2 SNAPS · NOT ENOUGH — SHOWING SITUATIONAL · 50% · 4.0 AVG · 2 SNAPS · 1ST & 10+`

FAIL — that row is 2 snaps at 50%. Spec acceptance says HAMMER-class situational
leader. The engine produces exactly that when handed the right pool; the caller
hands it the wrong one.

## Root cause (one line in the inline caller code)

`ours` passed to `Eng.orderCallerList({ own: ours })` is scoped by
`callerOppScope()` → "Hazelwood East". So H = our 22 live O snaps from the
Hazelwood game (10 on 1st down, no play above 2 snaps), not our season.

  gamesRows("ours")               926 rows · 401 on 1st down · HAWK 44, DINO 41, HOUSTON 26, HAMMER 16 …
  oursScoped (opponent = Hazelwood) 22 rows · 10 on 1st down · max 2 per play

Spec §1: **H = every charted + live snap of OUR offense, all opponents, all
season.** The opponent scope belongs to B (their book), never to H.

## Proof — same engine, full pool, same context (run in console)

  predict: leader C0 · "1st down · 41 snaps (widened from 1st & 10)"
  rank()[0..4]:
    HAMMER   tier 2 · 76% · 7.1 avg · 17 snaps · 1st down (widened from 1st & 10)  (vs C0: 2 snaps · not enough)
    MIAMI    tier 2 · 75% · 17.0 avg · 4 snaps
    ST LOUIS tier 2 · 71% · 6.3 avg · 7 snaps
    HOUSTON  tier 2 · 69% · 9.7 avg · 26 snaps
    THUNDER  tier 2 · 61% · 5.5 avg · 23 snaps

That is the hero Matt asked for.

## Fix for Cursor

1. In the caller list builder: `own: ours` → use the UNSCOPED fold
   (`Dir.foldRows(oursRaw, book)`), all opponents. Keep `scopeOpp` for
   `book:` (ex.def + liveBook) only.
2. Tonight's live snaps vs this opponent still count — they are in
   `gamesRows("ours")` already; weight them highest per spec §1, don't
   filter to them.
3. BEST NOW badge reads `1st & 10+ · 35 snaps` (the opponent book's n) while
   the row reads `2 snaps · 1st & 10+` (own rung). Two different rungs on one
   card. Badge should show rank()'s rung label, not predict()'s.
4. Scout "From your book · vs C0" still ranks 4× MEMPHIS concept match above
   HAWK 78% · 4 snaps — unwired surface, expected; wire per spec §6.

## Oct 7 re-verify — commit 7966828 — PASS on 1st & 10+, one gap found

1st & 10+ vs Hazelwood East: BEST NOW = `HAMMER 76% · 7.1 avg · 17 snaps ·
1st & 10+` == shortlist row 1. Badge `1st & 10+ · 372 snaps`. Own pool
unscoped. Good.

GAP — thin-play hero. 3rd & 4-6 (same opponent):
  BEST NOW `THUNDER 100% · 8.5 avg · 2 snaps · 3rd & medium`
  rows 2-4: `100% · 1 snap` ×3, then GATOR 67% · 3 snaps
The rung (44 snaps) clears MIN_SNAPS as a pool, but no play on it has
≥ MIN_SNAPS, so rank() falls to tier 3.5 (n>0, below MIN) and the hero is a
1-2 snap 100%. That is the coin-flip the gates exist to stop.

Fix (spec §3 clarification, no gate change): for rank(), a rung "clears"
only when at least SHORTLIST_MIN (3) plays have n_sit ≥ MIN_SNAPS on it;
otherwise keep walking down. Tier 3.5 rows may still appear, but never
above a tier ≤3 row and never with a bold % (label `thin · 2 snaps`).
Console proof, same engine on all 3rd down (177 snaps):
  HAWK 75% · 4 · 3rd | TANK BLAST 75% · 4 | GATOR 67% · 6 | MEMPHIS 63% · 16 | DINO 55% · 11
Hero should read `HAWK 75% · 8.3 avg · 4 snaps · 3rd (widened from 3rd & medium)`.

## Oct 7 (2) — commit d74219c — thin-play fix PASS, candidate set still scoped

3rd & 4-6: hero `HAWK 75% · 8.3 avg · 4 snaps · 3rd (widened from 3rd &
medium)` == row 1; badge `3rd · 177 snaps`; thin rows labeled `thin · N
snaps`, no %. 1st & 10+ unchanged (HAMMER 76%/17). Scout "From your book"
vs C0 row 1 = HAMMER. All good.

GAP — the engine only reorders what the old builder nominates.
`callerRankedCalls` still builds `names = uniq(book ∪ oursScoped)` (scoped to
the pinned opponent) and hands `entries` (19 rows) to `orderCallerList`.
Plays we run all season but did not run vs Hazelwood, and that are not in
PBOOK under the same spelling, are never candidates:
  MEMPHIS  63% · 7.3 avg · 16 snaps on 3rd   — absent (PBOOK has "Memphis")
  TANK BLAST 75% · 3.5 avg · 4 snaps on 3rd  — absent (ties HAWK for row 1)
Console: rank() on the full 3rd-down pool with all 115 own play names puts
HAWK, TANK BLAST, GATOR, MEMPHIS, DINO in the top 5; the card shows HAWK,
GATOR, DINO, F Exit Fargo, HAMMER 29%.

Fix:
1. Candidates = PBOOK ∪ every play name in the UNSCOPED own fold (115
   names), not `oursScoped`. The scope was removed from `own:` but not from
   `names`.
2. Name identity is case-insensitive + formation-prefix-stripped
   (ship-readiness §2 item already on the list): "MEMPHIS" rows must count
   for the "Memphis" book play. Do it once in a `playKeyOf()` used by both
   the candidate uniq and `rank()`'s `mine` filter; display the book
   spelling.
Expected after fix, 3rd & 4-6 vs Hazelwood: HAWK 75%/4 and TANK BLAST
75%/4 rows 1-2 (tie → n, then name), GATOR 67%/6, MEMPHIS 63%/16, DINO 55%/11.

## Re-verify after fix
- O Caller vs Hazelwood East, 1st & 10+: hero = HAMMER 76% · 17 snaps
  (or whatever rank()[0] is on the full pool), label carries % + n + rung.
- Same row in Guided shortlist row 1 and Advanced BEST NOW.
- Then the 20-random-situation smoke from spec §9.
