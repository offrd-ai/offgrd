# TICKET — D Caller: team-customized defensive call vocabulary

Matt (Sep 2): "You know how we loaded the various plays for the offense…
we need to do the same thing for defenses so it can customize their calls
so they get tagged properly. A team may be a base 3-4 defense, but they call
it different names based on fronts and coverages to fit their system.
Customization for teams is key."

**Scope: the D CALLER only — Step 3 "YOUR D CALL" (Front · Coverage ·
Blitz/Stunt).** The O Caller's defense-look logging (what the OPPONENT
showed) keeps the generic vocabulary (4-3, Cover 2, Mike A-gap…) because it
describes other teams. Do not touch it.

This unparks "D Caller defense-side plays" from the parked trio.

Implementation: `_offgrd-git` (`OFFGRD-d-vocab.js`, Playbook **Defense calls**,
`OFFGRD-dcaller.js` Step 3). Cloud table `offgrd.offgrd_d_vocab` —
`docs/apply-offgrd-d-vocab.sql` (v1 applied, 20260902000000).
Follow-up: `docs/apply-offgrd-d-vocab-v2.sql` (20260902010000) — no authenticated
DELETE, `touch_updated_at`, trial write trigger, payload object check.

## What it is

A team **D vocabulary**: three ordered lists of the team's own call names —
FRONT, COVERAGE, BLITZ/STUNT — entered by the coach, rendered as the Step 3
buttons in place of the generic sets, and stored on every live D snap as the
call of record. Same philosophy as play stubs: **fully callable from the
name alone; canonical mapping is optional and can come later.**

## Acceptance

- [ ] Coach pastes the three West lists → Step 3 renders them verbatim, in
      order, with `other` on each row
- [ ] A live D snap logs `BRAVO · CHICAGO · SAM & BILL`; call log and
      "What's working" show team names
- [ ] Compound names never split or merge; `SAM & BILL` == `SAM AND BILL`
- [ ] Retire keeps historical snaps intact; retired names stop rendering
- [ ] Teams with no vocabulary see the generic sets unchanged
- [ ] O Caller look-logging vocabulary unchanged (regression check)
- [ ] Mapping is optional; unmapped calls fully functional
- [ ] Vocabulary syncs across the team's devices

## Seed — Parkway West

See `scripts/fixtures/offgrd-d-vocab-parkway-west.json`. Paste into
Playbook → Defense calls, or `OFFGRD_D_VOCAB.applySeed(book, seed)`.
