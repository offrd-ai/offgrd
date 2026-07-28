# Focus Slice 4d — emphasize-next-test → Focus Impact re-test loop (scheme/dimension delta over the existing spine)

Slices 4a–4c shipped and verified on prod: gameplan scoping (in-plan + opponent-frequency tags), Add-to-practice, and LLM phrasing (PII airtight, confirmed server-side). 4d closes the loop — it proves practice *moved the number*. This is **not greenfield**: a tracked-focus + Focus Impact spine already exists. 4d is a **precision upgrade over that spine**, not a rewrite.

**The one-line delta:** today the loop tracks and reports at the coarse **kind** level (`DB align: 55% → 62% (+7)`). The rest of the Focus chain (Slice 1.5 / 2 / 4a) already localizes every deficiency to a **scheme + dimension cell** (`Cover 1 depth 0/8`). 4d makes the re-test loop track, up-weight, and report at *that* resolution — with rep counts and the scheme label — so the payoff readout matches the diagnosis.

---

## The spine that's live (extend it — don't rebuild)

| Layer | What exists today | 4d's change |
|---|---|---|
| **UI** | `Emphasize next test` action + `PortalFocusImpact` surface | Wire the action to a scheme+dimension flag; upgrade the Impact line format |
| **Client** | `emphasizeNextTest` → `start_tracked_focus(kind, subskill, baseline)` | Pass scheme_type / scheme_value / dimension + baseline rep counts |
| **RPCs** | `get_focus_impact` / `refresh_focus_impact` | Return the cell delta (rep counts + scheme), keep kind-% as fallback |
| **Format** | `DB align: 55% → 62% (+7) since …` (kind-level) | `Cover 1 depth: 0/8 → 5/9` (scheme + rep counts), delta secondary |

Also live and reused, not touched: Slice 1/1.5 `computeSchemeBreakdown` / `schemeConcentration` (the cell math — **reuse it**, don't fork), Slice 2 `focus_drill_rules`, Slice 3 `focus_today_overrides` (**the RLS template to mirror exactly**), Slice 4a scheme cells carrying `inPlan` / `opponentFrequency`, Slice 4b `append_focus_to_practice`, Slice 4c LLM fallback. `FOCUS_PAYLOAD_VERSION` is at 7. The **`high_school_coaches` trust anchor is locked** (REVOKE ALL + GRANT `{SELECT, UPDATE}` + re-home trigger + `create_owned_program` definer RPC) — 4d must not write to it or to `high_schools`.

---

## 1. Flag storage — extend `start_tracked_focus` to scheme + dimension

Decision to make explicit in the build (report which you chose): **extend the existing tracked-focus table** that `start_tracked_focus` writes with nullable scheme columns (preferred — keeps `get_focus_impact` a single read and preserves back-compat), **or** a sibling table mirroring `focus_today_overrides`. Prefer extend unless the tracked-focus table's shape makes a sibling cleaner; either way the RLS pattern below is identical.

Additive, nullable columns on the tracked-focus row (back-compat: existing kind/subskill/baseline rows keep working):

```
scheme_type        text null          -- 'coverage' | 'formation' | 'defensive_call'
scheme_value       text null          -- e.g. 'Cover 1'; null = kind-level flag (today's behavior)
dimension          text null          -- 'depth' | 'leverage' | 'relationship'; null for flat kinds
baseline_correct   int  null          -- rep counts at flag time → the "0/8" baseline
baseline_attempts  int  null
consumed_at        timestamptz null   -- set when a re-test produces enough attempts to compute a delta (history, not delete)
```

Natural key (one active flag per cell): unique on `(school_id, position_group, kind, coalesce(dimension,''), coalesce(scheme_type,''), coalesce(scheme_value,''))` where `consumed_at is null`. Upsert on re-flag.

**RLS — mirror `focus_today_overrides` exactly (this is the highest-risk item):**
- `GRANT SELECT, INSERT, UPDATE ON <flag table> TO authenticated; REVOKE ALL FROM anon; GRANT ALL TO service_role.`
- **SELECT** `USING (school_id IN (SELECT school_id FROM public.high_school_coaches WHERE user_id = auth.uid()))` — own-school only.
- **INSERT** `WITH CHECK (school_id IN (…own schools…) AND created_by = auth.uid())`.
- **UPDATE** `USING (…own schools…)` (for `consumed_at` / re-flag).
- **Anchor-safe:** the flag references `school_id` only. **No INSERT/UPDATE/DELETE to `high_schools` or `high_school_coaches`** anywhere in the 4d path. The coach→school link is read-only through the locked anchor.
- **If `start_tracked_focus` is (or becomes) `SECURITY DEFINER`:** pin `search_path = public, offgrd`, and **re-derive `school_id` server-side** from `auth.uid()` via `high_school_coaches` — do **not** trust a client-passed `school_id` (same discipline as `append_focus_to_practice` in 4b). The client passes the cell (kind/dimension/scheme + baseline counts); the server owns the school binding.

**Verify (report the results):** foreign-school flag attempt → `42501`; own-school flag → row present; anon → denied; re-flag same cell → upsert (no duplicate).

## 2. Test-gen read — up-weight the flagged cell

Where week-test generation builds the position test, read the school's active (non-consumed) flags and **up-weight** the flagged `(kind, dimension, scheme_value)` so the next test includes at least a floor of reps on that exact cell (e.g., ≥ 6 reps of Cover 1 depth for DB).

- **Up-weight, don't exclusive-generate** — still cover the rest of the install; the flag biases, it doesn't monopolize.
- **No active week / development slot:** the flag is **durable** — stored, not tied to a specific week. It's consumed by the **next test-gen that runs**, whether that's a real `week_plan` week or a development/dev-mode test slot. It does **not** expire on an empty week. Define and implement: if there's no active `week_plan`, the flag simply waits; the next generated test (real or dev) honors it.
- **Out-of-plan honor rule:** if the flagged scheme isn't in this week's install at all (4a would tag it out-of-plan), **still honor the flag** — the coach explicitly asked to re-test it — but generate it as a **teach/review rep**, not a fabricated opponent-look rep. Don't invent opponent frequency for a look the opponent doesn't show.
- **Consume/expire rule:** the flag stays active until a re-test produces `attempts ≥` the compute floor on that cell (so Impact can compute a real delta), then set `consumed_at` (keep the row for history — don't delete). A coach can also clear it manually (own-school UPDATE). Report which trigger sets `consumed_at`.

## 3. Focus Impact WoW — scheme/dimension + rep counts

Upgrade `get_focus_impact` / `refresh_focus_impact` from a kind-level % to the **cell delta with rep counts**, keeping the kind-level readout as a fallback.

- **Baseline** = `(baseline_correct / baseline_attempts)` captured at flag time on that cell (e.g., `0/8`).
- **Current** = the same cell recomputed over the **re-test reps**, using the **same `computeSchemeBreakdown` logic** as Slice 1/1.5 (attempt floor, below-strength guard) — reuse, don't fork, so baseline and current are apples-to-apples.
- **Render:** `Cover 1 depth: 0/8 → 5/9` (rep counts + scheme label) with the delta. Retain the kind-level `DB align: 55% → 62% (+7)` as the **fallback** when the flag is kind-level (scheme_value null) — full back-compat with today's output.
- **Degrade cleanly (never a fake or noisy delta):**
  - Re-test hasn't happened yet (no new reps) → `Cover 1 depth: 0/8 → awaiting re-test`, not an invented number.
  - Re-test attempts below the compute floor → `needs more reps`, not a noisy `1/1`.
- **Payload / return shape:** add `scheme_type`, `scheme_value`, `dimension`, and baseline/current rep counts to the `get_focus_impact` return; `PortalFocusImpact` reads them. If Impact rides `group_focus.payload`, **bump `FOCUS_PAYLOAD_VERSION` → 8** so existing cards self-heal to the cell-level readout.

## 4. Cadence gating + render-proof (the non-negotiable standard)

- **`allowPracticeRec` gate:** `Emphasize next test` is a planning action — gate it like Add-to-practice (suppressed on gameday, available on install / practice-week slots). The **Impact readout line** (the delta) renders across **all** slots, like the diagnosis line — the coach wants to see the payoff anytime, including gameday.
- **Cadence-slot integration test through the real chain** (this caught real bugs three times this arc — the Slice 2 cadence null-out and the 4c sticky-payload bug both lived where unit tests didn't reach): flag a cell → simulate next-week re-test reps → `get_focus_impact` → `applyCadenceToFocus` → render-gate, across `gameday` / `day0` / `practice-week`. Assert: (a) the flag up-weights test-gen; (b) Impact shows `0/8 → 5/9` with the scheme; (c) awaiting-re-test and below-floor both degrade cleanly; (d) the kind-level fallback still renders when no scheme is flagged.
- **Live render-proof, signed-in as hscoach on the preview** (done = the rendered/served result seen, never grep): `Emphasize next test` on the DB Cover-1 depth cell → flag persists across a **hard reload** → after re-test reps land, `PortalFocusImpact` shows the `Cover 1 depth: 0/8 → X/Y` line. **RLS proof:** a foreign-school flag attempt → `42501`; own-school emphasize → the Impact line renders.

---

## Acceptance

1. Flag stored at **scheme + dimension** with own-school RLS (foreign → `42501`, anon denied, re-flag upserts), **anchor-safe** (no `high_schools` / `high_school_coaches` writes); `school_id` re-derived server-side if the write path is `SECURITY DEFINER`.
2. Next week's test-gen **up-weights** the flagged cell; **no-active-week / dev-slot** behavior defined and safe (flag durable, consumed by next test-gen, out-of-plan honored as a review rep); `consumed_at` set on re-test, row kept for history.
3. Focus Impact shows `Cover 1 depth: 0/8 → 5/9` (rep counts + scheme), computed via the **shared** scheme-breakdown logic; kind-level % retained as fallback; awaiting / below-floor degrade cleanly.
4. `allowPracticeRec` gates the **action** (not the Impact line); cadence-slot integration test green; live render-proof + RLS `42501` proof confirmed on preview.
5. **No scoring / rep-capture change**; `FOCUS_PAYLOAD_VERSION` bumped if payload shape changes; `daily_focus_cron_config.enabled` stays `false`.

## Guardrails

Live product, portal default-on, storage served. **Extend the spine, don't rewrite it** — `start_tracked_focus` / `get_focus_impact` / `refresh_focus_impact` / `PortalFocusImpact` stay the entry points; add columns + resolution, no RPC teardown. First new writable surface since Slice 3 — RLS scoped own-school, `created_by = auth.uid()`, **mirror `focus_today_overrides`**; do **not** touch the locked `high_school_coaches` anchor or `high_schools`. Migration via SQL editor with confirm-applied + RLS row-count check (not "no rows returned"). **Review-before-apply on anything touching RLS or test-gen** (standing rule). Ship preview → signed-in QA → served render-proof → fast-forward cutover. Verify by the rendered/served result, not by grep or a green unit test alone.

## Report back

- Flag storage **decision** (extend tracked-focus vs sibling table) + migration SQL + applied confirmation + RLS test (own-school pass, foreign `42501`, anon denied) + **anchor-safety confirmation** (no `high_schools` / `high_school_coaches` writes; `school_id` server-derived).
- Where test-gen **reads the flag and up-weights**, plus the no-active-week / dev-slot behavior, the out-of-plan honor rule, and the `consumed_at` trigger.
- The `get_focus_impact` / `refresh_focus_impact` **return-shape change** (scheme + dimension + baseline/current rep counts), the shared `computeSchemeBreakdown` reuse, and `FOCUS_PAYLOAD_VERSION` if bumped.
- Cadence-slot integration test output + preview URL for the signed-in render-proof (flag → re-test → `0/8 → 5/9` Impact line) + the RLS `42501` proof.

---

## Why this closes the arc

Slice 1 said *where* the deficiency is. 1.5 said *who*. 2 gave the drill. 3 let the coach own it. 4a scoped it to the opponent. 4b pushed it into practice. 4c phrased it when no rule fit. 4d is the **proof**: the same Cover-1-depth cell that started at 0/8 now reads `0/8 → 5/9 after last week's emphasis` — teach → test → practice → **re-test**, closed at the resolution the coach actually coaches at.
