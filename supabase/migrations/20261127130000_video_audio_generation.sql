create table public.video_audio_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null,
  track text not null check (track in ('music', 'sfx', 'ambience')),
  slot integer not null,
  revision integer not null,
  prompt text not null,
  duration double precision not null,
  credits integer not null,
  pricing_version text not null,
  status text not null check (status in ('submitting', 'queued', 'ready', 'failed', 'uncertain')),
  provider_request_id text,
  status_url text,
  response_url text,
  ledger_id uuid references public.credit_ledger(id),
  storage_path text,
  error text,
  created_at timestamptz not null default now(),
  unique (user_id, job_id, track, slot, revision)
);

create index video_audio_generations_user_created
  on public.video_audio_generations (user_id, created_at desc);

alter table public.video_audio_generations enable row level security;
revoke all on public.video_audio_generations from anon, authenticated;
grant select, insert, update on public.video_audio_generations to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('video-generated-audio', 'video-generated-audio', false, 25165824, array['audio/mpeg'])
on conflict (id) do nothing;

create function public.discard_unreserved_audio(asset uuid, owner_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.video_audio_generations
  where id = asset and user_id = owner_id and status = 'failed' and ledger_id is null;
$$;
revoke all on function public.discard_unreserved_audio(uuid, uuid) from public, anon, authenticated;
grant execute on function public.discard_unreserved_audio(uuid, uuid) to service_role;

-- Serialize admission per user. Only the caller receiving created=true may submit.
create function public.admit_video_audio(
  owner_id uuid, job uuid, layer text, track_slot integer, version integer,
  audio_prompt text, seconds double precision, credit_amount integer, pricing text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  item public.video_audio_generations%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('video-audio:' || owner_id::text, 0));
  select * into item from public.video_audio_generations
    where user_id = owner_id and job_id = job and track = layer
      and slot = track_slot and revision = version;
  if found then return jsonb_build_object('row', to_jsonb(item), 'created', false); end if;

  if version > 0 and not exists (
    select from public.video_audio_generations
    where user_id = owner_id and job_id = job and track = layer and slot = track_slot
      and revision = version - 1 and status in ('ready', 'failed')
  ) then
    return jsonb_build_object('error', 'Previous audio request must be settled');
  end if;

  if (select count(*) from public.video_audio_generations
      where user_id = owner_id and status in ('submitting', 'queued', 'uncertain')) >= 4
    or (select count(*) from public.video_audio_generations
        where user_id = owner_id and created_at > now() - interval '1 minute') >= 8 then
    return jsonb_build_object('error', 'Audio generation limit reached');
  end if;

  insert into public.video_audio_generations (
    user_id, job_id, track, slot, revision, prompt, duration, credits, pricing_version, status
  ) values (owner_id, job, layer, track_slot, version, audio_prompt, seconds, credit_amount, pricing, 'submitting')
    returning * into item;
  return jsonb_build_object('row', to_jsonb(item), 'created', true);
end;
$$;
revoke all on function public.admit_video_audio(uuid, uuid, text, integer, integer, text, double precision, integer, text)
  from public, anon, authenticated;
grant execute on function public.admit_video_audio(uuid, uuid, text, integer, integer, text, double precision, integer, text)
  to service_role;

-- Commit the existing ledger settlement and the visible asset state together.
create function public.settle_video_audio(owner_id uuid, asset uuid, object_path text, failure text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  item public.video_audio_generations%rowtype;
  outcome jsonb;
begin
  select * into strict item from public.video_audio_generations
    where id = asset and user_id = owner_id for update;
  if item.status in ('ready', 'failed') then return to_jsonb(item); end if;
  if item.ledger_id is null or not exists (
    select from public.credit_ledger where id = item.ledger_id and user_id = owner_id
      and action = 'video_audio'
  ) then
    raise exception 'Audio reservation missing';
  end if;
  if failure is null then
    outcome := public.finalize_credits(item.ledger_id);
  else
    outcome := public.refund_credits_by_ledger(item.ledger_id, failure);
  end if;
  if (outcome->>'ok')::boolean is distinct from true then
    raise exception 'Audio settlement failed';
  end if;
  update public.video_audio_generations
    set status = case when failure is null then 'ready' else 'failed' end,
        storage_path = object_path, error = failure
    where id = asset returning * into item;
  return to_jsonb(item);
end;
$$;
revoke all on function public.settle_video_audio(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.settle_video_audio(uuid, uuid, text, text) to service_role;
