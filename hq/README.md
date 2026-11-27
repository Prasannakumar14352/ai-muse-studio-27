# ProdXStore HQ

Owner-only dashboard for CreatorFlow AI **and the ProdXStore store**, deployed
separately from the app at `hq.prodxstore.com`.

- **Sections:** `/` CreatorFlow AI metrics · `/store` ProdXStore store (sales, orders,
  products shown on prodxstore.com, reviews, contact messages, newsletter, offer banner).
- **All revenue** strip at the top adds CreatorFlow revenue and store sales.
- Store data lives in the `pxs_*` tables (admin-only via RLS); checkout runs at
  `pay.prodxstore.com` through the `pxs-checkout` and `pxs-razorpay-webhook` edge functions
  (`supabase/functions/`).

- **No secrets here.** It signs in with Google through the same Supabase
  project and calls one database function, `hq_metrics(p_days)`, which refuses
  anyone who isn't an admin. `.env` only holds the public URL and
  publishable key.
- **Data:** payments, subscriptions, credit_ledger, profiles, Razorpay webhook
  log, support chats, agent runs, plus `signup_attribution` and funnel events
  that the main app records.
- Refreshes every 5 minutes and when the tab is reopened. Installable on a phone
  (Add to Home Screen).

## Deploy (Vercel)
1. New Project → import this repo → **Root Directory: `hq`** → Framework: Vite.
2. Domains → add `hq.prodxstore.com`, then create the DNS record Vercel shows
   (CNAME `hq` → `cname.vercel-dns.com`).
3. Supabase → Authentication → URL Configuration → Redirect URLs → add
   `https://hq.prodxstore.com/**`.

## Develop
```
cd hq && npm install && npm run dev
```
