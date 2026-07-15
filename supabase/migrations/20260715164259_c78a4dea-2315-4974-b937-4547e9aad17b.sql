
CREATE TABLE public.asset_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('image','video','logo','voiceover','music','character','background','document')),
  title TEXT NOT NULL DEFAULT 'Untitled',
  description TEXT,
  url TEXT NOT NULL,
  storage_path TEXT,
  thumbnail_url TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  duration_seconds NUMERIC,
  width INTEGER,
  height INTEGER,
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  favorite BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_library TO authenticated;
GRANT ALL ON public.asset_library TO service_role;

ALTER TABLE public.asset_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "asset_library owner all" ON public.asset_library
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_asset_library_user_created ON public.asset_library (user_id, created_at DESC);
CREATE INDEX idx_asset_library_kind ON public.asset_library (user_id, kind);
CREATE INDEX idx_asset_library_tags ON public.asset_library USING GIN (tags);

CREATE TRIGGER trg_asset_library_updated_at
  BEFORE UPDATE ON public.asset_library
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Storage policies for the public 'library' bucket (auth users manage own folder)
CREATE POLICY "library_read_public" ON storage.objects FOR SELECT
  USING (bucket_id = 'library');
CREATE POLICY "library_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'library' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "library_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'library' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "library_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'library' AND auth.uid()::text = (storage.foldername(name))[1]);
