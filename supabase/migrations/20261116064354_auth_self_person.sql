-- Every user gets exactly one is_self person ("You") when their auth user is created.
-- No new table, so no new RLS: the row is covered by the people policies.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- people_one_self_per_owner_idx makes a second self row impossible; skip, don't fail.
  insert into public.people (owner_id, name, is_self)
  values (new.id, 'You', true)
  on conflict (owner_id) where is_self do nothing;
  return new;
end;
$$;

-- Only the trigger calls this; it must not be exposed as an RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
