# Focus Slice 4d — Follow-up G: OFFGRD autotest up-weight consumer (close the mechanical loop)

4d shipped the coach-facing re-test loop **and the contract** that's supposed to drive next week's test: `test_spec.positions[g].emphasis[]` plus the `get_active_focus_flags(school_id)` RPC. But the OFFGRD autotest generator doesn't consume it yet — it still ranks drills by kind-level weight and never looks at the scheme/dimension cell or `min_reps`. So today "Emphasize next test" writes a flag, tracks it, and renders the Impact readout — but it doesn't actually change which reps the athlete gets. **G makes that mechanically real:** wire the generator to read the emphasis contract and guarantee the flagged cell gets its reps next cycle. That flips the Impact line from `awaiting` to a true `2/7 → 5/9` delta on real data.

This is the last thread on the whole flywheel.

---

## What 4d already provides (the contract — build against it, don't rebuild)

- **`test_spec.positions[g].emphasis[]`** — written by `_focus_embed_emphasis_in_week` when a week exists. Each entry: `{ kind, dimension, scheme_type, scheme_value, min_reps: 6, out_of_plan_mode: 'review', … }`.
- **`get_active_focus_flags(school_id)`** — own-school-gated for authenticated callers, service_role for server consumers; returns active (non-`consumed_at`) flags with the cell fields + `min_reps`. This is the source for consumers that *don't* have a persisted `test_spec` in hand (dev/no-week).
- **`consumed_at`** — set by `refresh_focus_impact` once the re-test produces `attempts ≥ 4` (the compute floor) on the cell; row kept for history.
- **Impact readout** — already renders `2/7 → awaiting` and will render `2/7 → 5/9 (+X)` once `current_correct/attempts` populate. G is what makes those populate.
- **Scheme normalization** — `_focus_normalize_scheme` (SQL) mirrors the client `normalizeSchemeValue`. **G must generate reps that normalize to the same cell the Impact RPC measures** (see §4 — this is the make-or-break parity point).

---

## The gap G fixes

OFFGRD autotest generation ranks/sorts drills by **kind-level weight** (e.g., "DB align" gets priority) and doesn't inspect the `(dimension, scheme_value)` cell or `min_reps`. A flag on **Cover 1 depth** therefore doesn't change generation — the coach's emphasis is cosmetic until G. G makes generation read `emphasis[]` and guarantee the flagged cell gets **≥ `min_reps`** reps of that exact `(kind, dimension, scheme_value)` next test.

## 1. Where the generator reads the flag

At test-generation time (the autotest builder that composes the position test / reps), read the emphasis list from one of two sources — pick per the generator's architecture:

- **(a) `test_spec.positions[g].emphasis[]`** — when the generator already has the week's `test_spec` in hand (normal week path). No extra call.
- **(b) `get_active_focus_flags(school_id)`** — when it doesn't (dev-mode / distance-gated / offseason generation with no persisted week). Call as service_role (server) or in the coach's own-school context.

Prefer (a) when a week/`test_spec` exists; fall back to (b) for no-week/dev slots so the flag is honored there too — matches 4d's rule that the flag is **durable and consumed by whatever test-gen runs next**, real or dev.

## 2. How it up-weights (bias, don't monopolize)

For each emphasis cell `(kind, dimension, scheme_value)`, ensure the generated test includes **≥ `min_reps`** (default 6) reps matching that exact cell: same `kind` (align), same `dimension` (depth/leverage), and a defensive call/coverage matching `scheme_value` (Cover 1), exercising that dimension.

- **Up-weight, don't exclusive-generate.** Still generate the normal spread across the install; the emphasis **raises the floor** for the flagged cell, it doesn't crowd out the rest. Concretely: run normal generation, then check the flagged cell's rep count; if `< min_reps`, add or substitute reps until it hits `min_reps`, keeping total test size within the normal band.
- **Draw from the existing rep-composition path** — reuse `composeDefense` / the align-drill generator with the scheme forced to `scheme_value`. Do **not** fabricate a new rep type; these must be ordinary reps that happen to land on the flagged cell.

## 3. `out_of_plan_mode: 'review'` (honor even if not in this week's install)

- If the flagged scheme (Cover 1) **isn't** in this week's defensive install / opponent plan (4a out-of-plan), **still generate the `min_reps`** — but as **review/teach reps, not opponent-look reps**. Don't invent opponent frequency for a look the opponent doesn't show. Tag/treat these as review so they don't pollute opponent-tendency stats.
- If it **is** in plan, generate as normal in-plan reps.

## 4. The `consumed_at` handshake + cell parity (make-or-break)

- **Generation does NOT set `consumed_at`.** It only ensures the reps exist. `consumed_at` is set by `refresh_focus_impact` once the athlete completes `≥ 4` attempts on the cell (already built in 4d). Sequence: flag → G generates `min_reps` of the cell → athlete tests → `reps_results` accrue → `refresh_focus_impact` computes `current_correct/attempts`, sets `consumed_at`, Impact flips `awaiting` → `2/7 → 5/9 (+X)`.
- **Parity is the critical bit:** the reps G generates must resolve to the **same cell definition** the Impact RPC measures. Reuse the **shared scheme normalizer** (`_focus_normalize_scheme` / `normalizeSchemeValue`) and the **same dimension-correctness predicate** so a rep G labels "Cover 1 / depth" is counted by `refresh_focus_impact`'s current-window filter. If G generates against one notion of "Cover 1 depth" and the Impact RPC filters on another, the current window never picks up the reps and the delta stays stuck on `awaiting` forever. This is the single most likely failure mode — call it out in the build and test it directly.

## 5. No active week / dev slot

If generation runs with no persisted week (dev / distance-gated / offseason dev test), use `get_active_focus_flags` and still up-weight — the flag is durable and honored by whatever test-gen runs next, per 4d.

---

## Guardrails

- **No scoring / rep-capture / partial-credit change.** G only changes **which** reps are generated, never how they're scored. The teach→test numbers stay exactly as validated.
- OFFGRD gameday app (v-numbered, HTML + mirror-sync pattern). The change is in the **autotest generation path only**. `daily_focus_cron_config.enabled` stays `false`; `week_autotest` flag behavior unchanged — G rides whatever generation path already runs, it does **not** enable auto-blasts or new crons.
- **Cadence:** G biases the **next** generated test; it doesn't retroactively rewrite an existing week's test unless that test is regenerated.
- **Repo reachability:** the OFFGRD autotest generator isn't in the mounted workspace (it wasn't there for the 4d migration either). Cursor builds this in the gameday repo; I'll review the generation-path diff + the parity (shared normalizer + dimension predicate) when it's shareable, then run the live end-to-end proof. Verify by the **generated artifact + rendered Impact flip**, not grep.

## Acceptance

1. Test generation reads `emphasis[]` (or `get_active_focus_flags`) and **guarantees ≥ `min_reps`** of the flagged `(kind, dimension, scheme_value)` cell in the next test.
2. Up-weight **biases without monopolizing** — the rest of the install still generates; total test size stays in the normal band.
3. `out_of_plan_mode: 'review'` honored — out-of-plan flagged cells generate as review/teach reps, not fabricated opponent looks; in-plan cells generate normally.
4. Generated reps share the **same cell definition** (shared scheme normalizer + dimension-correctness) the Impact RPC measures, so completing them flips Impact `awaiting` → delta and `refresh_focus_impact` sets `consumed_at` at `≥ 4` attempts.
5. No-week / dev slot still honors active flags.
6. No scoring / rep-capture change; crons / auto-blasts unchanged.

## Verification (live, end-to-end — the payoff)

- On preview/gameday, with a Cover-1 flag active (reuse `be1fef06…` or plant a fresh one), **generate the DB test** → confirm it contains **≥ 6 Cover-1 depth/leverage reps** (the flagged cell) **plus** the normal spread.
- **Complete those reps as the athlete** → `reps_results` accrue → `refresh_focus_impact` → Impact flips to **`Cover 1 leverage: 2/7 → 5/9 (+X)`**, `consumed_at` set.
- Confirm **out-of-plan review-tagging** on a flag whose scheme isn't in the week install.
- That's teach → test → practice → **re-test** mechanically closed and visible — the full loop.

## Report back

- Where the generator reads the flag (`test_spec.emphasis[]` vs `get_active_focus_flags`) and the up-weight algorithm (how it reaches `min_reps` without monopolizing).
- The **shared scheme-normalizer + dimension-correctness reuse** proving generated cell == measured cell (the parity check).
- The `out_of_plan` review-tagging handling.
- The generated-test artifact (≥ `min_reps` of the cell) + the live Impact flip (`awaiting` → delta) + `consumed_at` set.

---

## Why this is the last piece

The coach-facing loop is already closed and proven: the coach flags a cell, it tracks, and the Impact card shows the payoff readout. G closes the **mechanical** half — the flagged cell actually gets more reps, the athlete tests on it, and the number moves for real. After G, "Emphasize next test" isn't just a promise the readout displays; it's a change the next test delivers. That's the whole flywheel turning on its own: teach → test → surface the gap → practice it → re-test it → prove it moved.
