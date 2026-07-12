# Steal A — Scout-Card Generator — build spec (for Cursor)

**Goal:** kill the single biggest weekly time-sink for a HS staff — **hand-drawn scout cards**. Turn a play (a coach's install play, or an opponent play from the scouting import) into a **printable scout card** — diagram + call info — and **batch-export to PDF** for the practice-card stack. This is the highest-ROI item from the Telemetry teardown, and it's **buildable from charting, no tracking data**.

**It stands on what already exists:** the **Step 2 shared renderer** (`OFFGRD-render.js` — draws the play `data` exactly), the **Step 1 thumbnails** (`thumbSvg`), the **Install-plan Print/PDF** path, and the **two-team scouting import**. So this is mostly assembly + a card layout + batch export, not new football engine.

**Ownership:** Cursor builds; Claude verifies live. Bundle work → `?v=` bump + both mirrors. **Terminology-aware** (Rooski fold-in): every card uses the program's own names, pulled from the playbook — never generic.

---

## What a scout card is
A single card = **the play diagram** + a **call strip** of metadata:
- Diagram: the play rendered via `OFFGRD-render.js` from its stored `data` (offense + optional defense/coverage), card-sized. Reuse `thumbSvg` for the small format; full render for the large.
- Call strip (terminology-aware, from the play's own fields): **name/call**, **formation**, **personnel**, and where present **down & distance**, **hash**, **result**, **opponent/period**.

## Parts

### A — Card render
Render a play's `data` into a card-sized SVG via the shared renderer (`OFFGRD-render.js`) + a metadata header/footer. Two sizes: **small** (reuse `thumbSvg`, many-per-page) and **large** (full render, few-per-page). Because it's the shared renderer, the card is the exact drawn play — no drift.

### B — Sources (plays that have a diagram)
1. **Our install plays** — the coach's playbook plays → offense install cards.
2. **Opponent plays** — scouting-import plays (`scouting_games`) **that have a drawn diagram** → opponent scout cards, with the charted D&D / hash / result on the call strip.
   - *Follow-on (NOT this ticket): auto-draw an opponent play's diagram from its charted tags* (formation + play type) when no diagram exists. Note it; don't block on it. This ticket ships cards for plays that already have a `data` diagram.

### C — Batch export
- Select a scope — a set of plays, an install day, or a scouting scope (vs opponent / by D&D) — and **export to PDF**: **N cards per page** (e.g. 4/6/9), a title, a template. Reuse the **Install-plan Print/PDF** pipeline.
- Also: per-card **print** and **PNG**.

### D — Card formats
A small **format picker** (like Telemetry's "Card Formats"): **Offense install card** (call + diagram, big) vs **Opponent scout card** (diagram + D&D/hash/result strip, many-per-page for the scout team). Start with these two.

---

## Guardrails
- **No tracking data** — everything comes from the play `data` + charting/tags. If a card needs data HS doesn't have, it's out of scope.
- **Terminology-aware** — call strip uses the program's own formation/play/personnel names from the playbook.
- Builds on the shared renderer + thumbnails + install/print — **don't** duplicate a second renderer or PDF path.
- Bundle change → `?v=` bump + both mirrors; behind a small flag if you want a staged rollout. Claude verifies live.

## Acceptance (Claude verifies)
- Select a coach play → generate a **scout card**: correct diagram (matches the drawn play via the shared renderer) + call strip with the program's own name/formation/personnel.
- **Batch-export** a set of plays → a **PDF, N-per-page**, cards legible, in the program's terminology.
- An **opponent play with a diagram** (from the scouting import) → an opponent scout card with its **D&D / hash / result** on the strip.
- **Both formats** (offense install / opponent scout) render.
- No tracking-data dependency; nothing generic.

*Report: what renders the card (confirm it's `OFFGRD-render.js`, not a new engine), the export path (confirm it reuses install/print), and the two formats. Follow-on ticket later: auto-draw opponent diagrams from charted tags. After this, Steal B (tendency reports) + the AI-GM weekly package bundle these into one weekly deliverable.*
