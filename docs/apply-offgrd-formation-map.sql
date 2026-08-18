-- Program formation vocabulary — Phase B writes; nothing reads this table in Phase A.
-- Unique (team_id, raw_tag_norm, side_scope). PROGRAM-SCOPED, never global.
-- formation_family stays GENERATED on scout_snaps from off_structure — do not
-- add a family column here and do not write formation_family directly.
-- RLS mirrors offgrd_opp_cards: members read, can_edit writes.
-- REVIEW-BEFORE-APPLY. Paste into prod SQL editor; mark schema_migrations after.

BEGIN;

CREATE TABLE IF NOT EXISTS offgrd.offgrd_formation_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES offgrd.teams(id) ON DELETE CASCADE,
  raw_tag text NOT NULL,
  raw_tag_norm text NOT NULL,
  off_structure text
    CHECK (off_structure IS NULL OR off_structure IN ('2x2', '3x1', '2x1', '1x1', '4x1', '3x2')),
  off_back_count integer,
  off_personnel text,
  side_scope text NOT NULL DEFAULT 'both'
    CHECK (side_scope IN ('off', 'def', 'both')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, raw_tag_norm, side_scope)
);

CREATE INDEX IF NOT EXISTS offgrd_formation_map_team_norm_idx
  ON offgrd.offgrd_formation_map (team_id, raw_tag_norm);

COMMENT ON TABLE offgrd.offgrd_formation_map IS
  'Program-scoped raw formation tag → structure map. Phase B writes; Phase C reads. Never global.';

ALTER TABLE offgrd.offgrd_formation_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS formation_map_select ON offgrd.offgrd_formation_map;
CREATE POLICY formation_map_select ON offgrd.offgrd_formation_map
  FOR SELECT TO authenticated
  USING (offgrd.is_member(team_id));

DROP POLICY IF EXISTS formation_map_insert ON offgrd.offgrd_formation_map;
CREATE POLICY formation_map_insert ON offgrd.offgrd_formation_map
  FOR INSERT TO authenticated
  WITH CHECK (offgrd.can_edit(team_id));

DROP POLICY IF EXISTS formation_map_update ON offgrd.offgrd_formation_map;
CREATE POLICY formation_map_update ON offgrd.offgrd_formation_map
  FOR UPDATE TO authenticated
  USING (offgrd.can_edit(team_id))
  WITH CHECK (offgrd.can_edit(team_id));

DROP POLICY IF EXISTS formation_map_delete ON offgrd.offgrd_formation_map;
CREATE POLICY formation_map_delete ON offgrd.offgrd_formation_map
  FOR DELETE TO authenticated
  USING (offgrd.can_edit(team_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON offgrd.offgrd_formation_map TO authenticated;
GRANT ALL ON offgrd.offgrd_formation_map TO service_role;
REVOKE ALL ON offgrd.offgrd_formation_map FROM anon;

COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
SELECT '20260818000000'
WHERE NOT EXISTS (
  SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260818000000'
);

SELECT version FROM supabase_migrations.schema_migrations WHERE version = '20260818000000';
