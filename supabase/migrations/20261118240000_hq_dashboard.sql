-- HQ dashboard (hq.prodxstore.com): signup attribution + one admin-only
-- read function that returns every number the dashboard shows.
-- The dashboard holds no secret keys: it calls hq_metrics() with the signed-in
-- admin's session, and the function refuses everyone who isn't an admin.

-- Where each user came from (first touch), recorded once after sign-in.
CREATE TABLE IF NOT EXISTS public.signup_attribution (
  user_id uuid PRIMARY KEY,
  source text,            -- instagram | youtube | facebook | google | meta_ads | referral | direct | <utm_source>
  medium text,
  campaign text,
  referrer text,
  landing_path text,
  country text,
  region text,
  city text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.signup_attribution ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS analytics_events_event_idx ON public.analytics_events (event, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.hq_metrics(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _days int := LEAST(GREATEST(COALESCE(p_days, 30), 7), 365);
  _tz text := 'Asia/Kolkata';
  _today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  _from date := _today - (_days - 1);
  _fx numeric;
  _cost_per_credit_usd numeric := 0.0054;   -- provider cost of one credit
  _result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin only' USING ERRCODE = '42501';
  END IF;

  SELECT rate INTO _fx FROM fx_rates WHERE base_currency = 'USD' AND quote_currency = 'INR' ORDER BY fetched_at DESC LIMIT 1;
  _fx := COALESCE(_fx, 85);

  WITH
  pay AS (
    SELECT p.user_id, p.created_at, (p.created_at AT TIME ZONE _tz)::date AS d,
      COALESCE(p.amount_inr_paise, CASE WHEN upper(p.currency) = 'INR' THEN p.amount_cents END,
               round(p.amount_cents * _fx))::numeric / 100 AS inr,
      p.status, p.pack_id
    FROM payments p
  ),
  paid AS (SELECT * FROM pay WHERE status IN ('success', 'captured', 'paid')),
  led AS (
    SELECT l.user_id, l.action, l.status, l.source, l.created_at, (l.created_at AT TIME ZONE _tz)::date AS d,
      extract(hour FROM l.created_at AT TIME ZONE _tz)::int AS h,
      COALESCE(l.credits_charged, 0) AS charged,
      COALESCE(l.credits_refunded, 0) AS refunded,
      CASE WHEN l.status = 'charged' THEN GREATEST(COALESCE(l.credits_charged, 0), COALESCE(l.credits_estimated, 0)) ELSE 0 END AS consumed
    FROM credit_ledger l
  ),
  days AS (SELECT generate_series(_from, _today, interval '1 day')::date AS d),
  daily AS (
    SELECT dd.d,
      (SELECT count(*) FROM profiles pr WHERE (pr.created_at AT TIME ZONE _tz)::date = dd.d) AS signups,
      (SELECT COALESCE(sum(inr), 0) FROM paid WHERE paid.d = dd.d) AS revenue,
      (SELECT count(*) FROM led WHERE led.d = dd.d AND led.status = 'charged') AS generations,
      (SELECT COALESCE(sum(consumed), 0) FROM led WHERE led.d = dd.d) AS credits
    FROM days dd
  ),
  day_kpi AS (
    SELECT x.label, x.d,
      (SELECT count(*) FROM profiles pr WHERE (pr.created_at AT TIME ZONE _tz)::date = x.d) AS signups,
      (SELECT COALESCE(sum(inr), 0) FROM paid WHERE paid.d = x.d) AS revenue,
      (SELECT count(*) FROM led WHERE led.d = x.d AND led.status = 'charged') AS generations,
      (SELECT count(*) FROM paid WHERE paid.d = x.d) AS payments
    FROM (VALUES ('today', _today), ('yesterday', _today - 1), ('last_week', _today - 7), ('last_week_yesterday', _today - 8)) AS x(label, d)
  ),
  paid_by_user AS (SELECT user_id, sum(inr) AS total, max(created_at) AS last_paid FROM paid GROUP BY user_id),
  last_active AS (SELECT user_id, max(created_at) AS at FROM credit_ledger GROUP BY user_id),
  features AS (
    SELECT action,
      count(*) FILTER (WHERE status = 'charged') AS runs,
      count(*) FILTER (WHERE status IN ('failed', 'refunded')) AS failures,
      sum(charged) AS credits_charged,
      sum(consumed) AS credits_consumed,
      sum(refunded) AS credits_refunded
    -- Customers only: your own (admin) test runs would distort the unit economics.
    FROM led WHERE d >= _from AND COALESCE(source, '') <> 'admin' GROUP BY action
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'days', _days,
    'fx_usd_inr', _fx,
    'cost_per_credit_inr', round(_cost_per_credit_usd * _fx, 4),

    'kpis', (SELECT jsonb_object_agg(label, jsonb_build_object('date', d, 'signups', signups, 'revenue', revenue, 'generations', generations, 'payments', payments)) FROM day_kpi),

    'totals', jsonb_build_object(
      'users', (SELECT count(*) FROM profiles),
      'paying_users', (SELECT count(*) FROM paid_by_user),
      'revenue_all_time', (SELECT COALESCE(sum(inr), 0) FROM paid),
      'revenue_range', (SELECT COALESCE(sum(inr), 0) FROM paid WHERE d >= _from),
      'ai_cost_range', (SELECT round(COALESCE(sum(consumed), 0) * _cost_per_credit_usd * _fx, 2) FROM led WHERE d >= _from),
      'credits_range', (SELECT COALESCE(sum(consumed), 0) FROM led WHERE d >= _from),
      'admin_ai_cost_range', (SELECT round(COALESCE(sum(consumed), 0) * _cost_per_credit_usd * _fx, 2) FROM led WHERE d >= _from AND source = 'admin'),
      'active_subscriptions', (SELECT count(*) FROM subscriptions WHERE status = 'active' AND COALESCE(plan_type, 'free') <> 'free'),
      'mtd_revenue', (SELECT COALESCE(sum(inr), 0) FROM paid WHERE d >= date_trunc('month', _today)::date),
      'mtd_ai_cost', (SELECT round(COALESCE(sum(consumed), 0) * _cost_per_credit_usd * _fx, 2) FROM led WHERE d >= date_trunc('month', _today)::date),
      'day_of_month', extract(day FROM _today)::int,
      'days_in_month', extract(day FROM (date_trunc('month', _today) + interval '1 month - 1 day'))::int
    ),

    'daily', (SELECT jsonb_agg(jsonb_build_object(
        'date', d, 'signups', signups, 'revenue', revenue, 'generations', generations,
        'ai_cost', round(credits * _cost_per_credit_usd * _fx, 2)) ORDER BY d) FROM daily),

    'features', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'action', action, 'runs', runs, 'failures', failures,
        'credits_charged', credits_charged, 'credits_consumed', credits_consumed, 'credits_refunded', credits_refunded,
        -- What users paid for those credits, at the average credit-pack list price.
        'revenue_inr', round(credits_charged * COALESCE((SELECT avg(pk.price_usd / NULLIF(pk.credits, 0)) * _fx
              FROM credit_packs pk WHERE pk.active), 0), 2),
        'cost_inr', round(credits_consumed * _cost_per_credit_usd * _fx, 2)
      ) ORDER BY credits_consumed DESC), '[]'::jsonb) FROM features),

    -- People most likely to buy now: active in the last 14 days and low on credits.
    'hot_leads', (SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.credits ASC), '[]'::jsonb) FROM (
        SELECT pr.email, COALESCE(pr.plan, 'free') AS plan, COALESCE(pr.user_credits, 0) AS credits,
          la.at AS last_active, COALESCE(pb.total, 0) AS paid_total,
          CASE WHEN pb.user_id IS NULL THEN 'free user almost out' ELSE 'paid user running low' END AS reason
        FROM profiles pr
        JOIN last_active la ON la.user_id = pr.id
        LEFT JOIN paid_by_user pb ON pb.user_id = pr.id
        WHERE NOT COALESCE(pr.is_admin, false)
          AND la.at > now() - interval '14 days'
          AND COALESCE(pr.user_credits, 0) <= CASE WHEN pb.user_id IS NULL THEN 15 ELSE 50 END
        ORDER BY COALESCE(pr.user_credits, 0) ASC LIMIT 25) t),

    'churn_risk', (SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) FROM (
        SELECT pr.email, s.plan_name, s.status, s.renews_at, s.expires_at, s.auto_renew, s.payment_issue,
          CASE WHEN COALESCE(s.payment_issue, '') <> '' THEN 'payment problem'
               WHEN s.auto_renew = false THEN 'auto-renew off'
               ELSE 'renews within 7 days' END AS reason
        FROM subscriptions s JOIN profiles pr ON pr.id = s.user_id
        WHERE COALESCE(s.plan_type, 'free') <> 'free' AND NOT COALESCE(pr.is_admin, false)
          AND (COALESCE(s.payment_issue, '') <> ''
               OR (s.status = 'active' AND s.auto_renew = false)
               OR (s.status = 'active' AND COALESCE(s.renews_at, s.expires_at) BETWEEN now() AND now() + interval '7 days'))
        ORDER BY COALESCE(s.renews_at, s.expires_at) NULLS LAST LIMIT 25) t),

    -- Failed or refunded generations, last 14 days, by feature × hour (IST).
    'failures', (SELECT COALESCE(jsonb_agg(jsonb_build_object('action', action, 'hour', h, 'count', c)), '[]'::jsonb) FROM (
        SELECT action, h, count(*) AS c FROM led
        WHERE status IN ('failed', 'refunded') AND created_at > now() - interval '14 days'
        GROUP BY action, h) t),
    'failure_errors', (SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) FROM (
        SELECT action, left(COALESCE(error, 'unknown'), 120) AS error, count(*) AS c, max(created_at) AS last_at
        FROM credit_ledger WHERE status IN ('failed', 'refunded') AND created_at > now() - interval '14 days'
        GROUP BY 1, 2 ORDER BY c DESC LIMIT 8) t),

    'payments_health', jsonb_build_object(
      'success', (SELECT count(*) FROM pay WHERE d >= _from AND status IN ('success', 'captured', 'paid')),
      'pending', (SELECT count(*) FROM pay WHERE d >= _from AND status IN ('pending', 'created')),
      'failed', (SELECT count(*) FROM pay WHERE d >= _from AND status IN ('failed', 'cancelled')),
      'stuck', (SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) FROM (
          SELECT pr.email, p.pack_id, p.inr, p.created_at FROM pay p LEFT JOIN profiles pr ON pr.id = p.user_id
          WHERE p.status IN ('pending', 'created') AND p.created_at < now() - interval '1 hour' AND p.created_at > now() - interval '7 days'
          ORDER BY p.created_at DESC LIMIT 10) t),
      'webhook_total', (SELECT count(*) FROM razorpay_webhook_events WHERE created_at > now() - make_interval(days => _days)),
      'webhook_errors', (SELECT count(*) FROM razorpay_webhook_events WHERE created_at > now() - make_interval(days => _days)
          AND (COALESCE(http_status, 200) >= 400 OR signature_verified = false)),
      'webhook_recent_errors', (SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) FROM (
          SELECT event_type, http_status, left(COALESCE(error_message, ''), 120) AS error, created_at
          FROM razorpay_webhook_events WHERE created_at > now() - make_interval(days => _days)
            AND (COALESCE(http_status, 200) >= 400 OR signature_verified = false)
          ORDER BY created_at DESC LIMIT 5) t)
    ),

    'support', jsonb_build_object(
      'telegram', (SELECT COALESCE(jsonb_object_agg(k, c), '{}'::jsonb) FROM (
          SELECT COALESCE(category, 'pending') AS k, count(*) AS c FROM telegram_messages
          WHERE created_at > now() - make_interval(days => _days) GROUP BY 1) t),
      'in_app', (SELECT COALESCE(jsonb_object_agg(k, c), '{}'::jsonb) FROM (
          SELECT COALESCE(category, 'pending') AS k, count(*) AS c FROM support_chat_messages
          WHERE role = 'user' AND created_at > now() - make_interval(days => _days) GROUP BY 1) t),
      'answered_by_agent', (SELECT count(*) FROM telegram_messages WHERE handled_by = 'agent' AND created_at > now() - make_interval(days => _days))
        + (SELECT count(*) FROM support_chat_messages m WHERE m.role = 'assistant' AND m.task_id IS NULL AND COALESCE(m.category, '') <> 'chat'
             AND m.created_at > now() - make_interval(days => _days)),
      'sent_to_admin', (SELECT count(*) FROM agent_tasks WHERE agent = 'support' AND source IN ('telegram', 'in_app')
          AND created_at > now() - make_interval(days => _days) AND (status = 'waiting_approval' OR draft_reply IS NOT NULL)),
      'waiting_now', (SELECT count(*) FROM agent_tasks WHERE status = 'waiting_approval'),
      'open_bugs', (SELECT count(*) FROM agent_tasks WHERE kind = 'bug' AND status IN ('todo', 'in_progress')),
      'agent_cost_usd_month', (SELECT round(COALESCE(sum(cost_usd), 0), 3) FROM agent_runs WHERE created_at >= date_trunc('month', now())),
      'top_questions', (SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) FROM (
          SELECT text, created_at, 'telegram' AS channel FROM telegram_messages
            WHERE category IN ('question', 'bug', 'billing', 'feature') AND created_at > now() - interval '7 days'
          UNION ALL
          SELECT text, created_at, 'in-app' FROM support_chat_messages
            WHERE role = 'user' AND COALESCE(category, '') <> 'chat' AND created_at > now() - interval '7 days'
          ORDER BY created_at DESC LIMIT 8) t)
    ),

    -- Funnel since tracking started (all users).
    'funnel', jsonb_build_object(
      'signed_up', (SELECT count(*) FROM profiles WHERE NOT COALESCE(is_admin, false)),
      'first_generation', (SELECT count(DISTINCT l.user_id) FROM credit_ledger l JOIN profiles pr ON pr.id = l.user_id WHERE NOT COALESCE(pr.is_admin, false)),
      'ran_out', (SELECT count(*) FROM profiles pr WHERE NOT COALESCE(pr.is_admin, false) AND (
          COALESCE(pr.user_credits, 0) <= 0
          OR EXISTS (SELECT 1 FROM analytics_events e WHERE e.user_id = pr.id AND e.event = 'credits_exhausted'))),
      'opened_pricing', (SELECT count(DISTINCT e.user_id) FROM analytics_events e JOIN profiles pr ON pr.id = e.user_id
          WHERE e.event = 'pricing_view' AND NOT COALESCE(pr.is_admin, false)),
      'paid', (SELECT count(*) FROM paid_by_user pb JOIN profiles pr ON pr.id = pb.user_id WHERE NOT COALESCE(pr.is_admin, false)),
      'tracking_since', (SELECT min(created_at) FROM signup_attribution)
    ),

    'sources', (SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.signups DESC), '[]'::jsonb) FROM (
        SELECT COALESCE(sa.source, 'unknown') AS source, count(*) AS signups,
          count(pb.user_id) AS paying, COALESCE(sum(pb.total), 0) AS revenue
        FROM signup_attribution sa LEFT JOIN paid_by_user pb ON pb.user_id = sa.user_id
        GROUP BY 1) t)
  ) INTO _result;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.hq_metrics(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hq_metrics(integer) TO authenticated;
