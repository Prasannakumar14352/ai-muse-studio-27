CREATE TABLE public.image_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  prompt text NOT NULL,
  style text,
  ratio text,
  full_prompt text,
  request jsonb NOT NULL DEFAULT '{}'::jsonb,
  response jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  success_count int NOT NULL DEFAULT 0,
  failure_count int NOT NULL DEFAULT 0,
  duration_ms int NOT NULL DEFAULT 0
);

CREATE INDEX image_generations_user_created_idx
  ON public.image_generations (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.image_generations TO authenticated;
GRANT ALL ON public.image_generations TO service_role;

ALTER TABLE public.image_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own image_generations"
  ON public.image_generations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own image_generations"
  ON public.image_generations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own image_generations"
  ON public.image_generations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);