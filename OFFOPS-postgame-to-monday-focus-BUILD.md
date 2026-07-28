# Post-Game Breakdown → Monday Focus (and the road to live prediction)

**The idea in one line:** Friday's game becomes Saturday's breakdown becomes Monday's focus cells becomes the week's practice and tests — and next Friday tells us whether it held.

**Why this and not live prediction first.** Live in-game prediction is the better *demo*; this is the better *product*. It runs on the same data, feeds the loop we already shipped, carries none of the sideline-reliability risk, and — critically — it **generates the training and validation data that makes live prediction trustworthy in 2027.** We ship value this season and de-risk next season's headline feature at the same time.

**The prize.** Today Focus Impact proves a kid improved **on tests**. This ticket lets us prove he improved **in a game**. *"We flagged Cover 1 depth after Week 3, drilled it, and it held up Friday"* is a fundamentally stronger claim than any quiz score, and no competitor can make it.

> **Everyone else's in-game analytics ends at the final whistle. Ours starts next week's practice plan.**

**Dependency note:** the ingest layer is shared with `OFFOPS-film-bridge-hudl-qwikcut-BUILD.md` **P1 (CSV import + column mapping)**. Build it once, use it for both. This ticket assumes that mapper exists or ships alongside.

---

## 0. Inspect first — report before building

1. **Does gameday have any live/in-game play logging today?** Fields captured, storage, and whether multiple coaches can see it. (I could not verify a multi-coach live-tag surface — assume the competition leads until proven.)
2. **Scout Predict / Tendencies surfaces** (player-side) — what they compute today and from what source. Reuse the math; don't fork it.
3. **`week_plans.gen` shape** — the scouting object Slice 4a already reads (`gen.defense.looks[].pct`). This is the "what we expected" side of the surprise diff.
4. **Scouting import pipeline** + its preview/sanity readout — reuse for game ingest.
5. **`offgrd.reps_results`** — confirm it is *test-rep* only, and that nothing else writes to it. Game snaps must **not** land here (see §6).
6. **`start_tracked_focus` signature** post-4d (scheme/dimension/baseline_correct/baseline_attempts) — the Monday hand-off calls it unchanged.
7. Where the **AI GM weekly package** is generated — the breakdown may belong inside it rather than as a new surface.

---

## 1. The cadence (design the product around the coach's week)

| When | Surface | What happens |
|---|---|---|
| **Friday night** | Ingest | Game data captured (manual entry, CSV, or later live tag) |
| **Saturday AM** | **Game Breakdown** | Auto-generated: what they ran, what we called, what broke, what surprised us |
| **Monday** | **Focus Candidates** | Ranked proposals → coach confirms → becomes tracked cells + practice emphasis + test up-weight |
| **Tue–Thu** | Existing loop | Practice script + week test (Slice 4b/4d/G already do this) |
| **Next Friday** | **Validation** | Same cells re-measured on game snaps → game-validated delta |

Name the surfaces in coach language: **"Saturday Breakdown"** and **"Monday Focus."** The cadence *is* the product.

---

## 2. Ingest — three sources, one normalizer

Ranked by effort; ship 1 and 2 this season.

1. **Quick entry** (ship first) — a coach or GA enters plays post-game from the sideline sheet or film. Fast grid: `dn · dist · hash · our call · their formation · their front/coverage · result · yards`. Optional per-play position-group grade. Must be usable on a phone, must autosave, must tolerate partial entry.
2. **CSV import** — Hudl/QwikCut export via the shared **film-bridge P1 column mapper**. Coach maps their tag names once per school; we remember.
3. **Live tag** — Phase 2 (§8).

**All three normalize into one `game_plays` shape.** Scheme values go through the **existing** `_focus_normalize_scheme` / `normalizeSchemeKey` path — same parity discipline that cost us a day in the G proof. If game cells don't normalize identically to Focus cells, nothing downstream matches and the feature silently produces zeros.

**Partial data is normal.** Never require a full 70-play chart. Everything below degrades gracefully and reports its own sample size.

---

## 3. Data model (sketch — confirm against inspect)

- **`game_logs`** — school, team, week_plan ref, opponent, date, source (`manual` / `csv` / `livetag`), status.
- **`game_plays`** — game_log ref, play index, `dn`, `dist`, `hash`, `field_zone`, `our_call`, `their_formation`, `their_personnel`, `their_front`, `their_coverage`, `concept`, `result`, `yards`, `success` (bool by situation rule), **`tags jsonb`** (raw source columns preserved verbatim), `source`.
- **`game_play_grades`** *(optional, per play × position group or player)* — `position_group`, `player_id?`, `scheme_type`, `scheme_value`, `dimension`, `graded` (`correct` / `incorrect` / `na`), `note`. This is the bridge to Focus cells.
- **`game_focus_candidates`** — derived proposals: cell (`kind`/`dimension`/`scheme_type`/`scheme_value`), `position_group`, `player_id?`, counts, `confidence`, `evidence`, `status` (`proposed` / `accepted` / `dismissed`).

**Preserve raw tags verbatim** alongside normalized columns — never lossy.

**RLS:** own-school only, mirroring `focus_today_overrides`. `REVOKE ALL FROM anon`; authenticated CRUD scoped to own school; INSERT `WITH CHECK created_by = auth.uid()`; **UPDATE with USING *and* WITH CHECK**. Any `SECURITY DEFINER` RPC pins `SET search_path TO 'public','offgrd'` and **re-derives `school_id` server-side**. **No writes to `high_schools` / `high_school_coaches`.**

---

## 4. The Saturday Breakdown

One screen, readable on a phone with coffee. Four blocks:

**A. What they ran.** Distribution by formation / personnel / front / coverage / concept, split by situation (down & distance, field zone, hash). Run–pass by situation. Success rate against us.

**B. What we called.** Our calls by situation, success rate per call, and the calls that carried the game — plus the ones that didn't. Self-scout: **what did *we* become predictable at?** (Same machinery pointed at ourselves; falls out free and coaches love it.)

**C. What broke — at cell resolution.** The differentiator. Which scheme cells failed and for whom: *"Cover 1 depth — 6 of 9 snaps broke down; 3 on DB2."* This is what feeds Monday.

**D. Surprises.** Diff observed vs `week_plans.gen` (what the scouting report predicted). *"They showed 3 looks we hadn't charted: Bear front on 3rd-and-short (4 snaps), Cover 6 to the field (7)."* Cheap to compute, disproportionately valuable, and it feeds next week's scouting.

Every number carries **sample size**. No percentage without an *n*.

---

## 5. Monday Focus — the hand-off

The breakdown produces **ranked candidate cells**, each with evidence, and the coach confirms. Never auto-apply.

- **Ranking:** `failure count × opponent-relevance × in-plan boost` — reuse Slice 4a's `planBoost` / `freqBoost` shape rather than inventing a second ranking.
- **Review UI:** one row per candidate — cell, position group, named individual if it concentrates, evidence string, confidence. Accept / dismiss / edit.
- **On accept, call the existing plumbing unchanged:**
  - `start_tracked_focus(...)` with `scheme_type` / `scheme_value` / `dimension` / `baseline_correct` / `baseline_attempts` (Slice 4d signature).
  - `append_focus_to_practice(...)` for the drill (Slice 4b).
  - The 4d/G `emphasis[]` + `min_reps` contract then up-weights next week's test automatically.
- **Coach precedence holds:** a coach edit outranks a derived candidate and is never overwritten by a re-import.
- **No auto-blasts.** `daily_focus_cron_config.enabled` stays `false`; nothing notifies players without a coach action.

**This is the whole architectural point:** the game becomes just another input to the flywheel we already built and proved. We are not building a second system.

---

## 6. Game-validated Impact — and the trap to avoid

**The trap:** game grades and test reps are different populations. A test rep is graded by the engine on relationship/leverage/depth; a game snap is graded by a coach watching film. **Conflating them would corrupt the Focus math we just shipped.**

**Rules:**
- Game grades **never** write to `offgrd.reps_results`. No exceptions.
- `focus_tracked` gets **separate, clearly-labeled** game fields (e.g. `game_correct` / `game_attempts`) — the existing `current_correct` / `current_attempts` test semantics are untouched.
- Focus Impact renders both, labeled: **"Tests: 2/7 → 5/9 · Games: 3/9 → 6/8."**
- **No change to scoring, partial credit, or rep capture** — the standing rule all arc.

**The payoff line for a coach:** *"You flagged it after Week 3. He was 3-for-9 in games on that cell. After two weeks of emphasis he's 6-for-8 — and it held on Friday."*

---

## 7. Guardrails

- No scoring / rep-capture / partial-credit change; the Focus chain (Slices 1→4d + G) must stay green.
- Shared normalizer for every scheme value — no parallel matching logic.
- Idempotent ingest: re-importing the same game updates, never duplicates.
- Migrations idempotent; **review-before-apply on anything touching RLS, `SECURITY DEFINER`, or `test_spec` writes.**
- Crons stay disabled. No player notifications from ingest.
- Partial/thin data degrades honestly — *"not enough data"* beats a confident wrong number.

---

## 8. Phase 2 sketch — live tag + prediction (2027 headline, **built in shadow this season**)

**8.1 Live tag.** One coach tags on a phone/tablet: situation → our call → their look → result. **Offline-first** (queue and sync; stadium wifi is the real environment), staff-wide read sync, and it writes the same `game_plays` shape so the Saturday Breakdown falls out with zero extra work.

**8.2 Prediction.** `P(next play | situation)` blended from: this game's tags + `week_plans.gen` scouting + season history against common opponents.

**8.3 The differentiator — cross-reference with our execution.** Not just *what they'll run*, but **whether we can handle it**:

> *"2nd-and-medium: 68% run to the field (n=19) — and your DBs are 33% on depth vs the Cover 1 look they'll see (n=12)."*

The alert version is the product: **"they're about to run the thing you're weakest against."** That's a personnel/check decision, not a stat. It requires cell-resolution execution data, which is precisely what competitors don't have.

**8.4 Credibility rules — non-negotiable.** High school means tiny samples; a confident wrong prediction in front of a staff on Friday night gets the product mocked by Week 2 and never trusted again.
- **Always show *n* and confidence.** Never a bare percentage.
- **Degrade to "not enough data"** below a floor (start at n ≥ 8 per situation bucket; tune from real data).
- Never present prediction as certainty; frame as tendency.

**8.5 Shadow mode — do this *this season*.** Compute predictions during/after every design-partner game, **log them against actual outcomes, and never display them.** By spring we have real accuracy numbers per situation bucket, tuned thresholds, and honest marketing claims — instead of shipping a guess and finding out live. This is the single most valuable thing we can do this fall for next year's headline feature, and it costs almost nothing.

---

## 9. Acceptance

1. A coach can enter a game by hand on a phone in under 15 minutes, or import a CSV via the shared mapper; partial data is accepted.
2. **Saturday Breakdown** renders the four blocks (their tendencies / our calls + self-scout / cell failures / surprises vs `gen`), every stat with sample size.
3. **Monday Focus** proposes ranked candidate cells with evidence; accept fires the **existing** `start_tracked_focus` / `append_focus_to_practice` / `emphasis[]` chain unchanged; nothing auto-applies.
4. Game grades never touch `reps_results`; Focus Impact shows **test and game deltas separately labeled**.
5. Scheme values normalize through the shared path — game cells and Focus cells match (explicit test).
6. Re-import is idempotent; raw source tags preserved verbatim.
7. RLS: own-school pass, foreign → `42501`, anon denied. No anchor writes.
8. Focus Today 1→4d + G regression-green; no scoring/capture change; crons off.
9. *(Phase 2 prep)* Prediction runs in shadow and logs prediction-vs-outcome; nothing displayed.

## 10. Verification

Integration through the real chain: ingest → normalize → breakdown → candidate → `start_tracked_focus` → practice + test up-weight → next-week measurement. Then **live render-proof, signed in**: enter a real game by hand, open the Saturday Breakdown, accept one candidate, confirm the tracked cell + practice line + next test's `min_reps` up-weight, then confirm Impact shows game and test deltas separately. Verify by the **rendered/served result** — never grep or a green unit test alone.

## 11. Out of scope

Live tag UI, live prediction display, call-sheet generation, film cutups (film bridge P3/P5). Prediction **computation in shadow** is in scope; **display** is not.

---

### Why this is the right thing to build now
It ships value this season with no sideline-reliability risk, it turns Friday into an input for the loop we already proved rather than a dead end, it produces the game-validated deltas that make our design-partner testimonials undeniable, and it quietly assembles the dataset that makes 2027's live prediction feature trustworthy instead of a guess.
