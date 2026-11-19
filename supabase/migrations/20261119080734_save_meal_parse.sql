-- save_meal_parse(): writes one parse result in one transaction (M2 task 3).
--
-- The parse-meal worker (service role) calls it after validating Haiku's
-- output. It writes the dishes, the place link, the cost, the confidence and
-- the status, and adds the dishes' cuisines to the place. It writes only while
-- the meal is still pending, so a double run of the worker or a hand edit made
-- in the meantime is never overwritten. A pre-set place_id (M4's "We went
-- here") is kept. No new table, so no new RLS.
--
-- p_items: [{ "dish_name": text, "cuisine": text | null, "tags": text[] }]
-- Returns false when the meal no longer exists, belongs to someone else, or
-- has left pending.

create function public.save_meal_parse(
  p_meal_id uuid,
  p_owner_id uuid,
  p_items jsonb,
  p_place_id uuid,
  p_total_cost_sgd numeric,
  p_confidence real,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_place_id uuid;
begin
  if p_status is null or p_status not in ('done', 'needs_review') then
    raise exception 'p_status must be done or needs_review' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'p_items must be a non-empty JSON array' using errcode = '22023';
  end if;
  if p_place_id is not null and not exists (
    select 1 from public.places where id = p_place_id and owner_id = p_owner_id
  ) then
    raise exception 'place % does not belong to the meal owner', p_place_id using errcode = '42501';
  end if;

  update public.meals
  set place_id = coalesce(place_id, p_place_id),
      total_cost_sgd = p_total_cost_sgd,
      parse_confidence = p_confidence,
      parse_status = p_status
  where id = p_meal_id
    and owner_id = p_owner_id
    and parse_status = 'pending'
  returning place_id into v_place_id;

  if not found then
    return false;
  end if;

  -- Replace, not append: a pending meal has no hand-made dishes.
  delete from public.meal_items where meal_id = p_meal_id;

  insert into public.meal_items (meal_id, dish_name, cuisine, tags)
  select
    p_meal_id,
    btrim(item ->> 'dish_name'),
    nullif(lower(btrim(item ->> 'cuisine')), ''),
    coalesce(
      array(select jsonb_array_elements_text(item -> 'tags')),
      '{}'
    )
  from jsonb_array_elements(p_items) as item;

  -- The place gains any cuisine it doesn't list yet; the list stays sorted.
  if v_place_id is not null then
    update public.places
    set cuisines = array(
      select distinct c
      from unnest(
        cuisines || array(
          select mi.cuisine from public.meal_items mi
          where mi.meal_id = p_meal_id and mi.cuisine is not null
        )
      ) as c
      order by c
    )
    where id = v_place_id and owner_id = p_owner_id;
  end if;

  return true;
end;
$$;

revoke execute on function public.save_meal_parse(uuid, uuid, jsonb, uuid, numeric, real, text)
  from public, anon, authenticated;
grant execute on function public.save_meal_parse(uuid, uuid, jsonb, uuid, numeric, real, text)
  to service_role;
