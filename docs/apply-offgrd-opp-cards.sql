-- Opponent scout cards — drawn cards only (shells are derived from SNAP_CORPUS).
-- Unique (team_id, opponent, shell_key). Raw signature fields persist so a
-- future shellKey change can re-match instead of orphaning drawn diagrams.
-- RLS mirrors scout_snaps: members read, can_edit writes.
-- REVIEW-BEFORE-APPLY. Paste into prod SQL editor; mark schema_migrations after.

BEGIN;

CREATE TABLE IF NOT EXISTS offgrd.offgrd_opp_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES offgrd.teams(id) ON DELETE CASCADE,
  opponent text NOT NULL,
  shell_key text NOT NULL,
  card_status text NOT NULL DEFAULT 'drawn'
    CHECK (card_status IN ('shell', 'drawn')),
  play_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  play_name text,
  formation text,
  backfield text,
  off_str text,
  play_type text,
  direction text,
  gap text,
  pass_zone text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, opponent, shell_key)
);

CREATE INDEX IF NOT EXISTS offgrd_opp_cards_team_opp_idx
  ON offgrd.offgrd_opp_cards (team_id, opponent);

COMMENT ON TABLE offgrd.offgrd_opp_cards IS
  'Drawn opponent scout cards. Shells regenerate from SNAP_CORPUS; this table is ground truth for edited diagrams.';

ALTER TABLE offgrd.offgrd_opp_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opp_cards_select ON offgrd.offgrd_opp_cards;
CREATE POLICY opp_cards_select ON offgrd.offgrd_opp_cards
  FOR SELECT TO authenticated
  USING (offgrd.is_member(team_id));

DROP POLICY IF EXISTS opp_cards_insert ON offgrd.offgrd_opp_cards;
CREATE POLICY opp_cards_insert ON offgrd.offgrd_opp_cards
  FOR INSERT TO authenticated
  WITH CHECK (offgrd.can_edit(team_id));

DROP POLICY IF EXISTS opp_cards_update ON offgrd.offgrd_opp_cards;
CREATE POLICY opp_cards_update ON offgrd.offgrd_opp_cards
  FOR UPDATE TO authenticated
  USING (offgrd.can_edit(team_id))
  WITH CHECK (offgrd.can_edit(team_id));

DROP POLICY IF EXISTS opp_cards_delete ON offgrd.offgrd_opp_cards;
CREATE POLICY opp_cards_delete ON offgrd.offgrd_opp_cards
  FOR DELETE TO authenticated
  USING (offgrd.can_edit(team_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON offgrd.offgrd_opp_cards TO authenticated;
GRANT ALL ON offgrd.offgrd_opp_cards TO service_role;
REVOKE ALL ON offgrd.offgrd_opp_cards FROM anon;

COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
SELECT '20260817000000'
WHERE NOT EXISTS (
  SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260817000000'
);

SELECT version FROM supabase_migrations.schema_migrations WHERE version = '20260817000000';
