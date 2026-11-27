begin;

do $$
begin
  assert not has_table_privilege('anon', 'public.landing_media', 'SELECT');
  assert not has_table_privilege('authenticated', 'public.landing_media', 'UPDATE');
  assert (select not public from storage.buckets where id = 'showcase-private');
  assert exists (select 1 from pg_policies where schemaname = 'storage'
    and tablename = 'objects' and policyname = 'Admins create private showcase objects'
    and cmd = 'INSERT' and with_check like '%has_role%');
  begin
    insert into public.landing_media
      (kind, status, title, prompt, showcase_video_path, showcase_poster_path, showcase_metadata)
    values ('showcase', 'published', 'Fixture', 'A fixture prompt', 'admin/video.mp4',
      'admin/poster.jpg', '{"rights":true}');
    raise exception 'Unreviewed record was published';
  exception when check_violation then
    null;
  end;
  insert into public.landing_media
    (kind, status, title, prompt, showcase_video_path, showcase_poster_path, showcase_metadata)
  values ('showcase', 'published', 'Fixture', 'A fixture prompt', 'admin/video.mp4',
    'admin/poster.jpg', '{"rights":true,"reviewed":true}');
  update public.landing_media set status = 'draft'
    where title = 'Fixture' and showcase_video_path = 'admin/video.mp4';
  assert not exists (select 1 from public.landing_media where title = 'Fixture'
    and showcase_video_path = 'admin/video.mp4' and status = 'published');
  insert into public.landing_media (kind, status, title, prompt)
    values ('showcase', 'published', 'Legacy fixture', 'Legacy prompt');
end
$$;
rollback;
