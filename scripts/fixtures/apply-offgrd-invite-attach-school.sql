-- CI fixture mirror of offrd docs/security/apply-offgrd-invite-attach-school.sql
-- REVIEW-BEFORE-APPLY — invite accept must not mint a personal team/school.
-- Paste into prod SQL editor. Safe to re-run (CREATE OR REPLACE).
--
-- Why: a brand-new account on an invite still hit create_owned_program +
-- create_team, then backfill_owned_orphan_team_for_coach linked that orphan
-- to a private school. school_id is immutable except service_role — accept
-- has to attach the invited team's school on the FIRST insert.
--
-- Does not recreate invites_owner_all.

CREATE OR REPLACE FUNCTION offgrd.ensure_team_school(p_team_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'offgrd', 'public'
AS $$
DECLARE
  hs uuid;
  tname text;
BEGIN
  IF p_team_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT high_school_id, name INTO hs, tname
    FROM offgrd.teams
   WHERE id = p_team_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF hs IS NOT NULL THEN
    RETURN hs;
  END IF;

  INSERT INTO public.high_schools (name, city, state, mascot)
  VALUES (coalesce(nullif(btrim(tname), ''), 'Program'), '', '', '')
  RETURNING id INTO hs;

  UPDATE offgrd.teams
     SET high_school_id = hs
   WHERE id = p_team_id
     AND high_school_id IS NULL;

  UPDATE public.high_schools
     SET offgrd_team_id = p_team_id
   WHERE id = hs
     AND (offgrd_team_id IS NULL OR offgrd_team_id = p_team_id);

  RETURN hs;
END;
$$;

CREATE OR REPLACE FUNCTION offgrd.attach_invitee_to_invited_school(p_uid uuid, p_team_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'offgrd', 'public'
AS $$
DECLARE
  hs uuid;
  v_email text;
  v_name text;
  existing uuid;
BEGIN
  IF p_uid IS NULL OR p_team_id IS NULL THEN
    RETURN NULL;
  END IF;

  hs := offgrd.ensure_team_school(p_team_id);
  IF hs IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO existing
    FROM public.high_school_coaches
   WHERE user_id = p_uid
   ORDER BY created_at ASC
   LIMIT 1;

  IF existing IS NOT NULL THEN
    RETURN hs;
  END IF;

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = p_uid;
  SELECT nullif(btrim(full_name), '') INTO v_name
    FROM offgrd.profiles WHERE id = p_uid;

  INSERT INTO public.high_school_coaches (user_id, school_id, name, email, role_title)
  VALUES (
    p_uid,
    hs,
    coalesce(v_name, nullif(split_part(coalesce(v_email, ''), '@', 1), ''), 'Coach'),
    coalesce(v_email, ''),
    'Coach'
  );

  RETURN hs;
END;
$$;

CREATE OR REPLACE FUNCTION offgrd.accept_invite(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'offgrd', 'public'
AS $$
DECLARE
  inv offgrd.invites%ROWTYPE;
  tname text;
  uid uuid;
  uemail text;
  existing_role text;
  exp_at timestamptz;
  rank_existing integer;
  rank_invited integer;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'signed_out');
  END IF;

  PERFORM offgrd.ensure_profile();

  SELECT lower(email) INTO uemail FROM auth.users WHERE id = uid;
  IF uemail IS NULL OR uemail = '' THEN
    SELECT lower(email) INTO uemail FROM offgrd.profiles WHERE id = uid;
  END IF;

  IF p_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'expired');
  END IF;

  SELECT * INTO inv FROM offgrd.invites WHERE id = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'expired');
  END IF;

  exp_at := coalesce(
    nullif(to_jsonb(inv)->>'expires_at','')::timestamptz,
    nullif(to_jsonb(inv)->>'created_at','')::timestamptz + interval '14 days'
  );
  IF exp_at IS NOT NULL AND exp_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'status', 'expired');
  END IF;

  SELECT name INTO tname FROM offgrd.teams WHERE id = inv.team_id;

  IF uemail IS NULL OR lower(inv.email) <> uemail THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'wrong_account',
      'signed_in_email', coalesce(uemail, ''),
      'invite_email_hint', regexp_replace(inv.email, '^(.).*(@.*)$', '\1***\2'),
      'team_name', coalesce(nullif(tname, ''), 'your program'),
      'role', inv.role
    );
  END IF;

  SELECT role INTO existing_role
    FROM offgrd.team_members
    WHERE team_id = inv.team_id AND user_id = uid;

  rank_existing := offgrd.role_rank(existing_role);
  rank_invited := offgrd.role_rank(inv.role);

  IF existing_role IS NOT NULL AND rank_existing >= rank_invited THEN
    PERFORM offgrd.attach_invitee_to_invited_school(uid, inv.team_id);
    DELETE FROM offgrd.invites WHERE id = inv.id;
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'already',
      'team_id', inv.team_id,
      'team_name', coalesce(nullif(tname, ''), 'your program'),
      'role', existing_role
    );
  END IF;

  INSERT INTO offgrd.team_members (team_id, user_id, role)
    VALUES (inv.team_id, uid, inv.role)
    ON CONFLICT (team_id, user_id) DO UPDATE SET role = excluded.role;

  PERFORM offgrd.attach_invitee_to_invited_school(uid, inv.team_id);

  DELETE FROM offgrd.invites WHERE id = inv.id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', CASE WHEN existing_role IS NULL THEN 'joined' ELSE 'already' END,
    'team_id', inv.team_id,
    'team_name', coalesce(nullif(tname, ''), 'your program'),
    'role', inv.role
  );
END;
$$;

CREATE OR REPLACE FUNCTION offgrd.create_team(team_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'offgrd', 'public'
AS $$
DECLARE
  tid uuid;
  hs_id uuid;
  v_email text;
  nm text;
BEGIN
  IF NOT offgrd.can_create_team() THEN
    RAISE EXCEPTION 'Only high school coaches can create a program. Players join with a team code.';
  END IF;

  nm := btrim(coalesce(team_name, ''));
  IF char_length(nm) < 3 THEN
    RAISE EXCEPTION 'Program name is too short';
  END IF;

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = auth.uid();
  IF EXISTS (
    SELECT 1 FROM offgrd.invites i
    WHERE lower(i.email) = v_email
  ) THEN
    RAISE EXCEPTION 'Join your invite instead of creating a new program';
  END IF;

  IF EXISTS (
    SELECT 1 FROM offgrd.team_members m WHERE m.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You already belong to a program';
  END IF;

  PERFORM offgrd.ensure_profile();
  SELECT school_id INTO hs_id FROM public.high_school_coaches WHERE user_id = auth.uid() LIMIT 1;
  INSERT INTO offgrd.teams (name, owner_id, join_code, high_school_id, trial_ends_at)
    VALUES (nm, auth.uid(), offgrd.gen_join_code(), hs_id, now() + interval '14 days')
    RETURNING id INTO tid;
  INSERT INTO offgrd.team_members (team_id, user_id, role) VALUES (tid, auth.uid(), 'owner');
  RETURN tid;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_owned_program(
  p_school_name text,
  p_city       text DEFAULT '',
  p_state      text DEFAULT '',
  p_coach_name text DEFAULT '',
  p_role_title text DEFAULT 'Head Coach'
)
RETURNS TABLE (school_id uuid, coach_id uuid, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, offgrd, pg_temp
AS $$
DECLARE
  v_uid             uuid := auth.uid();
  v_email           text;
  v_school_id       uuid;
  v_coach_id        uuid;
  v_existing_school uuid;
  v_existing_coach  uuid;
  v_team_id         uuid;
  v_team_hs         uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  SELECT t.id, t.high_school_id
    INTO v_team_id, v_team_hs
    FROM offgrd.team_members m
    JOIN offgrd.teams t ON t.id = m.team_id
   WHERE m.user_id = v_uid
   ORDER BY CASE WHEN t.high_school_id IS NOT NULL THEN 0 ELSE 1 END, t.created_at ASC
   LIMIT 1;

  IF v_team_id IS NULL AND v_email IS NOT NULL THEN
    SELECT i.team_id, t.high_school_id
      INTO v_team_id, v_team_hs
      FROM offgrd.invites i
      JOIN offgrd.teams t ON t.id = i.team_id
     WHERE lower(i.email) = lower(v_email)
     ORDER BY i.created_at DESC
     LIMIT 1;
  END IF;

  IF v_team_id IS NOT NULL THEN
    v_school_id := offgrd.attach_invitee_to_invited_school(v_uid, v_team_id);
    SELECT hsc.school_id, hsc.id
      INTO v_existing_school, v_existing_coach
      FROM public.high_school_coaches hsc
     WHERE hsc.user_id = v_uid
     ORDER BY hsc.created_at ASC
     LIMIT 1;
    school_id := coalesce(v_existing_school, v_school_id);
    coach_id  := v_existing_coach;
    created   := false;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT hsc.school_id, hsc.id
    INTO v_existing_school, v_existing_coach
    FROM public.high_school_coaches hsc
   WHERE hsc.user_id = v_uid
   ORDER BY hsc.created_at ASC
   LIMIT 1;

  IF v_existing_coach IS NOT NULL THEN
    school_id := v_existing_school;
    coach_id  := v_existing_coach;
    created   := false;
    RETURN NEXT;
    RETURN;
  END IF;

  IF coalesce(btrim(p_school_name), '') = '' THEN
    RAISE EXCEPTION 'school name is required' USING errcode = '22023';
  END IF;

  INSERT INTO public.high_schools (name, city, state, mascot)
  VALUES (btrim(p_school_name), btrim(coalesce(p_city, '')), btrim(coalesce(p_state, '')), '')
  RETURNING id INTO v_school_id;

  INSERT INTO public.high_school_coaches (user_id, school_id, name, email, role_title)
  VALUES (
    v_uid,
    v_school_id,
    coalesce(nullif(btrim(p_coach_name), ''), nullif(split_part(coalesce(v_email, ''), '@', 1), ''), coalesce(v_email, ''), 'Coach'),
    coalesce(v_email, ''),
    coalesce(nullif(btrim(p_role_title), ''), 'Head Coach')
  )
  RETURNING id INTO v_coach_id;

  school_id := v_school_id;
  coach_id  := v_coach_id;
  created   := true;
  RETURN NEXT;
END;
$$;
