-- Local test data only (dev-setup §3): you, Jane, Mark, Priya.
-- Sign in locally as me@example.test via magic link (Mailpit, localhost:54324).
--
-- The auth.users trigger creates the "You" (is_self) person, so it isn't inserted here.

-- Auth user ---------------------------------------------------------------------
-- Token columns are set to '' because GoTrue cannot scan NULLs in them.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'me@example.test', '',
  now(), '{"provider":"email","providers":["email"]}', '{}',
  now(), now(),
  '', '', '', ''
);

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'email',
  '{"sub":"00000000-0000-4000-8000-000000000001","email":"me@example.test","email_verified":true}',
  now(), now(), now()
);

-- People ------------------------------------------------------------------------
insert into public.people (id, owner_id, name, is_self) values
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Jane',  false),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Mark',  false),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'Priya', false);

-- Constraints -------------------------------------------------------------------
insert into public.constraints (person_id, tag) values
  ('10000000-0000-4000-8000-000000000002', 'no_pork'),
  ('10000000-0000-4000-8000-000000000003', 'allergy_peanut'),
  ('10000000-0000-4000-8000-000000000004', 'vegetarian');

-- Stated cuisine preferences ----------------------------------------------------
insert into public.cuisine_prefs (person_id, cuisine, stated_score)
select id, v.cuisine, v.stated_score
from public.people,
  (values ('japanese', 1), ('korean', 0)) as v (cuisine, stated_score)
where owner_id = '00000000-0000-4000-8000-000000000001' and is_self;

insert into public.cuisine_prefs (person_id, cuisine, stated_score) values
  ('10000000-0000-4000-8000-000000000002', 'thai',      1),
  ('10000000-0000-4000-8000-000000000002', 'indian',   -1),
  ('10000000-0000-4000-8000-000000000003', 'italian',   1),
  ('10000000-0000-4000-8000-000000000004', 'indian',    1),
  ('10000000-0000-4000-8000-000000000004', 'japanese',  0);
