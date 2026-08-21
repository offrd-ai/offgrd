# Steal B — Auto Tendency Reports — ship report

**Cache:** `?v=49`  
**Module:** `OFFGRD-tendencies.js`  
**Flag (default ON):** `OFFGRD_CONFIG.tendencyReports` · rollback `?tendency=0` / `localStorage.offgrd_tendency_reports=0`  
**Mirrored:** root ↔ `offgrd-web/` · pushed `offrd-ai/offgrd`

---

## What renders / reuses

| Concern | Reuse |
|---------|--------|
| Aggregation | Same D&D buckets as Scout predictor (`1-3` / `4-6` / `7-9` / `10+`), unweighted shares that reconcile to filtered `scouting_games` row counts |
| Scope | `sit.opp` + season-library `SCOPE` / `scopeAllows` + this-season toggle |
| Print | Report **Print / PDF** → `window.print()` (same path as Install / Scout cards) |
| Engine | **No new charting engine** — reporting layer only |

**AI GM / week plan feed:** generating a report publishes `window.OFFGRD_LAST_TENDENCIES` + `localStorage.offgrd_last_tendencies` (opponent, summary tile, snap counts, timestamp).

---

## Tables shipped

### Defensive (opponent D)
- **Coverage by D&D** — heat-mapped top-call % + n
- **Coverage by D&D — MOF / Boundary** — hash M vs L/R (**stand-in for MFC/MFO** until those are charted)
- **Front by D&D**
- **Blitz/pressure rate by D&D**
- **Blitz % by personnel grouping × distance** (Base / Nickel / Dime / 7-DBs + raw labels)
- Coverage distribution (scope total)

### Offensive (opponent O)
- Run/pass by **formation** (incl. boundary vs MOF run %)
- Run/pass by **D&D**
- By **personnel** and **field zone**
- **Run success by direction** — only when `direction` + `gain` exist; otherwise noted deferred

### Summary tile
Plays, run/pass %, explosive %, success %, top coverage / front / personnel, avg yds

---

## Deferred (un-charted fields)
- Native **MFC/MFO** chart columns (hash MOF/Boundary used for now)
- Run success by direction when direction/gain not charted

---

## UI
- **Tendencies** button (top tools) → Report view  
- **Report** tab — one click with opponent selected (e.g. Parkway North)

---

## Claude verify (Parkway North)
1. Select Parkway North → **Tendencies** / Report → Coverage-by-D&D, Front-by-D&D, Blitz-% heat tables.
2. Spot-check a cell % against raw `scouting_games` snaps for that D&D.
3. Change scope (All / Last N / Game) → tables narrow.
4. Offense run/pass-by-formation appears when offense rows exist.
5. Print / PDF works.
6. Summary tile populated; `OFFGRD_LAST_TENDENCIES` set in console.
7. `?tendency=0` → classic lightweight Report (pre–Steal B).
