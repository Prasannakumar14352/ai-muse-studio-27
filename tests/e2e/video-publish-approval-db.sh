#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
database="$(docker run --detach --rm --network none --env POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine)"
trap 'docker stop "$database" >/dev/null' EXIT
for attempt in {1..20}; do
  if docker exec "$database" pg_isready -h 127.0.0.1 -U postgres >/dev/null; then
    break
  fi
  sleep 1
done

cat "$root/supabase/tests/video_publish_approvals_fixture.sql" \
    "$root/supabase/migrations/20261128120000_video_publish_approvals.sql" \
    "$root/supabase/tests/video_publish_approvals.sql" \
  | docker exec --interactive "$database" psql --host 127.0.0.1 --username postgres --set ON_ERROR_STOP=1

cat "$root/supabase/tests/credit_pack_fulfillment_fixture.sql" \
    "$root/supabase/migrations/20261128121000_atomic_credit_pack_fulfillment.sql" \
  | docker exec --interactive "$database" psql --host 127.0.0.1 --username postgres --set ON_ERROR_STOP=1

fulfill_pack() {
  docker exec "$database" psql --host 127.0.0.1 --username postgres --set ON_ERROR_STOP=1 \
    --command "select * from public.fulfill_credit_pack_payment('20000000-0000-0000-0000-00000000000$1', 'pay_$1')"
}

fulfill_pack 1 &
first=$!
fulfill_pack 1 &
duplicate=$!
fulfill_pack 2 &
other=$!
wait "$first"
wait "$duplicate"
wait "$other"

docker exec --interactive "$database" psql --host 127.0.0.1 --username postgres --set ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  assert (select user_credits = 200 from public.profiles where id = '10000000-0000-0000-0000-000000000001');
  assert (select count(*) = 2 from public.payments where status = 'success');
  assert (select status = 'redeemed' from public.offer_redemptions where payment_ref = 'order_1');
  assert not has_function_privilege('authenticated', 'public.fulfill_credit_pack_payment(uuid,text)', 'EXECUTE');
  begin
    perform public.fulfill_credit_pack_payment('20000000-0000-0000-0000-000000000003', 'pay_3');
    raise exception 'A purchase without a profile was fulfilled';
  exception when no_data_found then
    assert (select status = 'pending' from public.payments where razorpay_order_id = 'order_3');
  end;
end $$;
SQL
