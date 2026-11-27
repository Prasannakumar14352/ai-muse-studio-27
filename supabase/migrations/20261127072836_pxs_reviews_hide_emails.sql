-- Already applied to production on 2026-11-27. Kept here so the repo matches the database.
revoke select on public.pxs_reviews from authenticated;
grant select (id, product_id, customer_name, rating, body, status, is_featured, is_verified_buyer, created_at) on public.pxs_reviews to authenticated;

-- Admins get reviewer emails through this function only
create or replace function public.pxs_admin_reviews()
returns setof public.pxs_reviews
language sql stable security definer set search_path = public as $$
  select * from public.pxs_reviews where public.is_admin(auth.uid())
  order by (status = 'pending') desc, created_at desc limit 1000;
$$;
revoke execute on function public.pxs_admin_reviews() from public, anon;
grant execute on function public.pxs_admin_reviews() to authenticated;
