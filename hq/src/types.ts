export type DayKpi = { date: string; signups: number; revenue: number; generations: number; payments: number };
export type Metrics = {
  generated_at: string;
  days: number;
  fx_usd_inr: number;
  cost_per_credit_inr: number;
  kpis: { today: DayKpi; yesterday: DayKpi; last_week: DayKpi; last_week_yesterday: DayKpi };
  totals: {
    users: number; paying_users: number; revenue_all_time: number; revenue_range: number;
    ai_cost_range: number; admin_ai_cost_range: number; credits_range: number; active_subscriptions: number;
    mtd_revenue: number; mtd_ai_cost: number; day_of_month: number; days_in_month: number;
  };
  daily: Array<{ date: string; signups: number; revenue: number; generations: number; ai_cost: number }>;
  features: Array<{
    action: string; runs: number; failures: number; credits_charged: number; credits_consumed: number;
    credits_refunded: number; revenue_inr: number; cost_inr: number;
  }>;
  hot_leads: Array<{ email: string; plan: string; credits: number; last_active: string; paid_total: number; reason: string }>;
  churn_risk: Array<{ email: string; plan_name: string | null; status: string; renews_at: string | null; expires_at: string | null; auto_renew: boolean | null; payment_issue: string | null; reason: string }>;
  failures: Array<{ action: string; hour: number; count: number }>;
  failure_errors: Array<{ action: string; error: string; c: number; last_at: string }>;
  payments_health: {
    success: number; pending: number; failed: number;
    stuck: Array<{ email: string | null; pack_id: string | null; inr: number; created_at: string }>;
    webhook_total: number; webhook_errors: number;
    webhook_recent_errors: Array<{ event_type: string | null; http_status: number | null; error: string; created_at: string }>;
  };
  support: {
    telegram: Record<string, number>; in_app: Record<string, number>;
    answered_by_agent: number; sent_to_admin: number; waiting_now: number; open_bugs: number;
    agent_cost_usd_month: number;
    top_questions: Array<{ text: string; created_at: string; channel: string }>;
  };
  funnel: { signed_up: number; first_generation: number; ran_out: number; opened_pricing: number; paid: number; tracking_since: string | null };
  sources: Array<{ source: string; signups: number; paying: number; revenue: number }>;
};
