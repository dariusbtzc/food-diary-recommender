-- keep_alive(): callable by anon only, returns true, reads no data.
begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

select ok(
  has_function_privilege('anon', 'public.keep_alive()', 'execute'),
  'anon can execute keep_alive');
select ok(
  not has_function_privilege('authenticated', 'public.keep_alive()', 'execute'),
  'authenticated cannot execute keep_alive');
select ok(
  not exists (
    select 1
    from pg_proc p, aclexplode(p.proacl) a
    where p.oid = 'public.keep_alive()'::regprocedure
      and a.grantee = 0 -- PUBLIC
      and a.privilege_type = 'EXECUTE'),
  'PUBLIC has no execute grant on keep_alive');
select is(
  (select prosecdef from pg_proc where oid = 'public.keep_alive()'::regprocedure),
  false,
  'keep_alive is security invoker');

set local role anon;
select is(public.keep_alive(), true, 'keep_alive returns true for anon');

select * from finish();
rollback;
