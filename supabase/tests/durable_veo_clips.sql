-- Run against a migrated local database.
begin;
do $$
declare
  owner uuid := 'aa000000-0000-4000-8000-000000000001';
  outsider uuid := 'aa000000-0000-4000-8000-000000000002';
  asset uuid;
  receipt jsonb;
  ledger uuid;
begin
  insert into auth.users (id,email)
    values (owner,'veo-owner@example.test'),(outsider,'veo-other@example.test');
  update public.profiles set user_credits=300,lifetime_credits=0 where id=owner;
  update public.subscriptions set monthly_credit_limit=0,monthly_credits_used=0,unlimited_usage=false where user_id=owner;
  receipt := public.reserve_credits(owner,112,'motion_clip',null,'veo-fixture','Veo clip');
  ledger := (receipt->>'ledger_id')::uuid;
  insert into public.model_generations (user_id,model_id,kind,prompt,credits,ledger_id,motion_request_key)
    values (owner,'veo-fast','video','Animate',112,ledger::text,'clip:0') returning id into asset;
  begin
    insert into public.model_generations (user_id,model_id,kind,prompt,credits,motion_request_key)
      values (owner,'veo-fast','video','Animate',112,'clip:0');
    raise exception 'Duplicate request key accepted';
  exception when unique_violation then null;
  end;
  begin
    perform public.settle_veo_clip(outsider,asset,null,'forbidden');
    raise exception 'Cross-owner settlement was accepted';
  exception when no_data_found then null;
  end;
  perform public.settle_veo_clip(owner,asset,null,'Provider failed');
  perform public.settle_veo_clip(owner,asset,null,'Provider failed');
  if (select user_credits from public.profiles where id=owner) <> 300
    or (select status from public.credit_ledger where id=ledger) <> 'refunded' then
    raise exception 'Veo reservation did not refund exactly once';
  end if;
end;
$$;
rollback;
