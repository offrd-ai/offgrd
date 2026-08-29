# Playbook search — airplane mode + silent chips

P0 behind the Tuesday snap gate. Desk smokes cannot close this.

**Device chip: v341.** v340 is the build that failed in airplane mode on the iPad.

## What Friday showed

Search in the caller playbook overlay returned nothing. **Show all plays** still listed plays. It works now on wifi.

## Trace (both real)

1. **Network.** `searchPlaybook` is a local substring. `OFFGRD_WEEK_PLAYS` always calls `Cloud.listPlays`. On failure it used to return `[]` and overwrite `PBOOK`. The overlay reads `PBOOK`. The sheet **Show all plays** reads the local call sheet / ranked list — a different source. Airplane from launch (gameday advice) produces exactly Friday: search empty, sheet still full.

2. **Chip.** `_callerPBFilter` ANDs after search. **Inside Run** + a play outside that family → zero rows. Empty state was `"No matches."` with no mention of the chip.

## Code (landed)

- Cache `offgrd_caller_pbook_v1` on a successful list. Fail / empty list falls back to that, then `offgrd_playbook_v1`. Does not overwrite the playbook page store.
- Overlay reads the cache when `PBOOK` is empty.
- Empty state names the query and chip (`No plays match 'dino' in Inside Run — clear filters`). Clear filters control. Same on the playbook library list.
- Chip tap toggles off.
- `scripts/smoke-playbook-search-offline.cjs`

## Still required — Tuesday, airplane from the start

Wifi at a desk cannot prove this. On the iPad, chip on the pinned build:

1. Airplane mode first.
2. Open the caller playbook overlay. Clear chips. Type a play name that exists. It must return.
3. Select **Inside Run**, type a pass name. The empty state must name the chip and offer Clear filters.
4. Then the 15-call snap gate, still in airplane.

Screenshot the miss and the hit. If search is empty with chips off and a cached book, stop.
