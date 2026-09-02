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
- [x] Sit fingerprint drops side + hash (v352). v351 keys missed 44/44:
      corpus `…|off|…|18|` vs season `…||…|18|R`.
- [x] Copy amendment (v353): hero is two clauses
      `Pass 55% · Run 45% → L 70%`; footer `22 snaps · 7 of 10 runs went left`.
      Grain (`→`) attaches only to the side whose tagged slice clears the
      gate. n is not on the hero. Formation/Tier-2 use the same grammar.

## COPY AMENDMENT (Matt, Sep 1, after seeing v352 live) — two clauses, not one

`Pass 55% · runs go L 70% (n=10)` is ambiguous: it reads as a parent share
plus an unrelated "70% goes left." The n refers only to the run slice and
nothing says so. Rewrite the hero as **two self-contained clauses, one per
side, each carrying its own share and its own grain:**

```
Pass 55%  ·  Run 45% → L 70%
```

Rules:
- BOTH sides always show their share (that's the parent tier). Lean side
  first (the THEY'LL PASS header already names the lean).
- A side's grain (`→ L 70%`, or pass depth `→ quick 60%` when PASS ZONE is
  tagged) attaches ONLY to that side's clause, and ONLY when that side's
  tagged slice clears DIRECTIONAL_SPLIT_MIN. Under the gate the clause is
  just the share: `Pass 55% · Run 45%`.
- Move the n out of the hero into the existing footer line, in coach
  language: `22 snaps · 7 of 10 runs went left`. "7 of 10" is more honest
  and more legible than "(n=10)".
- Formation tier uses the same grammar:
  `2x1 Wing: Pass 30% · Run 70% → L 71%`.
- Tier 2 slots in without changing shape:
  `Pass 55% → quick 58% · Run 45% → inside 60%, L 70%` (lane and direction
  both on the run clause when both clear the gate).

Expected South 1st & 10+ after the change:
hero `Pass 55% · Run 45% → L 70%`, footer `22 snaps · 7 of 10 runs went left`.

Paint-string only. No gate or data changes.
