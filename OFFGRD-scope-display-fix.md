# Scope display fix — tendency report + weekly-package snapshot

**Cache:** `?v=51`  
**Symptom:** top bar "130 · 2 games" vs report "193 PLAYS IN SCOPE"

## Cause
- Totals were legitimate (`193 = def 76 + off 117`; self-scout excluded) but the summary showed a **def+off union** no table uses.
- Weekly-package snapshot used **unscoped** `oppRows` (skipped Games-scope / this-season filters).
- Top bar counted **all library** snaps for the mode, not the active opponent + Games(scope) pool.

## Fix
1. Shared `scopedOppRows(side)` — opponent + `#sel-scope` + This season (same pool as Scout grids).
2. Report + Package both use `scopedOppRows`; subtitle labels scope explicitly (`all charted games (N)` / last N / single game).
3. Summary tile: **"N defensive · M offensive"** instead of a single union count; optional Games-scope chip.
4. Top-bar `datbadge` uses the same scoped pool so it matches the report.

## Acceptance
- Scoped snaps match Games(scope) + opponent; Package snapshot matches Tendencies.
- Header splits def / off; self-scout excluded.
- Per-cell `n=` still reconciles; Cover % recomputes under scoped rows.
- No edge-function redeploy (snapshot is client-side).

*Reporting-only. Data always reconciled — this was scope/display consistency.*
