# Tracking: finish the shared Live Caller snap engine

Shipped 2026-08-28: D Caller now opens snaps the way O Caller always did.
Both writers call `OFFGRD_CALLER.openSnap` in `OFFGRD-caller-log.js`.
`call` advances the index. `outcome` never does. `undo` and `correction`
are different operations (remove last snap vs edit existing snap).

That is the P0. It is a port plus one shared entry point, not a merge
of the two caller UIs.

## Still two files

`OFFGRD.html` (`callerLog`, `callerLogST`, `callerUndoLast`, `callerSubmitEdit`)
and `OFFGRD-dcaller.js` (`logTheirPlay`, `logST`, `undoLast`, `submitEdit`)
still build their own payloads and still have their own append wrappers.

If those wrappers drift again, Friday's class of bug comes back — one
behavior, two implementations, nothing keeping them honest.

## What "done" looks like

One module both callers import for:

- open snap (`openSnap` — already shipped)
- attach outcome (playIndex of last snap, no advance)
- undo last snap
- correct existing snap

Caller-specific data (named play vs Run/Pass, ST labels, sit fields)
is passed in. The engine does not know "DINO GLANCE" from "Run L".

Do not land this half-done. The next cut is the remaining four verbs
as functions on `OFFGRD_CALLER`, then delete the duplicated wrappers.
The HTML/JS UI stay where they are.

## Lock

`scripts/smoke-caller-snap-advance.cjs` smoke 7 feeds the same sequence
through both sides and asserts identical indexes and snap counts.
That is the analogue of the invite `ROLES`-vs-SQL-rank smoke.
