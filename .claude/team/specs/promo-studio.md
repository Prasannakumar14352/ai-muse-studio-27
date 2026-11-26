# Spec: Promo Studio (admin-only creatives for promoting CreatorFlow)

- **Date:** 2026-11-26
- **Author:** product-manager
- **Requested by:** SPK
- **Status:** Draft. Size L, so it goes to the architect next. Money questions are open (section 11).
- **Route:** `/admin/promo-studio`, at `src/routes/_authenticated/admin.promo-studio.tsx`

---

## 1. Problem
SPK makes CreatorFlow's own marketing by hand today, studio by studio. The 30-day plan lives in `content_plan_items`, and finished files are attached to drafts by hand. That is slow, the creatives don't look consistent, and the active offer code is often missing from them. With a one-click, on-brand creative factory, the 30-day plan (and the plans after it) actually ships every day. That brings signups and offer redemptions.

## 2. Who uses it
Only admins, meaning users with `has_role(uid,'admin')` in `user_roles`. No plan tier gets this. It is never shown to Free, Starter, Creator or Pro users.

---

## 3. Phased scope (be ruthless)

### v1: ships first, static creatives only
1. **Brand Kit.** Covers:
   - logo
   - brand colours
   - app URL
   - **screenshot library** (images only)
   - offer picker that reads the existing `offers` table
   - default CTA text
2. **Three templates:**
   - **Feature spotlight**
   - **Offer / festival**
   - **Before → after**
3. **Options:**
   - Format: **image**, **carousel** (3–7 slides) or **story** (static 9:16)
   - Size: **4:5**, **1:1** or **9:16**
   - Language: **English**, **Telugu** or **Hindi** (text only)
   - Variants: **1–4**
4. **AI copy.** Hook, headline, slide lines, caption and hashtags come from OpenRouter (gemini-2.5-flash, capped `max_tokens`, no reasoning).
5. **Optional AI background.** fal `flux/schnell` at **≤1 MP**. The default is a free brand gradient.
6. **Overlay rendering.** Code templates put real screenshots in device mockups, then overlay text, logo, CTA and offer code. Rendered **client-side** (see §8).
7. **Promo Library.** Statuses are Draft, Approved, Scheduled, Posted and Archived (§7). It has:
   - download (PNG, or ZIP for carousels)
   - a copy-caption button
8. **Send to calendar,** for Approved creatives only. It creates `scheduled_posts` rows through a Promo Studio server function that checks approval.
9. **Weekly pack.** One click generates up to 7 static creatives from the next 7 days of `content_plan_items`.
10. **Cost logging, monthly spend cap and per-admin rate limit.** All enforced on the server.

### Phase 2: video, depends on v1 data model
- **Video format.** A screenshot or AI still becomes a motion clip through `src/lib/motion-clips.ts`, then gets an ffmpeg overlay through `src/lib/transcode.server.ts`.
- **Faceless YouTube template.** A script plus scenes plus a voiceover.
- **Telugu voiceover.** Uses the ElevenLabs pipeline that `src/routes/api/tts.ts` uses, with Telugu on v3.
- **Screen-recording library.** Video uploads.
- **Add to landing showcase.** The `landing_media` showcase is **video-only**: `upsertLandingMedia` refuses to publish a showcase without `video_url` and `prompt`. So this button only becomes meaningful once video creatives exist. In v1 it is not shown.
- **Automatic "Posted" sync** from the publish worker. In v1 this sync happens when the Library loads.

### Phase 3: later
- Performance feedback, meaning which creative drove signups or redemptions.
- A Promo Studio cost widget on hq.prodxstore.com.
- Approval by two people.

---

## 4. User stories (v1)
| # | Story |
|---|---|
| US1 | As an **admin**, I want to set the logo, colours, app URL and active offer once, so that every creative is on-brand and carries the right code. |
| US2 | As an **admin**, I want to upload and tag real app screenshots, so that creatives show the real product, not AI fakes. |
| US3 | As an **admin**, I want to pick a template, format, size, language and variant count and click Generate, so that I get ready-to-post creatives in under a minute. |
| US4 | As an **admin**, I want AI to write the hook, caption and hashtags in English, Telugu or Hindi, so that I don't write copy for every post. |
| US5 | As an **admin**, I want every creative to stay a Draft until I approve it, so that nothing off-brand or wrong is ever posted. |
| US6 | As an **admin**, I want to download a creative (PNG, or ZIP for a carousel) and copy its caption, so that I can post it manually anywhere. |
| US7 | As an **admin**, I want to send an approved creative to my calendar for a platform and time, so that the existing publish worker posts it. |
| US8 | As an **admin**, I want a "weekly pack" button that drafts 7 creatives from next week's content plan, so that the week is prepared in one go. |
| US9 | As **SPK**, I want every provider call logged with its cost and a hard monthly cap, so that Promo Studio can never run up an unexpected bill. |
| US10 | As **SPK**, I want normal users to have no way, through UI, API or request flag, to reach the credit-free path. Credits are money. |

---

## 5. Acceptance criteria (QA tests exactly these)

### A. Access and security
**A1.** Given a user without `has_role(uid,'admin')`, when they open `/admin/promo-studio`, then:
- they are redirected to `/dashboard`
- no Promo Studio data is fetched

The route guard must call a server function that checks `has_role`. It must **not** rely on `useAccess().isAdmin`, which reads `profiles.is_admin` and the hard-coded email. See audit C1.

**A2.** Given a user without `has_role(...,'admin')`, when they call any Promo Studio server function directly (for example with fetch), then:
- the call fails with `Forbidden: admin only`
- no provider call happens
- no row is written

This applies even if:
- `profiles.is_admin = true`
- the email matches `ADMIN_EMAIL`

**A3.** Given an anonymous request, when it calls any Promo Studio server function, then it fails with 401 (`requireSupabaseAuth`).

**A4.** Given any request body to any **existing** user endpoint, when it contains `admin`, `promo`, `skipCredits` or similar flags, then nothing changes:
- `/api/generate-image`
- `/api/tts`
- `/api/generate-video-clip`
- `*.functions.ts`

Credits are charged exactly as before. Code review checks that no existing endpoint gained a new parameter.

**A5.** Given the new tables, when an `authenticated` non-admin queries them through the Supabase JS client, then they get 0 rows and writes fail. The tables are:
- `promo_settings`
- `promo_assets`
- `promo_creatives`
- `promo_cost_log`

RLS is on, and policies use `has_role(auth.uid(),'admin')`. `promo_cost_log` cannot be inserted or updated from any client, admin included; only the server (service role) writes it.

**A6.** Given an admin generates any creative, when the `credit_ledger` table is checked afterwards, then:
- no new row exists for that generation
- `profiles.user_credits` and `subscriptions.monthly_credits_used` are unchanged

### B. Brand Kit
**B1.** Given an admin uploads a PNG or SVG logo up to 1 MB, when they save, then the logo:
- is stored under `renders/<adminId>/promo-studio/brand/`
- appears in the Brand Kit preview

Other types, or files over 1 MB, are rejected with "Logo must be PNG or SVG, max 1 MB."

**B2.** Given an admin sets the primary, secondary, accent and text colours (hex) and the app URL, when they save and reload, then the values persist. An invalid hex value or URL shows an inline error and is not saved.

**B3.** Given an admin uploads screenshots, when the upload completes:
- Each file is PNG, JPG or WebP, ≤5 MB, and at most 20 per upload.
- Each one appears in the library with an editable **label** and a **feature tag**.
- The feature tags are: images, carousels, thumbnails, video, voice, captions, research, planner, pricing, other.

**B4.** Given there are live offers in `offers`, when the admin opens the offer picker, then:
- it lists only live offers: `active`, started, not ended
- each entry shows its code and label (`offerLabel`)

Picking one stores `offer_id` in `promo_settings`. "No offer" is allowed.

**B5.** Given the selected offer later ends or is deactivated, when the admin opens Promo Studio, then the Brand Kit shows "Your selected offer has ended. Pick another." New generations use no offer until a new one is picked.

**B6.** Given an empty screenshot library, when the admin picks a template that needs a screenshot, then:
- Generate is disabled
- the message "Upload at least one screenshot in Brand Kit first" is shown

The templates that need a screenshot are feature spotlight and before-after.

### C. Templates and generation options
**C1.** The template picker shows 3 cards in v1:
- Feature spotlight
- Offer/festival
- Before→after

Faceless YouTube and Telugu voiceover appear as disabled cards labelled "Coming soon (video)".

**C2.** Allowed combinations are validated **on the server** with zod:

| Option | Allowed values | Notes |
|---|---|---|
| format | image, carousel, story | |
| size | 4:5, 1:1, 9:16 | story always uses 9:16 |
| language | en, te, hi | |
| variants | 1–4 | |
| slides | 3–7 | carousel only |

Anything outside these is rejected with a clear error and no provider call.

**C3.** Offer/festival template, given no offer is selected: Generate shows "Pick an offer in Brand Kit first."

**C4.** Before→after template:
- The admin picks a "before" image (an upload or a library screenshot) and an "after" screenshot.
- Without both, Generate is disabled.

**C5.** Given valid options and N variants, when the admin clicks Generate, then N Draft creatives appear in the Library, each with:
- a different hook and headline
- the caption and hashtags
- the rendered preview

**C6.** Given language = te or hi, when the creatives render, then:
- the headline, slide text and CTA are in native script (Telugu or Devanagari)
- they use an embedded Noto Sans Telugu or Noto Sans Devanagari font, with no tofu boxes
- the caption is in the same language, with English hashtags allowed

**C7.** Given the AI returns invalid JSON or the provider fails, then:
- the creative is not created
- the error "Couldn't write the copy. Try again." is shown
- the failed call is still logged in `promo_cost_log` with `ok=false`

**C8.** The AI copy prompt must follow `HONESTY_RULES` (`src/lib/agents/marketing.server.ts`). It must not invent features, prices or discounts:
- The offer code and label come from the `offers` row, never from the model.
- QA check: the displayed offer code equals `offers.code` exactly.

### D. Overlay and mockup rendering
**D1.** Every creative is built from a code template. Each one contains:
- the real screenshot inside a device mockup frame (phone or browser)
- the headline
- the logo, top-left or top-right per template
- the CTA button text
- the app URL
- for offer creatives, the offer code chip

Text is never baked into the AI image. The AI background, if used, has no text.

**D2.** The output pixel sizes are fixed:

| Size | Pixels |
|---|---|
| 4:5 | 1080×1350 |
| 1:1 | 1080×1080 |
| 9:16 | 1080×1920 |

QA checks the downloaded PNG dimensions.

**D3.** If a headline is longer than the template's text box:
- the text first auto-shrinks, to a minimum of 70% size
- if it still doesn't fit, the editor shows "Headline too long, shorten it"

Text must never be clipped silently.

**D4.** The admin can edit the headline, CTA and caption of a Draft inline. Saving re-renders the preview. **Editing an Approved creative moves it back to Draft** (see §7).

**D5.** When the "AI background" toggle is off (the default), no fal call is made. QA checks that no `promo_cost_log` row exists with `step='background'`.

### E. Promo Library and statuses
**E1.** The Library lists the creatives:
- newest first
- with filters by status, template, format and language
- 24 per page

Each card shows:
- the thumbnail
- the template, size and language
- the status badge
- the cost (USD, 4 decimals)
- the created date

**E2.** Status transitions follow §7 exactly. Any transition outside the table is rejected by the server with "Can't move a <from> creative to <to>."

**E3.** Approve requires that:
- the creative has a stored output file
- if it has an offer, that offer is still live

If the offer has ended, the error is "This offer has ended. Regenerate or remove the offer."

**E4.** Archive hides the creative from the default view. An "Archived" filter shows it again. Nothing is deleted in v1.

### F. Download
**F1.** For an image or story creative, Download saves `creatorflow-<template>-<size>-<lang>-<id8>.png` at the D2 size.

**F2.** For a carousel creative, Download saves `creatorflow-carousel-<id8>.zip`. It contains:
- `slide-01.png` … `slide-NN.png`
- `caption.txt`

jszip must be lazy-loaded (audit PERF-10).

**F3.** "Copy caption" copies the caption, a blank line, then the hashtags.

**F4.** Download is allowed in **every** status. Downloading does not change the status.

### G. Send to calendar (approval gate)
**G1.** "Send to calendar" is enabled **only** on Approved creatives. On Draft creatives the button is disabled, with the tooltip "Approve first."

**G2.** **The server enforces the gate.** `schedulePromoCreative({creativeId, platform, connectionId, scheduledAt})` must:
1. Re-check `has_role`.
2. Load the creative and reject it unless `status='approved'`.
3. Reject it if the offer has ended, or if `scheduledAt` is after the offer's `ends_at`. The error is "This post would go out after the offer ends."
4. Insert a `scheduled_posts` row for the admin, using the same media and connection validation as `schedulePost` (`src/lib/publishing.functions.ts:74`). It must reuse that validation, not copy it loosely.
5. Store the `scheduled_post_id` on the creative and set `status='scheduled'`.

The creative is never sent to the generic `schedulePost` without this check.

**G3.** Given a Draft creative id is sent straight to `schedulePromoCreative`, then the call fails with "Approve this creative first", and no `scheduled_posts` row is created.

**G4.** The calendar entry must appear on `/calendar` (the admin's own `scheduled_posts`). The publish worker (`social-publish.server.ts`) posts it at the scheduled time, with no change to the worker.

**G5.** "Cancel schedule" on a Scheduled creative:
- deletes the `scheduled_posts` row, only if its status is still `scheduled`
- moves the creative back to Approved

If the post is already `publishing` or `published`, cancel is refused.

**G6.** When the Library loads, Scheduled creatives whose linked `scheduled_posts.status = 'published'` are shown, and stored, as **Posted**. If that post has status `failed`, the creative shows a red "Post failed: <last_error>" note and stays Scheduled.

**G7.** "Mark as posted" (for manual posting after download) is available on Approved creatives only. It moves them to Posted.

**G8.** If the creative came from a weekly pack (it has a `plan_item_id`) and that plan item already has a post scheduled for the same platform and day, the schedule dialog warns "This day already has a <platform> post scheduled." The admin can still continue.

### H. Weekly pack
**H1.** The "Weekly pack" button reads `content_plan_items` dated IST today through today+6 with `status IN ('planned','drafted')`, at most 7 items. It shows a confirm dialog listing:
- each day's idea, mapped format and template
- the **estimated total cost (USD)**
- the remaining monthly budget

**H2.** The plan format maps to the v1 format like this:

| Plan format | v1 format |
|---|---|
| `image` | image 4:5 |
| `carousel` | carousel 4:5, 5 slides |
| `reel` / `long` | story 9:16 (a static cover or teaser) |

The `build='walkthrough'` days use the screenshot whose feature tag matches `media_id`. If none matches, they use the most recent screenshot.

**H3.** The template is picked per item:
- If the idea mentions the active offer code, or says offer/deal/sale/festival/Diwali/Christmas/Sankranti/Ugadi, it is **Offer/festival**.
- If it says "before" or "makeover", it is **Before→after**.
- Otherwise it is **Feature spotlight**.

The admin can change any row in the confirm dialog.

**H4.** The language is Telugu if the idea mentions Telugu, Hindi if it mentions Hindi, and otherwise English.

**H5.** On confirm, the creatives are generated **one at a time**. A progress list shows each day as queued, generating, done or failed. The pack produces 1 variant per day, in Draft. Each creative stores its `plan_item_id`.

**H6.** If a non-archived creative already exists for a plan item, that day is skipped with "Already has a creative". A "Regenerate" checkbox per row overrides this.

**H7.** If the monthly cap would be crossed mid-pack, the remaining days stop with "Monthly Promo Studio budget reached". Finished creatives are kept.

**H8.** The weekly pack **never** approves or schedules anything. It **never** changes `content_plan_items.status`, because that column is owned by the post-creator flow.

**H9.** With 0 plan items in range, the button shows the empty state: "No content plan days in the next 7 days. Add days in Calendar → Content plan."

### I. Cost logging, cap and rate limit
**I1.** Every provider call writes one `promo_cost_log` row, whether it succeeds or fails, with these fields:

| Field | Value |
|---|---|
| `admin_id` | the admin's user id |
| `creative_id` | nullable for pre-creative copy calls |
| `batch_id` | shared by one Generate click or one weekly pack |
| `step` | `copy`, `background`, (phase 2) `video`, `voice` or `transcode` |
| `provider` | `openrouter` or `fal` |
| `model` | the exact model or endpoint id |
| `units` | numeric |
| `unit_type` | `input_tokens+output_tokens`, `megapixels`, `images`, `characters` or `seconds` |
| `est_usd` | the price-table estimate |
| `actual_usd` | OpenRouter `usage.cost` when returned (`usage: {include: true}`, as `agentJson` does), otherwise null |
| `ok`, `error` | outcome |
| `provider_request_id` | if the provider returns one |
| `created_at` | timestamp |

**I2.** `promo_creatives.cost_usd` equals the sum of `coalesce(actual_usd, est_usd)` over its log rows. The Library card shows this value.

**I3.** A header widget shows:
- "This month: $X.XX of $CAP"
- a progress bar
- creatives made this month
- average cost per creative

It is amber at 80% and red at 100%.

**I4.** **Monthly cap:**
- Before every provider call, the server compares this calendar month's (UTC) total in `promo_cost_log` plus the call's estimate against `promo_settings.monthly_cap_usd`.
- If the call would cross the cap, it refuses with "Monthly Promo Studio budget reached ($CAP). Raise it in Brand Kit → Budget." and makes no provider call.
- The cap is editable only by an admin, and the change is logged.

**I5.** **Per-request cap:** a single Generate request whose estimate is over `$1.00` is refused with the estimate shown. The weekly pack is checked per creative.

**I6.** **Rate limit,** counted on the server from `promo_cost_log` and enforced before the provider call:

| Window | Max provider calls per admin |
|---|---|
| Rolling 10 minutes | 40 |
| Rolling 24 hours | 300 |

Over the limit, the error is "Slow down. Try again in N minutes."

**I7.** When spend first crosses 80% of the cap in a month, one Telegram alert goes to admins. It must resolve admins through `has_role` / `user_roles`, **not** `profiles.is_admin` (audit C1 says `alertAdmins` currently uses `is_admin`). If that helper is not fixed yet, skip the alert in v1 rather than use `is_admin`.

---

## 6. "No user credits deducted": how it works without a credit-free hole
- **A separate server-only path.** All Promo Studio generation lives in new server functions in `src/lib/promo-studio.functions.ts`. They call server-only helpers in `src/lib/promo-studio/*.server.ts`.
- **The chain on every function is:**
  1. `requireSupabaseAuth`
  2. `assertPromoAdmin` (`has_role`)
  3. zod validation
  4. rate-limit check
  5. budget check
  6. provider call
  7. cost log
- **The admin decision comes only from the session.** There is **no** request flag such as `admin`, `free` or `skipCredits`. The server decides from `context.userId` plus `has_role`, never from the body.
- **Shared provider calls, extracted carefully.** The architect should pull the raw fal and OpenRouter calls into plain server-only functions, for example `falRunImage(endpoint, input)` and `openrouterJson(...)` returning `usage`. These must:
  - **not** be routes or `createServerFn`
  - not be importable from client code (`*.server.ts`)
  - **contain no auth and no charging**, so they can only be reached through a caller that does its own checks
- **The existing user routes stay as they are.** `/api/generate-image`, `/api/tts` and `/api/generate-video-clip` keep calling `chargeCredits` exactly as now. **Promo Studio must not call those HTTP routes.** If it did, it would create audit-only `source='admin'` ledger rows through `reserve_credits`'s admin branch (`20260715201121:147-159`) and lose the cost data.
- **No `credit_ledger` writes from Promo Studio.** Spend is tracked only in `promo_cost_log`. This keeps credit accounting (user money) separate from marketing spend (company money).
- **Side note for SPK and security.** `reserve_credits` already makes **every admin generation free** in the user studios, with no cost logged. That is acceptable for one admin, but Promo Studio's cost log will not include admin use of the normal studios.

## 7. Status state machine
```
             generate / weekly pack
                     │
                     ▼
   ┌────────────► DRAFT ◄───────────────┐
   │ edit text        │ approve (admin)  │ unapprove (admin)
   │ (re-render)      ▼                  │
   └──────────── APPROVED ───────────────┘
                 │      │  mark as posted (admin, manual)
  send to        │      └──────────────────────────┐
  calendar       ▼                                  ▼
  (admin)    SCHEDULED ── linked scheduled_post ──► POSTED (terminal)
                 │        status = 'published'
                 │        (system, synced on Library load)
                 │ cancel schedule (admin, only while the
                 ▼ scheduled_post is still 'scheduled')
              APPROVED

  Draft, Approved and Scheduled (Scheduled only after cancelling) can all go to ARCHIVED (admin).
  Archived can be restored (admin) to Draft.
```
| From → To | Who | Server guard |
|---|---|---|
| Draft → Approved | admin | output file exists; offer live (E3) |
| Approved → Draft | admin, or automatically on any edit | none |
| Approved → Scheduled | admin, via `schedulePromoCreative` | `status='approved'`; offer still live at `scheduledAt` (G2) |
| Scheduled → Approved | admin, by cancelling | linked post still `scheduled` (G5) |
| Scheduled → Posted | system | linked `scheduled_posts.status='published'` |
| Approved → Posted | admin ("Mark as posted") | none |
| Draft / Approved → Archived | admin | none |
| Archived → Draft | admin | none |
| Posted → anything | nobody | terminal; the record is kept for metrics |

- **There is no path from Draft to Scheduled or Posted.** Generation and the weekly pack can only create Drafts.
- **Approve is a separate request from Generate.** No endpoint generates and approves in one call.
- **Transitions are done by a single server function, `setPromoCreativeStatus`,** using a whitelist table, never by direct client table writes. RLS lets admins read only. Writes go through server functions (service role) after `has_role`.

## 8. Overlay rendering: recommendation (architect to confirm)
**Recommendation: render client-side in v1** with `html-to-image`. It is already a dependency, used by `carousels.tsx`, `slide-editor.tsx` and `thumbnails.tsx`. The approach:
- React template components at fixed pixel sizes
- static device-mockup frames (SVG/PNG in `public/promo-mockups/`)
- the PNG uploaded to Storage with a signed upload URL, in the same pattern as `createPlanMediaUpload`

**Why:**
- It costs $0 per render.
- The browser shapes Telugu and Devanagari text correctly with Noto fonts.
- The admin sees the exact pixels they will approve.
- It needs no new server dependencies.

Server-side options carry real costs:
- satori/resvg: weak complex-script shaping, so Telugu is a risk
- Puppeteer/Chromium on Vercel: cold starts, size limits, and a new service
- `@napi-rs/canvas`: a new native dependency

**Trade-offs for the architect:**
- **Integrity.** The server does not render, so it can't prove the PNG matches the stored text. That is acceptable because this is admin-only and the human approves the visible PNG.
- **Bundle size.** The fonts and mockup assets must load lazily, only on this route.
- **Phase 2 video.** Text on video will need a server-side ffmpeg `drawtext` pass through the existing transcode path, with a Telugu font file. Video overlay goes server-side in phase 2.

## 9. Data model (proposal; the architect owns the final shape)
Everything goes in one migration in `supabase/migrations/`, RLS on for every table.

**`promo_settings`.** A singleton row holding:
- `logo_path`
- `colors jsonb`
- `app_url`
- `default_cta`
- `offer_id` (FK `offers`, nullable)
- `monthly_cap_usd numeric(10,2)`
- `cap_alerted_month`
- `updated_by`, `updated_at`

**`promo_assets`.** Holds:
- `id`
- `kind` (`'screenshot'`; phase 2 `'recording'`)
- `path`
- `label`
- `feature_tag`
- `width`, `height`
- `created_by`, `created_at`

**`promo_creatives`.** Holds:
- `id`, `batch_id`
- `template`, `format`, `size`, `language`, `variant_index`
- `hook`, `headline`, `slides jsonb`, `cta`, `caption`, `hashtags`
- `offer_id` plus **snapshots** `offer_code` and `offer_label`. These are frozen at generation so a later offer edit can't change an approved creative silently.
- `asset_ids uuid[]`, `background_path`, `output_paths text[]`
- `status` (check: `draft`, `approved`, `scheduled`, `posted` or `archived`)
- `approved_by`, `approved_at`
- `scheduled_post_ids uuid[]`
- `plan_item_id` (FK `content_plan_items`, nullable)
- `landing_media_id` (phase 2)
- `cost_usd`
- `created_by`, `created_at`, `updated_at`

**`promo_cost_log`.** Holds the fields in I1. It is append-only:
- no UPDATE or DELETE policy
- inserts only by the service role
- index on `(admin_id, created_at)` and `(created_at)`

**Storage.** The existing private `renders` bucket, under `<adminId>/promo-studio/{brand,assets,out}/`.
- Use batch `createSignedUrls` for the Library (audit PERF-9).
- Posts scheduled through the worker need long-lived signed URLs: 45 days, as `attachPlanMedia` does.

**Price table.** `PROMO_PRICES` in `src/lib/promo-studio/prices.server.ts` (server-only). It holds per-unit USD for each model used, so the estimate and log share one source.

## 10. Credit cost and provider cost (flag for SPK; no user prices change)
- **User credits per use:** **0**. This is an admin-only internal tool, and no user-facing price, plan or credit cost changes.
- **Estimated provider cost per v1 creative.** These are estimates and need confirming against fal's live pricing endpoint:

| Step | Model | Est. cost |
|---|---|---|
| Copy (hooks, caption, hashtags for 1–4 variants) | gemini-2.5-flash via OpenRouter, ~1.5k in / ~1k out tokens, no reasoning | ~$0.003 per request |
| AI background (optional) | fal `flux/schnell` at ≤1 MP | ~$0.003 per image; a 5-slide carousel with backgrounds is ~$0.015 |
| Overlay render | client-side | $0 |
| **Typical static creative** | | **$0.003–0.02** |
| **Weekly pack (7)** | | **~$0.05–0.15** |

- **Phase 2 reference costs,** taken from the 2026-11-26 audit margin table:
  - motion clip, standard: ~$0.22
  - motion clip, premium (Kling): ~$0.35
  - ElevenLabs v3 for Telugu: ~$0.01 per 100 characters
  - a 30-second faceless video: ~$0.5–1.5

  Video changes the budget picture, which is why it is phase 2 with its own cap review.

## 11. UX
**Entry point.** A new card or link "Promo Studio" on `/admin` (`admin.index.tsx`). Nothing appears in the user sidebar.

**Page layout.** One route with tabs: **Create**, **Library** and **Brand Kit**. The budget widget (I3) sits in the header on every tab.

**Create tab:**
- template cards
- options bar: format, size, language, variants, and slides for carousels
- screenshot picker, a grid from the library filtered by feature tag
- AI-background toggle, off by default
- an estimated cost line, "Est. $0.004"
- the Generate button
- the "Weekly pack" button, top-right

**Loading state.** One skeleton card per variant, with the steps "Writing copy…", "Painting background…" and "Rendering…". The admin can't double-submit: the button is disabled while a batch runs.

**Library tab:**
- a grid of cards with status badges: Draft (grey), Approved (green), Scheduled (blue), Posted (purple), Archived (muted)
- a detail drawer with the preview (a slide carousel for carousels), editable text (Draft only), the caption, and actions: Approve, Unapprove, Download, Copy caption, Send to calendar, Cancel schedule, Mark as posted, Archive
- the cost breakdown from the log rows

**Schedule dialog:**
- platform picker, limited to the admin's connected `platform_connections`
- account picker
- date and time in IST
- an offer-expiry warning
- a duplicate-day warning (G8)

**Brand Kit tab:**
- logo upload
- 4 colour pickers
- app URL
- default CTA
- offer picker (B4/B5)
- screenshot library (upload, label, tag, delete-from-library)
- Budget section with the monthly cap field (admin-editable once SPK sets a default)

**Empty states:**
- no screenshots (B6)
- no live offer: "No live offers. Create one in Admin → Offers."
- empty Library: "No creatives yet. Pick a template on Create."
- no plan days (H9)
- no connected accounts in the schedule dialog: "Connect Instagram/Facebook/YouTube in Connections first." (Connections is live per SPK's 2026-11-26 decision)

**Errors.** Plain one-line messages as listed in the ACs. A provider error never shows a raw JSON dump; it shows at most a 160-character detail, as the image route does.

**Mobile.** The Library and Brand Kit must work at 375 px: single-column grid, full-screen drawer. Create works but shows the hint "Best on desktop" because the render preview is large. Rendering still produces full-size PNGs, since it renders off-screen at fixed pixel size.

## 12. Out of scope / non-goals (v1)
- Video, voiceover, Telugu audio, screen recordings, the faceless YouTube template, and add-to-landing-showcase (all phase 2).
- Any change to user-facing credits, prices, plans, `ACTION_COSTS` or the refund logic.
- Any change to the publish worker, `schedulePost`, or the post-creator agent and `agent_tasks`. **Promo Studio does not depend on Agent HQ or AI Agents.**
- Writing `content_plan_items.status`.
- Auto-posting without approval, auto-approval, or scheduled (cron) generation of packs.
- Multi-admin roles or a two-person approval.
- Editing creatives on a canvas (drag and drop). v1 allows text edits only.
- AI-generated product UIs. **Only real screenshots** show the product.
- Exposing Promo Studio on hq.prodxstore.com. Only a cost metric goes there, later.
- Re-enabling Marketplace or AI Agents.

## 13. Risks
| Risk | Mitigation |
|---|---|
| **A credit-free path leaks to users.** This is the biggest risk. | Admin-only server functions with `has_role` (A2); no request flags (A4); the provider helpers have no exported endpoint (§6). The security-auditor must sign off. |
| **The admin check uses the wrong source.** `useAccess().isAdmin` trusts `profiles.is_admin` (user-writable until audit C1 is fixed) and a hard-coded email. | The route guard and every server function use `has_role` only (A1, A2). **This must ship after the C1–C4 emergency fix**, or at minimum must not use `is_admin` anywhere. |
| **Provider cost spike** from loops, retries or a stuck pack. | Monthly cap (I4), per-request cap (I5), rate limit (I6), sequential pack (H5), 80% alert (I7). There is no automatic retry in a loop: at most 1 retry per provider call, and each retry is logged. |
| **Budget race.** Two parallel requests can both pass the check. | The overshoot is limited to one request (≤$1) by I5 and the rate limit. The architect may use a SQL function with an advisory lock if wanted. |
| **The wrong or expired offer code gets published.** | Offer snapshot on the creative; Approve and Schedule both re-check that the offer is live (E3, G2). |
| **Misleading claims in AI copy** (fake features, prices). | `HONESTY_RULES` (C8); the offer code comes from the DB; human approval is required. |
| **Duplicate posts.** The post-creator agent may also draft the same plan day into `agent_tasks`. | G8 warning; the open question for SPK below. |
| **Signed media URL expires before the post goes out.** | 45-day signed URLs (as `attachPlanMedia`); scheduling more than 45 days ahead is refused. |
| **Large Library payloads.** | Store paths, not base64 (audit H12); batch URL signing; 24 per page. |
| **Fonts and mockups bloat the main bundle.** | Lazy-load them on the route only. |
| **Payments.** | Nothing here touches Razorpay, so there is no payment risk. It only reads `offers`. |

## 14. Size
**L.** It needs:
- a new migration with 4 tables, RLS and indexes
- storage paths
- new server functions
- extraction of the shared provider helpers out of the existing paid routes (which touches money-path files)
- a new admin route with 3 tabs

**It goes to the architect, and then the security-auditor is required.** The v1 build is roughly 3–5 developer days after the design.

**Dependencies:**
- the audit C1–C4 fix merged first
- the existing `html-to-image`, `jszip` and `renders` bucket

## 15. Success metrics (watch on hq.prodxstore.com)
- **Creatives approved per week:** target ≥7, meaning the weekly pack is actually used.
- **Approved-to-generated ratio:** target ≥40%. A low ratio means the templates or copy need work.
- **Creatives Posted per week:** target ≥5.
- **Promo Studio spend per month** against the cap, and **cost per approved creative:** target <$0.05 in v1.
- **Offer redemptions** (`offer_redemptions`, status `redeemed`) for the codes used in posted creatives, week over week.
- **Signups** in the 48 hours after each posted creative. This is directional only: real attribution needs UTM tracking on `app_url`, and it is an open question below.

## 16. Open questions for SPK
### (a) Money and cost: need approval
1. **Monthly spend cap for Promo Studio.** *Suggested default: **$10/month** for v1 (static only, ~100+ weekly packs' worth), hard stop, alert at 80%. Review again before phase 2 video. Suggested $25/month then.*
2. **Per-request cap.** *Default: $1.00 per Generate click.*
3. **A separate budget or a shared one?** Should Promo Studio share the Agent HQ `monthly_budget_usd` (default $10)? *Recommendation: **separate**, so marketing can't starve the support agents.*
4. **AI background.** Allow `flux/schnell` only (~$0.003), or also nano-banana HD (~$0.04 per image)? *Recommendation: schnell only in v1, ≤1 MP.*
5. **Phase 2 video models.** Standard MiniMax (~$0.22 per clip) or Kling premium (~$0.35)? *Recommendation: decide at phase 2; Kling for hero creatives only.*

### (b) Non-money
1. **Spec file path.** The team convention is `specs/<date>-<slug>.md`, but this file was saved to `specs/promo-studio.md` as CHIEF asked. *Default: keep it as is.*
2. **Calendar integration.** Should Promo Studio schedule straight into `scheduled_posts` (this spec), or create `agent_tasks` drafts in Calendar → Content plan? *Recommendation: direct `scheduled_posts` through an approval-checked server function. It is simpler and doesn't depend on Agent HQ.*
3. **Duplicates with the post-creator agent.** When a weekly-pack creative is scheduled, should the matching plan day be marked so the post-creator agent skips it? *Recommendation: v1 warns only (G8); revisit after a week of use.*
4. **Ship order.** Does v1 wait for the C1–C4 emergency fix to merge? *Recommendation: yes. The Promo Studio guards rely on `has_role`, and `alertAdmins` still uses `is_admin`.*
5. **UTM on the app URL** (`?utm_source=promo_studio&utm_content=<id8>`) for attribution. Is there signup UTM capture today? *Default: add it to the URL in creatives now; analytics capture is a separate ticket.*
6. **Languages in v1.** English, Telugu and Hindi? *Default: yes. Telugu and Hindi are text only; voiceover comes in phase 2.*
7. **Retention.** Archived creatives are kept forever in v1. *Default: yes; a delete flow is out of scope, since deleting needs SPK approval anyway.*

## Sources
- fal pricing overview and pricing API: https://fal.ai/docs/documentation/model-apis/pricing
- FLUX schnell ~$0.003/MP and nano-banana ~$0.039/image (third-party trackers; confirm against fal's live pricing):
  - https://modelslab.com/fal-ai-pricing
  - https://markaicode.com/pricing/fal-ai-pricing/
  - https://perkstack.co/blog/cheapest-nano-banana-api
- Motion-clip, ElevenLabs and Gemini Flash costs: `.claude/team/audits/2026-11-26.md`, AI cost-margin table.

## SPK decisions (2026-11-26)
**Money (approved by SPK):**
- Monthly cap: **$10/month**. Hard stop at the cap, with an alert at 80%.
- Per-request cap: **$1.00** per Generate click or weekly pack.
- Budget: **separate** from Agent HQ's budget.
- Background model: **flux/schnell only, at ≤1 MP**. No nano-banana HD in v1.

**Non-money (CHIEF took the recommended defaults):**
- Keep the spec file name.
- Schedule straight into `scheduled_posts`.
- Warn on duplicate posts, but don't block them.
- Ship after the C1–C4 fix merges.
- Add UTM tags to the app URL.
- Support English, Telugu and Hindi as text.
- Keep archived creatives; no delete in v1.
