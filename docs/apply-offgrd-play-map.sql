-- Program play-call vocabulary — Slice 2 own-offense Magic 3.
-- Unique (team_id, raw_call_norm). PROGRAM-SCOPED, never global.
-- family is required; concept is the grouped stem (or the call name when ungrouped);
-- play_id is set ONLY when the coach explicitly links an existing playbook play.
-- RLS mirrors offgrd_opp_cards: members read, can_edit writes.
-- REVIEW-BEFORE-APPLY. Paste into prod SQL editor; mark schema_migrations after.
-- Do not apply from the agent.

BEGIN;

CREATE TABLE IF NOT EXISTS offgrd.offgrd_play_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES offgrd.teams(id) ON DELETE CASCADE,
  raw_call text NOT NULL,
  raw_call_norm text NOT NULL,
  family text NOT NULL,
  concept text,
  play_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, raw_call_norm)
);

CREATE INDEX IF NOT EXISTS offgrd_play_map_team_norm_idx
  ON offgrd.offgrd_play_map (team_id, raw_call_norm);

COMMENT ON TABLE offgrd.offgrd_play_map IS
  'Program-scoped raw call name → family/concept map. play_id only when the coach links a book play.';

ALTER TABLE offgrd.offgrd_play_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS play_map_select ON offgrd.offgrd_play_map;
CREATE POLICY play_map_select ON offgrd.offgrd_play_map
  FOR SELECT TO authenticated
  USING (offgrd.is_member(team_id));

DROP POLICY IF EXISTS play_map_insert ON offgrd.offgrd_play_map;
CREATE POLICY play_map_insert ON offgrd.offgrd_play_map
  FOR INSERT TO authenticated
  WITH CHECK (offgrd.can_edit(team_id));

DROP POLICY IF EXISTS play_map_update ON offgrd.offgrd_play_map;
CREATE POLICY play_map_update ON offgrd.offgrd_play_map
  FOR UPDATE TO authenticated
  USING (offgrd.can_edit(team_id))
  WITH CHECK (offgrd.can_edit(team_id));

DROP POLICY IF EXISTS play_map_delete ON offgrd.offgrd_play_map;
CREATE POLICY play_map_delete ON offgrd.offgrd_play_map
  FOR DELETE TO authenticated
  USING (offgrd.can_edit(team_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON offgrd.offgrd_play_map TO authenticated;
GRANT ALL ON offgrd.offgrd_play_map TO service_role;
REVOKE ALL ON offgrd.offgrd_play_map FROM anon;

COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
SELECT '20260819000000'
WHERE NOT EXISTS (
  SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260819000000'
);

SELECT version FROM supabase_migrations.schema_migrations WHERE version = '20260819000000';
