
-- Templates: negative prompt, credits, draft/published status
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS negative_prompt text,
  ADD COLUMN IF NOT EXISTS credits integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'templates_status_check') THEN
    ALTER TABLE public.templates ADD CONSTRAINT templates_status_check CHECK (status IN ('draft','published'));
  END IF;
END $$;

-- Template version history
CREATE TABLE IF NOT EXISTS public.template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);
GRANT SELECT ON public.template_versions TO authenticated;
GRANT ALL ON public.template_versions TO service_role;
ALTER TABLE public.template_versions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='template_versions' AND policyname='Admins can read template versions') THEN
    CREATE POLICY "Admins can read template versions" ON public.template_versions
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- Brand kits: add legacy/UI-compat columns + default styles
ALTER TABLE public.brand_kits
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS secondary_color text,
  ADD COLUMN IF NOT EXISTS font_primary text,
  ADD COLUMN IF NOT EXISTS font_secondary text,
  ADD COLUMN IF NOT EXISTS default_styles jsonb NOT NULL DEFAULT '{}'::jsonb;
