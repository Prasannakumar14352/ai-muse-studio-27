alter table public.landing_media
  add column showcase_metadata jsonb,
  add column showcase_video_path text,
  add column showcase_poster_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('showcase-private', 'showcase-private', false, 52428800,
        array['video/mp4','video/webm','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "Admins create private showcase objects" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'showcase-private' and public.has_role(auth.uid(), 'admin'::public.app_role)
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- New managed records can only publish when all explicit approvals are present.
alter table public.landing_media add constraint showcase_managed_publication check (
  kind <> 'showcase' or status <> 'published' or
  (showcase_video_path is null and showcase_poster_path is null and showcase_metadata is null) or
  (showcase_video_path is not null and showcase_poster_path is not null
    and (showcase_metadata->>'rights') is not distinct from 'true'
    and (showcase_metadata->>'reviewed') is not distinct from 'true'
    and nullif(trim(title), '') is not null and nullif(trim(prompt), '') is not null)
);

-- Public clients use the server projection. Service role reads private
-- references only after status/role checks in the landing media service.
revoke select on public.landing_media from anon, authenticated;
revoke insert, update, delete on public.landing_media from anon, authenticated;
grant select, insert, update, delete on public.landing_media to service_role;
