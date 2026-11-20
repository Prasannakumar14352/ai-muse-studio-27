-- Content plan: CreatorFlow's own 30-day social calendar (admin only).
-- Each item is one day's post; the post-creator agent drafts a post per
-- platform into agent_tasks ("waiting_approval"), and nothing publishes
-- until an admin approves it.

CREATE TABLE IF NOT EXISTS public.content_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_number integer,
  plan_date date NOT NULL,
  idea text NOT NULL,
  format text NOT NULL CHECK (format IN ('reel', 'long', 'carousel', 'image')),
  -- walkthrough = an existing product clip; otherwise the studio to build it in
  build text NOT NULL CHECK (build IN ('walkthrough', 'video', 'thumbnail', 'carousel', 'image')),
  media_id text,
  -- [{"platform":"instagram","time":"19:30"}] — times are IST
  platforms jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'drafted', 'done', 'skipped')),
  drafted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_plan_items_date_idx ON public.content_plan_items (plan_date);

ALTER TABLE public.content_plan_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage content plan" ON public.content_plan_items;
CREATE POLICY "Admins manage content plan" ON public.content_plan_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed the 30-day launch plan (21 Nov – 20 Dec 2026) once.
INSERT INTO public.content_plan_items (day_number, plan_date, idea, format, build, media_id, platforms, notes)
SELECT v.* FROM (VALUES
  (1, DATE '2026-11-21', 'Launch: 60-sec tour — reels, carousels, thumbnails in one studio', 'reel', 'walkthrough', 'tour', '[{"platform":"instagram","time":"19:30"},{"platform":"youtube","time":"18:30"},{"platform":"facebook","time":"20:30"}]'::jsonb, NULL),
  (2, DATE '2026-11-22', '"Telugu reel in 60 seconds" — trending topic, finished reel + free-signup CTA', 'reel', 'video', NULL, '[{"platform":"instagram","time":"19:30"},{"platform":"youtube","time":"18:30"},{"platform":"facebook","time":"20:30"}]'::jsonb, NULL),
  (3, DATE '2026-11-23', 'Feature demo: Research — "Should I make this video?" verdict', 'reel', 'walkthrough', 'research', '[{"platform":"instagram","time":"19:30"},{"platform":"youtube","time":"18:30"},{"platform":"facebook","time":"20:30"}]'::jsonb, NULL),
  (4, DATE '2026-11-24', 'One topic, two languages — Telugu reel on Instagram, Hindi version on YouTube', 'reel', 'video', NULL, '[{"platform":"instagram","time":"19:30"},{"platform":"youtube","time":"18:30"},{"platform":"facebook","time":"20:30"}]'::jsonb, NULL),
  (5, DATE '2026-11-25', 'Before / after thumbnail — plain photo vs Thumbnail Studio, Telugu headline', 'image', 'thumbnail', NULL, '[{"platform":"instagram","time":"12:30"},{"platform":"facebook","time":"13:00"}]'::jsonb, NULL),
  (6, DATE '2026-11-26', '7 faceless video ideas for Telugu creators', 'carousel', 'carousel', NULL, '[{"platform":"instagram","time":"12:30"},{"platform":"facebook","time":"13:00"}]'::jsonb, NULL),
  (7, DATE '2026-11-27', 'Price math: a month of daily reels for less than one editor hour (LAUNCH20)', 'reel', 'video', NULL, '[{"platform":"instagram","time":"19:30"},{"platform":"youtube","time":"18:30"},{"platform":"facebook","time":"20:30"}]'::jsonb, 'Telegram 19:00 — send the week''s offer note from Agent HQ → Marketing.'),
  (8, DATE '2026-11-28', 'Research → reel #1: score a trending topic, then make the reel', 'reel', 'video', NULL, '[{"platform":"instagram","time":"19:30"},{"platform":"youtube","time":"18:30"},{"platform":"facebook","time":"20:30"}]'::jsonb, NULL),
  (9, DATE '2026-11-29', 'How to start a faceless Telugu channel with AI (8–10 min)', 'long', 'video', NULL, '[{"platform":"youtube","time":"10:00"},{"platform":"instagram","time":"19:30"},{"platform":"facebook","time":"20:30"}]'::jsonb, NULL),
  (10, DATE '2026-11-30', 'Feature demo: Thumbnail Studio — styles and CTR options', 'reel', 'walkthrough', 'thumbnails', '[{"platform":"instagram","time":"19:30"},{"platform":"youtube","time":"18:30"},{"platform":"facebook","time":"20:30"}]'::jsonb, NULL),
  (11, DATE '2026-12-01', 'Hindi motivational reel — shows Hindi voice and timing', 'reel', 'video', NULL, '[{"platform":"instagram","time":"19:30"},{"platform":"youtube","time":"18:30"},{"platform":"facebook","time":"20:30"}]'::jsonb, NULL),
  (12, DATE '2026-12-02', 'Hook formulas that stop the scroll', 'carousel', 'carousel', NULL, '[{"platform":"instagram","time":"12:30"},{"platform":"facebook","time":"13:00"}]'::jsonb, NULL),
  (13, DATE '2026-12-03', 'Feature demo: Captions — 30 hashtags in one click', 'reel', 'walkthrough', 'captions', '[{"platform":"instagram","time":"19:30"},{"platform":"youtube","time":"18:30"},{"platform":"facebook","time":"20:30"}]'::jsonb, NULL),
  (14, DATE '2026-12-04', 'Lifetime deal explainer: pay once, create every month (LAUNCH20)', 'reel', 'video', NULL, '[{"platform":"instagram","time":"19:30"},{"platform":"youtube","time":"18:30"},{"platform":"facebook","time":"20:30"}]'::jsonb, 'Telegram 19:00 — send the week''s offer note from Agent HQ → Marketing.'),
  (15, DATE '2026-12-05', 'Research → reel #2', 'reel', 'video', NULL, '[{"platform":"instagram","time":"19:30"},{"platform":"youtube","time":"18:30"},{"platform":"facebook","time":"20:30"}]'::jsonb, NULL),
  (16, DATE '2026-12-06', 'Make a month of Instagram content in 1 hour (8–10 min)', 'long', 'video', NULL, '[{"platform":"youtube","time":"10:00"},{"platform":"instagram","time":"19:30"},{"platform":"facebook","time":"20:30"}]'::jsonb, NULL),
  (17, DATE '2026-12-07', 'Feature demo: Carousel Creator — 7 slides in one go', 'reel', 'walkthrough', 'carousels', '[{"platform":"instagram","time":"19:30"},{"platform":"youtube","time":"18:30"},{"platform":"facebook","time":"20:30"}]'::jsonb, NULL),
  (18, DATE '2026-12-08', 'Telugu story / devotional reel — popular niche demo', 'reel', 'video', NULL, '[{"platform":"instagram","time":"19:30"},{"platform":"youtube","time":"18:30"},{"platform":"facebook","time":"20:30"}]'::jsonb, NULL),
  (19, DATE '2026-12-09', 'Small business: plain product photo → AI ad image', 'image', 'image', NULL, '[{"platform":"instagram","time":"12:30"},{"platform":"facebook","time":"13:00"}]'::jsonb, NULL),
  (20, DATE '2026-12-10', 'December festival post ideas for small shops', 'carousel', 'carousel', NULL, '[{"platform":"instagram","time":"12:30"},{"platform":"facebook","time":"13:00"}]'::jsonb, NULL),
  (21, DATE '2026-12-11', 'Myth-buster: "AI can''t write Telugu correctly" — show clean native-script text', 'reel', 'video', NULL, '[{"platform":"instagram","time":"19:30"},{"platform":"youtube","time":"18:30"},{"platform":"facebook","time":"20:30"}]'::jsonb, 'Telegram 19:00 — send the week''s offer note from Agent HQ → Marketing.'),
  (22, DATE '2026-12-12', 'Research → reel #3', 'reel', 'video', NULL, '[{"platform":"instagram","time":"19:30"},{"platform":"youtube","time":"18:30"},{"platform":"facebook","time":"20:30"}]'::jsonb, NULL),
  (23, DATE '2026-12-13', 'Thumbnail mistakes that kill views, and the fixes (8–10 min)', 'long', 'video', NULL, '[{"platform":"youtube","time":"10:00"},{"platform":"instagram","time":"19:30"},{"platform":"facebook","time":"20:30"}]'::jsonb, NULL),
  (24, DATE '2026-12-14', 'Feature demo: Content planner / calendar', 'reel', 'walkthrough', 'planner', '[{"platform":"instagram","time":"19:30"},{"platform":"youtube","time":"18:30"},{"platform":"facebook","time":"20:30"}]'::jsonb, NULL),
  (25, DATE '2026-12-15', 'Your shop''s festival offer reel in 2 minutes', 'reel', 'video', NULL, '[{"platform":"instagram","time":"19:30"},{"platform":"youtube","time":"18:30"},{"platform":"facebook","time":"20:30"}]'::jsonb, NULL),
  (26, DATE '2026-12-16', 'Thumbnail makeover: weak demo thumbnail → improved', 'image', 'thumbnail', NULL, '[{"platform":"instagram","time":"12:30"},{"platform":"facebook","time":"13:00"}]'::jsonb, NULL),
  (27, DATE '2026-12-17', 'Your first 30 days on YouTube: a plan', 'carousel', 'carousel', NULL, '[{"platform":"instagram","time":"12:30"},{"platform":"facebook","time":"13:00"}]'::jsonb, NULL),
  (28, DATE '2026-12-18', 'Christmas offer reel — LAUNCH20 ends 31 Dec', 'reel', 'video', NULL, '[{"platform":"instagram","time":"19:30"},{"platform":"youtube","time":"18:30"},{"platform":"facebook","time":"20:30"}]'::jsonb, 'Telegram 19:00 — send the week''s offer note from Agent HQ → Marketing.'),
  (29, DATE '2026-12-19', 'Research → reel #4: topic of the week', 'reel', 'video', NULL, '[{"platform":"instagram","time":"19:30"},{"platform":"youtube","time":"18:30"},{"platform":"facebook","time":"20:30"}]'::jsonb, NULL),
  (30, DATE '2026-12-20', '30-day recap: what we shipped + full tour repost', 'long', 'video', NULL, '[{"platform":"youtube","time":"10:00"},{"platform":"instagram","time":"19:30"},{"platform":"facebook","time":"20:30"}]'::jsonb, NULL)
) AS v(day_number, plan_date, idea, format, build, media_id, platforms, notes)
WHERE NOT EXISTS (SELECT 1 FROM public.content_plan_items);
