# Steal B — Auto Tendency Reports — build spec (for Cursor)

**Goal:** one click → the opponent's **tendency reports** (heat-mapped tables) generated from the charted scouting data, per opponent/week. Replaces the coach's manual spreadsheet ("cumbersome reporting" from Telemetry's own slide) and feeds the AI GM + week plan. **Buildable from charting, no tracking data.**

**It stands on what already exists:** the **two-team scouting import** (`scouting_games` rows) and the **Scout coverage-predictor**, which already aggregates the opponent's coverage/front/pressure distribution. Steal B is the **reporting layer** on top of the same rows — mostly aggregation + a heat-mapped table UI, not new charting.

**Ownership:** Cursor builds; Claude verifies live (Parkway North already has charted scout data). Bundle → `?v=` bump + both mirrors. **Terminology-aware** (Rooski fold-in): tables use the program's/opponent's own formation + personnel names.

---

## What it produces (heat-mapped tables + a summary tile)

### Defensive tendencies (opponent's D — for our offense) — build first, the predictor already computes the base
- **Coverage by Down/Distance** — % Cover 0/1/2/3/4/6/2-Man/Tampa by D&D buckets (1st-10, 2nd-short/med/long, 3rd-short/med/long, etc.), with MFC/MFO split.
- **Front by Down/Distance** — % of each front (4-3/3-4/4-2-5/Nickel/Bear/…) by D&D.
- **Pressure / Blitz %** — blitz rate by **personnel grouping** (Base/Nickel/Dime/7-DBs) × D&D (Telemetry's Blitz-% table).

### Offensive tendencies (opponent's O — for our defense) — from the charted offense rows
- **Run/Pass split by Formation** and by **Down/Distance** (field-run/pass, boundary-run/pass %).
- **Tendencies by personnel / field-zone / hash.**
- **Run Success by Direction / Formation** (success rate, yds/rush, TFL) — **only if direction + result are charted**; if not in the row schema yet, mark as a follow-on (needs a charting field), don't block the rest.

### Summary tile (like Telemetry's Stats)
Plays, run/pass %, explosive %, success %, top coverage, top front, top personnel, avg yds — a one-glance header.

---

## How
- **Source:** `scouting_games` rows (down, distance, formation, personnel, coverage, front, hash, result, side/perspective). Pure aggregation — reuse the coverage-predictor's grouping logic; extend it to the full table set.
- **Heat-map:** color each cell by rate (frequency and/or success), so hot tendencies pop — one shared cell-color scale.
- **Scope-aware:** per opponent, per week, and filterable by D&D / formation / personnel — reuse the **season-library scope** already in Scout.
- **Feeds:** the **AI GM** (tendencies inform the game-plan draft) and the **week plan**; and **exportable** (PDF/print — reuse the install / scout-card print path).

---

## Guardrails
- **No tracking data** — every table comes from charted rows. A table that needs an un-charted field (e.g. run direction) → **follow-on**, not blocked.
- **Terminology-aware** — formation/personnel labels use the program's own names.
- **Reuse, don't duplicate** — build on the coverage-predictor aggregation + the season-library scope + the existing print path; no second reporting engine.
- Bundle → `?v=` + both mirrors; behind a small flag if you want a staged rollout. Claude verifies live.

## Acceptance (Claude verifies — Parkway North scout data)
- Open an opponent with charted scout data (e.g. **Parkway North**) → one click generates the **Coverage-by-D&D**, **Front-by-D&D**, and **Blitz-%** tables, heat-mapped, in the program's terminology.
- The **numbers reconcile** to the raw `scouting_games` rows (I'll spot-check a cell's count/% against the underlying plays).
- **Per-week / per-opponent scope** works; filters narrow the tables.
- **Offensive** run/pass-by-formation table renders where those fields are charted.
- **Export** to PDF/print works.
- Summary tile shows plays / run-pass % / top coverage-front-personnel.

*Report: which tables shipped vs deferred (any needing an un-charted field), that it reuses the predictor + scope + print path (not a new engine), and how it feeds the AI GM / week plan. After this, the AI-GM weekly package bundles Steal A (scout cards) + Steal B (tendencies) + auto-reads into one "your analyst's weekly prep" deliverable in the program's terminology.*
