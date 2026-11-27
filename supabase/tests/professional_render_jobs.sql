-- Run against a migrated local database.
begin;
do $$
declare
  owner uuid := 'aa000000-0000-4000-8000-000000000001';
  other_user uuid := 'aa000000-0000-4000-8000-000000000002';
  project uuid := 'aa000000-0000-4000-8000-000000000003';
  job_uuid uuid;
  result jsonb;
  old_lease uuid;
  new_lease uuid;
begin
  insert into auth.users (id,email)
    values (owner,'render-owner@example.test'),(other_user,'render-other@example.test');
  result := public.queue_professional_render(owner, project, '{"version":1}'::jsonb);
  job_uuid := (result->>'id')::uuid;
  if job_uuid is null then raise exception 'Job was not enqueued'; end if;
  result := public.claim_professional_render();
  old_lease := (result->>'lease_id')::uuid;
  if (result->>'id')::uuid is distinct from job_uuid or old_lease is null then raise exception 'Claim failed'; end if;
  if public.claim_professional_render() is not null then raise exception 'Duplicate claim'; end if;
  update public.professional_render_jobs set heartbeat_at=now()-interval '2 minutes' where professional_render_jobs.id=job_uuid;
  result := public.claim_professional_render();
  new_lease := (result->>'lease_id')::uuid;
  if new_lease is null or new_lease=old_lease or (result->>'attempts')::int <> 2 then
    raise exception 'Lease recovery failed';
  end if;
  update public.professional_render_jobs set status='cancelled',lease_id=null where professional_render_jobs.id=job_uuid;
  if public.claim_professional_render() is not null then raise exception 'Cancelled job was reclaimed'; end if;
  result := public.queue_professional_render(other_user,null,null,job_uuid);
  if result->>'error' is null then raise exception 'Cross-owner retry was accepted'; end if;
  result := public.queue_professional_render(owner,null,null,job_uuid);
  if result->>'status' <> 'queued' then raise exception 'Retry did not requeue the job'; end if;
  if has_table_privilege('authenticated','public.professional_render_jobs','SELECT') or
     has_function_privilege('authenticated','public.claim_professional_render()','EXECUTE') then
    raise exception 'Authenticated role can bypass owner-scoped APIs';
  end if;
end;
$$;
rollback;
