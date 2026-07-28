# Focus Today Slice 4 — the capstone (gameplan scoping · Add-to-practice · LLM phrasing · re-test loop)

Slices 1–3 shipped: group scheme concentration → individual drill-down → templated Practice emphasis → coach edit/pin, all live on served storage. Slice 4 turns Focus Today from "a smart read" into a **closed loop**: scope it to *this week's* gameplan, push the drill into the practice script, generate phrasing when no rule matches, and re-test the deficiency next week to prove practice moved the number.

Four sub-slices, each independently shippable in the order below.

---

## What's live (build on it — don't rebuild)

- **Slice 1/1.5** `schemeBreakdown` (group) + `schemeConcentration` (individual) on the payload.
- **Slice 2** `focus_drill_rules` (seed rules) + `resolvePracticeEmphasis` → `payload.practiceEmphasis` (with `drill_ref` column already on the table, currently unused — Slice 4b's hook).
- **Slice 3** `focus_today_overrides` (coach edit/pin), precedence coach > rule > generic, pin survives Refresh.
- **`applyCadenceToFocus`** rides `practiceEmphasis` through every slot (gameday/day0/practice-week) — the null-out bug is fixed + covered by a cadence-slot integration test. Preserve that.
- **`FOCUS_PAYLOAD_VERSION`** self-heal (currently 5) — bump on any payload-shape change so existing cards backfill.
- **Served storage works** for a correctly-linked coach (`get_group_focus_for_school(high_schools.id)` returns rows; the earlier "0 rows" was a diagnostic artifact, retracted). Slice 4 reads/persists against served storage.
- **Practice-script feature** exists (season practice scripts) + the card's **"Add to practice" / "Emphasize next test"** affordances (referenced in Focus Impact) — 4b and 4d wire *into* these, not new surfaces.
- **Scouting import** exists (opponent tendency data) — 4a's weighting source.

---

## Slice 4a — gameplan scoping (`week_plan` join + opponent weighting)

Only surface deficiencies against schemes **in this week's install / opponent plan** — a coach doesn't care about a coverage they won't face this week.

- The reps already carry `week_plan_id`. Join the top `schemeBreakdown` / `schemeConcentration` cells against the current `week_plan`'s installed schemes, and **rank in-plan deficiencies above out-of-plan ones** (don't hard-hide out-of-plan — a big deficiency still matters — but weight in-plan higher and label it).
- Where scouting/opponent-tendency data exists, **weight by how often the opponent shows that look** — "Cover 3 is 40% of what Parkway North runs, and you're 0/8 on depth vs it" is a stronger focus than an equally-bad look the opponent rarely shows.
- Render: tag in-plan cells ("vs this week's plan") so the coach sees the focus is opponent-relevant, not generic.
- Payload: add `inPlan: bool` + optional `opponentFrequency` to the scheme cells (JSONB, bump version).

**Acceptance:** in-plan deficiencies rank above out-of-plan; opponent-frequency weighting applies where scouting data exists and degrades gracefully where it doesn't; no rep-capture or scoring change.

## Slice 4b — Add-to-practice hookup (`drill_ref` → practice script)

Close the loop: deficiency → one tap → in this week's practice plan.

- The `focus_drill_rules.drill_ref` column already exists (Slice 2 left the seam). Populate it on the seed rules with a reference into the drill/practice-script library where one exists.
- Wire the card's **"Add to practice"** action: tapping it on a Practice emphasis line appends that drill (via `drill_ref`, or the emphasis text if no ref) to the **current week's practice script** using the existing practice-script write path.
- Gate correctly: "Add to practice" stays behind `allowPracticeRec` (it's a practice *action*, not a diagnosis) — so on gameday it's suppressed exactly as today, available on install/practice-week slots.
- Confirmation: a toast + the item visibly in the practice script.

**Acceptance:** "Add to practice" appends the drill to the current week's practice script; `drill_ref` resolves to a real drill where set, falls back to emphasis text where not; the action respects `allowPracticeRec` (suppressed on gameday); no duplicate on double-tap (idempotent by signature).

## Slice 4c — LLM phrasing fallback (rule-miss → generated, coach-editable)

When no `focus_drill_rules` entry matches, generate the emphasis instead of falling back to the flat generic line.

- On a rule-miss, call an LLM with a **scoped, PII-free** context: the deficiency signature (kind/dimension/scheme cell + accuracy), the position group, the opponent/gameplan context (4a), and a short instruction to produce a concrete practice emphasis in a coach's voice.
- **Never authoritative:** the generated line renders with a subtle "suggested" treatment, `source: 'llm'`, and is fully coach-editable (drops into the Slice 3 edit/pin flow). A coach edit becomes a `focus_today_override` — so the LLM's good guesses get promoted into the rules library over time (same cold-start-solve as coach edits).
- **Guardrails:** no player PII or names in the prompt (scheme/dimension/accuracy only); cache by deficiency signature so the same cell doesn't re-call every load; hard fallback to the generic line if the LLM call fails or times out (never a blank line).
- Payload: `source: 'rule' | 'coach' | 'llm' | 'generic'`.

**Acceptance:** a rule-miss renders a scheme-specific generated line (not the flat generic) with a "suggested" treatment; it's editable and a coach edit persists as an override; no PII in the prompt; LLM failure degrades to the generic line, never blank; results cache by signature.

## Slice 4d — emphasize-next-test scheme flag (the Focus Impact loop)

Prove practice moved the number.

- Wire the card's **"Emphasize next test"** action: flag the current deficiency's scheme (e.g., "DB depth vs Cover 1") to be **re-tested / up-weighted** in next week's test generation.
- Store the flag (own-school, RLS-scoped like `focus_today_overrides`); the week-test generator reads it to ensure the flagged scheme gets reps next cycle.
- **Feed Focus Impact:** after the re-test, compare the flagged cell's accuracy week-over-week and surface it — "Cover 1 depth: 0/8 → 5/9 after last week's emphasis." That's the payoff that closes teach→test→practice→re-test.

**Acceptance:** "Emphasize next test" flags a scheme; next week's test generation includes/up-weights it; Focus Impact shows the week-over-week delta for flagged cells; flag is own-school RLS-scoped.

---

## Sequencing

4a (gameplan scoping — pure aggregation + join, no new writes) → 4b (Add-to-practice — reuses practice-script write path) → 4c (LLM phrasing — additive, guarded) → 4d (re-test loop — touches test generation, the biggest). Each ships independently through the same flow. 4a and 4b are the highest coaching value; 4c and 4d can follow.

## Guardrails (unchanged, hold them)

Live product, portal default-on, storage served. **No rep-capture change, no scoring change** — partial-credit stays exactly as validated. `daily_focus_cron_config.enabled` stays `false`. Any new table (4d's flag) gets tight RLS scoped to the coach's own school — the same discipline as `focus_today_overrides`, and mindful of the `high_school_coaches` trust anchor (now locked). Resolved values ride `group_focus.payload` JSONB where possible (no RPC signature churn); bump `FOCUS_PAYLOAD_VERSION` on any shape change so cards self-heal.

## Verification standard (non-negotiable — it caught real bugs three times this arc)

- **Integration test through the real chain**, across cadence slots: `fetch rules + overrides + week_plan (+ LLM) → computeGroupFocus → applyCadenceToFocus → render-gate`. Assert the rendered output, not just the pure resolver — the Slice 2 cadence null-out and the Slice 1.5 stale-payload bugs both lived exactly where unit tests didn't reach.
- **Live render-proof by eye** on the preview, signed in as a coach: the in-plan tag renders (4a), "Add to practice" actually lands the drill in the script (4b), a rule-miss shows a generated line that's editable (4c), the re-test delta shows in Focus Impact (4d). Done = the rendered/served result seen, never a grep or a green unit test alone.
- Ship each sub-slice preview → signed-in QA → served-artifact check → fast-forward cutover. For the LLM (4c), also confirm no PII leaves in the prompt and the failure path degrades to generic.

## Report back per sub-slice

- 4a: the `week_plan` join + ranking rule + where opponent-frequency comes from.
- 4b: how `drill_ref` resolves into the practice script + the idempotency key + the `allowPracticeRec` gate.
- 4c: the exact prompt (confirm PII-free), the cache key, the failure fallback, and how an LLM line becomes a coach override.
- 4d: the flag storage + RLS, how test generation reads it, and the Focus Impact delta computation.
- Each: the cadence-slot integration test output + the preview URL for the signed-in render-proof.
