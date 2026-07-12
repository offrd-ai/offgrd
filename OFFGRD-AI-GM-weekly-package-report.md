# AI-GM Weekly Package — ship report (Claude live verify)

**Cache:** `?v=50`  
**Flag:** `OFFGRD_CONFIG.weeklyPackage: true` (rollback: `?weeklypackage=0` or `localStorage.offgrd_weekly_package=0`)  
**Principle:** assembly + orchestration only — no new chart/render/read engines.

---

## What shipped

One-click **weekly package** per opponent/week bundles verified parts:

| # | Section | Source |
|---|---------|--------|
| 1 | Opponent snapshot | `OFFGRD-tendencies.js` → `OFFGRD_LAST_TENDENCIES` heat tables |
| 2 | Game plan draft | `weekly-package` edge fn (Claude, server key) — situational calls using **playbook names only** |
| 3 | Scout cards | `OFFGRD-scoutcards.js` buttons (install + opponent print) |
| 4 | Install / teaching | Week-plan plays + Step 3 `qb_reads` / `ol_keys` status |
| 5 | Weekly briefing | Existing `generate-week` narrative (called inside package flow) |

---

## Files

### OFFGRD bundle (`Claude Cowork OFFGRD` + `offgrd-web` mirror)

- **`OFFGRD-weeklypackage.js`** — package view, approval UX, GM handoff consume, offline banner
- **`OFFGRD-config.js`** — `weeklyPackage: true`
- **`OFFGRD-cloud.js`** — `Cloud.assembleWeeklyPackage()`
- **`OFFGRD-account.js`** — `OFFGRD_WEEKLY_PACKAGE_GEN()`
- **`OFFGRD.html`** — Package tab, Game Plan bar button, player-share gate until approved

### Authority project edge functions (`OFFRD FILES 25/supabase/functions`)

- **`weekly-package/index.ts`** — auth like `generate-week`; runs briefing + game-plan draft; saves into `week_plans.gen`
- **`ai-gm-orchestrator`** — new mode `assemble_weekly_package` (delegates to `weekly-package`)

---

## Coach flow (Parkway North acceptance)

1. **Game Plan → This week** — opponent = Parkway North, plays committed to buckets.
2. **Generate weekly package** (blue bar) or **Package** tab after first run.
3. **Verify snapshot** — tendency tables match Report tab (Cover 4 on 3rd & long, etc.).
4. **Verify game-plan draft** — calls use **your play names** (not generic); whys cite real tendencies.
5. **Approve for sharing** — unlocks player share checkboxes; nothing auto-publishes.
6. **Export** — Print / PDF on package view; scout cards via Steal A modal.
7. **Share to players** — week plan → Reps (plays + briefing when checked).
8. **Flag off** — `?weeklypackage=0` → separate tools unchanged.

---

## Guardrails (UI copy)

- Banner: *"AI draft — you approve before sharing with players. Your edits win."*
- Player share blocked until `gen.package_status === 'approved'`.
- Offline: tendencies + scout cards + install render locally; AI draft/briefing need connection.

---

## Deploy notes

1. Bump static bundle (`?v=50`) to `offrd-ai/offgrd` + root mirror (already in repo paths above).
2. Deploy edge functions:
   ```bash
   supabase functions deploy weekly-package
   supabase functions deploy ai-gm-orchestrator
   ```
3. Requires existing secrets: `ANTHROPIC_API_KEY` (same as `generate-week`), Supabase URL/keys.

---

## Portal handoff

- GM `/coach/gm` → `stageWeekPlanDraft()` still works.
- OFFGRD consumes `sessionStorage.offrd_gm_week_plan_draft` on load → opens **Package** tab.

---

## Known limits (unchanged from Steal A/B / Step 3)

- MFC/MFO stand-in via hash MOF/Boundary.
- Game-plan draft requires plays on week plan (same as briefing).
- Institutional memory: client may pass `past_opponents`; full history RPC deferred.

---

*Roadmap finale: one deliverable assembled from verified engines, coach in command.*
