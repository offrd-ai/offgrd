# Scout Report Tier 2 — A/B/C (Run Direction · Motion · Personnel) — BUILD

**What this is.** Three cleared sections added to Scout → Report, over the same `SNAP_CORPUS` / `offgrd_scout_snaps_for_team` reader the v1 report uses. Zero new SQL. Decision-aid language only. Every % ships with `(n)`. Reuse `OFFGRD_TENDENCIES` math wherever the number already exists (two-readers rule) — no third aggregator.

**Depends on:** Scout Report v1 (shipped v239/v240), Tier-2 proposal (`scout-report-tier2-PROPOSAL.md`, A/B/C cleared, D on hold).

**Orthogonal to CV:** A/B/C read **import** fields (direction/motion/personnel from Hudl Assist), not CV coverage — so they're unaffected by the gated-draft work. With current **defense-scout** batches (McClure), section **C's defense mode** lights up immediately; A and B populate once an **offense-scout** opponent exists (empty-state with a foot note until then — see each section).

---

## Step 0 — Zero-SQL hydration (prerequisite, cleared)

Hydrate these onto each row in `Cloud.scoutSnapToRow` from `s.raw` / existing columns using the Assist aliases already used elsewhere. **No migration** — the review-gated RPC already returns full rows including `raw`.

- `direction` (aliases: `play_dir`, `dir`, `play direction`)
- `gap` (aliases: `gap`, `hole`)
- `qtr` (aliases: `qtr`, `quarter`)
- `series` (aliases: `series`, `drive`, `drive #`, `drive no`, `series #`) — for D later; hydrate now
- `snap_index` (already present)
- `motion_type`, `off_personnel`/`personnel` — already on corpus; confirm they survive to the row

Normalize `direction` to `L / M / R` (map left/mid/middle/right, case-insensitive; unknown → null, excluded from A). If a field isn't present in `raw`, leave null and the section degrades gracefully (never invent).

---

## A — Run Direction Analysis  (offense-scout flavor)

**Corpus:** offense-scout rows (`side='off'`), run snaps with a non-null `direction`. Defense-scout opponents → render the section header with an empty state: "No offensive snaps for this opponent."

**Reuse:** `OFFGRD_TENDENCIES.runByDirection(offRows)` for the L/M/R body. Report **renders**; it does not fork the success math.

**Per lane (Left / Middle / Right):**
- Volume: `n` + share of directed runs — `38% (12/32)`
- Success rate when `success` known (reuse the existing success rule / tendency helper) — `58%`
- Avg yards when `gain` present
- Optional sub-line: top `gap` label when gap hydrates and lane n ≥ 3

**UI:** one section under the cheat cards — three lanes as simple bars or an arrow row. Print-safe, no overlays.

**Confidence:** v1 sample chips (HIGH ≥15, MED 8–14, LOW 5–7, THIN <5). Thin lanes grey + "lean, not law."

**IP:** "They run left 38% (12/32) · 58% success" — never "call outside zone."

---

## B — Motion Tendency  (offense-scout flavor)

**Inputs:** `motion_type`. Motion present = `motion_type` non-empty and not `none` (same bit as `scoutSnapToRow`). Offense rows. Skip the whole section if motion n = 0.

**Metrics:**
1. **Motion rate** — motion snaps / all snaps — `42% (21/50)`
2. **Pass after motion** — pass share among motion snaps vs **baseline** pass share on no-motion snaps. Delta callout only when `|Δ| ≥ 12pp` **and** both sides n ≥ 5 — `Pass rate +18pp after motion (62% vs 44% baseline)`
3. **Top motion types** — `fieldDist(rows, 'motion_type')` top 3, each with `(n)`

**Reuse:** `fieldDist`, `runShare` from tendencies. No new RPC. Print: compact table.

**IP:** observational only — report the tendency, never a call.

---

## C — Personnel Grouping Tendencies

**Inputs:** `off_personnel` / row `personnel` (11/12/21…).

**Defense-scout mode (their D vs our looks) — the immediately useful one:** group **def** rows by the personnel they faced (our OFF PERS on the snap) → coverage distribution + pressure rate. Same rendering shape as the v1 read sheet, but the axis is **personnel** instead of `formation_family`.

**Offense-scout mode (their O):** group by their personnel → run/pass share + top concepts.

**Thresholds:** hide groups with n < 3. Spike callout only for **Cover 0 ≥ 20% & n ≥ 3** (same honesty bar as the v1 read sheet).

**Reuse:** `fieldDist`, `pressureRate`, `runShare`. Mirror the read-sheet rendering patterns already in `OFFGRD-scout-report.js`.

**Note (post gated-draft):** pressure/coverage come from the **review-gated** corpus — only coach-confirmed rows. AMBER snaps with null coverage simply don't count until tagged. Correct as-is; no special handling.

---

## Shared rules (carry from v1)

- Sample-based confidence only; every % shows `(n)`; no naked percentages.
- Section provenance badge = the mix (imported / AI-tagged / coach-verified counts).
- Print stylesheet: stacked, no overlays; per-section Print/CSV.
- Opponent-scoped via the existing GAME/OPPONENT selector + `scopedOppRows`.
- No caller/`ours` rows. No LLM narrative (that's Tier 3).
- All aggregates from the review-gated corpus only (RPC enforces; no client bypass).

---

## Acceptance

1. **Hydration:** `direction`, `gap`, `qtr`, `series`, `motion_type`, `personnel` land on the row from `raw` without a migration; a spot-checked snap's `direction`/`personnel` match its Hudl Assist values.
2. **A:** with an offense-scout corpus, L/M/R lanes render with volume/success/avg-yards, every % shows `(n)`, thin lanes grey out, and the numbers match `OFFGRD_TENDENCIES.runByDirection` exactly (two-readers). Defense-scout opponent → clean empty state.
3. **B:** motion rate + pass-after-motion delta (only when the ≥12pp / n≥5 guard clears) + top-3 motion types with `(n)`; section hidden when motion n = 0.
4. **C:** defense-scout personnel × coverage/pressure grid renders and matches the read-sheet math on a shared group; groups n<3 hidden; Cover-0 spike callout only at ≥20% & n≥3.
5. **Print:** each section produces a clean stacked sheet, no overlays over input regions.
6. **No new aggregation paths** where `OFFGRD_TENDENCIES` already computes the number; caller/`ours` data never appears.
7. Pin-bump + single-version guard green; ships in the normal bundle.

---

## Sequencing
Step 0 hydration → **C (defense mode)** first (it's useful on current McClure-style data) → **A** → **B**. Screenshot per section; I'll verify the numbers against `OFFGRD_TENDENCIES` / the read-sheet math in-browser as usual.

## Out of scope
- **D (Drive funnel)** — stays on hold until a McClure-quality import (qtr + yardline) validates segmentation; Series-first + sanity-gate + DERIVED badge per the amended proposal.
- Any new SQL/RPC/view. If you find yourself wanting one, stop and flag it.
- Hit chart / zone grid / LLM briefing.
