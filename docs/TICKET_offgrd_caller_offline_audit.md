# Gameday caller — every network call, and what it does offline

Audited 2026-08-29 after playbook search failed in airplane mode on v340.
Scope: O Caller and D Caller during a live game (not Team Portal, not Playbook page except the caller overlay).

`navigator.onLine === false` is the gate. Rural no-signal with `onLine === true` still hits the **fetch-fails** column.

## Silent-empty (same class as Friday search)

| call | when | fail / offline | UI |
|---|---|---|---|
| `OFFGRD_WEEK_PLAYS` → `Cloud.listPlays` | hydrate, week set | **v340:** `[]` into `PBOOK`. **v341:** cache fallback | Search overlay empty; **Show all plays** still lists the local sheet |
| `Cloud.listScoutSnaps` → `setSnapCorpus` | hydrate / pull / after push | Offline: skip (keep last). Success `[]`: **sets `SNAP_CORPUS_READY=true` with empty corpus** | Tendencies / expect draw 0 snaps and stop falling back to `GAMES` |
| `offgrd_team_scouting` / `listGames` | hydrate when **online** | RPC can return `[]` with no error (auth.uid miss) | v340 no longer auto-pushes empty cloud. Local season kept **unless** a later `A.set([])` path runs |
| `pullPlayMap` / `pullFormationMap` | hydrate | `.catch(() => [])` | Family chips / formation labels empty if cache was never written |

## Holds locally (degrades with a label, or no UI change)

| call | when | fail / offline | UI |
|---|---|---|---|
| Caller event flush (`OFFGRD_CALLER_SYNC_ENGINE.flush`) | open, after snap, Sync now | Offline: `{ ok:false, offline:true, pending:N }` — no throw | Header: pending / held, not “All synced” |
| `Cloud.upsertCallerEvents` | inside flush | throw → backoff | Badge stays pending; events stay in `localStorage` |
| `Cloud.saveGame` via `OFFGRD_SYNC` | after fold to library | Offline: `push` still fires; fetch throws; `push(true)` silent | Library row is already local (`callerSyncToGames`). Cloud lags. Badge can still say synced if stamp ran earlier |
| `refreshScoutSnaps` | pull / push | Offline: return. Throw: `console.warn` | Prior corpus kept if already hydrated |
| `pull()` / `maybePull` 45s | focus | Offline: return | No load, no wipe |
| `finishProgramHydrate` | boot | Offline: skip `listGames`, paint from LS, offline banner | Role/chrome from pin |
| Ask Booth free-text | coach types | Needs connection; copy says so | Chips stay local |
| AI week package / `OFFGRD_WEEK_GEN` | not a live-call path | Throws “requires a connection” | Alert — not on the call screen |

## Local only (no fetch on the call path)

Situation inference, snap counter, call sheet buckets, live log, outcome tags, D-call named book (`offgrd_def_playbook_*`), O/D event stores (`offgrd_caller_events_v2` / `offgrd_dcaller_events_v2`).

Roster / invites / billing are not on the caller surface during a game.

## What “offline-complete” still is not

Airplane mode and rural no-signal are the same product requirement. v341 makes **search** use a cache. It does not make the rest of the table honest. Next silent-empty to close: `setSnapCorpus([])` must not flip `SNAP_CORPUS_READY` when the fetch is empty/failed.
