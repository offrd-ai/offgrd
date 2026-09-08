# D Caller Export — where it lands (device-session P2 report)

v360 recovery: **Export all sessions** (Tools) dumps raw `offgrd_dcaller_events_v2` + `offgrd_caller_events_v2` (every gameId) plus leftover `offgrd_*caller_export_*` receipts and the one-shot `offgrd_caller_recovery_snapshot_v1`. Session-scoped Export still writes `offgrd_dcaller_export_<gameId>` only.

UI copy (v188+): **Export JSON** / receipt **Saved · JSON exported** — never "Uploaded" until a server table exists.

## Today (served artifact)

`OFFGRD_DCALLER.upload()` does **not** write to Supabase.

| Destination | What |
|---|---|
| `localStorage` key `offgrd_dcaller_export_<gameId>` | Full export JSON |
| `localStorage` key `offgrd_dcaller_export_latest` | Same payload (latest game) |
| Browser download | `offgrd-dcaller-<opp>-<date>.json` |

Payload fields for spot-check: `snapCount`, `eventCount`, `log[]`, `events[]`, `mondayFocus` (sidecar).

**There is no server table / row count to query.** A SQL editor check will find nothing until Monday-pipeline ingest ships (`game_logs` / `game_plays` per `OFFOPS-postgame-to-monday-focus-BUILD.md`).

## Spot-check on device (DevTools / Safari Web Inspector)

```js
const raw = localStorage.getItem("offgrd_dcaller_export_latest");
const p = JSON.parse(raw);
console.log({ snaps: p.snapCount, events: p.eventCount, opp: p.session && p.session.opp });
console.log("log length", (p.log || []).length, "events length", (p.events || []).length);
```

Mismatch `snapCount` vs `log.length` → bug. Both should match folded snaps.

Live store (pre-upload):

```js
const st = JSON.parse(localStorage.getItem("offgrd_dcaller_events_v2") || "null");
console.log({ events: (st && st.events || []).length, sit: st && st.sit });
```

## After ingest exists (future)

Compare device `snapCount` to:

```sql
-- placeholder — tables not built yet
-- SELECT count(*) FROM game_plays gp
-- JOIN game_logs gl ON gl.id = gp.game_log_id
-- WHERE gl.source = 'livetag' AND gl.opponent = :opp;
```
