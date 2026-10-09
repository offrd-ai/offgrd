-- APPLIED 2026-10-09 (Parkway West) — tonight's engine soak, DB only, no pin.
-- Season blobs only. caller_games and caller_events stay.
-- Delete-trigger owns scout_snaps; both opponents had 0 snaps.
-- Natural key blocks the device from writing the same opponent|week|side back.

-- SELECT confirmed before the write:
--   59c7ba6f SOAK TEST 108 | Live 2026-10-08 | ours | 16 rows (HAMMER 1)
--   85941233 SOAK TEST ENGINE | Live 2026-10-08 | ours | 2 rows (HAMMER 1)

INSERT INTO offgrd.scouting_game_tombstones (team_id, natural_key, opponent, week, side, reason, game_id)
VALUES
  ('f7f14dc9-642f-469c-a896-0706f6631c9e', 'soak test 108|live 2026-10-08|ours', 'SOAK TEST 108', 'Live 2026-10-08', 'ours', 'junk-live-test', '59c7ba6f-d948-409c-8443-8523e6c58609'),
  ('f7f14dc9-642f-469c-a896-0706f6631c9e', 'soak test engine|live 2026-10-08|ours', 'SOAK TEST ENGINE', 'Live 2026-10-08', 'ours', 'junk-live-test', '85941233-22a0-458e-bfe5-fa1fa2d28f03')
ON CONFLICT (team_id, natural_key) DO UPDATE
SET reason = EXCLUDED.reason, game_id = EXCLUDED.game_id;

DELETE FROM offgrd.scouting_games
WHERE team_id = 'f7f14dc9-642f-469c-a896-0706f6631c9e'
  AND id IN (
    '59c7ba6f-d948-409c-8443-8523e6c58609',
    '85941233-22a0-458e-bfe5-fa1fa2d28f03'
  );
