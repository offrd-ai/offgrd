# Playbook Step 1 — Quick-Win Polish — ship report

**Cache bust:** `?v=42` (Playbook, QB, account, role-gate, mobile, cache-gate, qb-cloud imports)  
**Mirrored:** `D:\mattb\Claude Cowork OFFGRD\` ↔ `offgrd-web\`  
**Cloud schema:** no `plays` table migration. Additive fields live in play `data` JSON (`id`, `tags`, `group`, `updatedAt`, `thumbSvg`). No Storage bucket.

Deploy: push `offgrd-web` (or root bundle) to `offrd-ai/offgrd` so live `/gameday/` picks up `?v=42`.

---

## Part A — Stable play IDs + rename-in-place
**`?v=42` · `OFFGRD-Playbook.html` + `OFFGRD-account.js`**

- Every play gets a stable `id` (uuid) at creation; `savePlay` upserts by `id` (preserves `cid`).
- Rename updates `name` on the same row / same cloud `cid` — no local duplicate.
- `migrateLib` on load: assign missing ids; collapse same-`cid` dups; collapse cid-less `name|formation` dups.
- Cloud pull merge matches by `id` / `cid` / `key` (`OFFGRD-account.js`).

**Verify:** Open a saved play → rename → Save → one library row; cloud `plays` same id; reload keeps name.

---

## Part B — Search / filter / tags
**`?v=42` · `OFFGRD-Playbook.html`**

- Search box (name, tags, formation, family, series, personnel, group).
- Filters: formation / family / series / personnel / tag; sort name | recently updated.
- Free tags + optional group/folder on the play (`data.tags`, `data.group`).

**Verify:** 12+ plays → search narrows; filter by formation/family; add tag → filter by tag.

---

## Part C — Lean SVG thumbnails
**`?v=42` · `OFFGRD-Playbook.html`**

- On save: `leanThumb()` → compact SVG string in `data.thumbSvg` (no base64 PNG in localStorage).
- Library rows + install plan show thumbnail.

**Verify:** Library shows diagram thumbs; spot-check `localStorage.offgrd_playbook_v1` length stays reasonable (SVG ~1–3KB/play, not PNG blobs).

---

## Part D — Autosave + undo persistence
**`?v=42` · `OFFGRD-Playbook.html`**

- Draft key `offgrd_pb_draft` (debounced); on load: **Restore unsaved play?**
- Undo cap **120**; session undo stack in `sessionStorage` (`offgrd_pb_undo`).

**Verify:** Draw unsaved → reload → restore → routes/meta intact.

---

## Part E — Player empty-states (no `alert()` dead-ends)
**`?v=42` · `OFFGRD-QB.html`**

- No position → inline position picker (writes `offgrd_pos`) then continues week test.
- Empty week/authored queues → guided `#guideBox` (not alerts).
- Cloud off / signed out → guidance copy in Author + Results.

**Verify:** Fresh player, no `offgrd_pos` → pick position → runnable path when content exists; no raw `alert()` on empty queues.

---

## Guardrails checked
- No route/coverage engine or animation changes.
- Offline-first + cache-gate preserved (version bump only).
- No Storage / `plays` DDL.
