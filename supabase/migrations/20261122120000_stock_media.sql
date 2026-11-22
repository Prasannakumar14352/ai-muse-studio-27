-- Free stock media (Pixabay) — server-side cache + per-user rate limit.
--
-- Pixabay's API terms require every search response to be cached for 24 hours
-- and forbid systematic mass downloads. Both tables are written only by the
-- server (service role); RLS is on with no policies so browsers can't touch them.

CREATE TABLE IF NOT EXISTS public.stock_media_cache (
  cache_key text PRIMARY KEY,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_media_cache_created ON public.stock_media_cache (created_at);
ALTER TABLE public.stock_media_cache ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.stock_media_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  action text NOT NULL DEFAULT 'search',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_media_requests_user ON public.stock_media_requests (user_id, created_at DESC);
ALTER TABLE public.stock_media_requests ENABLE ROW LEVEL SECURITY;
