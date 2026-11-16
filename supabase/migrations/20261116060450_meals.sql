-- Places, their tags, and meals with attendees, items and ratings (brief, Data Model).
-- places and meals are owned via owner_id; child tables check ownership through
-- their parent(s). Two-parent tables (meal_attendees, ratings) require both
-- parents to belong to the caller.

-- places ----------------------------------------------------------------------
-- Only IDs are stored long-term from Google; ratings and reviews are fetched live.
-- Constraint tags live in place_tags, so there is no tags[] column here.
create table public.places (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  google_place_id text unique,
  osm_id text,
  name text not null check (name = btrim(name) and name <> ''),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  cuisines text[] not null default '{}',
  -- Google's price scale: 0 (free) to 4 (very expensive).
  price_level smallint check (price_level between 0 and 4)
);

create index places_owner_id_idx on public.places (owner_id);

-- Radius queries (earthdistance lives in the extensions schema).
create index places_location_idx on public.places
  using gist (extensions.ll_to_earth(latitude, longitude));

alter table public.places enable row level security;
revoke all on public.places from anon;

create policy "places: owner can select" on public.places
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "places: owner can insert" on public.places
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "places: owner can update" on public.places
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "places: owner can delete" on public.places
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- place_tags ------------------------------------------------------------------
-- One row per place, tag and source. value = false records a failed check.
-- Review checks may only set vegetarian or vegan, never halal or allergy tags.
create table public.place_tags (
  place_id uuid not null references public.places (id) on delete cascade,
  tag text not null check (tag ~ '^[a-z][a-z0-9_]*$'),
  source text not null check (source in ('user', 'review')),
  value boolean not null,
  updated_at timestamptz not null default now(),
  primary key (place_id, tag, source),
  constraint place_tags_review_tags_check
    check (source <> 'review' or tag in ('vegetarian', 'vegan'))
);

create trigger place_tags_set_updated_at
  before update on public.place_tags
  for each row execute function public.set_updated_at();

alter table public.place_tags enable row level security;
revoke all on public.place_tags from anon;

create policy "place_tags: owner can select" on public.place_tags
  for select to authenticated
  using (exists (
    select 1 from public.places pl
    where pl.id = place_tags.place_id and pl.owner_id = (select auth.uid())
  ));

create policy "place_tags: owner can insert" on public.place_tags
  for insert to authenticated
  with check (exists (
    select 1 from public.places pl
    where pl.id = place_tags.place_id and pl.owner_id = (select auth.uid())
  ));

create policy "place_tags: owner can update" on public.place_tags
  for update to authenticated
  using (exists (
    select 1 from public.places pl
    where pl.id = place_tags.place_id and pl.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.places pl
    where pl.id = place_tags.place_id and pl.owner_id = (select auth.uid())
  ));

create policy "place_tags: owner can delete" on public.place_tags
  for delete to authenticated
  using (exists (
    select 1 from public.places pl
    where pl.id = place_tags.place_id and pl.owner_id = (select auth.uid())
  ));

-- meals -----------------------------------------------------------------------
-- One row per meal out. place_id is set by the parser (M2), so it starts null.
create table public.meals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  place_id uuid references public.places (id) on delete set null,
  eaten_at timestamptz not null default now(),
  meal_type text check (meal_type in ('breakfast', 'lunch', 'dinner', 'supper', 'snack')),
  raw_text text,
  photo_path text,
  total_cost_sgd numeric(10, 2) check (total_cost_sgd >= 0),
  parse_status text not null default 'pending'
    check (parse_status in ('pending', 'done', 'needs_review', 'failed')),
  parse_confidence real check (parse_confidence between 0 and 1),
  -- A meal is logged from text, a photo, or both.
  constraint meals_has_content_check
    check (nullif(btrim(raw_text), '') is not null or photo_path is not null)
);

-- Diary feed.
create index meals_owner_id_eaten_at_idx on public.meals (owner_id, eaten_at desc);
create index meals_place_id_idx on public.meals (place_id);

alter table public.meals enable row level security;
revoke all on public.meals from anon;

-- FK checks bypass RLS, so the policies also stop a meal pointing at another
-- user's place.
create policy "meals: owner can select" on public.meals
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "meals: owner can insert" on public.meals
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (place_id is null or exists (
      select 1 from public.places pl
      where pl.id = meals.place_id and pl.owner_id = (select auth.uid())
    ))
  );

create policy "meals: owner can update" on public.meals
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (place_id is null or exists (
      select 1 from public.places pl
      where pl.id = meals.place_id and pl.owner_id = (select auth.uid())
    ))
  );

create policy "meals: owner can delete" on public.meals
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- meal_attendees --------------------------------------------------------------
-- Who was there. Rows are added or removed, never updated, so there is no
-- update policy.
create table public.meal_attendees (
  meal_id uuid not null references public.meals (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  primary key (meal_id, person_id)
);

-- Per-person history and recency.
create index meal_attendees_person_id_idx on public.meal_attendees (person_id);

alter table public.meal_attendees enable row level security;
revoke all on public.meal_attendees from anon;

create policy "meal_attendees: owner can select" on public.meal_attendees
  for select to authenticated
  using (
    exists (
      select 1 from public.meals m
      where m.id = meal_attendees.meal_id and m.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from public.people p
      where p.id = meal_attendees.person_id and p.owner_id = (select auth.uid())
    )
  );

create policy "meal_attendees: owner can insert" on public.meal_attendees
  for insert to authenticated
  with check (
    exists (
      select 1 from public.meals m
      where m.id = meal_attendees.meal_id and m.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from public.people p
      where p.id = meal_attendees.person_id and p.owner_id = (select auth.uid())
    )
  );

create policy "meal_attendees: owner can delete" on public.meal_attendees
  for delete to authenticated
  using (
    exists (
      select 1 from public.meals m
      where m.id = meal_attendees.meal_id and m.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from public.people p
      where p.id = meal_attendees.person_id and p.owner_id = (select auth.uid())
    )
  );

-- ratings ---------------------------------------------------------------------
-- Per-person rating of a meal. Only attendees can rate: the composite FK to
-- meal_attendees enforces it, and removing the attendee removes the rating.
create table public.ratings (
  meal_id uuid not null references public.meals (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  source text not null check (source in ('stated', 'inferred')),
  primary key (meal_id, person_id),
  constraint ratings_attendee_fkey foreign key (meal_id, person_id)
    references public.meal_attendees (meal_id, person_id) on delete cascade
);

create index ratings_person_id_idx on public.ratings (person_id);

alter table public.ratings enable row level security;
revoke all on public.ratings from anon;

create policy "ratings: owner can select" on public.ratings
  for select to authenticated
  using (
    exists (
      select 1 from public.meals m
      where m.id = ratings.meal_id and m.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from public.people p
      where p.id = ratings.person_id and p.owner_id = (select auth.uid())
    )
  );

create policy "ratings: owner can insert" on public.ratings
  for insert to authenticated
  with check (
    exists (
      select 1 from public.meals m
      where m.id = ratings.meal_id and m.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from public.people p
      where p.id = ratings.person_id and p.owner_id = (select auth.uid())
    )
  );

create policy "ratings: owner can update" on public.ratings
  for update to authenticated
  using (
    exists (
      select 1 from public.meals m
      where m.id = ratings.meal_id and m.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from public.people p
      where p.id = ratings.person_id and p.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.meals m
      where m.id = ratings.meal_id and m.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from public.people p
      where p.id = ratings.person_id and p.owner_id = (select auth.uid())
    )
  );

create policy "ratings: owner can delete" on public.ratings
  for delete to authenticated
  using (
    exists (
      select 1 from public.meals m
      where m.id = ratings.meal_id and m.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from public.people p
      where p.id = ratings.person_id and p.owner_id = (select auth.uid())
    )
  );

-- meal_items ------------------------------------------------------------------
-- Dishes extracted by the parser (M2). embedding is not used by v1 scoring but
-- is populated for later similarity features.
create table public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals (id) on delete cascade,
  dish_name text not null check (dish_name = btrim(dish_name) and dish_name <> ''),
  cuisine text check (cuisine = lower(btrim(cuisine)) and cuisine <> ''),
  tags text[] not null default '{}',
  embedding extensions.vector(1024)
);

create index meal_items_meal_id_idx on public.meal_items (meal_id);
create index meal_items_embedding_idx on public.meal_items
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.meal_items enable row level security;
revoke all on public.meal_items from anon;

create policy "meal_items: owner can select" on public.meal_items
  for select to authenticated
  using (exists (
    select 1 from public.meals m
    where m.id = meal_items.meal_id and m.owner_id = (select auth.uid())
  ));

create policy "meal_items: owner can insert" on public.meal_items
  for insert to authenticated
  with check (exists (
    select 1 from public.meals m
    where m.id = meal_items.meal_id and m.owner_id = (select auth.uid())
  ));

create policy "meal_items: owner can update" on public.meal_items
  for update to authenticated
  using (exists (
    select 1 from public.meals m
    where m.id = meal_items.meal_id and m.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.meals m
    where m.id = meal_items.meal_id and m.owner_id = (select auth.uid())
  ));

create policy "meal_items: owner can delete" on public.meal_items
  for delete to authenticated
  using (exists (
    select 1 from public.meals m
    where m.id = meal_items.meal_id and m.owner_id = (select auth.uid())
  ));
