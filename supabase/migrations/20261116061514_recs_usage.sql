-- Recommendation requests and results, and the LLM usage log (brief, Data Model).
-- rec_requests and llm_usage are owned via owner_id; rec_results checks
-- ownership through rec_requests.

-- rec_requests ----------------------------------------------------------------
-- One row per recommendation request. diner_ids is an array, so it cannot have
-- a foreign key; RLS checks every id belongs to the caller instead. Ids of
-- people deleted later stay in the array as history.
create table public.rec_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  diner_ids uuid[] not null
    check (cardinality(diner_ids) > 0 and array_position(diner_ids, null) is null),
  -- Same set as meals.meal_type.
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'supper', 'snack')),
  -- Budget bands from app-ui: hawker < $10, casual $10–30, nice $30–80, premium $80+.
  budget text not null check (budget in ('hawker', 'casual', 'nice', 'premium')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  mode text not null check (mode in ('known', 'new', 'either'))
);

create index rec_requests_owner_id_idx on public.rec_requests (owner_id);

alter table public.rec_requests enable row level security;
revoke all on public.rec_requests from anon;

create policy "rec_requests: owner can select" on public.rec_requests
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "rec_requests: owner can insert" on public.rec_requests
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and not exists (
      select 1 from unnest(rec_requests.diner_ids) as d (id)
      where not exists (
        select 1 from public.people p
        where p.id = d.id and p.owner_id = (select auth.uid())
      )
    )
  );

create policy "rec_requests: owner can update" on public.rec_requests
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and not exists (
      select 1 from unnest(rec_requests.diner_ids) as d (id)
      where not exists (
        select 1 from public.people p
        where p.id = d.id and p.owner_id = (select auth.uid())
      )
    )
  );

create policy "rec_requests: owner can delete" on public.rec_requests
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- rec_results -----------------------------------------------------------------
-- Shown options and which was picked. explanation is null if the LLM call
-- fails. rejected_reason is free text until the feedback UI defines a set.
create table public.rec_results (
  request_id uuid not null references public.rec_requests (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  rank smallint not null check (rank between 1 and 5),
  group_score real not null,
  per_person_scores jsonb not null check (jsonb_typeof(per_person_scores) = 'object'),
  explanation text,
  chosen boolean not null default false,
  rejected_reason text check (rejected_reason = btrim(rejected_reason) and rejected_reason <> ''),
  primary key (request_id, place_id),
  unique (request_id, rank)
);

-- At most one chosen place per request.
create unique index rec_results_one_chosen_per_request_idx
  on public.rec_results (request_id) where chosen;
create index rec_results_place_id_idx on public.rec_results (place_id);

alter table public.rec_results enable row level security;
revoke all on public.rec_results from anon;

-- FK checks bypass RLS, so insert and update also require the caller's own place.
create policy "rec_results: owner can select" on public.rec_results
  for select to authenticated
  using (exists (
    select 1 from public.rec_requests r
    where r.id = rec_results.request_id and r.owner_id = (select auth.uid())
  ));

create policy "rec_results: owner can insert" on public.rec_results
  for insert to authenticated
  with check (
    exists (
      select 1 from public.rec_requests r
      where r.id = rec_results.request_id and r.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from public.places pl
      where pl.id = rec_results.place_id and pl.owner_id = (select auth.uid())
    )
  );

create policy "rec_results: owner can update" on public.rec_results
  for update to authenticated
  using (exists (
    select 1 from public.rec_requests r
    where r.id = rec_results.request_id and r.owner_id = (select auth.uid())
  ))
  with check (
    exists (
      select 1 from public.rec_requests r
      where r.id = rec_results.request_id and r.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from public.places pl
      where pl.id = rec_results.place_id and pl.owner_id = (select auth.uid())
    )
  );

create policy "rec_results: owner can delete" on public.rec_results
  for delete to authenticated
  using (exists (
    select 1 from public.rec_requests r
    where r.id = rec_results.request_id and r.owner_id = (select auth.uid())
  ));

-- llm_usage -------------------------------------------------------------------
-- One row per LLM call. Tracks token spend and enforces the 50 parse calls a
-- day limit. day is the Singapore date, so the limit resets at SGT midnight.
-- Users can read and append, but not update or delete, so the limit can't be
-- reset by wiping rows.
create table public.llm_usage (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null default (now() at time zone 'Asia/Singapore')::date,
  purpose text not null check (purpose in ('parse', 'explain', 'review_check')),
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0)
);

-- Lets the parse worker count today's calls quickly.
create index llm_usage_owner_id_day_idx on public.llm_usage (owner_id, day);

alter table public.llm_usage enable row level security;
revoke all on public.llm_usage from anon;

create policy "llm_usage: owner can select" on public.llm_usage
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "llm_usage: owner can insert" on public.llm_usage
  for insert to authenticated
  with check (owner_id = (select auth.uid()));
