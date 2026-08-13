# OFFGRD Matchup Engine — "Play vs Look" scorer — build spec v1

**Goal:** rank OUR plays against THEIR looks with **no head-to-head film required**. The
correlation is look-keyed, never opponent-keyed: a Cover 1 is a Cover 1 whoever shows it.
Born from the Rockwood Summit / Festus scenario — new account, 162 opponent snaps, zero
shared history — where today the call sheet needs self-scout vs *that* opponent to rank.

**Ownership:** Cursor builds; Claude verifies. Deterministic engine on-device (offline
gameday is non-negotiable); LLM never on the scoring path — words only for "why" strings,
and only when online.

---

## 0. The model in one line

```
EV(play | situation) = Σ_look  P(look | situation, opponent) × Score(play, look)
Score(play, look)    = w · Empirical(play, look) + (1 − w) · Structural(play, look)
w                    = n / (n + K)            # n = graded self-scout snaps in that cell
```

Three inputs, two of which already exist:

| Input | Source | Status |
|---|---|---|
| **P(look \| situation)** | Scout tendency engine (recency-weighted, confidence-flagged) | ✅ shipped |
| **Empirical(play, look)** | Self-scout import: play/concept, coverage faced, DN/DIST, GN/LS | ✅ import path shipped; scoring new |
| **Structural(play, look)** | Play `data` (routes/tags/concepts) scored by rules vs coverage families | 🆕 this ticket |

## 1. Structural scorer (the new organ)

Score every play in the program book against each coverage family (C0, C1, C2, 2-Man,
C3, C4/Quarters, + pressure overlay) from the play's stored `data` — the same data the
renderer animates and auto-derive already reads. **Reuse the auto-derive reads engine;
do not build a second play-interpretation path** (same drift rule as the renderer).

Rule table (versioned, `struct_rules_v1`), examples of the shape — deterministic,
each rule = (condition on play data, look family, delta, why-string):

- Crossing/mesh concepts (two shallow crossers, rub tags) → **+big vs C0/C1/2-Man**
  ("natural picks vs man"), neutral vs zone.
- High-low on flat defender (curl-flat, smash) → **+big vs C2/C4** ("corner is
  high-lowed / flat is soft when safeties carry verticals").
- 3-level vertical stretch / 4 verts → **+big vs C3** ("4-on-3 deep"), **− vs C4**.
- Post/deep dig with single-high occupied → **+ vs C1/C3 sky** ("attack the post-safety").
- Quick game (≤3-step tags) & screens → **+ vs pressure-heavy cells** (blitz% from scout).
- RB swing/flare with LB-man tags → **+ vs C1** ("back wins the leverage race").
- Deep-developing play-action → **− vs high-pressure cells** unless max-protect tag.
- OL: pull/counter vs 4-2 light box → run-game rules score run concepts vs FRONT
  distribution the same way (front families already imported).

Output per (play, look): `struct_score` 0–100 + top-2 why strings. Rules live in code,
versioned; changing rules bumps `struct_rules_v` so any displayed score is reproducible.
This is the grown-up version of the attack panel's static beaters — same football,
but computed from THEIR actual playbook instead of generic concept names.

## 2. Empirical scorer

From self-scout rows (any opponent, any season): success rate by
(concept/play, coverage family, down-bucket), where **success = gain ≥ 4 on 1st,
≥ half-to-go on 2nd, converted on 3rd/4th** (chunk plays weight 1.5, TO/sack weight 0).
Same recency weighting as the scout engine ("weight recent games heavier" honors the
same toggle). Map raw plays → concepts via the formation/alias canon (trailing-tag
strip rule applies — same normalization in both readers).

## 3. Blend math & honesty

- `w = n/(n+K)`, **K = 8** graded snaps per (concept × look-family) cell. n=0 → pure
  structural; n=8 → 50/50; n≥30 → empirical dominates (~0.79+).
- EV combines with the scout's existing small-sample widening: thin `P(look)` cells
  widen to down-bucket priors exactly as Scout does today — one sampling policy, not two.
- **Basis is always displayed**: `"14 snaps vs C4 · 71% success"` or `"on paper"` badge
  when structural-only. Never show a ranking that hides whether it's earned or derived.
  (Same ethos as rep-earned scoring and coach-confirmed focus: the machine proposes,
  labeled honestly; the coach decides.)

## 4. Cold start (the Rockwood Summit case)

Brand-new program, zero self-scout: every play still ranks vs Festus **day one** via
structural × P(look), all rows badged `on paper`. Import last season's offense →
cells fill, badges flip to snap counts, ranking sharpens play-by-play. In-season, Caller
logging feeds the empirical side automatically (rep-earned data flywheel — no new
capture surface needed).

## 5. Where it surfaces

1. **Caller best-calls (O + D-aware)** — replaces the current "your success vs this
   opponent" ranking with EV vs predicted look. Must hit the existing per-snap compute
   budget (~ms, on-device, offline). Basis chip on each call.
2. **Scout attack panel** — beaters become *their-book-specific*: top 5 plays from the
   program's own playbook per look, why-strings attached, "on paper" badges where
   applicable.
3. **Plan tab — auto-drafted gameplan sheet** (Sunday-night moment): per situation
   bucket (1st&10, 2nd&medium, 3rd&long, red zone, 4th&short), top-3 plays + why +
   basis. **Draft only — coach confirms/edits into the plan; nothing auto-locks.**
   Confirmed sheet feeds the install → weekAutotest attaches the week's tests to it.
4. **Practice/test tie-in (flywheel)** — plays confirmed into the sheet whose primary
   look is the opponent's top-2 get **up-weighted in the week's tests** (existing
   focus4d up-weight path; no new mechanism).

## 6. Data & platform

- **No new tables for v1.** Structural scores computed on-device from the play library
  (cache in localStorage keyed by `play_id × struct_rules_v`); empirical cells derived
  from existing self-scout rows; EV computed at render. Fully recomputable from raws.
- If a server rollup becomes necessary for Team Portal surfaces later: views with
  `security_invoker`, RLS in the same migration, per house rule.
- Offline: everything above is deterministic local math — gameday parity required
  (same numbers airplane-mode as online).

## 7. Guardrails

- One play-interpretation engine (auto-derive) — no parallel parser.
- Deterministic + versioned (`struct_rules_v`) — any score reproducible from raws.
- Coach-confirmed everywhere it touches practice or the plan.
- Small-sample honesty: n shown on every empirical claim; no 100%-off-2-snaps headlines.
- LLM off the scoring path; template why-strings offline, richer wording online only.

## 8. Verify (golden fixtures + math)

- Fixtures: mesh scores top-quartile vs C1/C0; curl-flat top-quartile vs C4; 4 verts
  high vs C3 and penalized vs C4; screens rise in high-blitz cells; deep PA falls there.
- Blend: w(0)=0, w(8)=.5, w(32)=.8; EV = Σ P·Score verified by hand on a seeded matrix.
- Cold start: empty self-scout → all "on paper," non-empty ranking, no NaNs.
- Rockwood acceptance: Festus profile (C1 47% / C4 28% on 1st&10+) + seeded book →
  mesh/crosser and curl-flat family land top-5 with correct why-strings.
- Perf: full book (60 plays × 7 looks) scored < 50ms on school iPad; Caller budget kept.
- Offline: airplane-mode ranking identical to online (minus LLM wording).
- Determinism: full recompute from raw rows reproduces every displayed number.

## 9. Phasing

1. **P1 — Structural scorer + Scout attack panel integration** (pre-opener value for
   every new account; Rockwood sees their-book beaters vs Festus immediately). Size M.
   ✅ Shipped v259 (`cd25ff2`) — verified live on both playbook and fallback paths.
2. **P2 — Empirical cells + blend + O Caller ranking swap.** Size M. Note the live
   dividend: P(look) is already re-blended in-game with shift detection, so once EV is
   the ranker, play rankings rotate mid-game automatically (their man rate spikes →
   mesh climbs the sheet, zero extra taps).
3. **P3 — Plan tab drafted sheet + weekAutotest up-weight tie-in.** Size M.
4. **P4 — D-side mirror (below).** Size M-L.

P1 kills the cold-start problem; P2 makes it learn; P3 makes it run the week; P4 gives
the defense the same brain.

## 10. P4 — D-side mirror: defensive calls vs their offense

Same engine, inverted axis:

```
EV(call | situation) = Σ_off  P(they run OFF | situation) × ScoreD(call, OFF)
```

**Their-offense taxonomy (P side of the product):** already imported — run/pass rate,
OFF FORM family (2x2 / 3x1 / empty / heavy), personnel, motion rate, shot/vertical rate,
screen/quick-game rate, all by situation from the same scouting rows (Festus files
carried every column). The D Caller's Expect panel computes these today.

**Call taxonomy (the thing being scored):** the D Caller's existing chips ARE the
taxonomy — front family × coverage × blitz/stunt. No new vocabulary; score the
combinations coaches can already select.

**Structural rules (`struct_rules_d_v1`) — the shape:**
- +box fronts (4-4, Bear) vs high run rate in 12/21 pers; −box vs empty/10 pers.
- Press / 2-Man / pattern-match vs high quick-game rate ("take away the free access");
  soft zone penalized there.
- 2-high shells vs high shot/vertical rate; 1-high penalized vs 4-verts-heavy.
- Zone pressure vs empty (5-man protection, hot answers beat man pressure); **0-blitz
  penalized vs quick game and screens**.
- Spy/contain tags vs scramble-heavy QB (scramble rate from RESULT column).
- C3 sky/cloud run-support vs perimeter-run-heavy; A-gap pressure vs interior run.

**Empirical cells:** the Sit → Expect → Call → Result loop has been logging
(your call family × what they ran × outcome) since the D Caller shipped — the data
side of P4 is already accruing. Defensive success = offense's failure by the same
success-rate definition (§2), TFL/turnover weighted 1.5, explosive allowed weighted 0.
Same K=8 blend, same recency weighting, same basis chips.

**Surfaces:** D Caller — rank/highlight the top call per chip row with basis chip
("on paper" / "6 stops in 9 vs 12P run"); **never auto-select a chip** — the coach
calls the defense, the engine annotates. Plan tab gets the defensive half of the
drafted sheet (P3 mechanism reused). Live shift dividend applies here too: their run
rate spikes tonight → run answers climb mid-drive.

**Verify fixtures:** 12-pers 70%-run profile → +box fronts top, dime penalized;
empty quick-game profile → press/pattern top and 0-blitz penalized; verticals-heavy →
2-high rises; scramble-QB profile → spy rises; live-shift sim (run rate +20% tonight)
reorders answers mid-game; determinism + airplane-mode parity same as §8.
