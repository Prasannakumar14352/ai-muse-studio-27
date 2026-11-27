create table public.professional_render_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  manifest jsonb not null,
  status text not null default 'queued' check (status in (
    'queued','preparing_assets','rendering','encoding','validating','uploading','completed','failed','cancelled'
  )),
  progress real not null default 0 check (progress >= 0 and progress <= 1),
  attempts integer not null default 0,
  lease_id uuid,
  heartbeat_at timestamptz,
  error text,
  output_path text,
  output_metadata jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index professional_render_jobs_claim_idx on public.professional_render_jobs (status, created_at);
alter table public.professional_render_jobs enable row level security;
revoke all on public.professional_render_jobs from anon, authenticated;
grant select, insert, update on public.professional_render_jobs to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('professional-renders', 'professional-renders', false, 104857600, array['video/mp4'])
on conflict (id) do nothing;

create function public.claim_professional_render()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  item public.professional_render_jobs%rowtype;
begin
  update public.professional_render_jobs set status = 'failed', error = 'Render worker recovery limit reached'
    where status in ('preparing_assets','rendering','encoding','validating','uploading')
      and heartbeat_at < now() - interval '90 seconds' and attempts >= 3;
  select * into item from public.professional_render_jobs
    where status = 'queued' or (
      status in ('preparing_assets','rendering','encoding','validating','uploading')
      and heartbeat_at < now() - interval '90 seconds' and attempts < 3
    ) order by created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.professional_render_jobs
    set status='preparing_assets', progress=0, lease_id=gen_random_uuid(),
        attempts=attempts+1, heartbeat_at=now()
    where id=item.id returning * into item;
  return to_jsonb(item);
end;
$$;
revoke all on function public.claim_professional_render() from public, anon, authenticated;
grant execute on function public.claim_professional_render() to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('professional-render-inputs', 'professional-render-inputs', false, 52428800,
  array['image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/mpeg','audio/wav','audio/mp4','audio/webm'])
on conflict (id) do nothing;

-- Input objects are write-once for API users. Workers read with service_role.
create policy professional_render_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'professional-render-inputs'
    and (storage.foldername(name))[1] = auth.uid()::text);

create function public.queue_professional_render(owner_id uuid, project uuid, spec jsonb, retry_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  item public.professional_render_jobs%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('professional-render:' || owner_id::text, 0));
  if (select count(*) from public.professional_render_jobs where user_id = owner_id
      and status in ('queued','preparing_assets','rendering','encoding','validating','uploading')) >= 2 then
    return jsonb_build_object('error','Render queue limit reached');
  end if;
  if retry_id is null then
    insert into public.professional_render_jobs(user_id, project_id, manifest)
      values (owner_id, project, spec) returning * into item;
  else
    update public.professional_render_jobs
      set status='queued', attempts=0, progress=0, lease_id=null, error=null
      where id=retry_id and user_id=owner_id and status in ('failed','cancelled')
      returning * into item;
    if not found then return jsonb_build_object('error','Render is not eligible for retry'); end if;
  end if;
  return jsonb_build_object('id',item.id,'status',item.status);
end;
$$;
revoke all on function public.queue_professional_render(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.queue_professional_render(uuid, uuid, jsonb, uuid) to service_role;
