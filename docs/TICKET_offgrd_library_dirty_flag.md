# Library push should be dirty-flag, not content compare

**Status:** queued — do not start tonight  
**Logged:** 2026-08-28 after the 22:09 / 22:19 / 22:49 `scouting_games` restamp bursts  
**v340:** canonical `scoutingRowsEqual` is a backstop. It is not the primary mechanism.

## What went wrong

`Cloud.saveGame` decided "nothing changed" by comparing two serializations of the same snaps: PostgREST jsonb parse vs `JSON.parse(localStorage)`. `JSON.stringify` compares key insertion order. Those two parses never agree, so a no-op upsert restamped `updated_at` on every game `push()` walked.

That is the fifth time tonight one value lived in two places and the client tried to derive sameness after the fact.

## What "done" looks like

A dirty flag set at mutation time.

- `fromCall`, import, Commit, Season manager edit, seed, clear: mark dirty.
- Open, hydrate, `APP.set`, focus `pull`, refold without `fromCall`: do not mark.
- `OFFGRD_SYNC` / `push()` for scout: if nothing is dirty, do not walk the library.

Canonical compare stays as a belt so a buggy dirty mark cannot restamp identical content. It must not be what decides to write.

Immune to jsonb key order, number normalize, null vs missing, and whatever the next serializer does.

## Lock

Opening a caller, calling nothing, then the 30-minute `updated_at` query: zero rows. That test is the gate. A content-equal no-op that still sends 16 upserts is not a pass.
