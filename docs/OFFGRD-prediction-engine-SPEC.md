# OFFGRD Prediction Engine — SPEC (build from this, not from chat)

Matt (Oct 2): "the heart of our system really needs to be down and distance,
formation, time of game, any information we have from Hudl, and then make
the best decision on what the defense is going to do and how we can exploit
it with either concepts or known plays in our playbook."

Today there are several ranking paths (BEST NOW, shortlist, Ask Booth, the
D Expect ladder, the Scout "From your book" list) with different pools and
different gates. That is why the hero showed MEMPHIS concept-match over
HAMMER 78%/18 vs Cover 0. This spec replaces them with **one engine, one
rule.** Every surface calls it; no surface ranks on its own.

## 1. Vocabulary
- **Snap context (C):** down, distance bucket, hash, field zone, score
  margin bucket, clock bucket (Q1–Q4 / 2-min), opponent formation shown
  (if entered), opponent personnel (if tagged), drive number.
- **Book (B):** opponent's charted rows (all imported films for this
  opponent) + tonight's live snaps for this opponent. Recency-weighted,
  tonight's snaps weighted highest.
- **Own history (H):** every charted + live snap of OUR offense, all
  opponents, all season (+ prior seasons at lower weight), each with
  result, yards, and the look faced when tagged.
- **Slice:** a filter on C. Slices form a ladder from exact to wide.
- **Gate:** MIN_SNAPS (4) to show a number; DIRECTIONAL_SPLIT_MIN (8) for
  a split; LEAN_FLOOR (0.60) for an arrow; SUCCESS_FLOOR (0.60) to be a
  "call"; all existing, unchanged.

## 2. Two questions, one call
`predict(C, B)` → **what they'll do**
`rank(C, H, prediction)` → **what we should call**
Both return their slice and n with every number. Nothing silent.

## 3. The slice ladder (used by BOTH questions)
Rungs, exact → wide. Walk down until the rung clears MIN_SNAPS:
1. down + dist + formation + hash + zone (exact)
2. down + dist + formation
3. down + dist
4. down + formation
5. down
6. all snaps for this opponent (predict) / all own snaps (rank)
Each rung reports `rung`, `n`, and `widened: true/false`. The UI shows the
rung in words ("exact · 2nd & 4-6 · 2x1 Wing", "widened to 2nd down").
Score-margin and clock are **modifiers**, not rungs: when the margin/clock
bucket has ≥ MIN_SNAPS inside the chosen rung, prefer that sub-slice and
say so ("trailing by 8+, Q4"); otherwise ignore them. Never a rung of
their own — they fragment the book too fast.

## 4. predict(C, B) — what they'll do
Output, for the D side and for the O side's "look coming":
- **Run/pass share** on the rung (D Caller hero, existing format
  `Pass 55% · Run 45% → your R 70%`).
- **Coverage distribution** on the rung (O Caller: Expect), with the
  leader and runner-up and their n.
- **Front + pressure rate** on the rung; "if they pressure, behind it."
- **Formation-conditioned line** when formation is in C and clears
  DIRECTIONAL_SPLIT_MIN (existing D grain rules).
- **Confidence** = HIGH / MED / LOW from n on the rung, unchanged.
- **Tonight vs season:** when tonight's live snaps on the rung ≥
  MIN_SNAPS and differ from the book by ≥ 20 points, show both:
  `Season: C4 60% · Tonight: C0 71% (7 snaps)`. Tonight wins the headline.
No change to the math that exists; the change is that all four surfaces
read the SAME predict() on the SAME rung.

## 5. rank(C, H, prediction) — what we should call
For each play in our book, compute on the SAME rung as predict():
- **Record vs the predicted look** = our snaps on this rung where the
  tagged look matches the predicted leader (coverage family for passes,
  front family for runs). `sr`, `avg`, `n_look`.
- **Situational record** = our snaps on this rung regardless of look.
  `sr`, `avg`, `n_sit`.
- **Concept fit** = existing SCHEME MATCH score (route/concept vs
  coverage family) — theory, 0–1.

**The ranking rule (history before theory, in this exact order):**
1. Plays with `n_look ≥ MIN_SNAPS` and `sr ≥ SUCCESS_FLOOR`, sorted by sr
   then avg then n. Label: `vs C0 · 4 snaps`.
2. Then plays with `n_sit ≥ MIN_SNAPS` and `sr ≥ SUCCESS_FLOOR`, sorted the
   same. Label: `2nd & medium · 18 snaps`.
3. Then plays with any record ≥ MIN_SNAPS below the floor, sorted by sr.
   Label shows the real %. (A 45% play with 20 snaps still beats theory.)
4. Only if fewer than SHORTLIST_MIN (3) plays clear 1–3: fill with concept
   fit, labeled `no reps · concept match`, visually distinct (no %), never
   above a play with a record.
Run/pass guarantee: at least one run and one pass in the top 5 when both
have ≥ MIN_SNAPS on the rung (existing rule, now on this ranking).
**Hero = row one. No separate hero logic exists anywhere.**

## 6. Surfaces (all read the engine; none compute)
- **O Caller BEST NOW** = rank()[0] with its label. Shortlist = rank()[0..4].
  "Search all plays" = rank() unbounded.
- **O Caller Expect** = predict().coverage line.
- **D Caller Expect** = predict().runpass line (+ grain, existing).
- **Ask Booth** "what's working / best vs their top" = rank() with the
  chip's filter as C.
- **Scout "From your book"** = rank() with C = the selector's situation.
- **Game Plan "This week's calls" suggestions** = rank() per situation row.
- **Wristband / call sheet export** = rank() top-N per situation.

## 7. Explainability (what the coach sees next to every number)
`HAMMER 78% · 7.3 avg · 18 snaps · 2nd & medium (widened from 2x1 Wing)`
`vs C0: 3 snaps · not enough — showing situational`
`2X1 MEMPHIS · no reps · concept match vs C0`
A coach must always be able to answer "where did that number come from"
from the row itself.

## 8. Not in this build
- New data capture (keys, strength-relative direction, depth) — roadmap.
- Changing any gate value.
- Any D-vocab mapping to families (unmapped D calls still rank by their
  own record).

## 9. Acceptance (verified in-browser against the real book)
- [ ] Vs Hazelwood (Cover 0 book, ~0 own snaps vs C0): hero = HAMMER-class
      situational leader with its %, NOT a concept match; concept rows
      appear only after every play with a record.
- [ ] Vs Fox (changeup book): Expect shows rung + n; widening is labeled.
- [ ] BEST NOW text == shortlist row 1 text, byte for byte, on 20 random
      situations (smoke).
- [ ] Ask Booth "best vs their top" == rank() output for that chip (smoke).
- [ ] Tonight-vs-season line appears when live snaps ≥ MIN_SNAPS and
      differ ≥ 20 pts; absent otherwise.
- [ ] Every row carries slice + n in its label.
- [ ] Reconciliation: a coach's hand sheet for one opponent matches
      predict() numbers on every shared cell (recon template).
