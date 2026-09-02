# TICKET — D Caller granular Expect (direction, formation, lane, depth)

Matt (Sep 1): "are we able to get more granular on the Expect? Pass Quick,
Intermediate, Deep? Or Run Inside, Outside or Right, Left, Middle?"

Data audit (every opponent xlsx uploaded to date):
- PLAY DIR: filled on ~92% of opponent snaps in EVERY file (L/R; no M
  observed — do not promise Middle until it appears in real exports).
- OFF FORM: filled ~95% everywhere.
- PLAY TYPE (Run/Pass): ~95%.
- GAP: 0 rows filled, all files. PASS ZONE: 0 rows filled, all files.

So granularity comes in two tiers with a hard data boundary between them.

## Tier 1 — ship from existing data (no new tagging)

Extend the D Caller Expect from `Run 62%` to conditioned splits, in this
order of value:

1. **Directional lean on runs (and passes):** from PLAY DIR.
   `Run 62% · runs go R 71% (n=17)`.
2. **Formation-conditioned expect:** from OFF FORM. When the operator logs
   (or the sit implies) a formation, show
   `2x1 Wing: run 78% · to the wing 70% (n=23)`. Formation-first is how a
   DC reads offense; this is the highest-value split we can feed today.
   Normalize formation strings case-insensitively ("2x1 Wing" == "2X1 WING")
   and reuse the formation-mapping table from import.

## Honesty rules (same as O Caller — non-negotiable)

- A split only renders when its slice clears `DIRECTIONAL_SPLIT_MIN` (8).
  Below that, show the parent level only.
- Show the DEEPEST tier that clears the gate; never all tiers stacked.
- LOW badge between MIN_SNAPS and comfortable n, exactly like coverage.
- Splits compound fast: situation × formation × direction on a 60-snap book
  is single digits. Degrading to the parent level is correct, not a bug.

## Tier 2 — lane + depth (requires tagging-forward)

- **Run lane** from GAP: A/B → inside, C/D/edge → outside.
  `Run 62% · inside 58% · R 71%`.
- **Pass depth** from PASS ZONE (Hudl standard: depth × direction,
  e.g. "Short Left", "Deep Middle"): bucket to Quick / Intermediate / Deep,
  and PASS ZONE direction backfills pass-side directional lean.
- Code ships dormant: render these tiers whenever the columns have data.
  Zero data today = zero UI today, automatically.

## Tagging-guide change (Matt, not Cursor)

Add GAP and PASS ZONE to Hudl Team Settings → Tagging defaults in
"OFFGRD — Hudl Tagging Guide" and the coach routine doc, with one line of
why: "two extra taps per snap in Hudl buys inside/outside and pass depth
in your defensive call sheet."

## Live logging parity

D Caller live taps are Run/Pass. Optional L/R pair (dashed, skippable —
After-Snap philosophy, never a gate) so live games feed the directional
split before film arrives. No Middle.

## Not in scope

- Middle direction (no M in any real export yet).
- Name-based family classification for opponents.
- Any change to the O Caller.

## Implementation

- `OFFGRD-dcaller-expect.js` — DOM-free grain builder.
- `OFFGRD-dcaller.js` — Expect strip consumes one grain line; live L/R only.
- `scripts/smoke-dcaller-expect.cjs` — honesty + dormant + P South-shaped book.

## Acceptance

- [x] Expect shows directional lean when slice n ≥ DIRECTIONAL_SPLIT_MIN
- [x] Formation-conditioned line appears only with formation data ≥ gate
- [x] Lane/depth tiers render iff GAP / PASS ZONE data exists (dormant now)
- [x] Below gate: parent tier only, no silent guessing, LOW badges intact
- [x] Formation strings normalized case-insensitively via import mapping
- [x] P South-shaped book (86 D-rows, 75 PLAY DIR tagged) renders a split
- [x] Run-direction is independent of parent lean. Pass-lean + dir-tagged
      runs n ≥ 8 → `Pass 55% · runs go L 70% (n=10)` (v348). v347 coupled
      dir to `typedRows(ctx, lean)`, so South (pass-lean everywhere) showed
      no direction line.
- [x] Panel paints `paint(build()).html` as the Expect hero (v349). v348
      loaded the module but `expectHtml` still rendered the old PASS/pct
      hero and hid `grain.text` when `tier === "parent"`. Smoke now asserts
      the painted markup, not just `build().text`.
- [x] SNAP_CORPUS mapper copies play_dir / direction / gap / passZone /
      offStrength from typed columns and season-store keys (v350). v349
      painted parent-only because scoutSnapToRow only read those from raw.
- [x] `setSnapCorpus` overlays season-store direction/gap onto cloud
      corpus rows when the server omits them (v351). Production
      `offgrd_scout_snaps_for_team` still ships dirTagged 0 — server
      carry is `docs/TICKET_offgrd_scout_snaps_play_dir.md` (after Friday).
