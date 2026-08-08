# Scout Report — UI polish ticket (v246 baseline)

**Framing.** The report's honesty machinery (provenance badges, `(n)` everywhere, confidence chips, review-gated corpus) is right and ahead of the competition — this ticket doesn't touch any of it. The gap is **scanability**: the page reads as a data dump, and a coordinator needs a call sheet. Five ranked changes + a polish list. Zero data/RPC/SQL changes — pure rendering in `OFFGRD-scout-report.js` (+ print CSS).

---

## 1. Read sheet: bars, not text strings  (highest impact)

**Now:** coverage cells are sentences — `cover 4 33.3% · cover 0 33.3% · 2-man 33.3%` — that must be *read*.
**Change:** render each row's coverage distribution as horizontal segment bars (label + % + `(n)` on/next to each segment), the way the v1 spec originally called for. Glanceable, print-safe, no overlay.
**Also apply to:** Personnel grouping (C) coverage-mix column — same helper, same treatment (keep the `+N other` remainder from v246).

## 2. Cards: dead buckets shrink, thin numbers grey

**Now:** "No coverage tags" buckets (4th & short, red zone) render as full-size cards; a `COVER 4 100%` off 1 snap headlines in bold white with only a small THIN chip to save it.
**Change:**
- Empty buckets collapse to a single slim row (bucket name + "no tags") — keep them present (fixed-grid muscle memory) but visually minimal.
- On THIN cards (<5 snaps), grey/de-emphasize the **headline % itself**, not just the chip. A bold 100% beats a grey chip in a coach's eye every time.

## 3. Add a takeaways strip (top of report)

3 lines max, auto-picked from the strongest signals only — rules, not LLM:
- Candidates: highest-share coverage overall, any pressure-rate spike by situation, any formation-family spike — **only** where confidence ≥ MED (n ≥ 8) and share ≥ 40% (or spike rule already defined for Cover 0).
- Wording observational, IP-safe: `Quarters team — Cover 4 on 55% of snaps (24/44) · Pressure spikes 3rd & long — 38% (5/13) · vs 3x1: Cover 4 64% (7/11)`.
- If nothing clears the bar, render nothing (no filler).

## 4. Readiness chain: collapse when complete

**Now:** five completed checkmark steps occupy a full-width row above the fold forever.
**Change:** when all steps are done → one line: `✓ Report ready · 44 coach-verified`. Expand only while any step is incomplete (that's when it's a guide). Keep the in-progress behavior exactly as-is.

## 5. Soft-headline weak leads

**Now:** `COVER 3 31%` (second place 23%) headlines with the same authority as `COVER 4 100% (6/6)`.
**Change:** when the top coverage share is **< 40%** or the margin over #2 is **< 10pp**, prefix the headline with "Lean:" (e.g. `Lean: Cover 3 31%`) and drop the headline to the same weight as the sub-line. Honest-numbers applied to presentation.

---

## Polish list (small, do in the same pass)

- **Decimals:** whole percents everywhere — 33.3% → 33%, 63.6% → 64%. `(n)` preserves the precision.
- **Casing:** unify coverage labels — pick one (suggest `Cover 4`) across read sheet, cards, personnel, Predict.
- **Provenance badge repetition:** full form once at the page header (`COACH-VERIFIED · 44 snaps · 44 coach-verified`); per-section badges compact to `✓ 44 coach-verified`.
- **Tablet check (verify, not build):** confirm the card grid + read sheet survive a 10" portrait viewport — sideline use is a tablet Friday night. Fix wraps if broken; don't redesign.

---

## Explicitly DO NOT touch

- Fixed bucket order on cheat cards (muscle memory).
- Per-section Print/CSV buttons.
- The badge system, confidence chips, `(n)` on every % — every number keeps its `(n)`.
- Any aggregation math, `OFFGRD_TENDENCIES` reuse, the review-gated corpus, thresholds (spike rule, chip bands).
- IP guardrail: all new copy (takeaways, leans) stays observational — never "call X."

## Acceptance

1. Read-sheet + personnel coverage render as bars; values identical to v246 text (spot-check 2 rows vs current numbers).
2. Empty buckets are slim rows; THIN headlines visually recede next to MED/HIGH cards.
3. Takeaways strip: shows only ≥MED, ≥40%-share (or defined spike) signals with `(n)`; renders nothing on a corpus with no qualifying signal; wording observational.
4. Complete readiness = one line; incomplete = current chain.
5. Weak leads read `Lean:` at reduced weight; strong leads unchanged.
6. Whole percents + unified casing everywhere on the report.
7. Print stylesheet still produces a clean stacked sheet with the new bars.
8. Pin-bump, single-version guard green.

**Sequence suggestion:** 1 (bars) → 2 (cards) → 4 (readiness) → 5 (lean) → 3 (takeaways) → polish. Screenshots per step; Claude will verify numbers didn't shift under the new rendering.
