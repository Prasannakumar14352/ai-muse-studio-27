
-- Templates module
CREATE TABLE public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('short_video','long_video','product_promo','documentary','carousel','linkedin_post','image','thumbnail','seo_pack')),
  description TEXT NOT NULL DEFAULT '',
  preview_image_url TEXT,
  aspect_ratio TEXT,
  platform TEXT,
  style TEXT,
  default_prompt TEXT NOT NULL DEFAULT '',
  default_brief JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags TEXT[] NOT NULL DEFAULT '{}',
  access_tier TEXT NOT NULL DEFAULT 'free' CHECK (access_tier IN ('free','starter','creator','pro')),
  featured BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.templates TO authenticated;
GRANT ALL ON public.templates TO service_role;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_active_templates" ON public.templates FOR SELECT TO authenticated USING (active = true OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin_write_templates_ins" ON public.templates FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin_write_templates_upd" ON public.templates FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin_write_templates_del" ON public.templates FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER templates_updated_at BEFORE UPDATE ON public.templates FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX templates_category_idx ON public.templates(category, sort_order);
CREATE INDEX templates_featured_idx ON public.templates(featured) WHERE featured = true;

CREATE TABLE public.template_favorites (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, template_id)
);
GRANT SELECT, INSERT, DELETE ON public.template_favorites TO authenticated;
GRANT ALL ON public.template_favorites TO service_role;
ALTER TABLE public.template_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_favorites_all" ON public.template_favorites FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Seed 27 templates (3 per category)
INSERT INTO public.templates (slug, name, category, description, aspect_ratio, platform, style, default_prompt, default_brief, tags, access_tier, featured, sort_order) VALUES
-- Short video / Reel
('reel-morning-habits','Morning Habits That Change Your Life','short_video','Punchy 30s vertical reel with hook, 3 tips, CTA.','9:16','instagram','cinematic','A high-energy 30-second reel about 3 morning habits that transform productivity and mood.', '{"tone":"Energetic","platform":"instagram","aspect_ratio":"9:16","duration":30,"scenes":[{"beat":"Hook: You have been mornings wrong","seconds":3},{"beat":"Habit 1: Cold water splash","seconds":8},{"beat":"Habit 2: 5-min journaling","seconds":8},{"beat":"Habit 3: Silent walk","seconds":8},{"beat":"CTA: Save this for tomorrow","seconds":3}]}', ARRAY['reel','viral','morning','habits'], 'free', true, 10),
('reel-ai-tools-3','3 AI Tools I Cannot Work Without','short_video','Fast-paced product-highlight reel.','9:16','tiktok','minimal','A 30s TikTok showcasing 3 AI tools with quick UI cutaways and voiceover.', '{"tone":"Viral","platform":"tiktok","aspect_ratio":"9:16","duration":30,"scenes":[{"beat":"Hook: Stop using ChatGPT wrong","seconds":3},{"beat":"Tool 1 demo","seconds":8},{"beat":"Tool 2 demo","seconds":8},{"beat":"Tool 3 demo","seconds":8},{"beat":"Follow for more","seconds":3}]}', ARRAY['ai','tools','reel'], 'starter', false, 20),
('reel-money-tip','One Money Habit That Made Me Rich','short_video','Cinematic finance hook reel.','9:16','instagram','cinematic','A cinematic 45s reel on one non-obvious money habit.', '{"tone":"Emotional","platform":"instagram","aspect_ratio":"9:16","duration":45,"scenes":[{"beat":"Cold open: Bank balance shot","seconds":5},{"beat":"The mistake everyone makes","seconds":10},{"beat":"The one habit","seconds":15},{"beat":"Proof / result","seconds":10},{"beat":"CTA","seconds":5}]}', ARRAY['finance','reel','viral'], 'creator', true, 30),

-- Long Video
('long-yt-explainer','YouTube Explainer (8 min)','long_video','Structured 8-minute educational YouTube video with chapters.','16:9','youtube','documentary','An 8-minute in-depth explainer with intro, 3 chapters, examples, and outro CTA.', '{"tone":"Educational","platform":"youtube","aspect_ratio":"16:9","duration":480,"scenes":[{"beat":"Hook + promise","seconds":30},{"beat":"Intro / channel","seconds":30},{"beat":"Chapter 1: Concept","seconds":120},{"beat":"Chapter 2: Example","seconds":120},{"beat":"Chapter 3: Application","seconds":120},{"beat":"Recap + CTA","seconds":60}]}', ARRAY['youtube','long','explainer'], 'starter', false, 10),
('long-yt-story','Narrative Story Video (10 min)','long_video','MagnatesMedia-style narrative deep dive.','16:9','youtube','cinematic','A 10-minute cinematic narrative video about a business/history story with reveals.', '{"tone":"Cinematic","platform":"youtube","aspect_ratio":"16:9","duration":600,"scenes":[{"beat":"Cold open teaser","seconds":45},{"beat":"Act 1: Setup","seconds":180},{"beat":"Act 2: Conflict","seconds":180},{"beat":"Act 3: Resolution","seconds":150},{"beat":"Lesson + CTA","seconds":45}]}', ARRAY['story','narrative','youtube'], 'creator', true, 20),
('long-yt-listicle','Top 10 Countdown Video','long_video','Retention-optimized listicle with rank reveals.','16:9','youtube','cinematic','A 12-minute Top 10 countdown with a strong #1 tease every 90s.', '{"tone":"Viral","platform":"youtube","aspect_ratio":"16:9","duration":720,"scenes":[{"beat":"Hook + #1 tease","seconds":45},{"beat":"#10 to #6","seconds":300},{"beat":"Mid-video re-tease","seconds":30},{"beat":"#5 to #2","seconds":240},{"beat":"#1 reveal","seconds":75},{"beat":"CTA","seconds":30}]}', ARRAY['listicle','top10','youtube'], 'pro', true, 30),

-- Product promo
('promo-saas-launch','SaaS Launch Spot (45s)','product_promo','Problem-solution-CTA launch video.','16:9','youtube','minimal','A 45s SaaS launch spot: problem, solution demo, benefits, CTA.', '{"tone":"Professional","platform":"youtube","aspect_ratio":"16:9","duration":45,"scenes":[{"beat":"Problem","seconds":8},{"beat":"Meet the product","seconds":10},{"beat":"Feature demo","seconds":15},{"beat":"Social proof","seconds":7},{"beat":"CTA","seconds":5}]}', ARRAY['saas','launch','promo'], 'starter', false, 10),
('promo-ecom-hero','E-commerce Product Hero','product_promo','30s cinematic hero shot for a physical product.','1:1','instagram','cinematic','A 30s cinematic product hero for Instagram: macro shots, lifestyle, CTA.', '{"tone":"Luxury","platform":"instagram","aspect_ratio":"1:1","duration":30,"scenes":[{"beat":"Macro reveal","seconds":6},{"beat":"Lifestyle in-use","seconds":10},{"beat":"Feature callouts","seconds":8},{"beat":"Price + CTA","seconds":6}]}', ARRAY['ecommerce','product','hero'], 'creator', true, 20),
('promo-app-download','Mobile App Download Ad','product_promo','15s app install ad optimized for stories.','9:16','instagram','anime','A 15s vertical app install ad with animated UI and CTA.', '{"tone":"Energetic","platform":"instagram","aspect_ratio":"9:16","duration":15,"scenes":[{"beat":"Hook: pain","seconds":4},{"beat":"App demo","seconds":7},{"beat":"Download CTA","seconds":4}]}', ARRAY['app','install','ad'], 'pro', false, 30),

-- Documentary
('doc-brand-story','Brand Origin Documentary (5 min)','documentary','Emotional founder-story documentary.','16:9','youtube','documentary','A 5-minute brand origin documentary in Nat Geo style.', '{"tone":"Cinematic","platform":"youtube","aspect_ratio":"16:9","duration":300,"scenes":[{"beat":"Opening scene","seconds":30},{"beat":"The problem","seconds":60},{"beat":"The journey","seconds":90},{"beat":"The breakthrough","seconds":60},{"beat":"Where we are now","seconds":45},{"beat":"CTA","seconds":15}]}', ARRAY['documentary','brand','story'], 'creator', true, 10),
('doc-mystery','Unsolved Mystery Deep Dive','documentary','Suspenseful investigative doc.','16:9','youtube','dark','A 6-minute unsolved mystery investigation with cliffhanger pacing.', '{"tone":"Cinematic","platform":"youtube","aspect_ratio":"16:9","duration":360,"scenes":[{"beat":"Cold open mystery","seconds":40},{"beat":"Background","seconds":80},{"beat":"Theory 1","seconds":80},{"beat":"Theory 2","seconds":80},{"beat":"What we know","seconds":60},{"beat":"You decide","seconds":20}]}', ARRAY['mystery','documentary','dark'], 'pro', true, 20),
('doc-tech-history','Tech History Explainer','documentary','How-it-was-built style tech history.','16:9','youtube','cinematic','A 7-minute tech history documentary on how a technology was built.', '{"tone":"Educational","platform":"youtube","aspect_ratio":"16:9","duration":420,"scenes":[{"beat":"Hook","seconds":30},{"beat":"Origin","seconds":90},{"beat":"Turning point","seconds":90},{"beat":"Rise","seconds":90},{"beat":"Today","seconds":90},{"beat":"CTA","seconds":30}]}', ARRAY['tech','history','documentary'], 'creator', false, 30),

-- Carousel
('carousel-5-tips','5 Tips Carousel','carousel','Classic Instagram 5-slide tips carousel.','1:1','instagram','minimal','A 7-slide Instagram carousel: cover + 5 tips + CTA.', '{"tone":"Educational","platform":"instagram","aspect_ratio":"1:1","slides":[{"title":"Cover: 5 tips that changed how I work","body":""},{"title":"Tip 1","body":"..."},{"title":"Tip 2","body":"..."},{"title":"Tip 3","body":"..."},{"title":"Tip 4","body":"..."},{"title":"Tip 5","body":"..."},{"title":"Save this + follow","body":""}]}', ARRAY['carousel','tips','instagram'], 'free', true, 10),
('carousel-mistakes','Common Mistakes Carousel','carousel','Mistake-fix pattern carousel.','1:1','instagram','minimal','A 6-slide carousel: cover + 4 mistakes + fixes + CTA.', '{"tone":"Educational","platform":"instagram","aspect_ratio":"1:1","slides":[{"title":"5 mistakes killing your growth","body":""},{"title":"Mistake 1","body":"Fix: ..."},{"title":"Mistake 2","body":"Fix: ..."},{"title":"Mistake 3","body":"Fix: ..."},{"title":"Mistake 4","body":"Fix: ..."},{"title":"Share this","body":""}]}', ARRAY['carousel','mistakes'], 'starter', false, 20),
('carousel-case-study','Case Study Carousel','carousel','Story-arc case study carousel.','1:1','instagram','cinematic','A 8-slide case study carousel with results.', '{"tone":"Professional","platform":"instagram","aspect_ratio":"1:1","slides":[{"title":"How we grew X to Y","body":""},{"title":"The starting point","body":""},{"title":"The strategy","body":""},{"title":"Step 1","body":""},{"title":"Step 2","body":""},{"title":"Step 3","body":""},{"title":"The result","body":""},{"title":"DM us to replicate","body":""}]}', ARRAY['carousel','case-study'], 'creator', true, 30),

-- LinkedIn post
('li-story-post','Story-Driven LinkedIn Post','linkedin_post','Hook-first personal story post.','1:1','linkedin','minimal','A LinkedIn story post: 1-line hook + 6-line story + lesson + CTA question.', '{"tone":"Professional","platform":"linkedin","format":"text","structure":["1-line hook","6-line story","lesson","question CTA"]}', ARRAY['linkedin','story','post'], 'free', true, 10),
('li-carousel-doc','LinkedIn Document Carousel','linkedin_post','9-slide LinkedIn PDF carousel.','4:5','linkedin','minimal','A 9-slide LinkedIn document carousel on a professional topic.', '{"tone":"Professional","platform":"linkedin","format":"carousel","slides":9}', ARRAY['linkedin','carousel','document'], 'starter', false, 20),
('li-thought-leader','Thought Leadership Post','linkedin_post','Contrarian opinion post with data.','1:1','linkedin','minimal','A contrarian thought-leadership LinkedIn post with a data point + CTA.', '{"tone":"Professional","platform":"linkedin","format":"text","structure":["contrarian hook","3 supporting points","data point","CTA"]}', ARRAY['linkedin','thought-leader'], 'creator', true, 30),

-- Single image
('img-quote-card','Quote Card','image','Typography-forward quote graphic.','1:1','instagram','minimal','A minimal quote card with bold typography on gradient background.', '{"tone":"Emotional","platform":"instagram","aspect_ratio":"1:1","style":"minimal"}', ARRAY['image','quote'], 'free', false, 10),
('img-cinematic-hero','Cinematic Hero Shot','image','16:9 cinematic hero image.','16:9','youtube','cinematic','A cinematic hero shot with teal-orange grade and depth of field.', '{"tone":"Cinematic","aspect_ratio":"16:9","style":"cinematic"}', ARRAY['image','cinematic','hero'], 'starter', true, 20),
('img-3d-product','3D Product Mockup','image','Stylized 3D render of a product on gradient.','1:1','instagram','3d','A stylized 3D product mockup on a soft gradient with subtle shadows.', '{"tone":"Luxury","aspect_ratio":"1:1","style":"3d"}', ARRAY['image','3d','product'], 'creator', false, 30),

-- Thumbnail
('thumb-shock-face','Shocked Face Thumbnail','thumbnail','MrBeast-style high-CTR thumbnail.','16:9','youtube','realistic','A high-CTR YouTube thumbnail with a shocked face, bold 3-word text, and vivid contrast.', '{"platform":"youtube","aspect_ratio":"16:9","style":"realistic","text":"THIS CHANGED EVERYTHING"}', ARRAY['thumbnail','youtube','viral'], 'free', true, 10),
('thumb-before-after','Before / After Thumbnail','thumbnail','Split-screen transformation thumbnail.','16:9','youtube','cinematic','A split-screen before/after transformation thumbnail with bold red arrow.', '{"platform":"youtube","aspect_ratio":"16:9","style":"cinematic","layout":"split"}', ARRAY['thumbnail','before-after'], 'starter', false, 20),
('thumb-luxury','Luxury Product Thumbnail','thumbnail','Premium teal-gold thumbnail.','16:9','youtube','cinematic','A luxury teal-gold thumbnail with elegant typography.', '{"platform":"youtube","aspect_ratio":"16:9","style":"cinematic","text":"THE $10,000 SECRET"}', ARRAY['thumbnail','luxury'], 'creator', true, 30),

-- SEO pack
('seo-blog-post','Blog Post SEO Pack','seo_pack','Full SEO pack for a blog post.','1:1','youtube','minimal','SEO pack for a blog post: title, meta description, 10 keywords, 5 H2s, FAQ.', '{"platform":"blog","components":["title","meta","keywords","h2s","faq"]}', ARRAY['seo','blog'], 'free', false, 10),
('seo-yt-pack','YouTube SEO Pack','seo_pack','Title, description, tags, chapters.','16:9','youtube','minimal','SEO pack for a YouTube video: 5 title options, description, 20 tags, 8 chapter timestamps.', '{"platform":"youtube","components":["titles","description","tags","chapters"]}', ARRAY['seo','youtube'], 'starter', true, 20),
('seo-product-page','Product Page SEO Pack','seo_pack','E-commerce product page SEO.','1:1','shopify','minimal','SEO pack for an e-commerce product page: title, meta, 5 bullet features, description, FAQ.', '{"platform":"shopify","components":["title","meta","bullets","description","faq"]}', ARRAY['seo','ecommerce'], 'pro', false, 30);
