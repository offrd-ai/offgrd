-- Belt: reject a scouting_games write that shrinks rows[] or relabels week.
-- Client bugs must not be able to delete a coach's season.
--
-- REVIEW-BEFORE-APPLY. Run AFTER the Parkway North re-key/merge recovery
-- (apply-offgrd-recover-2026-08-27-parkway-north.sql) so the unique index
-- is not blocked by c3a18c94 / 0ba6a21b.
--
-- Escape hatch (session-local, recovery only):
--   SELECT set_config('offgrd.allow_shrink', 'on', true);
-- Do not grant that to the app role.

BEGIN;

CREATE OR REPLACE FUNCTION offgrd.scouting_games_refuse_shrink()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_n int;
  new_n int;
  allow text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  allow := current_setting('offgrd.allow_shrink', true);
  old_n := CASE WHEN jsonb_typeof(OLD.rows) = 'array' THEN jsonb_array_length(OLD.rows) ELSE 0 END;
  new_n := CASE WHEN jsonb_typeof(NEW.rows) = 'array' THEN jsonb_array_length(NEW.rows) ELSE 0 END;

  IF new_n < old_n AND coalesce(allow, '') NOT IN ('on', 'true', '1') THEN
    RAISE EXCEPTION 'scouting_game refuse shrink (%) % → %',
      offgrd.scouting_natural_key(OLD.opponent, OLD.week, OLD.side),
      old_n,
      new_n;
  END IF;

  IF NEW.week IS DISTINCT FROM OLD.week THEN
    RAISE EXCEPTION 'scouting_game week immutable (%) → %',
      OLD.week,
      NEW.week;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION offgrd.scouting_games_refuse_shrink() IS
  'v339: refuse rows[] shrink unless offgrd.allow_shrink=on; week is immutable once written.';

DROP TRIGGER IF EXISTS trg_scouting_games_refuse_shrink ON offgrd.scouting_games;
CREATE TRIGGER trg_scouting_games_refuse_shrink
  BEFORE UPDATE ON offgrd.scouting_games
  FOR EACH ROW
  EXECUTE FUNCTION offgrd.scouting_games_refuse_shrink();

-- Unique (team, opp, week, side) lives in the recovery script after
-- c3a18c94 is deleted. Creating it here would roll this trigger back
-- if any duplicate logical key still exists.

COMMIT;
