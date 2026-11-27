create function public.fulfill_credit_pack_payment(payment_row_id uuid, captured_payment_id text)
returns table (already_credited boolean, new_balance integer)
language plpgsql set search_path = '' as $$
declare
  payment public.payments%rowtype;
  balance integer;
begin
  select * into strict payment from public.payments where id = payment_row_id for update;
  if payment.pack_id is null or left(payment.pack_id, 5) = 'plan_' or
      payment.credits <= 0 or nullif(captured_payment_id, '') is null then
    raise exception 'Invalid credit pack purchase';
  end if;
  if payment.status = 'success' then
    return query select true, null::integer;
    return;
  end if;
  if payment.status is null or payment.status not in ('pending', 'failed') then
    raise exception 'Payment cannot be fulfilled';
  end if;

  update public.profiles set user_credits = user_credits + payment.credits
    where id = payment.user_id returning user_credits into strict balance;
  update public.payments set status = 'success', razorpay_payment_id = captured_payment_id
    where id = payment.id;
  update public.offer_redemptions set status = 'redeemed', redeemed_at = now()
    where payment_ref = payment.razorpay_order_id and user_id = payment.user_id and status = 'pending';

  return query select false, balance;
end;
$$;
revoke all on function public.fulfill_credit_pack_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.fulfill_credit_pack_payment(uuid, text) to service_role;
