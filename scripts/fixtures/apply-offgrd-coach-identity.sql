-- CI fixture mirror of offrd docs/security/apply-offgrd-coach-identity.sql
-- REVIEW-BEFORE-APPLY — coach display identity (one slice).
-- Paste into prod SQL editor. Safe to re-run.
--
-- Why: invitees have no offgrd.profiles row, so team_roster INNER JOIN
-- hides them or falls back to email; create_owned_program stored the
-- email local part as high_school_coaches.name. setMyName UPDATE 0 rows.

CREATE OR REPLACE FUNCTION offgrd.format_email_local_name(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN split_part(lower(btrim(coalesce(p_email, ''))), '@', 1) ~ '[._-]'
      THEN initcap(replace(replace(replace(
        split_part(lower(btrim(p_email)), '@', 1), '.', ' '), '_', ' '), '-', ' '))
    ELSE NULL
  END;
$$;

DROP FUNCTION IF EXISTS offgrd.display_coach_name(text, text, text);
CREATE OR REPLACE FUNCTION offgrd.display_coach_name(p_full_name text, p_hsc_name text, p_email text, p_role text DEFAULT NULL)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(
    nullif(btrim(p_full_name), ''),
    CASE
      WHEN p_hsc_name IS NULL OR btrim(p_hsc_name) = '' THEN NULL
      WHEN p_email IS NOT NULL
           AND lower(btrim(p_hsc_name)) = lower(split_part(p_email, '@', 1))
        THEN NULL
      WHEN btrim(p_hsc_name) ~ '\s' THEN btrim(p_hsc_name)
      ELSE NULL
    END,
    offgrd.format_email_local_name(p_email),
    CASE WHEN p_role = 'player' THEN 'Player' ELSE 'Coach' END
  );
$$;

CREATE OR REPLACE FUNCTION offgrd.set_my_name(n text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'offgrd', 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  nm text := btrim(coalesce(n, ''));
  v_email text;
  has_member boolean;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'signed_out');
  END IF;
  IF char_length(nm) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_required');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM offgrd.team_members m WHERE m.user_id = uid
  ) INTO has_member;
  IF NOT has_member THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_member');
  END IF;

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = uid;
  INSERT INTO offgrd.profiles (id, email, full_name)
  VALUES (uid, coalesce(v_email, ''), nm)
  ON CONFLICT (id) DO UPDATE
    SET full_name = excluded.full_name,
        email = coalesce(nullif(excluded.email, ''), offgrd.profiles.email);

  UPDATE public.high_school_coaches
     SET name = nm
   WHERE user_id = uid;

  RETURN jsonb_build_object('ok', true, 'full_name', nm);
END;
$$;

CREATE OR REPLACE FUNCTION public.offgrd_set_my_name(n text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'offgrd'
AS $$
  SELECT offgrd.set_my_name(n);
$$;

REVOKE ALL ON FUNCTION public.offgrd_set_my_name(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.offgrd_set_my_name(text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.offgrd_team_roster(uuid);
DROP FUNCTION IF EXISTS offgrd.team_roster(uuid);

CREATE OR REPLACE FUNCTION offgrd.team_roster(t uuid)
RETURNS TABLE(user_id uuid, email text, full_name text, role text, "position" text, positions text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'offgrd', 'public'
AS $$
  SELECT
    m.user_id,
    coalesce(p.email, u.email) AS email,
    offgrd.display_coach_name(p.full_name, hsc.name, coalesce(p.email, u.email), m.role) AS full_name,
    m.role,
    m."position",
    m.positions
  FROM offgrd.team_members m
  LEFT JOIN offgrd.profiles p ON p.id = m.user_id
  LEFT JOIN public.high_school_coaches hsc ON hsc.user_id = m.user_id
  LEFT JOIN auth.users u ON u.id = m.user_id
  WHERE m.team_id = t AND offgrd.is_member(t)
  ORDER BY (m.role = 'owner') DESC, coalesce(p.email, u.email);
$$;

CREATE OR REPLACE FUNCTION public.offgrd_team_roster(t uuid)
RETURNS TABLE(user_id uuid, email text, full_name text, role text, "position" text, positions text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'offgrd', 'public'
AS $$
  SELECT * FROM offgrd.team_roster(t);
$$;

REVOKE ALL ON FUNCTION public.offgrd_team_roster(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.offgrd_team_roster(uuid) TO authenticated, service_role;

INSERT INTO offgrd.profiles (id, email, full_name)
SELECT u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', '')
FROM offgrd.team_members m
JOIN auth.users u ON u.id = m.user_id
WHERE NOT EXISTS (SELECT 1 FROM offgrd.profiles p WHERE p.id = m.user_id)
ON CONFLICT (id) DO NOTHING;
