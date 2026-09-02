# TICKET — scout_snaps / SNAP_CORPUS must carry PLAY DIR (server)

Client v351 overlays `direction` / `gap` from `offgrd_season_v2` in
`setSnapCorpus` when the cloud corpus omits them. That unblocks Friday
(Parkway South). It is not the real fix.

## Bug

`offgrd_scout_snaps_for_team` (and/or the autoscout snapshot builder)
does not persist or return `play_dir` / `gap` on review-passed snaps.
`scoutSnapToRow` (v350) copies typed columns when present. Production
corpus rows for Parkway South still arrive with `direction: ""` on 44/44
while the season store has `direction` on 44/44.

## Fix (after Friday)

1. Persist `play_dir` and `gap` on `scout_snaps` from Assist / Hudl ingest
   (typed columns already exist — `apply-scout-snaps-slice-b-typed.sql`).
2. Return those columns from `offgrd_scout_snaps_for_team`.
3. Confirm `scoutSnapToRow` still maps `s.play_dir` → `direction`.
4. Keep the v351 client overlay as a belt until every team's corpus
   hydrates with dirTagged matching the season store. Then remove it.

## Proof

D Caller vs South, 1st & 10+: `Pass 55% · runs go L 70% (n=10)`.
`snapRows('off')` dirTagged === `gamesRows('off')` dirTagged without the
client overlay.
