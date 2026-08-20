-- REVIEW BEFORE APPLY — Slice B typed fields + import RPC pass-through.
-- Do not apply from this agent. Matt applies SQL himself.
--
-- Apply BEFORE pushing v307 client code. Safe either order:
--   SQL first (this plan): new columns nullable; new RPC reads keys the
--   current client does not send yet → those columns stay NULL. Existing
--   payload keys keep the same mapping. No 400.
--   Code first: old RPC has a fixed INSERT list, so extra jsonb keys are
--   silently dropped (not 400). That is why this file replaces the RPC.
--
-- Source of the function body: docs/security/apply-auto-scout-import-v1.sql
-- (same signature: upsert_scout_snap_import_v1(jsonb) → uuid).
-- motion_response stays the existing column; MOT ADJ also lands on
-- defense_response. Same charted value is dual-written so neither name is lost.

BEGIN;

ALTER TABLE offgrd.scout_snaps
  ADD COLUMN IF NOT EXISTS result text,
  ADD COLUMN IF NOT EXISTS play_dir text,
  ADD COLUMN IF NOT EXISTS gap text,
  ADD COLUMN IF NOT EXISTS qtr text,
  ADD COLUMN IF NOT EXISTS defense_response text,
  ADD COLUMN IF NOT EXISTS form_tag text,
  ADD COLUMN IF NOT EXISTS pass_zone text,
  ADD COLUMN IF NOT EXISTS play_index integer;

COMMENT ON COLUMN offgrd.scout_snaps.defense_response IS
  'Hudl MOT ADJ / defense response. Charted-or-blank. Dual-written to motion_response.';
COMMENT ON COLUMN offgrd.scout_snaps.form_tag IS
  'Hudl FORM TAG (TIGHT, FLEXED H, …). Charted-or-blank. No inference.';

CREATE OR REPLACE FUNCTION offgrd.upsert_scout_snap_import_v1(p_snap jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'offgrd', 'public'
AS $$
DECLARE
  v_team uuid;
  v_id uuid;
  v_batch uuid;
  v_idx integer;
  v_motion text;
  v_pers text;
  v_def_resp text;
BEGIN
  v_team := (p_snap->>'team_id')::uuid;
  IF v_team IS NULL THEN
    RAISE EXCEPTION 'team_id required';
  END IF;
  IF NOT offgrd.can_edit(v_team) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF coalesce(p_snap->>'contract_version', '') <> 'v1' THEN
    RAISE EXCEPTION 'formation contract mismatch';
  END IF;

  v_batch := NULLIF(p_snap->>'import_batch_id', '')::uuid;
  v_idx   := offgrd._as_smallint(p_snap->>'snap_index');
  IF v_batch IS NULL OR v_idx IS NULL THEN
    RAISE EXCEPTION 'import_batch_id+snap_index required';
  END IF;

  -- Assist empty Motion Direction = affirmatively no motion (human-path semantics).
  v_motion := coalesce(
    NULLIF(btrim(coalesce(p_snap#>>'{motion,motion_type}', p_snap->>'motion_type', '')), ''),
    'none'
  );

  v_pers := NULLIF(btrim(coalesce(p_snap->>'off_personnel', '')), '');
  IF v_pers IS NOT NULL AND (v_pers !~ '^\d{2}$' OR v_pers::int > 22) THEN
    v_pers := NULL;
  END IF;

  v_def_resp := NULLIF(btrim(coalesce(
    p_snap->>'defense_response',
    p_snap#>>'{motion,defense_response}',
    ''
  )), '');

  INSERT INTO offgrd.scout_snaps (
    team_id, import_batch_id, snap_index,
    opponent, opponent_id, week, week_plan_id, side,
    down, distance, field_zone, hash, coverage, front, pressure,
    play, play_type, gain, success,
    off_structure, off_back_count, off_personnel, off_strength,
    motion_type, motion_changes_structure, motion_post_structure, motion_response,
    formation, formation_id, contract_version,
    tag_source, raw, updated_at,
    result, play_dir, gap, qtr, defense_response, form_tag, pass_zone, play_index
  ) VALUES (
    v_team,
    v_batch,
    v_idx,
    p_snap->>'opponent',
    NULLIF(p_snap->>'opponent_id', '')::uuid,
    p_snap->>'week',
    NULLIF(p_snap->>'week_plan_id', '')::uuid,
    p_snap->>'side',
    offgrd._as_smallint(p_snap->>'down'),
    offgrd._as_smallint(p_snap->>'distance'),
    p_snap->>'field_zone',
    p_snap->>'hash',
    p_snap->>'coverage',
    p_snap->>'front',
    p_snap->>'pressure',
    p_snap->>'play',
    p_snap->>'play_type',
    offgrd._as_numeric(p_snap->>'gain'),
    offgrd._as_bool(p_snap->>'success'),
    offgrd.normalize_off_structure(p_snap->>'off_structure'),
    offgrd._as_smallint(p_snap->>'off_back_count'),
    v_pers,
    offgrd.normalize_off_strength(p_snap->>'off_strength'),
    v_motion,
    (p_snap#>>'{motion,changes_structure}')::boolean,
    p_snap#>>'{motion,post_structure}',
    v_def_resp,
    coalesce(p_snap->>'raw_formation_label', p_snap->>'formation'),
    NULLIF(p_snap->>'formation_id', ''),
    'v1',
    'import',
    p_snap->'raw',
    now(),
    NULLIF(btrim(coalesce(p_snap->>'result', '')), ''),
    NULLIF(btrim(coalesce(p_snap->>'play_dir', '')), ''),
    NULLIF(btrim(coalesce(p_snap->>'gap', '')), ''),
    NULLIF(btrim(coalesce(p_snap->>'qtr', '')), ''),
    v_def_resp,
    NULLIF(btrim(coalesce(p_snap->>'form_tag', '')), ''),
    NULLIF(btrim(coalesce(p_snap->>'pass_zone', '')), ''),
    offgrd._as_numeric(p_snap->>'play_index')::integer
  )
  ON CONFLICT (import_batch_id, snap_index) WHERE import_batch_id IS NOT NULL
  DO UPDATE SET
    opponent      = EXCLUDED.opponent,
    opponent_id   = EXCLUDED.opponent_id,
    week          = EXCLUDED.week,
    week_plan_id  = EXCLUDED.week_plan_id,
    side          = EXCLUDED.side,
    down          = EXCLUDED.down,
    distance      = EXCLUDED.distance,
    field_zone    = EXCLUDED.field_zone,
    hash          = EXCLUDED.hash,
    coverage      = EXCLUDED.coverage,
    front         = EXCLUDED.front,
    pressure      = EXCLUDED.pressure,
    play          = EXCLUDED.play,
    play_type     = EXCLUDED.play_type,
    gain          = EXCLUDED.gain,
    success       = EXCLUDED.success,
    off_structure = EXCLUDED.off_structure,
    off_back_count = EXCLUDED.off_back_count,
    off_personnel = EXCLUDED.off_personnel,
    off_strength  = EXCLUDED.off_strength,
    motion_type   = EXCLUDED.motion_type,
    motion_changes_structure = EXCLUDED.motion_changes_structure,
    motion_post_structure    = EXCLUDED.motion_post_structure,
    motion_response          = EXCLUDED.motion_response,
    formation     = EXCLUDED.formation,
    formation_id  = EXCLUDED.formation_id,
    raw           = EXCLUDED.raw,
    tag_source    = 'import',
    updated_at    = now(),
    result        = EXCLUDED.result,
    play_dir      = EXCLUDED.play_dir,
    gap           = EXCLUDED.gap,
    qtr           = EXCLUDED.qtr,
    defense_response = EXCLUDED.defense_response,
    form_tag      = EXCLUDED.form_tag,
    pass_zone     = EXCLUDED.pass_zone,
    play_index    = EXCLUDED.play_index
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION offgrd.upsert_scout_snap_import_v1(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION offgrd.upsert_scout_snap_import_v1(jsonb)
  TO authenticated, service_role;

COMMIT;
