# Scout Report — quick fix-list (post-Tier-2 verify)

Two small fixes found while verifying Tier 2 in-browser. Neither affects report *data* — the numbers are trustworthy. Both are surface bugs.

---

## Fix 1 — `listAutoScoutJobs` throws 400 (console error flood)

**Symptom:** DevTools console spams `Failed to load resource: 400 (Bad Request)` on every report load — one per poll. Observed on both McClure North and Parkway North (follows the selected opponent).

**Failing request:**
```
GET .../rest/v1/auto_scout_jobs?select=id…896-0706f6631c9e&order=created_at.desc&limit=200&opponent=eq.<Opponent Name>
→ 400 Bad Request
```

**Three problems in that URL:**
1. **`opponent=eq.<Opponent Name>`** — `auto_scout_jobs` has no `opponent` column. Jobs key off batch/team. Filtering a non-existent column → 400.
2. **`order=created_at.desc`** — likely no `created_at` column either (same family as the earlier `auto_scout_jobs.updated_at does not exist` bug).
3. **`select=id…a896-0706f6631c9e`** — the team_id UUID is bleeding into the `select=` clause — malformed query-string construction.

**Fix:**
- Select only columns that exist on `auto_scout_jobs`.
- Remove the `opponent=` filter; scope jobs by `team_id` / `batch` and resolve the opponent via the batch, not a non-existent column.
- Fix or drop the `order=created_at.desc` (use a column that exists).
- Fix the select-clause construction that injects the team_id.
- **Audit every `auto_scout_jobs` query in `OFFGRD-cloud.js` in one pass** — this is the third symptom of the same construction bug (after `updated_at`), so there are likely siblings.

**Accept:** report loads with zero 400s in console; jobs list still populates for the selected opponent.

---

## Fix 2 — Personnel grouping (C) coverage mix doesn't sum to n

**Symptom:** McClure 11-personnel shows `cover 4 55% · cover 3 20% · cover 0 10% · 2-man 10%` = **95% (19/20)** — one snap missing. It's truncating to the top coverages and silently dropping the smallest slice (a 1-snap cover 1). Violates the "every % ships with (n)" honesty rule.

**Fix:** in section C's coverage-mix render, either show **all** coverage slices, or append a **"+N other (X%)"** remainder so the displayed mix always accounts for the full group n. (21-personnel already sums to 100% because it happened to have ≤ the display cap — so this only bites groups with more coverage variety.)

**Accept:** every personnel group's coverage mix sums to its snap count; no silently dropped snaps.

---

## While you're in the read sheet (low-confidence, quick eyeball)

Verify the McClure **3x1** row renders `cover 3` as **9.1%** (1/11), not `0.9%`. 63.6 + 27.3 + 9.1 = 100, so it must be a 1-snap 9.1% slice — if it literally prints `0.9%`, that's a decimal-format bug. (Parkway North's read sheet summed correctly, so this may be McClure-specific or a misread — just confirm.)

---

**Scope:** surface fixes only. No change to the gated corpus, the tendency math, or any RPC. No new SQL.
