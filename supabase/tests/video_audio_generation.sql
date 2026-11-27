-- Run only on a migrated local Supabase database.
BEGIN;
do $$
declare
  owner uuid := 'aa000000-0000-4000-8000-000000000001';
  outsider uuid := 'aa000000-0000-4000-8000-000000000002';
  job uuid := 'bb000000-0000-4000-8000-000000000001';
  response jsonb;
  asset uuid;
  ledger uuid;
begin
  insert into auth.users (id, email) values (owner, 'audio-owner@example.test'),
    (outsider, 'audio-outsider@example.test');
  update public.profiles set user_credits = 120, lifetime_credits = 0 where id = owner;
  update public.subscriptions set monthly_credit_limit = 0, monthly_credits_used = 0,
    unlimited_usage = false where user_id = owner;
  response := admit_video_audio(owner, job, 'music', 0, 0, 'Original score', 30, 112, 'test');
  if response->>'created' <> 'true' then raise exception 'First claim failed'; end if;
  asset := (response->'row'->>'id')::uuid;
  response := admit_video_audio(owner, job, 'music', 0, 0, 'Original score', 30, 112, 'test');
  if response->>'created' <> 'false' or (response->'row'->>'id')::uuid <> asset then raise exception 'Duplicate was admitted'; end if;
  response := admit_video_audio(owner, job, 'music', 0, 1, 'Original score', 30, 112, 'test');
  if response->>'error' is null then raise exception 'Revision before settlement'; end if;
  response := reserve_credits(owner, 112, 'video_audio', null, 'audio-success', 'music');
  ledger := (response->>'ledger_id')::uuid;
  update video_audio_generations set status='queued', ledger_id=ledger where id=asset;
  begin
    perform settle_video_audio(outsider, asset, null, 'forbidden');
    raise exception 'Unauthorized refund succeeded';
  exception when no_data_found then null;
  end;
  perform settle_video_audio(owner, asset, 'private/test.mp3', null);
  perform settle_video_audio(owner, asset, 'private/test.mp3', null);
  if (select status from credit_ledger where id=ledger) <> 'charged' or
     (select count(*) from usage_history where user_id=owner) <> 1 then
    raise exception 'Settlement must charge once';
  end if;
  response := admit_video_audio(owner, job, 'sfx', 0, 0, 'Ocean waves', 3, 2, 'test');
  asset := (response->'row'->>'id')::uuid;
  response := reserve_credits(owner, 2, 'video_audio', null, 'audio-failed', 'sfx');
  ledger := (response->>'ledger_id')::uuid;
  update video_audio_generations set status='queued', ledger_id=ledger where id=asset;
  perform settle_video_audio(owner, asset, null, 'Provider rejected');
  perform settle_video_audio(owner, asset, null, 'Provider rejected');
  if (select status from credit_ledger where id=ledger) <> 'refunded' or
     (select user_credits from profiles where id=owner) <> 8 then
    raise exception 'Refund must restore exactly once';
  end if;
  response := reserve_credits(owner, 9, 'video_audio', null, 'audio-insufficient', 'music');
  if response->>'error' <> 'insufficient_credits' then raise exception 'Insufficient credits not rejected'; end if;
  if has_table_privilege('authenticated', 'public.video_audio_generations', 'SELECT') or
     has_function_privilege('authenticated', 'public.settle_video_audio(uuid, uuid, text, text)', 'EXECUTE') then
     raise exception 'Authenticated role has privileged access';
  end if;
end;
$$;

ROLLBACK;
