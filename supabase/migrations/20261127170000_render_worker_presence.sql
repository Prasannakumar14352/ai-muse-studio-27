create table public.professional_render_workers (
  id uuid primary key,
  seen_at timestamptz not null default now()
);
alter table public.professional_render_workers enable row level security;
revoke all on public.professional_render_workers from anon, authenticated;
grant select, insert, update, delete on public.professional_render_workers to service_role;

create function public.claim_professional_render_supported(max_version integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  item public.professional_render_jobs%rowtype;
begin
  update public.professional_render_jobs set status = 'failed', error = 'Render worker recovery limit reached'
    where status in ('preparing_assets','rendering','encoding','validating','uploading')
      and heartbeat_at < now() - interval '90 seconds' and attempts >= 3;
  select * into item from public.professional_render_jobs
    where coalesce((manifest->>'version')::integer, 1) <= max_version and (status = 'queued' or (
      status in ('preparing_assets','rendering','encoding','validating','uploading')
      and heartbeat_at < now() - interval '90 seconds' and attempts < 3
    )) order by created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.professional_render_jobs
    set status='preparing_assets', progress=0, lease_id=gen_random_uuid(),
        attempts=attempts+1, heartbeat_at=now()
    where id=item.id returning * into item;
  return to_jsonb(item);
end;
$$;
revoke all on function public.claim_professional_render_supported(integer) from public, anon, authenticated;
grant execute on function public.claim_professional_render_supported(integer) to service_role;

-- Keep older workers off manifests with effects they cannot reproduce.
create or replace function public.claim_professional_render()
returns jsonb language sql security definer set search_path = public as $$
  select public.claim_professional_render_supported(1)
$$;
