alter table public.model_generations add column motion_request_key text;
create unique index model_generations_motion_request_idx
  on public.model_generations (user_id, motion_request_key)
  where motion_request_key is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('generated-motion', 'generated-motion', false, 52428800, array['video/mp4'])
on conflict (id) do nothing;

create function public.settle_veo_clip(owner_id uuid, asset uuid, object_path text, failure text)
returns void language plpgsql security definer set search_path = public as $$
declare
  item public.model_generations%rowtype;
  outcome jsonb;
begin
  select * into strict item from public.model_generations
    where id = asset and user_id = owner_id and motion_request_key is not null for update;
  if item.status in ('completed', 'failed') then return; end if;
  if not exists (
    select from public.credit_ledger where id = item.ledger_id::uuid
      and user_id = owner_id and action = 'motion_clip'
  ) then raise exception 'Motion reservation missing'; end if;
  if failure is null then
    outcome := public.finalize_credits(item.ledger_id::uuid);
  else
    outcome := public.refund_credits_by_ledger(item.ledger_id::uuid, failure);
  end if;
  if (outcome->>'ok')::boolean is distinct from true then
    raise exception 'Motion settlement failed';
  end if;
  update public.model_generations
    set status = case when failure is null then 'completed' else 'failed' end,
        output_url = object_path, error = failure
    where id = asset;
end;
$$;
revoke all on function public.settle_veo_clip(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.settle_veo_clip(uuid, uuid, text, text) to service_role;
