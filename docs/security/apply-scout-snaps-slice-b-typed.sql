-- REVIEW BEFORE APPLY — Slice B typed fields on offgrd.scout_snaps.
-- Do not apply from this agent. Matt applies SQL himself.
-- upsert_scout_snap_import_v1 must pass these keys through p_snap if it
-- currently copies a fixed column list.

ALTER TABLE offgrd.scout_snaps
  ADD COLUMN IF NOT EXISTS result text,
  ADD COLUMN IF NOT EXISTS play_dir text,
  ADD COLUMN IF NOT EXISTS gap text,
  ADD COLUMN IF NOT EXISTS qtr text,
  ADD COLUMN IF NOT EXISTS defense_response text,
  ADD COLUMN IF NOT EXISTS form_tag text;

-- pass_zone and play_index and motion_type are already read by the client.
-- ADD COLUMN IF NOT EXISTS is safe if they already exist:
ALTER TABLE offgrd.scout_snaps
  ADD COLUMN IF NOT EXISTS pass_zone text,
  ADD COLUMN IF NOT EXISTS play_index integer;

COMMENT ON COLUMN offgrd.scout_snaps.defense_response IS
  'Hudl MOT ADJ / defense response. Charted-or-blank. No consumer yet.';
COMMENT ON COLUMN offgrd.scout_snaps.form_tag IS
  'Hudl FORM TAG (TIGHT, FLEXED H, …). Charted-or-blank. No inference.';
