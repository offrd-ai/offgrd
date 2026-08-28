-- Re-key + merge Friday 2026-08-27 Parkway North live games.
-- REVIEW ONLY. Order: v339 on every device → refuse-shrink trigger → this
-- dry-run → read the counts → uncomment writes → unique index last.
-- Recovery does not shrink rows[]. The trigger must already be in.
-- The previous version of this file rebuilt 39+37 snaps. That is obsolete —
-- defense already holds 39 through the fixed fold. This file only re-keys and
-- collapses the duplicate ours row.
--
-- Backup offgrd.scouting_games_backup_20260828 (28 rows) was taken AFTER the
-- damage. It is a floor, not a restore point. Do not drop it.
--
-- Team: f7f14dc9-642f-469c-a896-0706f6631c9e
--
--   d510cfa3  off   Live 2026-08-28 · 39  →  re-key to Live 2026-08-27
--                                          restamp per-play date to 2026-08-27
--   0ba6a21b  ours  Live 2026-08-28 · 1   →  absorb c3a18c94, delete duplicate,
--                                          re-key to Live 2026-08-27
--   c3a18c94-e0c4-4c3d-bfb5-792b03aa6c69  ours  Live 2026-08-28 · 1
--                                          identical content, duplicate key
--
-- HOUSTON 9c3244ab and MEMPHIS 22d64ab3 are gone. Do not fabricate them.
--
-- Dry-run prints counts. Writes stay commented. ROLLBACK at the bottom.

BEGIN;

-- ========== DRY-RUN PREVIEW ==========

SELECT 'do_not_drop_backup' AS which, count(*) AS n
  FROM offgrd.scouting_games_backup_20260828;

SELECT 'defense_now' AS which, id, side, week, jsonb_array_length(rows) AS rows_n,
       (SELECT count(*) FROM jsonb_array_elements(rows) r WHERE r->>'date' = '2026-08-27') AS dated_27,
       (SELECT count(*) FROM jsonb_array_elements(rows) r WHERE r->>'date' = '2026-08-28') AS dated_28
  FROM offgrd.scouting_games
 WHERE id = 'd510cfa3-f83e-4767-807e-b498ee709931';

SELECT 'ours_pair' AS which, id, side, week, jsonb_array_length(rows) AS rows_n,
       (SELECT string_agg(r->>'callId', ',') FROM jsonb_array_elements(rows) r) AS call_ids
  FROM offgrd.scouting_games
 WHERE team_id = 'f7f14dc9-642f-469c-a896-0706f6631c9e'
   AND (
         id = '0ba6a21b-e85b-4c34-91fd-bc8e61dccbcc'
      OR id = 'c3a18c94-e0c4-4c3d-bfb5-792b03aa6c69'
   )
 ORDER BY id;

SELECT 'logical_dups' AS which, opponent, week, side, count(*) AS n, array_agg(id) AS ids
  FROM offgrd.scouting_games
 WHERE team_id = 'f7f14dc9-642f-469c-a896-0706f6631c9e'
 GROUP BY opponent, week, side
HAVING count(*) > 1;

-- Historical vs post-damage backup. Backup cannot prove a pre-clobber count;
-- it can only flag live rows that are now shorter than the floor.
SELECT 'historical_vs_backup' AS which,
       l.id, l.opponent, l.week, l.side,
       jsonb_array_length(COALESCE(l.rows, '[]'::jsonb)) AS live_n,
       jsonb_array_length(COALESCE(b.rows, '[]'::jsonb)) AS backup_n,
       l.updated_at
  FROM offgrd.scouting_games l
  LEFT JOIN offgrd.scouting_games_backup_20260828 b ON b.id = l.id
 WHERE l.team_id = 'f7f14dc9-642f-469c-a896-0706f6631c9e'
   AND l.id NOT IN (
         'd510cfa3-f83e-4767-807e-b498ee709931',
         '0ba6a21b-e85b-4c34-91fd-bc8e61dccbcc'
       )
   AND l.id <> 'c3a18c94-e0c4-4c3d-bfb5-792b03aa6c69'
 ORDER BY l.opponent, l.week, l.side;

-- ========== WRITES (leave commented for dry-run) ==========
-- Uncomment after the preview looks right, then COMMIT.
-- If anything is off: ROLLBACK;

-- 1. Defense: re-key week + restore per-play date. Do not replace rows[].
-- UPDATE offgrd.scouting_games g
--    SET week = 'Live 2026-08-27',
--        rows = (
--          SELECT coalesce(jsonb_agg(
--                   jsonb_set(
--                     jsonb_set(elem, '{date}', '"2026-08-27"'),
--                     '{gameWeek}', '"Live 2026-08-27"'
--                   )
--                   ORDER BY ordinality),
--                 '[]'::jsonb)
--            FROM jsonb_array_elements(g.rows) WITH ORDINALITY AS t(elem, ordinality)
--        ),
--        updated_at = now()
--  WHERE g.id = 'd510cfa3-f83e-4767-807e-b498ee709931'
--    AND g.team_id = 'f7f14dc9-642f-469c-a896-0706f6631c9e'
--    AND g.side = 'off'
--    AND jsonb_array_length(g.rows) = 39;

-- 2. Merge duplicate ours into 0ba6a21b by callId, then re-key.
-- WITH dup AS (
--   SELECT rows
--     FROM offgrd.scouting_games
--    WHERE team_id = 'f7f14dc9-642f-469c-a896-0706f6631c9e'
--      AND id = 'c3a18c94-e0c4-4c3d-bfb5-792b03aa6c69'
--    LIMIT 1
-- )
-- UPDATE offgrd.scouting_games g
--    SET week = 'Live 2026-08-27',
--        rows = (
--          SELECT coalesce(jsonb_agg(x.row ORDER BY x.ord), '[]'::jsonb)
--            FROM (
--              SELECT e.row,
--                     e.ordinality AS ord
--                FROM jsonb_array_elements(g.rows) WITH ORDINALITY AS e(row, ordinality)
--              UNION
--              SELECT d.row,
--                     1000 + d.ordinality
--                FROM dup, jsonb_array_elements(dup.rows) WITH ORDINALITY AS d(row, ordinality)
--               WHERE NOT EXISTS (
--                 SELECT 1
--                   FROM jsonb_array_elements(g.rows) e
--                  WHERE e->>'callId' IS NOT NULL
--                    AND e->>'callId' = d.row->>'callId'
--               )
--            ) x
--        ),
--        updated_at = now()
--  WHERE g.id = '0ba6a21b-e85b-4c34-91fd-bc8e61dccbcc'
--    AND g.team_id = 'f7f14dc9-642f-469c-a896-0706f6631c9e'
--    AND g.side = 'ours';

-- 3. Re-stamp play date / gameWeek on the kept ours row.
-- UPDATE offgrd.scouting_games g
--    SET rows = (
--          SELECT coalesce(jsonb_agg(
--                   jsonb_set(
--                     jsonb_set(elem, '{date}', '"2026-08-27"'),
--                     '{gameWeek}', '"Live 2026-08-27"'
--                   )
--                   ORDER BY ordinality),
--                 '[]'::jsonb)
--            FROM jsonb_array_elements(g.rows) WITH ORDINALITY AS t(elem, ordinality)
--        )
--  WHERE g.id = '0ba6a21b-e85b-4c34-91fd-bc8e61dccbcc'
--    AND g.team_id = 'f7f14dc9-642f-469c-a896-0706f6631c9e';

-- 4. Delete the duplicate logical key.
-- DELETE FROM offgrd.scouting_games
--  WHERE team_id = 'f7f14dc9-642f-469c-a896-0706f6631c9e'
--    AND id = 'c3a18c94-e0c4-4c3d-bfb5-792b03aa6c69';

-- After a write: check rowcount, then
--   SELECT id, week, side, jsonb_array_length(rows)
--     FROM offgrd.scouting_games
--    WHERE id IN (
--          'd510cfa3-f83e-4767-807e-b498ee709931',
--          '0ba6a21b-e85b-4c34-91fd-bc8e61dccbcc'
--        )
--       OR id = 'c3a18c94-e0c4-4c3d-bfb5-792b03aa6c69';
-- Expect: d510cfa3 Live 2026-08-27 off 39; 0ba6a21b Live 2026-08-27 ours 1; no c3a18c94.

-- 5. One logical key. Apply after the delete, and only if logical_dups is empty.
-- CREATE UNIQUE INDEX IF NOT EXISTS scouting_games_team_logical_key_uidx
--   ON offgrd.scouting_games (
--     team_id,
--     lower(trim(coalesce(opponent, ''))),
--     lower(trim(coalesce(week, ''))),
--     side
--   );

ROLLBACK;
-- COMMIT;  -- only after uncommenting the writes and reading the preview
