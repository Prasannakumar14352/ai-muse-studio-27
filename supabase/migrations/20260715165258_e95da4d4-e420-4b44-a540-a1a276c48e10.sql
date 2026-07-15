
CREATE TABLE public.landing_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('testimonial','demo')),
  title text,
  subtitle text,
  country text,
  company text,
  quote text,
  review text,
  poster_url text,
  video_url text,
  video_type text CHECK (video_type IS NULL OR video_type IN ('mp4','webm','youtube','vimeo')),
  duration text,
  source text CHECK (source IS NULL OR source IN ('customer','sample','demo')),
  rating int CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.landing_media TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_media TO authenticated;
GRANT ALL ON public.landing_media TO service_role;

ALTER TABLE public.landing_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published landing media" ON public.landing_media
  FOR SELECT TO anon, authenticated USING (status = 'published');

CREATE POLICY "Admins can view all landing media" ON public.landing_media
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can insert landing media" ON public.landing_media
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update landing media" ON public.landing_media
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete landing media" ON public.landing_media
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_landing_media_updated_at BEFORE UPDATE ON public.landing_media
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_landing_media_kind_status_order ON public.landing_media (kind, status, display_order);

-- Storage policies for 'landing' bucket: public read, admin write
CREATE POLICY "Public read landing bucket" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'landing');

CREATE POLICY "Admins upload to landing" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'landing' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins update landing" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'landing' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins delete landing" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'landing' AND public.has_role(auth.uid(), 'admin'::public.app_role));
