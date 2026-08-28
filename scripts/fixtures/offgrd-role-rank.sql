-- Mirror of offgrd.role_rank CASE arms in apply-offgrd-accept-invite.sql
-- (accept + invites RLS snapshot). Parameter name there is p_role, not r.
-- Smoke fails if an app ROLES value is missing from this CASE (would score 0).
SELECT CASE r
  WHEN 'owner' THEN 4
  WHEN 'coach_edit' THEN 3
  WHEN 'coach_view' THEN 2
  WHEN 'player' THEN 1
  ELSE 0
END;
