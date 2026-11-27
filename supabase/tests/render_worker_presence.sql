-- Run against a migrated PostgreSQL / Supabase environment.
begin;
do $$
declare
  owner uuid := 'aa000000-0000-4000-8000-000000000001';
  project uuid := 'aa000000-0000-4000-8000-000000000003';
  job uuid;
  claimed jsonb;
begin
  insert into auth.users (id,email) values (owner,'worker-v2@example.test');
  job := (public.queue_professional_render(owner, project, '{"version":2}'::jsonb)->>'id')::uuid;
  if job is null then raise exception 'Manifest v2 was not queued'; end if;
  if public.claim_professional_render() is not null then raise exception 'Legacy worker claimed manifest v2'; end if;
  claimed := public.claim_professional_render_supported(2);
  if (claimed->>'id')::uuid is distinct from job then raise exception 'V2 worker did not claim job'; end if;
  if has_table_privilege('authenticated','public.professional_render_workers','INSERT') or
     has_function_privilege('authenticated','public.claim_professional_render_supported(integer)','EXECUTE') then
    raise exception 'Authenticated role could impersonate renderer';
  end if;
end;
$$;
rollback;
