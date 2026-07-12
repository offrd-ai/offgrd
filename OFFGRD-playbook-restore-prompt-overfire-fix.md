# Playbook — Restore-prompt over-fire fix — ship report

**Cache:** `?v=47` (`OFFGRD-Playbook.html` + related script tags)  
**Root cause (v=42):** `newPlay()` called `scheduleDraft(true)` on every open, writing the blank formation canvas to `offgrd_pb_draft`, then `offerRestoreDraft()` prompted immediately — Discard cleared it, next open re-wrote it (nag loop).  
**Prior fix:** `?v=45` removed blank autosave + added meaningful/dirty gates.  
**This ship:** hardens those gates and matches the ticket’s three clears.

---

## Guards (live)

1. **No blank autosave** — `scheduleDraft` only writes when `draftIsMeaningful` (routes / annotations / defense / meta / protection / etc.). Stock formation players alone do **not** count. `newPlay` / `loadPlayId` do not write drafts.
2. **Prompt only if non-empty + unsaved + dirty** — `offerRestoreDraft` requires meaningful content and `draftDiffersFromSaved`; otherwise `clearDraft` and no modal.
3. **Clear on Save / Discard / Restore** — `clearDraft` also cancels any pending debounce timer. Restore no longer immediately re-stashes (further edits re-stash via `snap`).

Fingerprint compare ignores ephemeral `id` / `updatedAt` / `thumbSvg` so an already-saved play doesn’t look “dirty” from metadata alone.

---

## Claude verify

1. Open `OFFGRD-Playbook.html?v=47`, draw nothing → **no** restore prompt.  
2. Draw routes, leave without Save, reopen → prompt **once**; Restore intact.  
3. Save, reopen → no prompt.  
4. Discard once → stays gone on next open.  
5. Console: `localStorage.getItem('offgrd_pb_draft')` after a fresh open with no work → `null`.

---

## Rollback

Prior behavior was the nag; no feature flag. Revert Playbook Part D block / pin `?v=46` if needed.
