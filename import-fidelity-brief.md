# Import fidelity — Slice A now, Slice B later

Classic parsers are header-driven. This brief is the work that follows the
A/B/C column audit (three real Hudl exports, not a vendor fork).

---

## Backlog (do not build in Slice A)

Logged 2026-08-19 from the Goaline diagnostic. Do not start these here.

1. **Magic 3 selection effect.** Avg distance-to-go column beside `n` so family
   EFF is not read as situation-free. See `magic3-polish-brief.md` backlog.

2. **RESULT on own-offense rows — done in situational-truth v305.** Classic
   `parseOffense` stores it; Assist keeps it on the typed snap + `raw`.
   Magic 3 COMP needs a classic ours re-import. Defense/scout paths untouched.

3. **YARD LN raw string on own-offense.** Stored on 0/238 of the live corpus.
   Needed before any goal-line clamp of the success rule.

---

## Slice A — done 2026-08-19 (pin v304). Do not re-run.

A1–A4 landed. Next work is RESULT on own-offense (promoted), then Slice B.
Success rule and Magic 3 columns were not touched.

### A1 shipped-behavior (render side)

`chartedBlitz` / `applyChartedStunt` read **`blitz` only**, not `stunt`, not either.
Bare `pressure=yes` still does not fork a card or draw a rusher.

On the 20-column export (both `BLITZ` and `STUNT` present), STUNT was already
dropped whenever BLITZ mapped first. Charted stunts (NUT, HAT, HAT / BUN, NUB)
never reached `row.blitz`, so they were invisible to the card renderer then
and still are. Cards do **not** start drawing those paths. Shipped print
sheets do not move.

The one case that *would* move: a STUNT-only file (no BLITZ header). Before,
`"stunt"` was a blitz alias so those labels were stolen into `blitz` and
could draw. After, they land on `stunt` and the renderer ignores them.
Export B is not that file.

### Re-import scope

Adding a field changes nothing retroactively. Old rows simply lack the keys.
Nothing reads `presnapSafeties`, `stunt`, `coverageRaw`, or `coverageMod`
yet, so nothing degrades in the meantime.

| field | who must re-import to store it | meantime | after re-import |
|---|---|---|---|
| `presnapSafeties` | Classic Defense (`parseCSV`) games that had the header. Assist/FIELD_DEFS does not write it. | Absent. No Predict axis. | Stored on the snap. Still no chart, no shell guess. |
| `stunt` | Same classic Defense games (20-col Export B). Assist still maps BLITZ only → `pressure`. | Absent. Cards still read `blitz`. | Stored. Cards still do not draw NUT/HAT/etc. |
| `coverageRaw` / `coverageMod` | Classic Defense **and** own-offense (`parseOffense`) games whose coverage cell had a leftover (PRESS, CLOUD, SKY, SOFT). Assist writes base `coverage` only. | Absent. Predict/cards already group on the base family. | Stored beside the same base. Grouping unchanged. |

A coach whose cards look different after a re-import is not seeing this
slice — unless they re-imported a STUNT-only file, in which case paths
that used to steal from STUNT into `blitz` go away. That is intended.

### A1. STUNT / BLITZ correctness

Export B has both `STUNT` and `BLITZ`. `ALIASES.blitz` currently lists `"stunt"`,
so a STUNT-only file is stolen into blitz, and a file with both columns drops
STUNT. Tendencies already treat `"DL stunt"` as not-a-blitz.

Required: when both headers exist, store each field. Remove `"stunt"` from the
blitz alias list. A combined `BLITZ/STUNT` header still maps to blitz. Do not
count a stunt as `pressure` unless the BLITZ column says so.

### A2. PRESNAP SAFETIES

100% filled in export B; dropped from every typed write. Classic Predict has
no safety-count axis (shell is implied by coverage family). Auto-Scout wants
`coverage_shell` (`0-high` / `1-high` / `2-high`) from video, not this column.

Required: map the header and store the value on the snap (`presnapSafeties`).
Do not invent a Predict chart in this slice. Do not guess a shell from the
count.

### A3. Coverage modifiers

`normCoverage` keeps a base family and drops PRESS / CLOUD / SKY / SOFT.
Rows are not rejected. Opaque tags (`JACK / SOLO`, `PREVENT`) stay as-is.

Required: keep the base family used for Predict. Also store `coverageRaw` and
a leftover `coverageMod` (PRESS, CLOUD, SKY, SOFT, …). Do not change grouping.
Fixture the audit traces: `4 PRESS`, `3 CLOUD`, `3 SKY`, `2 MAN`, `SOFT 0`,
`JACK / SOLO`, `PREVENT`.

### A4. Play-map hydrate smoke

v294 lesson: never paint a mapped count from an unknown/empty-loading cache.
`openPlayMap` does not pass `hydrating: true`. There was no dedicated
`smoke-play-map-hydrate.cjs`.

Required: a hydrate smoke that asserts (1) `hydrating` + no cache → `loading`,
no “0 mapped”, (2) same-cache `setCache` does not re-fire `onAfterHydrate`,
(3) a genuinely empty hydrated map may show an honest 0. Wire it into `npm run check`.

---

## Slice B — later (RESULT is no longer here)

MOT ADJ → `defense_response`, FORM TAG, MOTION name (stop collapsing scout
motion to 0/1), Assist typed writes for fields already in FIELD_DEFS, GAP /
PASS ZONE. Not this slice.
