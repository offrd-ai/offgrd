# Multi-Frame Coverage Experiment — does a burst through the snap beat 2 stills? (BUILD)

**Status:** experiment, isolated & non-destructive. Not a product change. Decision gate for whether we wire `extract.js` into the production runner.
**Owner:** Cursor builds the harness; coach supplies clips; Claude scores the output and calls the verdict.
**Depends on:** existing capture (`scout-frames` bucket, F1/F2), runner (`workers/auto-scout-runner/`), `cv-def-v2` prompt (`docs/prompts/cv-def-v2.md`), `extract.js` scaffold. **Zero production writes.**

---

## Why we're running this

Two full games off standard press-box sideline HUDL film both landed in the same place: **front 0%, shell 68%, coverage 45%** agreement vs coach truth. That camera is the high-school standard — coaches can't move the press box — so "get a better angle" is not a fix for the market.

The real diagnosis: **coverage is a post-snap event.** Cover 1 and Cover 3 look identical pre-snap (one high safety either way). What separates them happens *after* the snap — corners turning and running (man) vs sinking to zones (zone). A frozen frame can't show motion, which is why coverage caps ~45% on *any* angle, while shell (a pre-snap fact) already sits at 68%.

The lever is **temporal, not spatial**: sample frames *through* the snap so the model can see coverage develop. We already have proof the mechanism works — adding F2 in calibration moved ~67%→76%. This experiment pushes that further: 3–4 frames spanning pre-snap to +3s, same bad camera, and measures whether coverage agreement climbs.

**Hypothesis:** coverage agreement rises materially (target: clears ~60%); shell flat-to-slightly-up (already strong); front flat/low (sideline occlusion of the D-line persists — front stays coach-only regardless).

---

## Design principle: isolate ONE variable

The only thing that changes between baseline and experiment is **the number and timing of frames**. Same model (claude-sonnet-4), same `cv-def-v2` prompt (plus one addendum line, below), same 10 plays, same coach ground truth. If coverage moves, it's the frames — not luck, not prompt tuning.

---

## The 10 plays (coach-hands, no Hudl automation)

- Reuse **10 already-reviewed McClure snaps** — they carry coach-verified `front / shell / coverage`, which is the ground truth to score against. No new review needed.
- **Don't cherry-pick.** Pick a spread: ~5 two-high + ~5 one-high shells, include ≥2 red-zone and ≥2 open-field, mix man and zone in the truth set. Record the chosen `snap_index` + Hudl PLAY# list up front so the sample is fixed before we see results.
- **Coach exports each play as a short clip** (~5–6s, from the pre-snap set through ~+3s after the snap) — Hudl clip download or screen-record, by hand. Name each file by **Hudl PLAY#**. **Trim each clip to START at the pre-snap set point** so no snap-detection is needed.
- Drop the 10 clips where the runner can read them (a scratch folder / experiment bucket prefix — NOT the production `scout-frames` F1/F2 paths).

> Dependency note: this needs *video*, not the hand-grabbed stills. That's the one manual cost of the experiment. 10 short clips, coach hands, one sitting.

---

## Frame extraction (`extract.js`, experiment mode)

Because each clip is trimmed to start at pre-snap set, use a **fixed offset schedule** — no snap detection:

| Frame | Offset from clip start | Reads |
|---|---|---|
| E0 | 0.0s (pre-snap set) | shell, alignment (this ≈ today's F1) |
| E1 | 1.0s (at/just-post snap) | shell confirm, initial movement (≈ today's F2) |
| E2 | 2.5s | **coverage develop** — corner turn vs zone sink |
| E3 | 4.0s | **coverage confirm** — man carry vs zone settle |

- FFmpeg pulls 4 JPEGs per play at those timestamps.
- Write to an **experiment path only** — e.g. `scout-frames-exp/{team}/{batch}/{snap_index}/E0.jpg..E3.jpg`. **Never** touch production `F1.jpg/F2.jpg` or `raw.capture`.
- If a clip is shorter than 4.0s, take the last available frame for E3 and flag it.

---

## Model call (experiment mode)

- One call per play, all **4 frames in a single message**, each labeled with its offset ("pre-snap set", "+1.0s", "+2.5s", "+4.0s"). Same `cv-def-v2` prompt otherwise.
- **Prompt addendum (one block, appended — do not rewrite the prompt):**
  > "You are given 4 time-stamped frames of the same snap, from pre-snap set through ~4s after the snap. Use the later frames (+2.5s, +4.0s) to read coverage development: corners turning and carrying receivers downfield indicate man; corners/safeties settling into zones and passing receivers off indicate zone. Shell and alignment come from the earliest frame. All existing rules still apply — front stays family-level, pressure stays null unless clearly a blitz, coverage stays null if genuinely unreadable."
- Everything else unchanged: same model string, same validation, same confidence + `notes_flags` output.

---

## Output — side-by-side, non-destructive

Write results to a **JSON artifact** (preferred — zero DB, zero migration). One record per play:

```json
{
  "snap_index": 0,
  "hudl_play": 85,
  "coach_truth":  { "front": "...", "shell": "...", "coverage": "..." },
  "baseline_cv":  { "front": "...", "shell": "...", "coverage": "..." },   // from the existing 2-frame run already on scout_snaps
  "exp_cv":       { "front": "...", "shell": "...", "coverage": "..." },   // this multi-frame run
  "exp_confidence": 0.0,
  "exp_notes_flags": ["sideline_angle", "..."]
}
```

- Pull `baseline_cv` from the CV values already stored on those `scout_snaps` rows (the 2-frame run) — read-only.
- Pull `coach_truth` from the coach-resolved values on the same rows — read-only.
- Emit one summary block: **per-field agreement, baseline vs truth AND exp vs truth**, plus the delta.

**Do NOT** write `exp_cv` into `scout_snaps`, run `upsert_cv_scheme_v1`, or flip anything into the corpus. This is a scratch measurement. (If Cursor strongly prefers a queryable scratch table over JSON, that's a separate REVIEW-BEFORE-APPLY SQL ticket — default to JSON, no SQL.)

---

## Decision gate

Report the three deltas. The one that matters is **coverage**:

- **Coverage exp-agreement ≥ ~60%** (up from 45%) → the temporal lever works on standard film. **Greenlight** wiring `extract.js` into the production runner (fixed-offset burst, coach still supplies/trims clips), then re-validate on a full 40–50 snap game before flipping any auto-accept.
- **Coverage stays < ~55%** → the ceiling is real on this film. **Do not build extract.** Pivot to the review-accelerator framing (shell auto-firsts, coverage/front get a fast coach pass; provenance badges already tell that honest story).
- **In between** → promising but thin; expand to 25–30 plays before committing.

**n = 10 is directional, not proof.** Treat a single-play flip as ±10pp noise. We're looking for a clear move, not a decimal.

---

## Guardrails (non-negotiable)

- **Non-destructive:** experiment writes only to the `-exp` bucket prefix + the JSON artifact. Production `scout_snaps`, `F1/F2`, `raw.capture`, and the review queue are untouched and read-only.
- **No corpus merge / no auto-accept:** `exp_cv` never calls `upsert_cv_scheme_v1` and never lands in `SNAP_CORPUS`.
- **Coach-hands only:** no Hudl automation; coach exports the 10 clips.
- **One variable:** same model, same prompt (+ the one addendum), same 10 plays, same truth. Frames are the only change.
- **Fixed sample up front:** the 10 `snap_index`/PLAY# are chosen and logged before results are read — no post-hoc swapping.
- **Zero SQL by default:** JSON artifact, no migration.

---

## Deliverable back to Claude

The JSON results file (or scratch-table dump) with the three per-field agreement deltas. Claude verifies the numbers and renders the verdict + the go/no-go on wiring `extract.js`.
