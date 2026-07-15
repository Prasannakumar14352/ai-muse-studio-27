## Goal
Centralize credit enforcement so every AI generation entry point (existing and future) goes through one backend service that reserves credits atomically, refunds on failure, and shows the correct plan-aware upgrade/top-up modal on shortage — without losing user work.

## 1. Database (single migration)

New table `credit_ledger` (auditable ledger):
- `id`, `user_id`, `action` (module id, e.g. `video`, `carousel`, `image`, `thumbnail`, `linkedin`, `caption`, `strategy`, `research`, `agent`, `repurpose`, `upscale`, `bg_remove`, `inpaint`, etc.), `project_id`, `render_job_id`
- `credits_estimated`, `credits_reserved`, `credits_charged`, `credits_refunded`
- `balance_before`, `balance_after`
- `source` (`subscription` | `balance` | `lifetime` | `admin`)
- `status` (`reserved` | `charged` | `refunded` | `failed`)
- `idempotency_key` (unique per user)
- `created_at`, `updated_at`
- RLS: user reads own rows; service_role full access.

New RPCs (SECURITY DEFINER, replace `deduct_credits` usage sites):
- `reserve_credits(_user_id, _amount, _action, _project_id, _idempotency_key, _description)` → returns `{ok, ledger_id, source, balance_before, balance_after}` or `{ok:false, error:'insufficient_credits', required, available, shortage, plan_type}`. Idempotent: if `idempotency_key` exists for the same user, return the existing ledger row untouched (no double charge).
- `finalize_credits(_ledger_id)` → marks `charged`. No-op if already charged.
- `refund_credits_by_ledger(_ledger_id, _reason)` → returns credits to the same bucket, marks `refunded`. No-op if already refunded/never reserved.
- Consumption order: monthly plan credits → top-up balance → lifetime. Admin/unlimited: write ledger row with 0 charged and status `charged`.

## 2. Server functions (`src/lib/credits-guard.functions.ts`)

Thin wrappers around the RPCs, all under `requireSupabaseAuth`:
- `reserveCreditsFn({ amount, action, projectId?, renderJobId?, idempotencyKey, description })`
- `finalizeCreditsFn({ ledgerId })`
- `refundCreditsByLedgerFn({ ledgerId, reason })`
- `getCreditSummaryFn()` — returns `{ available, monthlyRemaining, balance, lifetime, unlimited, planType, canBuyTopups }` for the modal.

Idempotency key = SHA-256 of `userId + action + inputHash + clientNonce` generated client-side; retries reuse it so refresh/double-click never double-charge.

## 3. Client guard hook (`src/lib/use-credit-guard.ts`)

```ts
const { runWithCredits, InsufficientModal } = useCreditGuard();
await runWithCredits(
  { action: 'image', amount: cost, description, projectId, inputHash },
  async () => callProvider(),
);
```

Behavior:
1. `useAccess()` fast client check → if clearly insufficient, open modal immediately (skip network round-trip). If unlimited, skip check.
2. Call `reserveCreditsFn` (server is the authority). On `insufficient_credits`, open the plan-aware modal with `{required, available, shortage}` and reject.
3. Run work. If it throws → `refundCreditsByLedgerFn`. If success → `finalizeCreditsFn`. Invalidate `['access']` and `['credit-summary']` queries.
4. In-flight `Set<idempotencyKey>` prevents double-click while pending; a completed key routes retries to the same ledger row via server-side idempotency.

## 4. Shared insufficient-credits modal (`src/components/insufficient-credits-dialog.tsx`)

Plan-aware:
- `free` / no paid plan → "You need more credits", CTAs: **View Plans** → `/pricing`, **Buy Credit Pack** (only if `canBuyTopups` allows free-tier top-ups — otherwise hidden), "Upgrade includes monthly credits + premium features".
- `paid` / `lifetime` → "Not enough credits", CTAs: **Buy Extra Credits** (opens existing `TopupPacks` checkout in a dialog), **View Usage** → `/billing`.
- Shows required, available, shortage.
- Preserves in-flight generation intent: the guard holds the work callback; when access query returns enough credits after top-up, an inline **Retry generation** button re-invokes it. Wizard state stays mounted — modal is a portaled overlay, no route change.

## 5. Cost estimator (`src/lib/credit-costs.ts` extended)

Add `estimateCost(action, params)`:
- `image`: `1 * batch * qualityMultiplier`
- `video-short`: `1 + scenes` (from plan)
- `video-long`: `1 + ceil(durationSec / 8)`
- `carousel`: `1 + slideCount`
- `thumbnail`: `conceptCount`
- `upscale` / `bg_remove` / `inpaint`: 1 each
- `linkedin` / `caption` / `strategy` / `research`: 1
- `agent-campaign`: 3
- `repurpose`: `1 * targets`

Exposed helper `<CreditCostBadge action={...} params={...} />` used on every Generate button ("Generate · N credits").

## 6. Retrofit call sites

Replace every existing `deductUsage` / raw provider call with `runWithCredits(...)`:
- Videos (input screen, regenerate scene, upscale)
- Thumbnails (concept batch, quality analysis, upscale, remove BG, inpaint, magic eraser)
- Images (batch generate, edit ops)
- Carousels + create/carousel
- LinkedIn posts new
- Captions wizard
- Strategy wizard
- Research (main run + one-click actions that consume credits when generating; **draft-only handoffs stay free per the previous turn**)
- Agents (campaign + specialists)
- Repurpose
- Templates "Use template" → cost applied when it triggers generation, not when opening
- Any api route that mints media (`/api/generate-image`, `/api/generate-video-clip`, `/api/tts`) — server-side also calls `reserveCreditsFn` inline so a direct HTTP hit can't bypass; frontend still runs the guard for UX.

Old `deductUsage`/`withCreditRefund` shim → delegate to new guard so any missed call site keeps working.

## 7. UI states

- All generation buttons: disabled while `runWithCredits` promise pending, spinner + label ("Generating…").
- Success toast on charge; failure toast on refund with reason.
- Cost badge visible before click; batch cost recomputes as batch/quality/duration changes.

## 8. Tests (`tests/e2e/credit-guard.py`, plus unit fns)

Playwright-driven scenarios against localhost: free-enough, free-short → upgrade modal, paid-short → top-up modal, top-up success → retry same intent charges once, forced-failure refund, double-click → single ledger row, admin → zero-cost ledger row, refresh mid-flight → no duplicate charge (idempotency).

## 9. Out of scope

- No pricing changes, no Razorpay flow changes (top-up dialog reuses existing `TopupPacks`).
- No sidebar/route redesign.
- Frontend estimator numbers stay authoritative for display; server RPC remains authoritative for enforcement.

## Deliverable order

1. Migration (`credit_ledger` + RPCs + GRANTs + RLS).
2. `credits-guard.functions.ts` + `use-credit-guard.ts` + modal + cost badge.
3. Retrofit modules one by one (Images → Thumbnails → Captions → LinkedIn → Carousel → Videos → Strategy → Research → Agents → Repurpose).
4. Server-side guard inside `/api/generate-image`, `/api/generate-video-clip`, `/api/tts`.
5. Typecheck + Playwright scenarios.
