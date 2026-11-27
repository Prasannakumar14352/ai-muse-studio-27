-- Already applied to production on 2026-11-27 (ProdXStore Phase 1). Kept here so the repo matches the database.
-- Store-facing product fields (prodxstore.com reads these directly)
alter table public.pxs_products
  add column if not exists category text not null default 'Creator Tools',
  add column if not exists image text,
  add column if not exists gallery jsonb not null default '[]'::jsonb,
  add column if not exists badge text,
  add column if not exists featured boolean not null default false,
  add column if not exists display_order integer not null default 0,
  add column if not exists show_in_store boolean not null default true,
  add column if not exists coming_soon boolean not null default false,
  add column if not exists landing_url text,
  add column if not exists external_checkout_url text,
  add column if not exists pricing_url text,
  add column if not exists billing_period text not null default 'one-time',
  add column if not exists price_note text,
  add column if not exists cta_text text not null default 'Buy now',
  add column if not exists plans jsonb not null default '[]'::jsonb,
  add column if not exists whats_included jsonb not null default '[]'::jsonb;

-- Store currency can be USD for subscriptions shown with external checkout (e.g. CreatorFlow AI)
-- Razorpay checkout only accepts INR products without an external checkout URL.

-- Reviews
create table if not exists public.pxs_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.pxs_products(id) on delete cascade,
  customer_name text not null check (char_length(customer_name) between 1 and 80),
  customer_email text check (customer_email is null or char_length(customer_email) <= 200),
  rating integer not null check (rating between 1 and 5),
  body text not null check (char_length(body) between 10 and 1500),
  status text not null default 'pending' check (status in ('pending','approved','rejected','hidden')),
  is_featured boolean not null default false,
  is_verified_buyer boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists pxs_reviews_product_idx on public.pxs_reviews (product_id, status);

-- Site settings (offer banner etc.)
create table if not exists public.pxs_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Contact messages
create table if not exists public.pxs_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 200),
  topic text not null default 'General' check (char_length(topic) <= 80),
  message text not null check (char_length(message) between 5 and 4000),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- Newsletter
create table if not exists public.pxs_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and char_length(email) between 3 and 200),
  created_at timestamptz not null default now()
);

alter table public.pxs_reviews enable row level security;
alter table public.pxs_settings enable row level security;
alter table public.pxs_messages enable row level security;
alter table public.pxs_subscribers enable row level security;

-- Reviews: visitors submit pending reviews; everyone reads approved ones (email column hidden from the public)
create policy "pxs reviews public read approved" on public.pxs_reviews
  for select to anon, authenticated using (status = 'approved' or public.is_admin(auth.uid()));
create policy "pxs reviews public submit" on public.pxs_reviews
  for insert to anon, authenticated
  with check (status = 'pending' and is_featured = false and is_verified_buyer = false);
create policy "pxs reviews admin update" on public.pxs_reviews
  for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "pxs reviews admin delete" on public.pxs_reviews
  for delete to authenticated using (public.is_admin(auth.uid()));
revoke select on public.pxs_reviews from anon;
grant select (id, product_id, customer_name, rating, body, status, is_featured, is_verified_buyer, created_at) on public.pxs_reviews to anon;
grant insert (id, product_id, customer_name, customer_email, rating, body) on public.pxs_reviews to anon;

-- Settings: public read, admin write
create policy "pxs settings public read" on public.pxs_settings for select to anon, authenticated using (true);
create policy "pxs settings admin write" on public.pxs_settings for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Messages: visitors can only send; admins read/manage
create policy "pxs messages public send" on public.pxs_messages for insert to anon, authenticated with check (resolved = false);
create policy "pxs messages admin read" on public.pxs_messages for select to authenticated using (public.is_admin(auth.uid()));
create policy "pxs messages admin update" on public.pxs_messages for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "pxs messages admin delete" on public.pxs_messages for delete to authenticated using (public.is_admin(auth.uid()));

-- Subscribers: visitors can only add; admins read/remove
create policy "pxs subs public add" on public.pxs_subscribers for insert to anon, authenticated with check (true);
create policy "pxs subs admin read" on public.pxs_subscribers for select to authenticated using (public.is_admin(auth.uid()));
create policy "pxs subs admin delete" on public.pxs_subscribers for delete to authenticated using (public.is_admin(auth.uid()));

-- Public ratings summary per product
create or replace view public.pxs_product_ratings with (security_invoker = true) as
  select product_id, round(avg(rating)::numeric, 1) as average, count(*)::int as count
  from public.pxs_reviews where status = 'approved' group by product_id;
grant select on public.pxs_product_ratings to anon, authenticated;

-- Product images bucket (public read, admin upload)
insert into storage.buckets (id, name, public) values ('pxs-product-images', 'pxs-product-images', true)
on conflict (id) do nothing;
create policy "pxs images admin upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'pxs-product-images' and public.is_admin(auth.uid()));
create policy "pxs images admin update" on storage.objects for update to authenticated
  using (bucket_id = 'pxs-product-images' and public.is_admin(auth.uid()));
create policy "pxs images admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'pxs-product-images' and public.is_admin(auth.uid()));

insert into public.pxs_settings (key, value) values ('offer_banner',
  '{"enabled": true, "label": "Launch offer:", "text": "20% off every CreatorFlow AI plan & credit pack — applied at checkout", "link_url": "https://creatorflowai.prodxstore.com/pricing", "link_label": "See plans", "countdown_minutes": 60}')
on conflict (key) do nothing;
