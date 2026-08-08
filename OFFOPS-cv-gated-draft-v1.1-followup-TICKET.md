# CV Gated Draft v1.1 — follow-up ticket (post-live-10)

**Context.** Gated Draft v1 shipped and the live 10 ran through the deployed gate. The AMBER side behaved correctly (borderline snaps → coach; no wrong data written). Two issues surfaced on the GREEN side that must be fixed before a coach is asked to trust GREEN:

- Same hand-picked frames produced **different** coverage between passes (7: cover 4 → cover 2; 11: cover 4/2-high → cover 3/1-high). Identical input, different output = vision non-determinism.
- On the live pass, **2 of 3 GREEN drafts were wrong vs coach truth** (7, 11). A "Confirm all GREEN" bulk action would have written those wrong values as **coach-verified** — the one unsafe direction.

Neither is a gate-logic bug (the gate routed on the flags/confidence it was given). Both are about making GREEN trustworthy.

---

## Fix 1 — Deterministic vision (temperature 0)

**Problem:** the vision call returns different coverage/shell/flags on identical frames, so both the drafted value and the GREEN/AMBER lane wobble pass-to-pass.

**Change:** set the model call in the runner's vision step to `temperature: 0` (or the lowest supported). A coverage tagger must be reproducible on a fixed frame set.

**Accept:**
- Re-run the hand-picked 10 twice; assert identical `exp_cv` (shell, coverage, man_or_zone) and identical lane assignment across both runs. Add this as a determinism check (can be manual/one-off, not necessarily in `smoke:gate`).
- Confirm no other sampling/setting (top_p, seed) reintroduces variance; pin what's needed.

---

## Fix 2 — GREEN is glance-and-confirm per snap, not blind bulk

**Problem:** GREEN was specced (by me) as a bulk "Confirm all in view" lane. The variance above shows GREEN drafts can be wrong, so bulk-approving stamps wrong coverage as coach-verified.

**Change (client, pin bump):**
- **Remove or hard-guard "Confirm all GREEN."** Default GREEN interaction = **per-snap confirm**: the draft (shell + coverage + man/zone) is pre-filled; the coach confirms one snap at a time (existing Enter = confirm is fine). Pre-filled-then-glance is still a real time-save vs a blank card — it just never stamps unseen.
- If a bulk action is kept at all, it must require an explicit per-snap glance (e.g. only enabled after the coach has stepped through the GREEN queue), and it must never fire from a single click on an unreviewed queue.
- Banner copy on GREEN: make it a *suggestion*, not a verdict — e.g. "AI draft — confirm the coverage." No "verified" language until the coach confirms.

**Accept:**
- No single action confirms an unreviewed GREEN snap.
- Confirming a GREEN snap still flips AI-TAGGED → COACH-VERIFIED (unchanged).
- AMBER unchanged (coverage required before confirm).

---

## Diagnostic — which frames did the live 10 use?

Confirm whether the live-gated run used the **hand-picked frames** or re-extracted through the **production auto-sampler**.

- If **hand-picked frames** → 9's new `cropped_deep` + the 7/11 flips are pure vision variance → Fix 1 addresses it.
- If **auto-sampler** → 9's `cropped_deep` may be a frame-selection regression (the parked sampler fixes: F0 set-gate + develop-span). Note it; a production run leans on the sampler, so those fixes may need to come off the shelf after all.

Report which, so we know whether the sampler still needs the two parked fixes before real opponents.

---

## Out of scope
- No change to `FILM_DEGRADED_FLAGS` or the gate routing logic (smoke suite stays as-is).
- No auto-accept. Front/pressure stay coach-only.
- No re-tuning of the confidence threshold in this ticket (revisit only if determinism changes the picture).

## Sequence
Fix 1 (runner, redeploy) → re-run hand-picked 10 twice to confirm determinism → Fix 2 (client, pin bump) → then a fresh live 10 to re-check lanes against the answer key.
