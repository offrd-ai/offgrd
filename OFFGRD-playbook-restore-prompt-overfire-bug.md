# Bug: "Restore unsaved play?" fires on EVERY Playbook open (Step 1 Part D over-fire)

**Symptom:** every time a coach opens the Playbook, the **"Restore unsaved play?"** modal appears — even with no meaningful unsaved work. Clicking Discard dismisses it, but it returns on the next open. Confirmed live.

**Root cause (diagnosed):** the restore prompt is **not gated on the draft having real content.** `offgrd_pb_draft` reads empty/absent between sessions, yet the prompt still shows — so the Playbook is autosaving the **blank initial canvas** as a draft on load (or the restore-check treats an empty / already-saved draft as "unsaved") and prompting. Discard clears it, but the next load re-writes the blank draft → nag loop every open.

## Fix (three guards)
1. **Don't autosave a blank/initial canvas.** Only write `offgrd_pb_draft` when the canvas has **meaningful content** — `players.length > 0` (or any drawn route / annotation) — *and* it's dirty vs the last-saved play. A freshly-opened, untouched Playbook writes no draft.
2. **Only prompt when the draft is non-empty AND unsaved.** Show "Restore unsaved play?" only if the draft has content and **differs from the current/last-saved play**. Empty draft, or a draft already saved → **no prompt.**
3. **Clear `offgrd_pb_draft` on Save, on Discard, and on successful Restore.** So it never lingers to re-nag.

## Acceptance (Claude verifies live)
- **Open Playbook fresh, draw nothing → NO restore prompt.** (the reported bug)
- Draw a play, navigate away **without saving**, reopen → prompt appears **once**, restores the play intact.
- **Save** a play, reopen → no prompt.
- **Discard** once → stays discarded on the next open (no blank draft re-created).

## Ship
OFFGRD bundle → bump `?v=` + mirror both copies. Small change, isolated to the Part D draft/restore logic — no engine/schema impact.

*Note: this is a Part D refinement, not a Step 2 issue — Step 2 (engine unification) parity is verified separately. Fold this in before the next parity flip so coaches stop getting nagged.*
