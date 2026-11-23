-- Landing "Made with CreatorFlow AI" showcase: videos generated in the app,
-- each with the prompt that made it. Also allows 'walkthrough' (the admin
-- page already offered it, but the original check only allowed
-- testimonial/demo, so saving a walkthrough failed).
ALTER TABLE public.landing_media DROP CONSTRAINT IF EXISTS landing_media_kind_check;
ALTER TABLE public.landing_media
  ADD CONSTRAINT landing_media_kind_check CHECK (kind IN ('testimonial', 'demo', 'walkthrough', 'showcase'));

ALTER TABLE public.landing_media
  ADD COLUMN IF NOT EXISTS prompt text,          -- the exact prompt / idea that produced the video
  ADD COLUMN IF NOT EXISTS tool text,            -- which CreatorFlow tool made it, e.g. "AI Video Studio"
  ADD COLUMN IF NOT EXISTS source_ref text;      -- where it came from in the app (video / project id)
