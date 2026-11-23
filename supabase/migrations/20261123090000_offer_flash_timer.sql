-- Flash timer for offers (Admin → Offers). When flash_minutes is set, each
-- visitor gets their own window of that length, starting the first time they
-- see the offer. Refreshing never restarts it. Checkout enforces the window
-- for signed-in buyers via offer_flash_windows.
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS flash_minutes integer CHECK (flash_minutes IS NULL OR flash_minutes BETWEEN 5 AND 10080),
  ADD COLUMN IF NOT EXISTS flash_repeat_days integer CHECK (flash_repeat_days IS NULL OR flash_repeat_days BETWEEN 1 AND 365),
  -- "Restart for everyone" bumps this; windows started before it no longer count.
  ADD COLUMN IF NOT EXISTS flash_epoch timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.offer_flash_windows (
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  epoch timestamptz NOT NULL,
  PRIMARY KEY (offer_id, user_id)
);
ALTER TABLE public.offer_flash_windows ENABLE ROW LEVEL SECURITY;
