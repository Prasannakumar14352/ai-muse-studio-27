-- Already applied to production on 2026-11-27 (ProdXStore checkout, Phase 0). Kept here so the repo matches the database.
-- ProdXStore checkout + transactions (prefixed pxs_ to stay separate from CreatorFlow tables)
create table public.pxs_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  tagline text,
  description text,
  price_paise integer not null check (price_paise > 0),
  mrp_paise integer,
  deposit_paise integer check (deposit_paise is null or deposit_paise > 0),
  currency text not null default 'INR',
  gst_note text default 'incl. GST',
  offer_badge text,
  offer_ends_at timestamptz,
  features jsonb not null default '[]'::jsonb,
  thank_you_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pxs_deposit_lt_price check (deposit_paise is null or deposit_paise < price_paise)
);

create sequence public.pxs_order_seq start 1001;
create sequence public.pxs_invoice_seq start 1;

create table public.pxs_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique default ('PXS-' || nextval('public.pxs_order_seq')),
  product_id uuid references public.pxs_products(id) on delete set null,
  product_name text not null,
  customer_name text,
  email text,
  phone text,
  payment_plan text not null default 'full' check (payment_plan in ('full','deposit')),
  total_paise integer not null,
  paid_paise integer not null default 0,
  status text not null default 'pending' check (status in ('pending','partially_paid','paid','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pxs_transactions (
  id uuid primary key default gen_random_uuid(),
  invoice_no text unique,
  order_id uuid references public.pxs_orders(id) on delete set null,
  product_id uuid references public.pxs_products(id) on delete set null,
  product_name text,
  kind text not null default 'full' check (kind in ('full','deposit','balance','imported')),
  customer_name text,
  email text,
  phone text,
  amount_paise integer not null,
  currency text not null default 'INR',
  gateway text not null default 'Razorpay',
  razorpay_order_id text,
  razorpay_payment_id text unique,
  method text,
  status text not null default 'created' check (status in ('created','success','failed','refunded')),
  fee_paise integer,
  tax_paise integer,
  raw jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pxs_tx_created_idx on public.pxs_transactions (created_at desc);
create index pxs_tx_rzp_order_idx on public.pxs_transactions (razorpay_order_id);
create index pxs_orders_created_idx on public.pxs_orders (created_at desc);

-- Invoice number assigned only when a payment succeeds: PXS-INV-YYYYMMDD0001
create or replace function public.pxs_tx_before_write()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'success' and new.invoice_no is null then
    new.invoice_no := 'PXS-INV-' || to_char(coalesce(new.paid_at, now()) at time zone 'Asia/Kolkata', 'YYYYMMDD')
                      || lpad(nextval('public.pxs_invoice_seq')::text, 4, '0');
    if new.paid_at is null then new.paid_at := now(); end if;
  end if;
  return new;
end $$;
create trigger pxs_tx_before_write before insert or update on public.pxs_transactions
for each row execute function public.pxs_tx_before_write();

-- Keep order paid amount / status in sync with successful transactions
create or replace function public.pxs_tx_after_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_paid integer; v_total integer;
begin
  if new.order_id is null then return new; end if;
  select coalesce(sum(amount_paise),0) into v_paid from pxs_transactions
   where order_id = new.order_id and status = 'success';
  select total_paise into v_total from pxs_orders where id = new.order_id;
  update pxs_orders set paid_paise = v_paid,
    status = case when v_paid >= v_total then 'paid' when v_paid > 0 then 'partially_paid' else status end,
    updated_at = now()
  where id = new.order_id;
  return new;
end $$;
create trigger pxs_tx_after_write after insert or update on public.pxs_transactions
for each row execute function public.pxs_tx_after_write();

-- RLS: public can read active products; only admins read/manage everything.
-- Orders/transactions are written by edge functions with the service role.
alter table public.pxs_products enable row level security;
alter table public.pxs_orders enable row level security;
alter table public.pxs_transactions enable row level security;

create policy "pxs products public read" on public.pxs_products
  for select to anon, authenticated using (is_active = true);
create policy "pxs products admin all" on public.pxs_products
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy "pxs orders admin read" on public.pxs_orders
  for select to authenticated using (public.is_admin(auth.uid()));
create policy "pxs orders admin update" on public.pxs_orders
  for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy "pxs tx admin read" on public.pxs_transactions
  for select to authenticated using (public.is_admin(auth.uid()));

revoke execute on function public.pxs_tx_after_write() from public, anon, authenticated;
