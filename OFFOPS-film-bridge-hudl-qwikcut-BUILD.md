# Film Bridge — Hudl / QwikCut import, cutups, and call-string tagging

**What they built (observed, from their own walkthrough).** SpiralXO ships a **browser extension**. The coach installs it, opens Hudl normally, and the extension injects an **"Export to SpiralXO"** control into Hudl's own UI. Pick a game → choose phase (offense/defense) → team → destination folder → export. The playlist **plus every tag column** lands in SpiralXO's film section. From there: scrub, multi-angle, show/hide the data table, click a row to jump. Right-click any value → *filter current playlist* / *view cutup*; click column headers to stack filters (hash left + concept stick); **save cutup** with an auto-generated name. Their pitch: *"a little bit faster than what's typical in Hudl."*

Two more capabilities matter more than the export itself:

1. **"Copy calls → paste plays → apply."** Take the call list from a practice script, paste it onto **untagged** practice film, and each call is matched against the **play pool** (checkmark = found). Apply, and one call string explodes into **personnel · shift · formation · concept · concept type · play direction · RPO tag**. Blank practice film becomes fully filterable — *without anyone tagging it.* Then: filter to trips, then inside zone, and you're looking at your four trips-inside-zone practice reps in seconds.
2. **Live-tag game-log import with column merge.** If they tagged the game live, import the log directly (skipping Hudl entirely) and **choose which columns to keep from which source** — e.g. keep Hudl's hash column because live tag doesn't capture hash. Merged result carries defensive front, efficiency, the lot.

They state it's **still in beta.**

**Why this is strategically important:** the extension is a **client-side bridge** — it rides the coach's own authenticated Hudl session in their own browser. That's how they get Hudl integration **without a Hudl partnership or API access.** It's the single highest-leverage unblock in their stack, and it's replicable.

> **This ticket is the sibling of `OFFOPS-import-to-install-BUILD.md`.** That one derives the *defensive call library*; this one derives *film + play data*. Both are the same principle: **derive, don't tag.** This ticket supplies Phases C/D of that one.

---

## 0. Non-negotiables before any code

**Credential safety — we do this differently than they demoed.** Their video shows logging in *to SpiralXO* from a form inside Hudl's page. We will **not** ship that pattern:

- The extension must **never** ask for, capture, read, or store **Hudl/QwikCut credentials**. Ever.
- The extension must **never** collect an OFFOPS password in a form injected into a third-party page — that's phishing-shaped and trains coaches into a dangerous habit.
- Auth = **OAuth/PKCE popup to our own origin**, or a short-lived device-pairing code generated in OFFOPS and pasted into the extension. The extension holds a **scoped, revocable token** only.
- Token stored in `chrome.storage.session`/`local` with least privilege; revocable from the OFFOPS account page; auto-expiring.

**Legal / ToS posture — get a decision before public launch.** Automating extraction from an authenticated third-party session can conflict with Hudl's or QwikCut's terms even when it's the customer's own data. Reduce risk by design:

- **User-initiated only.** No background scraping, no crawling, no scheduled jobs. One export = one explicit click.
- **Only data the coach can already see or export** in their own account. No hidden endpoints, no privilege escalation, no other teams' data.
- **Prefer official paths where they exist** — if Hudl/QwikCut expose an export or API for this data, use it and keep the DOM path as fallback.
- **Rate-limit and identify** the extension honestly; don't spoof.
- **Ship Phase 1 (CSV) first** so the product works with zero ToS exposure and the extension is an accelerant, not a dependency.
- **Get counsel sign-off before public distribution** (Chrome Web Store listing especially). Flag this to Matt as a decision, not an engineering detail.

**Fragility note:** a DOM-based bridge breaks whenever Hudl ships UI changes. Budget for maintenance, version-detect, and fail **loudly and safely** (clear "Hudl changed, update the extension" message — never a silent partial import).

---

## 1. Phases

```
P1  CSV / manual import      → ToS-safe, unblocks everything, ships first
P2  Extension bridge         → Hudl + QwikCut, one-click export
P3  Film library + cutups    → playlist, filters, saved cutups, player
P4  Call-string → tags       → "paste calls" explodes into structured fields
P5  Film ↔ reps/Focus link   → OUR differentiator
P6  Export back out          → game log → Hudl/QwikCut/CSV
```

### P1 — CSV / manual import (ship first)
Upload a Hudl/QwikCut export (or any CSV). **Column-mapping UI**: coach maps their tag names to our fields **once**, saved per school and reused. Their terminology, not ours. Preview + sanity readout before commit (we already have this pattern from the scouting import). Idempotent by natural key; re-import updates rather than duplicates.

### P2 — Extension bridge (MV3)
- Chrome MV3 (Edge/Brave inherit). Content script activates **only** on Hudl/QwikCut domains; minimal host permissions; no `<all_urls>`.
- Injects an **"Export to OFFOPS"** control on playlist/game views.
- Export dialog: **phase** (offense / defense / special teams) · **team** (multi-team programs) · **destination** (season / week / folder) · **opponent/label**.
- Sends playlist + tag columns + clip references to our ingest endpoint with the scoped token.
- Progress + success/failure state in the extension; failures are explicit and re-runnable.
- **Do not** re-host video we don't have rights to — store **references/links + tag data** by default; treat any clip copying as a separate rights decision.

### P3 — Film library, cutups, saved filters
- Playlist view with the data table beneath the player; click a row → jump to that play; show/hide table; multi-angle where available.
- **Right-click any cell value → filter / view cutup.** Stack filters across columns (e.g. hash = left + concept = stick).
- **Save cutup** with auto-generated name from the active filters ("hash left · concept stick"), plus rename/remove.
- Must feel **faster than Hudl** — that's their explicit claim and the bar. Client-side filtering over already-loaded tag data; no server round-trip per filter.

### P4 — Call-string → structured tags ("paste calls")
The highest-value piece to copy, and we already have the parser inputs.
- **Copy calls** from a practice script or game plan → **paste** onto an untagged film playlist (line-by-line paste also supported).
- Each line is matched against the **playbook / play pool**; show a per-line **match indicator** (found / not found / ambiguous) *before* applying.
- **Apply** explodes each call into structured fields: personnel · shift · formation · motion · concept · concept type · direction · tag (+ our defensive equivalents: front · coverage · pressure · stunt).
- Unmatched lines are listed for review — **never silently dropped**, never fabricated.
- Result: blank practice film becomes filterable in seconds without manual tagging.

### P5 — Film ↔ reps + Focus Today (**the differentiator**)
This is what SpiralXO structurally cannot do: they have film tags; **we have execution data at cell resolution.**
- Link imported plays to `offgrd.reps_results` / week-plan context where identifiable (opponent, week, call, formation).
- **Focus-cell cutups:** from a Focus Today card — *"DB depth vs Cover 1, 0/8"* — one tap generates the cutup of those exact snaps. Diagnosis → film evidence → drill → re-test, in one motion.
- Attach clips to a **drill / practice emphasis** (Slice 4b) and to a **tracked focus cell** (4d) so the Impact readout can show *"here's what it looked like before, here's after."*
- Player side: their assignment reps can carry the clip of the real look.

> Positioning: *they filter film by what was typed on the call sheet; we filter film by what our players actually failed.*

### P6 — Export back out
Game log → **CSV first**, then Hudl/QwikCut where a supported path exists (mirrors their one-click export). Also supports the **live-tag log import + column merge** pattern: import our gameday log, then **choose which columns win** per source when merging with a film export (their hash-column example). Merge rules must be explicit and previewable.

---

## 2. Inspect first — report before building

1. What our **gameday live-tag / play-log** currently captures (fields, storage) — the P6 merge source.
2. Existing **scouting import** pipeline + preview/sanity readout — reuse, don't rebuild; where `week_plans.gen` is written.
3. **Playbook / play-pool data model** — what a call string can be matched against, and whether formations/concepts/tags are structured enough to explode into P4 fields. This determines P4 feasibility.
4. Existing **film/telestration** feature (we spec'd one earlier) — storage, player component, what it already does.
5. `offgrd.reps_results` join keys available to link a rep to a film play (week, opponent, call, formation, player).
6. Auth: how to mint a **scoped, revocable** extension token in the current Supabase auth model.

---

## 3. Data model (sketch — confirm against inspect)

- `film_sources` — per school: provider (`hudl`/`qwikcut`/`csv`/`livetag`), external ref, imported_by, imported_at.
- `film_playlists` — school, team, season, week/opponent, phase, name, source.
- `film_plays` — playlist ref, clip ref/URL, play index, **`tags jsonb`** (provider columns preserved verbatim) + normalized columns (formation, concept, front, coverage, hash, dn, dist, result), `match_status`, `source`, optional `reps_result_id`.
- `film_cutups` — saved filter definitions (school, playlist, filter json, name).
- `film_column_maps` — per school per provider: provider column → our field.

**Preserve raw provider tags verbatim** alongside normalized fields — never lossy. Normalize scheme values through the **existing** `normalizeSchemeKey` / `_focus_normalize_scheme` path so film cells match Focus cells (same parity discipline that bit us in the G proof).

**RLS:** own-school only, mirroring `focus_today_overrides` — `REVOKE ALL FROM anon`; authenticated CRUD scoped to own school; INSERT `WITH CHECK created_by = auth.uid()`; UPDATE with **USING *and* WITH CHECK**. Any `SECURITY DEFINER` ingest RPC pins `search_path` and **re-derives `school_id` server-side**. No writes to `high_schools` / `high_school_coaches`.

---

## 4. Acceptance

1. **P1**: a coach imports a Hudl/QwikCut CSV, maps columns once, and sees a filterable playlist; re-import is idempotent; mapping persists per school.
2. **P2**: with the extension installed, one click in Hudl exports a selected game to the chosen team/phase/destination; tag columns arrive intact; failure states are explicit and retryable. **No third-party credentials are ever requested or stored; no OFFOPS password is ever entered in an injected form.**
3. **P3**: right-click filter, stacked column filters, view cutup, save/rename/remove cutup — all client-side fast; row click jumps the player.
4. **P4**: pasting practice-script calls onto untagged film matches against the playbook, shows per-line match status, and on apply populates structured fields; unmatched lines surface for review and are never fabricated.
5. **P5**: from a Focus Today cell, one tap produces the cutup of those snaps; clips attach to a tracked focus cell / practice emphasis.
6. **P6**: game log exports to CSV (and supported providers); live-tag + film merge lets the coach choose the winning column per field, with preview.
7. Raw provider tags preserved; scheme normalization goes through the shared path; **no change** to rep capture, scoring, or the Focus chain (1→4d + G stays green).
8. RLS verified: own-school pass, foreign → `42501`, anon denied.

## 5. Verification
Integration tests through the real chain (import → normalize → playlist → filter → cutup → Focus link). **Live render-proof, signed in**: import a real CSV, build and save a cutup, paste a practice script onto untagged film and confirm the explosion, then generate a Focus-cell cutup. Extension tested against a live Hudl session in a real browser profile, including the **failure path** (simulate a DOM change → confirm loud, safe failure, not a silent partial import). Verify by the rendered result, not a green unit test.

## 6. Sequencing recommendation
**P1 → P4 → P3 → P5 → P2 → P6.** Rationale: P1 unblocks with zero legal exposure; **P4 is the highest-value differentiator we can ship without touching Hudl at all** (it works on any film, including our own practice video); P3 makes the data usable; P5 is our moat; P2 (the extension) is the flashy piece but carries the ToS decision and maintenance burden, so it should land once the value is already real without it. P6 last.

---

### Honest risk summary for Matt
- **ToS/legal**: needs a decision + counsel sign-off before public extension distribution. The CSV path keeps the product whole if the answer is no.
- **Maintenance**: DOM bridges break on vendor UI changes; this is an ongoing cost, not a one-time build.
- **Video rights**: default to referencing clips, not re-hosting, unless we've confirmed rights.
- **Their beta status is an opening**: they said it themselves — this is new and rough. P4 + P5 (call-string tagging tied to *execution data*) is a place we can be better rather than merely equal.
