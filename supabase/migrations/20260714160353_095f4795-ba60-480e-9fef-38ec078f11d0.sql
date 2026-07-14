
ALTER TABLE public.pricing_plans RENAME COLUMN price_monthly_inr TO price_monthly_usd;
ALTER TABLE public.pricing_plans RENAME COLUMN price_yearly_inr TO price_yearly_usd;
ALTER TABLE public.pricing_plans RENAME COLUMN price_lifetime_inr TO price_lifetime_usd;

UPDATE public.pricing_plans SET price_monthly_usd = 0,   price_yearly_usd = 0,   price_lifetime_usd = 0   WHERE code = 'free';
UPDATE public.pricing_plans SET price_monthly_usd = 5,   price_yearly_usd = 49,  price_lifetime_usd = 0   WHERE code = 'starter';
UPDATE public.pricing_plans SET price_monthly_usd = 15,  price_yearly_usd = 149, price_lifetime_usd = 0   WHERE code = 'pro';
UPDATE public.pricing_plans SET price_monthly_usd = 29,  price_yearly_usd = 289, price_lifetime_usd = 0   WHERE code = 'business';
UPDATE public.pricing_plans SET price_monthly_usd = 0,   price_yearly_usd = 0,   price_lifetime_usd = 0   WHERE code = 'enterprise';
UPDATE public.pricing_plans SET price_monthly_usd = 0,   price_yearly_usd = 0,   price_lifetime_usd = 149 WHERE code = 'lifetime';
