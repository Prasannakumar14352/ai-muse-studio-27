# CreatorFlow AI — End-to-End Audit (read-only)

Scope: architecture, navigation/UX, pricing/billing/credits, generation modules (videos/carousels/images/thumbnails/captions/LinkedIn), publishing/OAuth, database & security, mobile, error handling, production readiness. No code changes.

---

## 1. What's already strong

**Architecture & foundations**
- Clean TanStack Start layout: `__root.tsx` shell, `_authenticated/route.tsx` gate, file-based routing, per-route `head()`.
- Auth gate uses `INITIAL_SESSION` + safety timeout (3s) — handles OAuth token parsing race correctly.
- Server split respected: `*.functions.ts` for RPC, `*.server.ts` for admin, `/api/public/*` for webhooks/OAuth callbacks.
- Supabase clients hardened: `sb_publishable_` fetch shim strips bogus bearer, `client.server.ts` proxy-lazy loads service role.

**Billing / credits**
- Idempotent Razorpay flow: `payments.status='pending'` guard on both verify RPC and webhook, `razorpay_webhook_events` audit log, HMAC timing-safe compare, USD→INR auto-fallback.
- `deduct_credits()` SECURITY DEFINER RPC atomically drains subscription first, then wallet — matches "top-ups consumed after monthly" requirement.
- Admin bypass centralized (`is_admin` + `has_role`); mirrored client-side in `access.ts`.
- Full invoices page with jsPDF receipts; unified top-up widget now on Billing and Pricing.

**Security posture**
- RLS enabled on all 17 public tables; every table has ≥1 policy.
- Roles in dedicated `user_roles` table with `has_role()` — no role escalation via profiles.
- `handle_new_user` trigger is defensive (per-block `EXCEPTION WHEN OTHERS`, `ON CONFLICT DO NOTHING`).
- `oauth_states` + PKCE + encrypted tokens (`OAUTH_TOKEN_ENCRYPTION_KEY`) for platform connections.
- Security scanners: zero findings across app_mcp, connector, supabase, supabase_lov, supply_chain.

**Generation pipeline maturity**
- Deep, layered creative stack: Creative Director → Retention Engine → Script → Storyboard → Motion Director → Cinematic Engine → Visual Director → Character Bible → Layout Engine. Character consistency is properly locked.
- Videos: async parallel shot runner (6 workers) + IndexedDB job store + `SafeVideoPreview` for Chromium range-quirk playback.
- LinkedIn Studio: post generator + carousel studio (DnD reorder, ZIP export, PDF) + image studio with layout-aware safe zones.
- Streaming image generation (SSE) avoids 524 timeouts.

**UX polish**
- Redesigned sidebar with sections (Create/Publishing/Manage/Admin/Support), collapse persistence, plan pill, active-route logic.
- Unified `useProjectDelete` (6s undo toast) + cascade deletes at DB level.
- Redesigned pricing cards, comparison table, credits estimator, FAQ.

---

## 2. Findings by priority

### CRITICAL — fix before next release
1. **Root-level `og:image` overrides every leaf's share image.** `__root.tsx` sets `og:image`/`twitter:image` inline; TanStack concatenates root head into every match, so LinkedIn/YouTube/carousel share cards can never surface the asset a leaf route generates. Remove from root; move to each shareable leaf (`/pricing`, `/linkedin-posts/$id`, marketing pages).
2. **No credit-refund path on generation failure.** Pricing FAQ promises "failed runs are refunded automatically", but `deduct_credits()` has no inverse RPC and no server-fn wraps generation success/failure to refund. Users get charged for provider errors.
3. **Video assets are device-locked in IndexedDB.** A user who generates on laptop cannot open the same render on phone or after a browser cache clear — pipeline yields no cloud copy of the final MP4. Production users will experience "my video vanished." Plan: opt-in `renders` bucket upload after final MP4 render (bucket already exists, unused).

### HIGH — meaningful UX / correctness risk
4. **Publishing scheduler has no visible executor loop.** `scheduled_posts` table + `publishing.functions.ts` + `/api/public/hooks/publish-scheduled.ts` exist, but there's no verified pg_cron or external scheduler wiring documented. Scheduled posts may silently never fire.
5. **Auth loader 3s timeout during SSR-off + OAuth parse can flash-redirect** legitimate users on slow networks or when Supabase JS is still hydrating token. Consider bumping to 5s or waiting explicitly for INITIAL_SESSION with no timeout, with a friendly "restoring session…" splash.
6. **No admin user-management UI.** `user_roles` supports admin/moderator/user, but there's no route to grant/revoke roles or adjust credits — only Razorpay adds credits. Support ops must run SQL.
7. **Top-up wallet vs signup bonus commingling.** Free plan grants 50 signup credits into `profiles.user_credits`, same column as top-ups. Signup bonus is documented as never-expire in UI but conceptually different; if policy changes ("bonus expires 90d") there's no separation. Consider a `credit_ledger` table (source: signup|topup|refund|manual) — invoices already track purchases, but the wallet itself is scalar.
8. **`create_.carousel.tsx` naming inconsistency.** Uses the `_` (pathless prefix) escape; while it works, the module route naming diverges from `linkedin-posts.new.tsx` and `videos.tsx`. Standardize to `create.carousel.tsx` or `carousels.new.tsx`.
9. **Homepage / marketing SEO thin.** `/` route quality wasn't sampled here but only 1 marketing route (`contact`) exists — no `/pricing` shown to logged-out users (currently under `_authenticated`), so all organic traffic hits auth wall. Pricing must have a public marketing twin.
10. **Sidebar `useModuleCounts` loads all projects columnless every mount.** `select("content_type")` on every visit — cheap now, but grows linearly with projects. Add a count-only view or Supabase `count: 'exact', head: true` per bucket, or aggregate server-side.

### MEDIUM — polish, DX, gradual improvements
11. **No `.notFoundComponent`/`.errorComponent` on many `_authenticated/*` routes.** Root has them, but per-route boundaries improve UX (e.g., `linkedin-posts.$id.tsx` on stale id).
12. **Mixed local storage backends:** `videoLocalStore.ts`, `thumbnailLocalStore.ts`, `local-store.ts`, `blob-store.ts`, `video-job-store.ts` — five stores with overlapping duties. Consolidate to one IDB namespace with typed adapters.
13. **`projects_scenes` has only owner policy** (no admin view) — support cannot debug scene issues without service-role login. Add an `is_admin` SELECT policy paralleling `projects`.
14. **Duplicate credit-pack UI logic between `pricing.tsx` and `components/topup-packs.tsx`** (both load Razorpay script, both handle checkout). Refactor pricing to consume the shared component.
15. **`useEffect`-in-loader is avoided but the auth beforeLoad manually races `getSession()` + `onAuthStateChange` + `setTimeout`.** This is fragile; the officially recommended pattern is now `supabase.auth.getSession()` awaited once + fallback subscription only if null. Simplify to reduce edge-case bugs.
16. **No dashboard credit-usage graph.** `usage_history` table records everything (source, amount, description, project_id) but Dashboard shows nothing. Free win: 30-day sparkline.
17. **Contact page** — verify it has a working form (email via Lovable Email domain or a `contact_submissions` table). Currently unclear from file list.
18. **Test coverage is one Playwright script.** No unit tests for `deduct_credits`, no integration for the Razorpay verify path, no visual regressions for the studios.
19. **Bundle size**: `video-agents.ts`, `visual-director.ts`, `cinematic-engine.ts`, `creative-director.ts`, `motion-director.ts`, `character-bible.ts`, `scene-detector.ts`, `layout-engine.ts` — 8 large planners, likely all in the initial video-route chunk. Verify with `bun run build` bundle report and lazy-import per phase.
20. **Publish Kit + Publish Actions duplication**: two adjacent components; check whether both are still used or one is legacy.

### NICE-TO-HAVE
21. Skeleton loaders on gallery pages instead of "Loading…" text.
22. Empty states with illustrative art in Videos / Carousels / Thumbnails.
23. Global command palette (⌘K) to jump between projects/modules.
24. Preferred-currency memory (last used USD vs INR).
25. Localized number/date formatting (some places use `en-IN`, others default).
26. Add `X-Frame-Options` / CSP via response middleware for `/api/public/*` webhook endpoints.
27. Add sentry-style breadcrumb capture instead of just `reportLovableError`.
28. Analytics on which content-type users pick most (drives roadmap).

---

## 3. Mobile responsiveness (spot audit)

- Sidebar has mobile menu (`Menu`/`X` toggle at top of `app-shell.tsx`) — good.
- Pricing cards, comparison table have mobile accordion fallback — good.
- Studios (LinkedIn carousel/image, slide editor) are canvas-heavy — likely cramped on <768px. Needs a "preview only, edit on desktop" fallback screen.
- Videos dashboard scene grid — validate on 375px; likely 1-col but scene lightbox interactions untested on touch.

---

## 4. Production readiness scorecard

| Area | Score | Notes |
|---|---|---|
| Auth | 8/10 | Solid, minor loader race |
| Payments | 9/10 | Idempotent, INR fallback, webhook backup |
| RLS / security | 9/10 | All tables covered; scanners clean |
| Generation reliability | 6/10 | No refund on failure, device-locked assets |
| Publishing | 5/10 | UI ready, executor loop unverified |
| Observability | 4/10 | Only client error report; no server APM |
| SEO / share cards | 5/10 | Root og:image blocks leaves; no public marketing |
| Test coverage | 3/10 | Single e2e |
| Support tooling | 4/10 | No admin user/credit UI |

---

## 5. Best next 5 implementation steps (phased roadmap)

**Phase 1 — Trust & reliability (Week 1)**
1. **Credit refund path.** Add `refund_credits(_user_id, _amount, _project_id, _description)` SQL fn + wrap every generation server fn in `try { deduct } … catch { refund }`. Show in `usage_history` as `source='refund'`.
2. **Cloud copy of final renders.** After MP4 render, upload to existing `renders` bucket, store URL in `projects.final_render_url` (or `render_jobs`), fall back to IDB blob for offline. Enables cross-device access and support debugging.

**Phase 2 — Reach & growth (Week 2)**
3. **Public marketing surface.** Extract public `/pricing`, `/features`, `/about`, `/contact` routes outside `_authenticated`. Remove root `og:image`, add per-route share cards. Add JSON-LD `Product`/`Offer` markup on pricing.

**Phase 3 — Ops & support (Week 3)**
4. **Admin console.** Under `/admin/users`: search users, view credit balance + subscription, adjust credits with a reason (logged to `usage_history` source='manual'), promote/demote roles. Small but stops SQL support tickets.

**Phase 4 — Publishing that actually publishes (Week 3-4)**
5. **Wire the scheduler executor.** Set up pg_cron to hit `/api/public/hooks/publish-scheduled` every minute; add per-provider retry with exponential backoff and `scheduled_posts.last_error`; show status pill (queued/publishing/published/failed) in the LinkedIn Posts list.

**Follow-ups** (queued for later phases): usage sparkline on Dashboard, unify local storage adapters, add loader boundaries per protected route, expand test coverage (verify RPC + generation happy path + carousel export).

---

## 6. Assumptions & things I didn't verify

- Did not run `bun run build` or bundle analysis — bundle-size claim is inferred from module count and needs confirmation.
- Did not test Razorpay webhook end-to-end against live signature.
- Did not open every route in Playwright — mobile assessment is inspection-only.
- Did not audit AI-gateway spend patterns; recommend running `credits--get_usage_breakdown` before shipping refunds (they will lower revenue offset).
- Contact page contents and publish-scheduled cron wiring not opened; findings marked "verify".

---

*This is an audit only. No files were modified. Approve the roadmap and I'll begin with Phase 1 (credit refund path).*
