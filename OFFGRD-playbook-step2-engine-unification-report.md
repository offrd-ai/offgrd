# Playbook Step 2 — Engine Unification ("draw = drill") — ship report

**Cache:** `?v=44`  
**Module:** `OFFGRD-render.js` (new)  
**Flag (default OFF):** `?unified=1` · `localStorage.offgrd_unified_render=1` · `OFFGRD_CONFIG.unifiedRender`  
**Mirrored:** root ↔ `offgrd-web/` · pushed `offrd-ai/offgrd`

---

## What shipped (stages 1–3 behind flag)

### Stage 1 — Extract shared renderer (live, always on for Playbook)
- Designer field / routes / defense / animation extracted to `OFFGRD-render.js`.
- `OFFGRD-Playbook.html` thin-wraps `OFFGRD_RENDER.*` — **no intentional behavior change**.
- Proof gate: designer must look identical to `?v=43`.

### Stage 2 — Custom plays through shared renderer (flagged)
- When flag **on**, Reps Lab Train/Test for coach-authored plays calls `prepareDrillState` + `renderState` + `play` on the play’s designer `data`.
- Quiz hit-targets (`data-lab`) stamped at stored route ends — same tap-the-throw UX.
- Snap / replay / reveal use designer animation (motion → hold → routes + man/zone/rush).

### Stage 3 — Built-ins converted (flagged)
- `yardToData()` converts the 6 CONCEPTS (Smash, Mesh, Flood, Four Verts, Stick, Curl-Flat) from yard/`PPY` space (LOS 360) → designer absolute points (LOS 380).
- Reads/`prog` stay on the concept; renderer draws `_data`.

### Fallback
- Missing/partial `data` → legacy `buildScene` path; one `console.warn` per session.
- Flag **off** → exact prior Reps experience (two-engine).

---

## Claude verify (visual parity)

1. **Designer regression:** `OFFGRD-Playbook.html?v=44` — draw/animate looks unchanged vs prior.
2. **Custom draw=drill (canary):** set `localStorage.offgrd_unified_render='1'` (or `?unified=1`), open a coach-drawn play in Reps Train — side-by-side with Playbook: spots/routes/coverage pixel-match.
3. **Built-ins (canary):** each of the 6 concepts vs pre-Step-2 look (flag on).
4. **Flag off:** `?unified=0` / clear localStorage — Reps matches today’s digests.
5. **Fallback:** data-less play still drills (legacy path, no blank).
6. Quiz: tap-throw, snap, Coverage-ID / Routes / OL, scoring unchanged.

---

## Rollback
Clear flag / omit `?unified=1` → two-engine Reps restored instantly. Playbook still uses shared module (Stage 1 extraction); that path is behavior-identical by design.

---

## Not in this ship
- Global flag flip (wait for Claude parity).
- Step 3 auto-derive reads.
- Retiring Reps yard engine permanently (kept as fallback).
