-- REVIEW-BEFORE-APPLY — team D Caller vocabulary (one JSON blob per team).
-- FRONT / COVERAGE / BLITZ lists. Retire in the payload; never DELETE a name
-- that live snaps already stored. Members read, can_edit writes.
-- RLS mirrors offgrd_formation_map.

BEGIN;

CREATE TABLE IF NOT EXISTS offgrd.offgrd_d_vocab (
  team_id uuid PRIMARY KEY REFERENCES offgrd.teams(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE offgrd.offgrd_d_vocab IS
  'Program-scoped D Caller Step 3 vocabulary (front / coverage / blitz). One row per team. Retire in payload, never delete names.';

ALTER TABLE offgrd.offgrd_d_vocab ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS d_vocab_select ON offgrd.offgrd_d_vocab;
CREATE POLICY d_vocab_select ON offgrd.offgrd_d_vocab
  FOR SELECT TO authenticated
  USING (offgrd.is_member(team_id));

DROP POLICY IF EXISTS d_vocab_insert ON offgrd.offgrd_d_vocab;
CREATE POLICY d_vocab_insert ON offgrd.offgrd_d_vocab
  FOR INSERT TO authenticated
  WITH CHECK (offgrd.can_edit(team_id));

DROP POLICY IF EXISTS d_vocab_update ON offgrd.offgrd_d_vocab;
CREATE POLICY d_vocab_update ON offgrd.offgrd_d_vocab
  FOR UPDATE TO authenticated
  USING (offgrd.can_edit(team_id))
  WITH CHECK (offgrd.can_edit(team_id));

DROP POLICY IF EXISTS d_vocab_delete ON offgrd.offgrd_d_vocab;
CREATE POLICY d_vocab_delete ON offgrd.offgrd_d_vocab
  FOR DELETE TO authenticated
  USING (offgrd.can_edit(team_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON offgrd.offgrd_d_vocab TO authenticated;
GRANT ALL ON offgrd.offgrd_d_vocab TO service_role;
REVOKE ALL ON offgrd.offgrd_d_vocab FROM anon;

COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
SELECT '20260902000000'
WHERE NOT EXISTS (
  SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260902000000'
);

SELECT version FROM supabase_migrations.schema_migrations WHERE version = '20260902000000';
