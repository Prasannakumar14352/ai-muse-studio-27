-- Festival / promo offers, managed from Admin → Offers.
-- Codes are never readable from the browser: everything goes through server
-- functions that use the service role (RLS on, no public policies).

CREATE TABLE IF NOT EXISTS public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,                                   -- stored UPPERCASE, e.g. DIWALI30
  title text NOT NULL DEFAULT '',                       -- "Diwali offer"
  discount_type text NOT NULL CHECK (discount_type IN ('percent', 'flat_inr', 'bonus_credits')),
  discount_value numeric NOT NULL CHECK (discount_value > 0),
                                                        -- percent: 1-90 · flat_inr: rupees · bonus_credits: % extra credits
  applies_to text[] NOT NULL DEFAULT ARRAY['packs','monthly','yearly','lifetime','autopay'],
  plan_codes text[] NOT NULL DEFAULT '{}',              -- empty = every plan
  recurring text NOT NULL DEFAULT 'first' CHECK (recurring IN ('first', 'cycles', 'forever')),
  recurring_cycles integer CHECK (recurring_cycles IS NULL OR recurring_cycles BETWEEN 1 AND 36),
  razorpay_offer_id text,                               -- offer_… from Razorpay Dashboard, for auto-renew discounts
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  per_user_limit integer NOT NULL DEFAULT 1 CHECK (per_user_limit > 0),
  min_amount_inr integer NOT NULL DEFAULT 0 CHECK (min_amount_inr >= 0),
  active boolean NOT NULL DEFAULT true,
  show_banner boolean NOT NULL DEFAULT false,
  banner_text text,
  auto_apply boolean NOT NULL DEFAULT false,            -- applies at checkout without typing the code
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS offers_code_key ON public.offers (upper(code));
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

-- One row per checkout that used an offer. 'pending' until the payment succeeds.
CREATE TABLE IF NOT EXISTS public.offer_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_ref text NOT NULL UNIQUE,                     -- Razorpay order_… or sub_…
  kind text NOT NULL,                                   -- packs | monthly | yearly | lifetime | autopay
  original_paise integer NOT NULL DEFAULT 0,
  discount_paise integer NOT NULL DEFAULT 0,
  amount_paise integer NOT NULL DEFAULT 0,              -- what the customer pays (first payment)
  bonus_credits integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'redeemed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz
);
CREATE INDEX IF NOT EXISTS offer_redemptions_offer_idx ON public.offer_redemptions (offer_id, status);
CREATE INDEX IF NOT EXISTS offer_redemptions_user_idx ON public.offer_redemptions (user_id, offer_id, status);
ALTER TABLE public.offer_redemptions ENABLE ROW LEVEL SECURITY;
