-- REVIEW-BEFORE-APPLY — d_vocab v2 (v1 already stamped 20260902000000).
-- Hardening only. No rewrite. Retire stays in the payload.
-- (1) authenticated cannot DELETE (service_role only)
-- (2) BEFORE UPDATE → offgrd.touch_updated_at() (same as formation_map / plays)
-- (3) trial trg_assert_write_access (same as other write tables)
-- (4) payload must be a JSON object
-- schema_migrations INSERT is inside this transaction.

BEGIN;

SELECT polname, polcmd
FROM pg_policy
WHERE polrelid = 'offgrd.offgrd_d_vocab'::regclass
ORDER BY polname;

SELECT privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'offgrd'
  AND table_name = 'offgrd_d_vocab'
  AND grantee = 'authenticated'
ORDER BY privilege_type;

DROP POLICY IF EXISTS d_vocab_delete ON offgrd.offgrd_d_vocab;
REVOKE DELETE ON offgrd.offgrd_d_vocab FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON offgrd.offgrd_d_vocab TO authenticated;
GRANT ALL ON offgrd.offgrd_d_vocab TO service_role;

ALTER TABLE offgrd.offgrd_d_vocab
  DROP CONSTRAINT IF EXISTS offgrd_d_vocab_payload_object;
ALTER TABLE offgrd.offgrd_d_vocab
  ADD CONSTRAINT offgrd_d_vocab_payload_object
  CHECK (jsonb_typeof(payload) = 'object');

DROP TRIGGER IF EXISTS trg_touch_d_vocab ON offgrd.offgrd_d_vocab;
CREATE TRIGGER trg_touch_d_vocab
  BEFORE UPDATE ON offgrd.offgrd_d_vocab
  FOR EACH ROW EXECUTE FUNCTION offgrd.touch_updated_at();

DROP TRIGGER IF EXISTS trg_assert_write_access ON offgrd.offgrd_d_vocab;
CREATE TRIGGER trg_assert_write_access
  BEFORE INSERT OR UPDATE ON offgrd.offgrd_d_vocab
  FOR EACH ROW EXECUTE FUNCTION offgrd.trg_assert_write_access();

SELECT polname, polcmd
FROM pg_policy
WHERE polrelid = 'offgrd.offgrd_d_vocab'::regclass
ORDER BY polname;
-- expect no polcmd = 'd'

SELECT tgname
FROM pg_trigger
WHERE tgrelid = 'offgrd.offgrd_d_vocab'::regclass
  AND NOT tgisinternal
ORDER BY tgname;
-- expect trg_touch_d_vocab, trg_assert_write_access

INSERT INTO supabase_migrations.schema_migrations (version)
SELECT '20260902010000'
WHERE NOT EXISTS (
  SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260902010000'
);

SELECT version FROM supabase_migrations.schema_migrations WHERE version = '20260902010000';

COMMIT; -- or ROLLBACK;
