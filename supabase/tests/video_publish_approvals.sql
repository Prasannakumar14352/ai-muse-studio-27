begin;
insert into auth.users(id) values ('b20e1c87-b653-4b99-824f-4ae54c03cc64');
insert into public.projects(id, user_id, title, format)
values ('ec3da900-d084-4ae7-a8ab-c0bd4e4e21e9', 'b20e1c87-b653-4b99-824f-4ae54c03cc64', 'Test', 'video');
insert into public.video_publish_approvals (id, user_id, project_id, object_path, sha256, metadata)
values ('4aa8c5e6-253e-40f2-bc68-32e8545da507', 'b20e1c87-b653-4b99-824f-4ae54c03cc64',
  'ec3da900-d084-4ae7-a8ab-c0bd4e4e21e9', 'fixture.mp4', repeat('a', 64), '{}');

do $$
begin
  assert not has_table_privilege('authenticated', 'public.video_publish_approvals', 'INSERT');
  assert not has_table_privilege('authenticated', 'public.video_publish_approvals', 'UPDATE');
  assert not has_table_privilege('anon', 'public.video_publish_approvals', 'SELECT');
  assert (select not public from storage.buckets where id = 'approved-video-exports');
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b20e1c87-b653-4b99-824f-4ae54c03cc64', true);
do $$
begin
  begin
    insert into public.scheduled_posts (user_id, platform, video_approval_id)
      values ('b20e1c87-b653-4b99-824f-4ae54c03cc64', 'youtube', '4aa8c5e6-253e-40f2-bc68-32e8545da507');
    raise exception using errcode = 'assert_failure', message = 'Forged approval binding was accepted';
  exception when raise_exception then
    assert SQLERRM = 'Video approval bindings are server managed';
  end;
end $$;
reset role;

update public.projects set metadata = '{"updatedExport":true}' where id = 'ec3da900-d084-4ae7-a8ab-c0bd4e4e21e9';
do $$
begin
  assert (select revoked_at is not null from public.video_publish_approvals
    where id = '4aa8c5e6-253e-40f2-bc68-32e8545da507');
end $$;
rollback;
