-- People, their hard constraints and cuisine preferences (brief, Data Model).
-- Top-level tables are owned via owner_id; child tables check ownership through people.

-- Extensions ------------------------------------------------------------------
-- vector: meal_items.embedding (task 3). cube + earthdistance: ll_to_earth radius
-- index on places (task 3). Installed in the extensions schema per Supabase
-- convention, so later migrations must schema-qualify, e.g. extensions.ll_to_earth().
create extension if not exists vector with schema extensions;
create extension if not exists cube with schema extensions;
create extension if not exists earthdistance with schema extensions;

-- Shared trigger function -----------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- people ----------------------------------------------------------------------
create table public.people (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (name = btrim(name) and name <> ''),
  is_self boolean not null default false,
  created_at timestamptz not null default now()
);

create index people_owner_id_idx on public.people (owner_id);

-- At most one self row per user; the auth trigger (task 5) creates it.
create unique index people_one_self_per_owner_idx on public.people (owner_id) where is_self;

alter table public.people enable row level security;
revoke all on public.people from anon;

create policy "people: owner can select" on public.people
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "people: owner can insert" on public.people
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "people: owner can update" on public.people
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "people: owner can delete" on public.people
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- constraints -----------------------------------------------------------------
-- tag is open-ended (e.g. allergy_peanut), so a format check rather than an enum.
create table public.constraints (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  tag text not null check (tag ~ '^[a-z][a-z0-9_]*$'),
  unique (person_id, tag)
);

alter table public.constraints enable row level security;
revoke all on public.constraints from anon;

create policy "constraints: owner can select" on public.constraints
  for select to authenticated
  using (exists (
    select 1 from public.people p
    where p.id = person_id and p.owner_id = (select auth.uid())
  ));

create policy "constraints: owner can insert" on public.constraints
  for insert to authenticated
  with check (exists (
    select 1 from public.people p
    where p.id = person_id and p.owner_id = (select auth.uid())
  ));

create policy "constraints: owner can update" on public.constraints
  for update to authenticated
  using (exists (
    select 1 from public.people p
    where p.id = person_id and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.people p
    where p.id = person_id and p.owner_id = (select auth.uid())
  ));

create policy "constraints: owner can delete" on public.constraints
  for delete to authenticated
  using (exists (
    select 1 from public.people p
    where p.id = person_id and p.owner_id = (select auth.uid())
  ));

-- cuisine_prefs ---------------------------------------------------------------
-- stated_score is null when a preference is only inferred by the nightly job.
create table public.cuisine_prefs (
  person_id uuid not null references public.people (id) on delete cascade,
  cuisine text not null check (cuisine = lower(btrim(cuisine)) and cuisine <> ''),
  stated_score smallint check (stated_score in (-1, 0, 1)),
  inferred_score real check (inferred_score between 0 and 1),
  n_obs integer not null default 0 check (n_obs >= 0),
  updated_at timestamptz not null default now(),
  primary key (person_id, cuisine)
);

create trigger cuisine_prefs_set_updated_at
  before update on public.cuisine_prefs
  for each row execute function public.set_updated_at();

alter table public.cuisine_prefs enable row level security;
revoke all on public.cuisine_prefs from anon;

create policy "cuisine_prefs: owner can select" on public.cuisine_prefs
  for select to authenticated
  using (exists (
    select 1 from public.people p
    where p.id = person_id and p.owner_id = (select auth.uid())
  ));

create policy "cuisine_prefs: owner can insert" on public.cuisine_prefs
  for insert to authenticated
  with check (exists (
    select 1 from public.people p
    where p.id = person_id and p.owner_id = (select auth.uid())
  ));

create policy "cuisine_prefs: owner can update" on public.cuisine_prefs
  for update to authenticated
  using (exists (
    select 1 from public.people p
    where p.id = person_id and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.people p
    where p.id = person_id and p.owner_id = (select auth.uid())
  ));

create policy "cuisine_prefs: owner can delete" on public.cuisine_prefs
  for delete to authenticated
  using (exists (
    select 1 from public.people p
    where p.id = person_id and p.owner_id = (select auth.uid())
  ));
