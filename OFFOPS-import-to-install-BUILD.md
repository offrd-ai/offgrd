# Import-to-Install — kill the cold start ("derive, don't tag")

**The problem, observed live.** During the Slice-4d/G proof I ran the DB Alignment test on a real program and got: *"No alignment calls yet — Author a defensive call with alignments under Author → Defense."* Zero reps. The up-weight consumer fired correctly, read the right cell, and had **nothing to draw from** — `[focus-4d] cell up-weight short: Cover 1 leverage got 0/6`. Our entire differentiator (teach → test → practice → re-test → prove) is gated behind a coach hand-authoring a defensive call library first.

**The competitive frame.** SpiralXO's automation chain (call sheet, practice script, scout cards) is downstream of a Play Pool the coach hand-tags — by their own admission *"maybe a full day of work,"* and *"the quality of the call sheet is directly related to the quality of your play pool."* Their AI is a **matching engine over typed-in metadata**. We already hold the machinery to **derive** most of that — scouting import, `week_plans`, `composeDefense`, and uniquely **`reps_results` at cell resolution**. This ticket makes derivation the default.

> **North-star metric — TTFR (Time To First gradeable Rep):** a brand-new program, zero authored defense, gets **≥ 6 gradeable alignment reps in under 2 minutes** without ever opening Author → Defense. Instrument it.

**Scope:** additive install/derivation layer + zero-state UX. **No** change to rep capture, scoring, partial credit, or the Focus Today chain. Everything derived is **coach-editable** and **provenance-tagged**.

---

## 0. Inspect first — report before building

1. **Where authored defensive calls actually live.** Author → Defense storage (table/JSONB shape), and how `week_plans.def_aligns` relates to it. Is `def_aligns` the weekly install snapshot, the canonical library, or both?
2. **What the align pool reads.** Confirm the exact source `pickAlignRep({ preferScheme, strictScheme })` / `weekAlignCallForScheme` draw from (v139 established: `def_aligns`, **not** playbook `ol_keys`). Document the full chain: source → normalizer → `alignRepMatchesCell`.
3. **What the playbook already stores about defense.** The play designer draws defensive structure, DL shading, coverage + responsibilities, zones. Is that persisted structurally (extractable) or only as drawing geometry?
4. **What scouting import produces today.** Shape of `week_plans.gen` (`gen.defense.looks[].pct` is already consumed by Slice 4a). What fields exist: fronts, coverages, personnel, down/distance, formations?
5. **`composeDefense` inputs.** Minimum viable input to render + grade an alignment rep (coverage, front, formation, motion?).
6. **Test-spec generation.** Where `test_spec.positions[g]` is built (Slice 4d/G touched `emphasis[]`), and what a position test needs to be non-empty.
7. **Existing rep data.** Distinct `coverage_name` / front values already present in `offgrd.reps_results` for a school — this is a free derivation source.

Report paths + shapes. **Do not build a parallel defense store** — the installer must write into the existing authored-defense path so `pickAlignRep` picks it up with no consumer changes.

---

## 1. Architecture — four sources, one installer, one review gate

```
        ┌─ A. Starter Systems Library (global templates)
        ├─ B. Derive from program data (playbook / prior reps)
Sources ┤                                                      →  CANDIDATES  →  Review & Confirm  →  INSTALL
        ├─ C. Derive from scouting import (week_plans.gen)         (scored,        (never silent)      (writes authored
        └─ D. Derive from film import (Hudl/QwikCut/CSV)            provenance)                         defense + def_aligns)
                                                                                          ↓
                                                                          E. Auto-seed test_spec per position
                                                                                          ↓
                                                                             Reps Lab non-empty · Focus Today has data
```

**One installer, one candidate model.** All four sources produce the same `InstallCandidate`; only `source` and `confidence` differ. Ship A first (unblocks TTFR immediately, zero dependencies), then B, C, D.

### Candidate model

```ts
type InstallCandidate = {
  kind: 'defensive_call';
  name: string;              // "4-3 Cover 1"
  family: string;            // '4-3' | '3-4' | '4-2-5' | ...
  front: string | null;      // 'Over' | 'Under' | 'Bear' ...
  coverage: string;          // normalized via normalizeSchemeKey → 'cover 1'
  stunt?: string | null;
  alignments: AlignmentSpec; // what composeDefense needs to render + grade
  personnel?: string | null;
  source: 'template' | 'derived_playbook' | 'derived_reps' | 'derived_scouting' | 'derived_film' | 'coach';
  confidence: number;        // 0–1
  evidence?: string;         // "seen on 23 snaps in Week 3 film"
};
```

**Precedence — mirror the Focus Today pattern:** `coach > derived_film > derived_scouting > derived_playbook > derived_reps > template`. A coach edit always wins and is never overwritten by a re-import.

## 2. Phase A — Starter Systems Library (ship first)

Global, seed-only templates (same shape/RLS discipline as `focus_drill_rules`: `school_id NULL` = global, readable by authenticated, writable by service_role only).

- **Families:** 4-3, 3-4, 4-2-5 (nickel), 3-3-5. **Coverages:** Cover 0, 1, 2, 3, 4, 6, Tampa 2. **Fronts:** Over, Under, Even. Plus 2–3 common pressures per family.
- Each template carries **real alignment rules** — enough for `composeDefense` to render the look and grade **relationship × leverage × depth** per position. Templates that can't be graded are worthless; validate at seed time.
- **One-tap install:** "Install 4-3 base (Cover 1/2/3)" → writes coach-editable authored calls + `def_aligns`. Immediately editable in Author → Defense; nothing is locked.
- Seed idempotently (natural key), and **validate every template produces ≥ 1 gradeable rep** in CI.

**Acceptance A:** from zero state, one tap → DB Alignment test generates a full non-empty set including the installed coverages. TTFR < 2 min.

## 3. Phase B — Derive from existing program data

For programs that already have *something*, propose before asking them to install generic templates.

- **From the playbook:** if defensive structures are persisted structurally (front + coverage + responsibilities/zones — see Inspect #3), extract them as candidates. **Do not** use offensive `ol_keys.coverage` — that's the exact false positive that produced `0/6` in the G proof (OL protection rows are not defensive calls). Guard against it explicitly and add a regression test.
- **From prior reps:** distinct `coverage_name` values in `offgrd.reps_results` for the school = coverages this program demonstrably runs. High-value, zero coach effort. Evidence string: *"you've repped this 41 times."*
- **From `week_plans.def_aligns` history:** prior weeks' installs → season library.

## 4. Phase C/D — Import-to-install from scouting + film

- **C — Scouting import (exists today):** `week_plans.gen` already yields opponent fronts/coverages/looks with `pct`. Derive (i) **opponent look candidates** for scout-card/rep realism, and (ii) **situation tags** (down/distance/field position) — the thing SpiralXO makes coaches type by hand.
- **D — Film import (Hudl/QwikCut/CSV):** ingest tagged film; **our own defensive snaps** → our call library; **opponent snaps** → opponent looks + tendencies. Ship a **CSV/manual-mapping path first** so this isn't blocked on partner API access; add Hudl/QwikCut round-trip behind that interface (tracked separately as the table-stakes integration).
- **Column mapping UI** for imports: coach maps their tag names to our fields once, and we remember it per school. Their terminology, not ours.

## 5. Phase E — Auto-seed tests + hand off to Focus Today

After install, **immediately** build `test_spec.positions[g]` for every position group with installed content, so Reps Lab is non-empty on day one and the Focus flywheel has inputs.

- Respect existing generation logic; **do not** bypass the Slice-4d/G `emphasis[]` contract or `min_reps` up-weight.
- `daily_focus_cron_config.enabled` **stays false**. No auto-blasts to players from an install.
- If a week plan doesn't exist yet, install to the season library and embed on the next week plan (same durable-flag rule as 4d).

## 6. The differentiator — rank by execution, not by typing

Where SpiralXO ranks call candidates by coach-entered metadata, **we rank by what this team actually executes.** Use `reps_results` at cell resolution to order candidates and to inform the derived install:

- Coverages the team reps **poorly** → higher teaching priority (they need reps).
- Coverages the team reps **well** and that are in this week's plan → confidence for the call sheet.
- Surface it in the review screen as evidence: *"Cover 3 — your DBs are 34% on depth (12 reps)."*

This is computable for us and **not** for them. Keep the computation in the **shared** scheme-breakdown path (same normalizer + dimension predicate as Focus Today) so nothing drifts.

## 7. UX — zero dead ends, guided by default

1. **Kill the dead end.** The empty align pool must **never** render "go author a call." Replace with inline one-tap fixes: *Install 4-3 base* · *Use last week's install* · *Import from film* · *Author manually*. Same treatment anywhere a pool can be empty.
2. **Review, never silent.** Derived candidates land in a review screen with **source + confidence + evidence** per row, all editable, select-all/deselect. Nothing installs without confirmation.
3. **Setup wizard entry:** "What do you run?" → family → coverages → install. Under 60 seconds, skippable, resumable.
4. **Guided by default** for new programs; Expert opt-in.
5. **Never interrupt a rep.** Prompts discovered mid-test (e.g. formation mapping) go to a **queue reviewed between reps**, not a modal on rep 1. *(This is the interruption I hit during the G proof.)*
6. **Provenance visible + revertible:** every installed item shows where it came from and can be reverted to template or re-derived.
7. **Re-import is idempotent** — upsert by natural key; **never** clobber `source: 'coach'` items.

## 8. Data / security constraints

- New tables (templates, import mappings, candidate staging) get **tight own-school RLS mirroring `focus_today_overrides`**: `REVOKE ALL FROM anon`; authenticated SELECT/INSERT/UPDATE/DELETE scoped to own school; INSERT `WITH CHECK created_by = auth.uid()`; **UPDATE needs USING *and* WITH CHECK**. Global templates: `school_id IS NULL`, service_role write only.
- Any `SECURITY DEFINER` RPC: pin `SET search_path TO 'public','offgrd'` and **re-derive `school_id` server-side** from `high_school_coaches` — never trust a client-passed school.
- **No writes to `high_schools` or `high_school_coaches`** (locked trust anchor).
- Migrations idempotent; **review-before-apply on anything touching RLS, DEFINER, or `test_spec` writes**; confirm-applied with row-count checks, not "no rows returned."
- **No change** to rep capture, scoring, or partial credit.

## 9. Acceptance

1. **TTFR < 2 minutes** from zero state to ≥ 6 gradeable alignment reps, without opening Author → Defense.
2. Installed templates produce reps that **`composeDefense` renders and grades** on relationship/leverage/depth; they resolve through the **same** normalizer/`alignRepMatchesCell` path as Focus Today (no parallel matching logic).
3. **No empty-pool dead ends** anywhere in Reps Lab; every empty state offers a one-tap fix.
4. Derived candidates show source + confidence + evidence; nothing installs silently; coach edits survive re-import.
5. **OL/offense rows never leak into the defensive call pool** (explicit regression test — the `ol_keys.coverage` false positive that caused `0/6`).
6. Install auto-seeds `test_spec` so Reps Lab and Focus Today are non-empty on day one; `emphasis[]`/`min_reps` contract intact; crons stay off.
7. Re-import is idempotent; no duplicates.
8. RLS verified: own-school pass, foreign → `42501`, anon → denied.
9. No scoring/rep-capture change; existing Focus Today chain (1→4d + G) still green.

## 10. Verification

Unit + integration through the real chain (install → pool → `pickAlignRep` → rendered rep → `reps_results` → `computeGroupFocus`). Then **live render-proof, signed in**: create/reset a zero-state program → install → generate DB Alignment test → confirm **≥ 6 gradeable reps** and console `[focus-4d]`-style pool health → complete reps → confirm Focus Today populates. Plus RLS `42501` by eye. Verify by the **rendered/served result**, never grep or a green unit test alone. Report TTFR measured.

## 11. Explicitly out of scope

Hudl/QwikCut **API** integration (separate table-stakes ticket — this ships the CSV/mapping interface it will plug into); call-sheet generation; practice-script auto-generation; equipment/team-drive/admin features. Don't chase SpiralXO's breadth — this ticket buys the *foundation* those features would sit on.

---

### Why this is #1
It fixes the failure I hit live (zero reps, dead-end message), it removes our steepest adoption barrier, and it attacks the competitor's full-day tagging tax with the one asset they can't copy — **execution data at cell resolution.** Everything else in the roadmap gets better once a program reaches a non-empty state in under two minutes.
