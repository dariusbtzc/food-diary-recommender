-- create_meal(): saves a meal, its attendees and their stated ratings in one
-- transaction, so a failed attendee or rating insert leaves no orphan meal.
-- No new table, so no new RLS. The function is security invoker: every insert
-- runs as the caller, under the existing meals, meal_attendees and ratings
-- policies. parse_status keeps its default ('pending').

create function public.create_meal(
  p_attendee_ids uuid[],
  p_raw_text text default null,
  p_photo_path text default null,
  p_meal_type text default null,
  p_ratings jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_meal_id uuid;
begin
  if coalesce(cardinality(p_attendee_ids), 0) = 0 then
    raise exception 'a meal needs at least one attendee' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_ratings, '[]'::jsonb)) <> 'array' then
    raise exception 'p_ratings must be a JSON array' using errcode = '22023';
  end if;

  insert into public.meals (raw_text, photo_path, meal_type)
  values (p_raw_text, p_photo_path, p_meal_type)
  returning id into v_meal_id;

  insert into public.meal_attendees (meal_id, person_id)
  select v_meal_id, person_id
  from unnest(p_attendee_ids) as person_id;

  -- The composite FK to meal_attendees rejects a rating for a non-attendee.
  insert into public.ratings (meal_id, person_id, score, source)
  select v_meal_id, (r ->> 'person_id')::uuid, (r ->> 'score')::smallint, 'stated'
  from jsonb_array_elements(coalesce(p_ratings, '[]'::jsonb)) as r;

  return v_meal_id;
end;
$$;

-- Callable as an RPC by signed-in users only.
revoke execute on function public.create_meal(uuid[], text, text, text, jsonb) from public, anon;
grant execute on function public.create_meal(uuid[], text, text, text, jsonb) to authenticated;
