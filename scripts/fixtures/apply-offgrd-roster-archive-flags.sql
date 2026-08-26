-- CI fixture mirror of offrd docs/security/apply-offgrd-roster-archive-flags.sql
-- REVIEW-BEFORE-APPLY — team_roster carries archive + class year.
-- Graduates/archived players stay on the team; the Program roster
-- parks them in a bottom section. Paste after display-name-by-role.
-- DROP is required: adding return columns changes the signature.

DROP FUNCTION IF EXISTS public.offgrd_team_roster(uuid);
DROP FUNCTION IF EXISTS offgrd.team_roster(uuid);

CREATE OR REPLACE FUNCTION offgrd.team_roster(t uuid)
RETURNS TABLE(
  user_id uuid,
  email text,
  full_name text,
  role text,
  "position" text,
  positions text[],
  archived_at timestamptz,
  graduation_year integer
)
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
    m.positions,
    pl.archived_at,
    pl.graduation_year
  FROM offgrd.team_members m
  LEFT JOIN offgrd.profiles p ON p.id = m.user_id
  LEFT JOIN public.high_school_coaches hsc ON hsc.user_id = m.user_id
  LEFT JOIN auth.users u ON u.id = m.user_id
  LEFT JOIN LATERAL (
    SELECT pl2.archived_at, pl2.graduation_year
    FROM public.players pl2
    WHERE pl2.user_id = m.user_id
       OR (
         coalesce(p.email, u.email) IS NOT NULL
         AND pl2.email IS NOT NULL
         AND lower(pl2.email) = lower(coalesce(p.email, u.email))
       )
       OR (
         m.role = 'player'
         AND nullif(btrim(coalesce(p.full_name, '')), '') IS NOT NULL
         AND lower(btrim(coalesce(pl2.first_name, '')) || ' ' || btrim(coalesce(pl2.last_name, '')))
             = lower(btrim(p.full_name))
       )
    ORDER BY
      CASE
        WHEN pl2.user_id = m.user_id THEN 0
        WHEN pl2.email IS NOT NULL
             AND lower(pl2.email) = lower(coalesce(p.email, u.email)) THEN 1
        ELSE 2
      END
    LIMIT 1
  ) pl ON true
  WHERE m.team_id = t AND offgrd.is_member(t)
  ORDER BY (m.role = 'owner') DESC, coalesce(p.email, u.email);
$$;

CREATE OR REPLACE FUNCTION public.offgrd_team_roster(t uuid)
RETURNS TABLE(
  user_id uuid,
  email text,
  full_name text,
  role text,
  "position" text,
  positions text[],
  archived_at timestamptz,
  graduation_year integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'offgrd', 'public'
AS $$
  SELECT * FROM offgrd.team_roster(t);
$$;

REVOKE ALL ON FUNCTION public.offgrd_team_roster(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.offgrd_team_roster(uuid) TO authenticated, service_role;
