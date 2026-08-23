-- Mirror of offgrd.role_rank in docs/security/apply-offgrd-accept-invite.sql
-- Smoke fails if an app ROLES value is missing from this CASE (would score 0).
SELECT CASE r
  WHEN 'owner' THEN 4
  WHEN 'coach_edit' THEN 3
  WHEN 'coach_view' THEN 2
  WHEN 'player' THEN 1
  ELSE 0
END;
