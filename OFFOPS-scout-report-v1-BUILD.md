# Scout Report v1 — Cheat Cards · Read Sheet · Provenance Badges · Readiness (BUILD)

**What this is.** A presentation layer over the verified `scout_snaps` corpus: four artifacts stolen-and-improved from XandOScout's report UI, rendered from data OFFGRD already has. XandOScout is a beautiful renderer of thin data (their own UI admits "No data available, likely a 4-2-5"; 61/67 carries "Unclassified"; cheat cards at CONF 28). We are the opposite — verified per-snap data, plain renderer. This ticket closes the presentation gap without adding a single new data source.

**Non-negotiable framing:** the report is a **view over the living corpus** — the same `scout_snaps` that feed Predict/Tendencies/Caller — never a separate "generated report" artifact with its own data path. One reader (`offgrd_scout_snaps_for_team` / `SNAP_CORPUS`), many renderings. No second aggregator: reuse `OFFGRD_TENDENCIES` math wherever a number already exists there (two-readers rule).

**Where it lives:** new "Report" content under the existing Scout → **Report** tab (it currently exists — extend it), reading the same `SNAP_CORPUS` the Predict cutover established. All sections opponent-scoped by the existing GAME/OPPONENT selector.

**IP guardrail (standing):** decision-aid language only. "They bring Cover 0 vs 2x1 24% of the time" — never "call X vs this look." No four-stage QB grading, no 3×3 zone grid, nothing overlaying input regions (these are print/stacked views, so structurally fine — keep it that way).

---

## 1. Situational Tendency Cheat Cards

Sideline quick-read cards, one per situation bucket, printable.

- **Buckets (fixed grid):** 1st & 10 · 2nd & short (1-3) · 2nd & medium (4-6) · 2nd & long (7+) · 3rd & short (1-3) · 3rd & medium (4-6) · 3rd & long (7+) · 4th & short · Red zone · Backed up (own ≤10). Buckets derive from `down`/`distance`/`field_zone` — the same bucketing Predict's quick-situations use (**reuse that function**, do not re-implement).
- **Card content (defense-scout flavor — our corpus is the opponent's D):**
  - Headline: most likely **coverage** with % ("COVER 3 62%") + second-most.
  - Sub-line: most likely **front** family + %.
  - Pressure line when data exists: "Pressure on N of M snaps (X%)" from the coach-set `pressure` field.
  - Snap count + **confidence chip** (see §5 badge/conf rules — n-based, not fake).
- **When the opponent corpus is offense (`side='off'`):** same cards flavored run/pass — "70% PASS · top concepts [IZ] [LEAD]" from `play_type`/`play`, mirroring what Predict's offense mode computes.
- **Export:** per-section Print + CSV buttons (window.print with a print stylesheet is fine for v1; CSV = the rows behind the card). PDF can wait.
- Low-sample cards (< 5 snaps) render greyed with "thin sample — treat as lean, not law" — honesty over bravado; this is exactly where XandOScout prints CONF 28 and hopes nobody notices.

## 2. Pre-Snap Read Sheet

"When you show this formation, here's what to expect." One row per **our formation family** (the `formation_family` axis the contract built):

- Row: family (2x2, 2x1, 3x1, heavy, empty) → their coverage distribution as bars ("Cover 3 47% · Cover 0 24% · Cover 4 12%"), front lean, pressure rate.
- Data: `GROUP BY formation_family, coverage` over review-passed snaps — this is `def_tendency_by_family` semantics; compute client-side from `SNAP_CORPUS` with the same gate (already-review-passed rows only, which is what the RPC returns).
- Callout line per row when a signal clears a threshold: "⚡ Cover 0 spike vs 2x1 — have a hot answer" (threshold: ≥20% and ≥3 snaps; wording stays observational).
- This is the sheet a coordinator tapes to the call sheet — the single most game-useful artifact in the set, and structurally impossible for XandOScout (they have no defensive reads at all).

## 3. Provenance badges — "how do I know this?"

Three-tier badge, shown on every section header and available per-stat on hover/tap:

| Badge | Condition (from existing columns) |
|---|---|
| **IMPORTED · Hudl** | rows with `import_batch_id`, no CV provenance (`prompt_version` null) |
| **AI-TAGGED** | CV provenance present (`prompt_version`/`confidence` set), reviewed |
| **COACH-VERIFIED** | `reviewed_by` set (resolve path) — the gold tier |

- Section badge = the *mix*: "48 snaps · 44 coach-verified · 4 imported" (counts, not vague labels).
- Never show unreviewed CV data here at all — the read RPC already gates it; the badge system's job is to *advertise* that gate. This is the trust weapon: XandOScout's ceiling ("HUDL VERIFIED" columns) is our floor, and the badge makes that visible without saying their name.

## 4. Scouting Readiness meter

XandOScout's best onboarding idea, mapped to our real pipeline. Card at the top of Scout → Report (and mirrored in the Auto-Scout imports manager):

- **Chain per opponent:** ① Breakdown imported → ② Frames captured (n_f1/n) → ③ Auto-Scout run (job done) → ④ Reviewed (n_review remaining) → ⑤ Report ready.
- Render as a 5-step progress chain with counts, each incomplete step being a **button to do it** (Import / Capture frames / Run Auto-Scout / Review N flagged) — the existing entry points, just surfaced as one guided path. All state already exists: `listImportBatches` (n, n_f1, n_review), `auto_scout_jobs.status`.
- Percentage optional; the step-chain with counts is more honest and more actionable than their single %.

## 5. Confidence & thresholds (shared rules for §1-2)

- Confidence chip is **sample-based**: HIGH ≥15 snaps in bucket, MED 8-14, LOW 5-7, THIN <5 (greyed). Do not surface model confidence here — these are review-passed facts; the only uncertainty is sample size.
- Percentages always ship with (n): "62% (13/21)". No naked percentages anywhere.
- All aggregates computed from the review-gated corpus only (the RPC already enforces; don't add a client bypass).

## 6. Explicitly NOT in this ticket
- Hit chart / run-direction arrows / drive funnel / motion report / personnel tables (Tier 2 — next ticket, needs a couple of import-column additions like PLAY DIR/GAP surfaced into columns).
- LLM Coach's Briefing narrative + insider-intel enrichment (Tier 3 — rides the existing game-summary prompt family; separate ticket so the tone/IP review is focused).
- Any new SQL. **This is a zero-migration ticket** — pure client rendering over `SNAP_CORPUS` + existing Cloud lists. If you find yourself wanting a new RPC/view, stop and flag it first.

## 7. Acceptance
1. With the Parkway South corpus (48 reviewed snaps): cheat cards render for every bucket with data; thin buckets grey out; every % shows (n); print stylesheet produces a clean 1-2 page sideline sheet.
2. Read Sheet shows the family × coverage grid matching `def_tendency_by_family` numbers exactly (spot-check 2x1/Cover 0 vs the SQL view — same numbers or it's a two-readers bug).
3. Badges: Parkway South shows "44 coach-verified · 4 imported" (or current true mix); a fresh import-only opponent shows all-IMPORTED; nothing unreviewed ever renders.
4. Readiness chain: a fresh opponent walks ①→⑤ with working buttons at each step; states update after each action without reload.
5. Offense-scout opponent (`side='off'`) renders run/pass-flavored cards, not empty defense cards.
6. No new aggregation code paths where `OFFGRD_TENDENCIES` already computes the number; caller/`ours` data never appears in the report.
7. Pin-bump + single-version guard green; report deploys as part of the normal bundle.

## 8. Sequencing
§4 readiness first (it guides everything and is pure state-rendering) → §3 badges (small) → §2 read sheet → §1 cards + print. Report back with screenshots per section; Claude will verify numbers against the SQL views in-browser as usual.
