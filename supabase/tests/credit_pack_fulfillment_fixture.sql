create table public.payments (
  id uuid primary key, user_id uuid not null, pack_id text not null, status text not null,
  credits integer not null, razorpay_order_id text not null unique, razorpay_payment_id text unique
);
create table public.profiles (id uuid primary key, user_credits integer not null);
create table public.offer_redemptions (payment_ref text, user_id uuid, status text, redeemed_at timestamptz);
insert into public.profiles values ('10000000-0000-0000-0000-000000000001', 100);
insert into public.payments (id, user_id, pack_id, status, credits, razorpay_order_id)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'pack', 'pending', 40, 'order_1'),
       ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'pack', 'failed', 60, 'order_2'),
       ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'pack', 'pending', 80, 'order_3');
insert into public.offer_redemptions values
  ('order_1', '10000000-0000-0000-0000-000000000001', 'pending', null);
