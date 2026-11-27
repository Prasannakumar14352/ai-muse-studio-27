insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('approved-video-exports', 'approved-video-exports', false, 52428800,
  array['video/mp4', 'video/webm']);

create table public.video_publish_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  object_path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  metadata jsonb not null,
  accepted_warnings text[] not null default '{}',
  approved_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.video_publish_approvals enable row level security;
revoke all on public.video_publish_approvals from public, anon, authenticated;
grant select, insert, update on public.video_publish_approvals to service_role;
alter table public.scheduled_posts add column video_approval_id uuid
  references public.video_publish_approvals(id) on delete cascade;

-- Existing users can still edit captions and schedules. Approval bindings are server-owned.
create function public.protect_video_publish_binding() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.video_approval_id is not null or coalesce(new.provider_state, '{}'::jsonb) <> '{}'::jsonb then
        raise exception 'Video approval bindings are server managed';
      end if;
    elsif new.provider_state is distinct from old.provider_state
       or new.video_approval_id is distinct from old.video_approval_id
       or (old.video_approval_id is not null and (
           new.media_urls is distinct from old.media_urls or
           new.user_id is distinct from old.user_id or new.project_id is distinct from old.project_id
       )) then
      raise exception 'Video approval bindings are server managed';
    end if;
  end if;
  return new;
end;
$$;
create trigger protect_video_publish_binding before insert or update on public.scheduled_posts
for each row execute function public.protect_video_publish_binding();

-- Keep the audit record and queued binding when project content changes.
create function public.revoke_changed_project_exports() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE'
    or row(new.output_url, new.metadata, new.music, new.voice, new.aspect_ratio, new.duration_sec, new.style)
       is distinct from row(old.output_url, old.metadata, old.music, old.voice, old.aspect_ratio, old.duration_sec, old.style)
  then
    update public.video_publish_approvals set revoked_at = now()
      where project_id = old.id and user_id = old.user_id and revoked_at is null;
  end if;
  return null;
end;
$$;
revoke all on function public.revoke_changed_project_exports() from public, anon, authenticated;
create trigger revoke_changed_project_exports after update or delete on public.projects
for each row execute function public.revoke_changed_project_exports();
