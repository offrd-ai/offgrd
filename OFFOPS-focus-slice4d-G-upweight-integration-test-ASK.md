# G up-weight — `ok ≥6` integration assertion (deterministic, auth-free)

**Why this exists:** the live browser proof of G is blocked by a staging-origin SSO quirk — the session won't hold on `offgrd-deploy-v93`, so the gameday page renders signed-out and the DB alignment test has no program to build from. That's plumbing, not a G defect. The one piece the live pass couldn't reach is the **`ok ≥6` placement** — proof that `startTest`, given a Cover-1 `def_aligns` call plus an active flag, actually fills **≥ `min_reps`** of the flagged cell and takes the `[focus-4d] cell up-weight ok` branch. A deterministic integration test proves that more rigorously than a manual click and sidesteps auth entirely.

## What's already proven (don't re-litigate)

- **Live on v139 staging** (console-verified): the consumer **fires** on the alignment path, **reads the cell** correctly (`Cover 1 leverage`, `min_reps 6`), and **degrades gracefully** (`[focus-4d] cell up-weight short: Cover 1 leverage got 0/6` — warning, no crash) when the align pool is empty.
- **Diagnosis confirmed:** the `0/6` was the OL Slam `ol_keys.coverage="Cover 1"` false positive; the real Cover-1 source is `def_aligns`. v139 fix reads `def_aligns` and ignores OL Slam rows.
- **4d render-proof:** the Impact-flip mechanism (`start_tracked_focus` → `get_focus_impact` → `Cover 1 leverage: 2/7 → …`) is already proven end-to-end at the DB level.

So the **only** open assertion is: the up-weight *places* ≥6 Cover-1 alignment reps from `def_aligns`.

## The test (extend the `alignScoringTest` 4d block, or a sibling)

**Fixture:**
- An **active tracked flag** for `(position_group=DB, kind=align, dimension=leverage, scheme_type=coverage, scheme_value=Cover 1)`, `min_reps=6` — sourced the way the generator reads it (`test_spec.positions[DB].emphasis[]` or `get_active_focus_flags`).
- A **`def_aligns` entry** with a **Cover 1** defensive call carrying DB alignments (leverage) — the real align pool source per the v139 fix, **not** the OL Slam rows.
- A normal spread of **other-coverage** calls (e.g., 4-3 Tampa 2) so the rest of the install is present.
- Test length `≥ min_reps` (e.g., 10).

**Act:** run `startTest` for the align path (`week_test` and/or `practice`) with `POSITION=DB`, `TEST TYPE=Alignment`, and a SOURCE that includes the `def_aligns` Cover-1 call.

**Assert:**
1. **≥6 Cover-1 reps placed** — the generated test contains `≥ min_reps` (6) alignment reps whose normalized coverage `== "cover 1"` (via `normalizeSchemeKey` / `alignRepMatchesCell`) **and** dimension matches `leverage`.
2. **`ok` path, not `short`** — assert the `[focus-4d] cell up-weight ok` branch is taken (log or internal counter reaches `min_reps`); **no** `short: got <6` warning.
3. **Bias, not monopolize** — total test size stays in the normal band; the non-flagged coverages (Tampa 2, etc.) still appear — the fill doesn't crowd out the rest of the install.
4. **Parity + regression guard (the make-or-break):** the placed Cover-1 reps are drawn from the **`def_aligns` call**, not the OL Slam `ol_keys` rows. Add the inverse case: an **OL-only Slam row with no `def_aligns` Cover 1** yields the **`short`** branch — locks out the false-positive that caused the original `0/6`.
5. **Pool identity** — the pool `startTest` fills into `==` the pool `pickAlignRep({ strictScheme:true })` reads from. (This is the seam I flagged in the G spec §4: a fill-pool ≠ test-pool mismatch would also produce `0/6` even with a valid call present. Assert they're the same source.)
6. **Out-of-plan review (optional, same block):** a flag whose `scheme ∉ install` still fills `min_reps` tagged `_reviewRep` / `reviewRep:true` — no fabricated opponent frequency.
7. **Graceful degrade (lock in what I saw live):** with **no** Cover-1 `def_aligns` call present, the `short` branch fires cleanly — warning, rest fills normally, no crash.

## Report back

- The **`ok ≥6` assertion output** — the placed Cover-1 rep count + confirmation the `ok` branch fired.
- The **parity/regression** result — reps sourced from `def_aligns` (not OL Slam); OL-only → `short`.
- The **pool-identity** confirmation — fill pool `==` test pool.
- (Optional) out-of-plan `_reviewRep` + degrade assertions.

## Then G is proven for ship

Green on this + the already-confirmed live behavior (fires / reads cell / degrades) + the 4d Impact-flip proof = G proven on combined evidence, ship the gameday mirror. If you still want one eyes-on live Impact flip, we do it in ~10 seconds on an origin where auth actually holds (e.g., right after the ship, on real gameday) — no need to fight the staging SSO for it.

## Separate note — staging gameday color scheme

Observed during the live pass: on `offgrd-deploy-v93`, the **Team Portal renders correctly, but clicking into Gameday shows the wrong color scheme** (team brand colors not applied). This tracks with the **signed-out / program-not-loaded** state on the staging origin — brand colors load with the program, so signed-out falls back to the default theme. Worth a quick separate confirm that it's *only* the signed-out fallback and **not** a v139 staging styling regression, since the portal side renders fine. Not a G blocker — just don't let it hide a real regression when the mirror ships.
