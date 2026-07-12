# Playbook Step 3 — Auto-Derive Reads & OL Keys — ship report

**Cache:** `?v=46`  
**Module:** `OFFGRD-autoderive.js` (new)  
**Flag (default OFF):** `?autoderive=1` · `localStorage.offgrd_autoderive_reads=1` · `OFFGRD_CONFIG.autoderiveReads`  
**Mirrored:** root ↔ `offgrd-web/` · pushed `offrd-ai/offgrd`

---

## What shipped

### Part A — Route classification
- Classify each skill player from `rname` preset when present; else from route point geometry.
- Detect concept (Smash / Mesh / Flood / Four Verts / Stick / Curl-Flat) from play `concept`/`family`/`name` or route combo.

### Part B — QB reads
- Per coverage (Cover 0/1/2/3/4 / Tampa 2): `{ t, why, prog?, auto:true }` matching live Author/Reps schema.
- Known concepts use ground-truth maps seeded from the 6 built-ins’ hand-authored reads.
- Arbitrary plays use coverage soft-spot rules + program terminology in `why`.

### Part C — OL keys
- From protection (BOB / Slide / Half-Slide / 6-man) + drawn front: `{ v, front, note, n, keys:{lab:{pre,post}}, auto }`.
- Rules reuse existing Author vocabulary (`bob`, `climb`, `fan`, `reach`, `scan`, `checkrel`, …).

### Author flow (flag on)
- Open Reads or OL in Author → empty slots pre-filled; banner **“Auto — tap to edit.”**
- Soft-persist via `savePlayReads` / `saveOlKeys` when filling empties.
- Coach edit clears `auto`; save persists override.
- **Never overwrites** existing `t` / blocker keys.

### Reps
- `loadCustom()` session-fills plays with **no** `qb_reads` so they appear in Our plays immediately (flag on).

### Validation harness
- Console: `__OFFGRD_VALIDATE_BUILTINS()` or `OFFGRD_AUTODERIVE.validateBuiltins(CONCEPTS)`
- Expect `ok: true` — derived targets match hand-authored `reads` for all 6 built-ins (`why` wording may differ only on soft-spot path; built-ins use truth `why`).

---

## Claude verify (live)

1. **Flag off:** open Author on a play with empty reads → blank selects (today’s manual authoring).
2. **Flag on:** `?autoderive=1` (or `localStorage.offgrd_autoderive_reads='1'`).
3. Draw / open a play (e.g. **Cali**) with routes → Author → Reads: all 6 coverages pre-filled; OL keys pre-filled when defense/protection present.
4. Reps → Our plays → play is drillable (Reads + OL) without hand-authoring first.
5. Edit one coverage target/why → Save → reload → coach edit sticks; other autos remain until edited.
6. Play that already had authored `qb_reads` → untouched (no overwrite).
7. Console: `__OFFGRD_VALIDATE_BUILTINS()` → `ok: true`.
8. Labels/`why` use play name / receiver labs from the playbook.

---

## Rollback
Clear flag / omit `?autoderive=1` → exact prior Author + Reps gate (must author reads first).

---

## Not in this ship
- Global flag flip (wait for Claude canary).
- Optional AI polish of `why` (Coach O / AI-GM edge function) — rule engine only for now.
- Schema changes (fills existing `qb_reads` / `ol_keys` only).
