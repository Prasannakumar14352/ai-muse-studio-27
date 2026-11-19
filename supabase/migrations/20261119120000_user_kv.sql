-- Cloud copy of each user's saved work. The app keeps a fast local copy in
-- the browser and mirrors every "cv:" entry here, so work survives a new
-- device or a cleared browser. Files (images, videos) are mirrored to the
-- private "library" bucket under <user id>/blobs/.
CREATE TABLE IF NOT EXISTS public.user_kv (
  user_id uuid NOT NULL DEFAULT auth.uid(),
  key text NOT NULL,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
ALTER TABLE public.user_kv ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own kv" ON public.user_kv;
CREATE POLICY "own kv" ON public.user_kv FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
