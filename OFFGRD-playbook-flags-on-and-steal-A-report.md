# Flag flip + Steal A — Scout-Card Generator — ship report

**Cache:** `?v=48`  
**Commit:** (see push) on `offrd-ai/offgrd`  
**Mirrored:** root ↔ `offgrd-web/`

---

## 1) Verified flags → ON in prod (config-only)

`OFFGRD-config.js`:
- `unifiedRender: true` — Step 2 shared renderer / draw=drill
- `autoderiveReads: true` — Step 3 auto-reads
- `scoutCards: true` — Steal A

**Rollback (instant, no redeploy):**
- `?unified=0` / `localStorage.offgrd_unified_render='0'`
- `?autoderive=0` / `localStorage.offgrd_autoderive_reads='0'`
- `?scoutcards=0` / `localStorage.offgrd_scoutcards='0'`  
URL `=1` / localStorage `=1` still force ON. Helpers in `OFFGRD-render.js` + `OFFGRD-autoderive.js` honor `=0` overrides when defaults are on.

**Claude post-flip:** fresh Playbook/Reps (no params) → Cali draw=drill via shared renderer; new play auto-derives reads; restore-prompt stays quiet on blank open; `?unified=0` / `?autoderive=0` restores prior gated behavior.

---

## 2) Steal A — Scout cards

**Module:** `OFFGRD-scoutcards.js` (assembly only)

| Part | Implementation |
|------|----------------|
| **A Card render** | Diagram via `OFFGRD_RENDER.renderMarkup` / `renderState` (shared renderer). Small size reuses `thumbSvg`. |
| **B Sources** | Install = playbook `LIB` with diagrams. Opponent = `scouting_games` rows that already have `data`/`diagram`/`thumbSvg`. If none, falls back to playbook diagrams enriched with matching scout D&D/hash/result by formation. Auto-draw from tags = **follow-on, not shipped**. |
| **C Batch export** | Same path as Install plan: build sheet DOM → `window.print()` (Save as PDF). Per-card PNG via canvas (same pattern as Playbook `exportPNG`). N-per-page: 4 / 6 / 9. |
| **D Formats** | **Offense install** (large, call + formation/personnel/protection) · **Opponent scout** (small, + D&D / hash / result / opponent). |

**Entry UI:** Playbook → **Scout cards**; OFFGRD home → **Scout cards** (defaults to opponent format).

**Guardrails:** no tracking data; terminology from play fields; no second renderer/PDF stack.

### Claude verify
1. Playbook → Scout cards → pick install plays → diagram matches drawn play; strip shows program name/formation/personnel.
2. Print / PDF → N-up sheet, legible.
3. Opponent format → strip shows D&D/hash/result when present (diagrammed scout row or formation-matched enrich).
4. Both formats render; `?scoutcards=0` hides the feature.

### Follow-on
Auto-draw opponent diagrams from charted tags (formation + play type) when no `data` diagram exists.
