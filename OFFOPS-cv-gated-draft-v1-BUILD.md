# CV Gated Draft v1 — confidence-gated coverage draft, coach confirms (BUILD)

**What this is.** The honest product shape the multi-frame experiment pointed to. CV does **not** auto-tag coverage. It **drafts** shell/coverage only on the snaps where the film is clean enough to trust, routes the rest to the coach blank-with-a-reason, and never bypasses review. This turns CV into a first-pass that saves the coach time on easy reps — not a robot that tags everything.

**Why these rules (evidence).** From the 10-play hand-picked re-run on McClure (batch `cb0421cb`):
- CV read coverage correctly on **every clean daytime snap** (6, 7, 9, 11 — 4/4), including the two (7, 11) that flipped from miss to hit once the safeties were visible.
- Every coverage failure was **film-limited**: night games (62, 99), an all-out blitz (14), a clip whose Hudl controls never hid (16). Two more (18, 23) were extraction artifacts.
- **The flags that predicted failure were `night_game`, `low_res`, `cropped_deep`** (and any unusable-frame flag). `sideline_angle` and `safeties_cut_off` fired on *every* play including the hits, so they are **not** gating signals.

That flag split is the gate.

---

## Non-negotiables (carry from existing system)

- **Auto-accept master stays OFF.** Nothing enters `def_tendency_by_family` without a coach action (`needs_review=false`). This ticket does not add an auto-accept path.
- **Reuse `upsert_cv_scheme_v1`** as-is: fill-NULLs only, `tag_source` stays `'import'`, pressure guardrail, `prompt_version` stamped. The gate decides *what CV passes in* (coverage value vs `null`), not a new writer.
- **`front` and `pressure` are coach-only, always.** Never drafted as truth. Front stays family-level hint; pressure blank unless a coach sets blitz Y/N. (Front reads ~0–10% off stills; pressure 0/8 detectable — both proven unusable.)
- **Provenance badges unchanged:** drafted = **AI-TAGGED**, confirmed = **COACH-VERIFIED**. Only confirmed rows feed tendencies/report.

---

## The gate (per snap, at merge time)

Inputs the runner already emits per snap: `exp_cv {shell, coverage, man_or_zone, front_detail}`, `confidence` (0–1), `notes_flags[]`.

Compute two things:

**1. `film_degraded`** = `notes_flags` intersects any of:
`{ night_game, low_res, cropped_deep, <any unusable/blank-frame flag e.g. F2_unusable> }`
(Do **not** include `sideline_angle` or `safeties_cut_off` — they are ever-present and non-discriminating.)

**2. `shell_coverage_consistent`** = coverage is compatible with shell:
- 1-high shell → coverage ∈ {cover 0, cover 1, cover 3}
- 2-high shell → coverage ∈ {cover 2, cover 4, 2-man}
- mismatch (e.g. 1-high + cover 4) → **inconsistent** (this is exactly the kind of contradiction that shows up in bad reads).

### Routing

| Condition | Lane | What CV writes |
|---|---|---|
| `!film_degraded` AND `confidence ≥ 0.50` AND `shell_coverage_consistent` | **GREEN — quick-confirm draft** | draft `shell`, `coverage`, `man_or_zone` (fill-NULL via `upsert_cv_scheme_v1`) |
| `film_degraded` OR `confidence < 0.50` OR `!shell_coverage_consistent` | **AMBER — coach-required** | draft `shell` only *if* confident; **leave `coverage` NULL**; attach `gate_reason` |

- Threshold `0.50` matches the data (clean hits ran 0.52–0.55; degraded reads 0.45–0.48). Make it a config constant, not a magic number.
- `gate_reason` is a short string for the review card: e.g. `"night game — you tag coverage"`, `"deep safeties cut off / low-res"`, `"shell/coverage mismatch — recheck"`. Derive it from the flags that tripped the gate.
- **Every snap still lands in review with `needs_review=true`.** The gate only decides *pre-filled vs blank* and *which lane*.

---

## Review UX — two lanes over the existing CV review

**GREEN · Quick-confirm lane.** Clean high-confidence drafts, shell + coverage pre-filled. Coach bulk-approves — one keypress per snap (Enter = confirm, flips AI-TAGGED → COACH-VERIFIED), or "Confirm all in view" for a batch. This is the time-saver: the coach rubber-stamps the easy reps instead of tagging them from scratch.

**AMBER · Coach-required lane.** Coverage blank. Card shows the `gate_reason` up top, the shell draft (if any) as a starting point, the develop frames, and the coverage picker (0–4/6, S shell, man/zone, P pressure — the existing keys). Coach tags coverage; confirm.

Both lanes keep the existing card (orientation banner "▶ Hudl PLAY #NN · D&D · hash · formation · YL", signed frame URLs, provenance badge).

---

## Data path (no new SQL if possible)

- Merge stays `upsert_cv_scheme_v1(p_key, p_cv)`. On AMBER, pass `coverage: null` (and `man_or_zone: null`) so the RPC leaves them for the coach; still stamp `shell` when confident, `prompt_version`, `confidence`. On GREEN, pass the full draft.
- Persist `gate_reason` + `gate_lane` (`green`/`amber`) onto the row's `raw.cv` (review-only, already how `front_detail`/notes are carried) so the review UI can sort/label — **no schema change**.
- Review queue sort: GREEN by descending confidence (fast bulk-confirm first), then AMBER grouped by `gate_reason`.
- `def_tendency_by_family` gate unchanged (`review_hold=false AND needs_review=false AND coverage IS NOT NULL AND formation_family IS NOT NULL`). AMBER snaps with null coverage simply don't count until the coach fills them — correct.

If a queryable `gate_lane`/`gate_reason` column is wanted later, that's a **REVIEW-BEFORE-APPLY** follow-up; default to `raw.cv`, zero migration.

---

## Explicitly NOT in this ticket

- No unattended auto-accept. No wiring of `extract.js` for blind tagging (the 44% aggregate does not support it).
- No drafting of `front` or `pressure` as truth.
- No change to the vision model/prompt — this is purely the **merge + review** gating layer.

---

## Acceptance

1. **Clean daytime batch:** high-confidence, consistent, non-degraded snaps land in the GREEN lane pre-filled; coach bulk-confirms; tendencies populate from confirmed rows only.
2. **Night/blitz/cropped batch:** coverage is left NULL, snaps land AMBER with a human-readable `gate_reason`; nothing wrong leaks into tendencies.
3. **Shell/coverage contradiction** (e.g. 1-high + cover 4) routes AMBER, never drafts the inconsistent pair.
4. **Provenance:** a drafted-then-confirmed snap shows COACH-VERIFIED; an un-touched draft shows AI-TAGGED and is excluded from tendencies.
5. **No auto-accept:** with the master OFF, no snap enters `def_tendency_by_family` without `needs_review=false`.
6. **Front/pressure** never appear as tagged truth anywhere in the report.

---

## One-line framing for the UI

CV drafts the reps it can see clearly and hands you the rest — you confirm, it learns your call sheet. First-pass, not final word.
