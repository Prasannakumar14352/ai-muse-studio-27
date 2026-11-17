-- Model Studio: one row per third-party model run (Seedance, FLUX, ElevenLabs…).
-- Credits are reserved on submit and finalized/refunded when the job ends,
-- using the existing reserve_credits / finalize_credits / refund_credits_by_ledger RPCs.
CREATE TABLE IF NOT EXISTS public.model_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('video', 'image', 'audio')),
  prompt text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  credits integer NOT NULL CHECK (credits >= 0),
  provider_cost_usd numeric(10, 4) NOT NULL DEFAULT 0,
  ledger_id text,
  provider_request_id text,
  status_url text,
  response_url text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'completed', 'failed')),
  output_url text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS model_generations_user_created_idx
  ON public.model_generations (user_id, created_at DESC);

ALTER TABLE public.model_generations ENABLE ROW LEVEL SECURITY;

-- Users may read their own runs. All writes go through server functions
-- using the service role, so there are no insert/update/delete policies.
CREATE POLICY "model_generations_select_own"
  ON public.model_generations FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER model_generations_set_updated_at
  BEFORE UPDATE ON public.model_generations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
