
# CreatorFlow AI — End-to-End Audit

Read-only review. No files were modified. Scope: structure, UX, billing/credits, generation pipelines, publishing, LinkedIn, DB/security, responsive, fallbacks, production readiness.

---

## 1. Snapshot

- **Routes**: 22 authenticated, 3 public (`/`, `/auth`, `/contact`) + API/OAuth routes.
- **Generation engines**: Creative Director, Motion Director, Visual Director, Character Bible, Cinematic Engine, Short Video Engine, Layout Engine, Retention Engine, 47 lib modules total.
- **Persistence**: Supabase (17 tables, RLS on all). Blob assets in IndexedDB (video shots), plus `renders` bucket for final MP4.
- **Billing**: Razorpay live, idempotent webhooks, subscription + top-up wallet, admin bypass, `refund_credits` RPC (just landed).
- **Auth**: Supabase native + Lovable Cloud Auth hybrid, Google/Apple providers.
- **Publishing**: Meta/Google/LinkedIn OAuth config UI + connection page + scheduling table, no executor yet.

---

## 2. Strengths

- **Architecture discipline** — TanStack Start file routing, server functions correctly split from client (`.functions.ts` vs `.server.ts`), no `useEffect+fetch` anti-patterns in loaders.
- **Billing correctness** — server-side Razorpay verification, idempotent payment status guard, top-up + subscription buckets with correct consumption order, admin bypass in-DB, refund path just added.
- **Security posture** — RLS enabled on every public table, `has_role` SECURITY DEFINER pattern for admin, OAuth tokens encrypted at rest (`OAUTH_TOKEN_ENCRYPTION_KEY`), service-role restricted to `.server.ts` files.
- **Creative pipeline** — Character Bible + Locked Director enforce protagonist consistency; Layout Engine reserves negative space; Motion Director eliminates slideshow feel; Retention Engine drives structure.
- **UX consistency** — unified two-view landing/input pattern across Images, Videos, Carousels, LinkedIn; unified `useProjectDelete` with undo + cascade; sidebar hierarchy with plan pill.
- **Editor tooling** — layer-based slide editor, LinkedIn Studio (carousel + image), full ZIP/PDF exports, drag-drop reordering, real-time preview.

---

## 3. Critical Findings

**C1. Root `og:image` overrides every leaf**
`src/routes/__root.tsx:64-65` hardcodes a preview-URL screenshot (`id-preview--de9e0877…lovable.app`) as `og:image` and `twitter:image`. Because root `head()` concatenates into every match, every page — Pricing, LinkedIn posts, projects — shares this image, and it points at an ephemeral preview host. Social shares look broken/branded-as-preview.

**C2. No scheduled-post executor**
`scheduled_posts` rows are created by `publishing.functions.ts` but nothing consumes them. Users see "Scheduled" toasts but nothing publishes. Feature is a UI-only stub.

**C3. Public marketing surface = 1 page**
Only `/`, `/auth`, `/contact` are unauthenticated. No `/pricing`, `/features`, `/how-it-works` public routes → paid signups depend on authenticated-only pricing. SEO surface is near zero.

---

## 4. High Findings

**H1. Refund helper not wired into any generation site**
`withCreditRefund` exists but no route uses it. Deducts across `create.tsx`, `create_.carousel.tsx`, `images.tsx`, `thumbnails.tsx`, `videos.tsx` all happen *after* save (correct for full failures), but partial-scene renderers and per-image loops (`images.tsx:158`) charge per success without a rollback path if the batch aborts mid-way.

**H2. Video assets device-locked**
Final MP4 uploads to `renders` bucket (`projects.$id.tsx:705`) but per-shot images/audio live only in IndexedDB. Users switching browsers/devices lose scene thumbnails and can't re-render. No `projects.assets_synced_at` column.

**H3. No admin console for user/credit ops**
`admin.tsx`, `admin.integrations.tsx`, `admin.webhooks.tsx` exist. Missing: user list, role toggle, manual credit grant, subscription override, refund UI. All operator tasks currently require direct SQL.

**H4. Hardcoded admin email**
`handle_new_user` DB function hardcodes `prasannaskvd@gmail.com` as admin. Not portable; can't demote or add co-admins without a migration.

**H5. Pricing page is auth-gated**
`/pricing` lives under `_authenticated/`. Prospects can't view plans without signing up. Conversion blocker.

---

## 5. Medium Findings

**M1. Sidebar count vs page state drift risk** — module counts query independently of page-level queries; a delete on one page invalidates its own keys but sidebar counts rely on separate query keys not always in the invalidation list.

**M2. `refund_credits` linter warnings** — 5 pre-existing SECURITY DEFINER warnings on `deduct_credits`, `has_role`, `is_admin`, `handle_new_user`, `reset_monthly_subscription_credits`. Intentional but undocumented; add a security memory note or the next audit re-flags them.

**M3. Blob URL leaks** — `SafeVideoPreview` handles lifecycle, but slide/thumbnail exports (`html-to-image`) create object URLs without paired `revokeObjectURL` in error paths.

**M4. No usage caps enforcement per plan on top-ups** — top-up credits never expire (correct per PRD) but there's no dashboard warning when balance exceeds e.g. 12 months of typical use → potential abuse for resellers.

**M5. `content_type` sprawl** — `linkedin_post`, `carousel`, `image`, `short_video`, `long_video`, `thumbnail` are strings on `projects.content_type`. No enum, no DB constraint → typos silently create ghost modules invisible to the sidebar.

**M6. Error boundaries partial** — `__root.tsx` has `notFoundComponent`, but leaf routes with loaders don't all set `errorComponent`+`notFoundComponent` (TanStack requirement).

**M7. No `robots.txt` / sitemap** — production SEO blocker independent of C3.

---

## 6. Nice-to-have

- N1. Keyboard shortcuts (New project, search) via `cmdk`.
- N2. Project search/filter on gallery pages (currently list-all).
- N3. Bulk delete / bulk export on Images and Thumbnails.
- N4. In-app changelog and empty-state onboarding tour.
- N5. Public share link per project (view-only) using signed URLs.
- N6. Dark/light toggle (currently dark-only).
- N7. Cost estimator preview *before* clicking Generate on video (word/scene count → credit projection).

---

## 7. Production Readiness Checklist

| Area | Status |
|---|---|
| RLS on all tables | ✅ |
| Server-side payment verify | ✅ |
| Idempotent webhooks | ✅ |
| Refund primitive | ✅ (just landed) |
| Credit refund wired in flows | ❌ H1 |
| Final render in cloud | ✅ |
| Scene assets in cloud | ❌ H2 |
| Scheduled publishing executor | ❌ C2 |
| Public pricing/marketing | ❌ C3/H5 |
| SEO metadata per leaf | ⚠ C1 |
| Admin console | ❌ H3 |
| Error/notFound on every route | ⚠ M6 |
| Responsive (390–1920) | ✅ (pricing redesign verified) |

---

## 8. Recommended Next 5 Steps

1. **Fix C1 + C3 + H5 together (SEO/marketing unblock)** — remove root `og:image`, move `/pricing` out of `_authenticated`, add public `/features` + `/how-it-works` with per-route `head()`. Adds robots.txt + sitemap. **Low code, high conversion impact.**

2. **Ship scheduled-post executor (C2)** — pg_cron every 5 min → `/api/public/cron/publish-due` route, verifies a shared secret header, pulls `scheduled_posts WHERE due AND status='pending'`, calls the platform-specific publisher, marks status. Unblocks the entire Publishing tab from being cosmetic.

3. **Cloud-sync video scene assets (H2)** — add `renders/{userId}/{projectId}/scenes/{n}.jpg` uploads inside `video-shot-runner.ts` completion callback, plus `project_scenes.image_url` column populated on upload. Keeps IndexedDB as cache, treats cloud as source-of-truth. Users can then resume renders cross-device.

4. **Wire `withCreditRefund` at generation sites (H1)** — wrap the batch loops in `images.tsx`, `thumbnails.tsx`, and per-shot deducts in the video runner so any partial-failure path reverses correctly. Also swap hardcoded admin email (H4) for a `user_roles` seed migration.

5. **Admin console MVP (H3)** — new `_authenticated/admin.users.tsx` with paginated users list, columns (email, plan, monthly_used/limit, wallet, is_admin), row actions (grant credits, toggle role, view usage_history). Server functions gated by `has_role(auth.uid(),'admin')`. Removes all manual-SQL operator toil.

---

## 9. Assumptions / Open Questions

- Assumes Razorpay stays as the sole payment provider (no Stripe migration planned).
- Assumes IndexedDB scene cache is acceptable to keep alongside cloud sync (not replace).
- Not audited: analytics accuracy, email/notification pipeline (none found), rate limiting on server functions (none found — worth a follow-up audit if abuse becomes a concern).

Approve to proceed with Step 1 of the Next 5, or reorder priorities.
