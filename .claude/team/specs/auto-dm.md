# Auto DM — spec (2026-11-27)

**Decisions (SPK):** Creator and Pro plans; visible as "Coming soon" until the Meta app is configured; built by CHIEF with one review pass.

## What it does
- Instagram (via linked Facebook Page) and Facebook Pages.
- Rules per connected account: comment with keyword → private DM; any comment → DM; DM with keyword → reply.
- Optional link appended to the DM; optional public reply under the comment (random pick of up to 5).
- Target one post/reel or all posts. Keyword match: whole-word for Latin, substring for Telugu/Hindi etc.; or exact.
- Activity log + 7-day sent/failed counts. "STOP" in a DM opts the person out.

## Meta rules enforced
- One private reply per comment (unique index), only within 7 days of the comment.
- DM replies only within 24 h of the person's last message.
- Hourly caps per account: 700 private replies, 180 DMs, 180 public replies.

## Architecture
- `POST /api/public/webhooks/meta` — X-Hub-Signature-256 (Meta app secret from Admin → Social Publishing); GET verify with `META_WEBHOOK_VERIFY_TOKEN`.
- Events → `dm_events` (dedupe) → rule match → `dm_sends` queue → sent immediately (8 s budget) or by `/api/public/hooks/auto-dm` (pg_cron every minute, only when queued; reuses the publish cron secret).
- Page tokens resolved server-side from the stored (encrypted) user token; never sent to the browser.
- OAuth `purpose: "dm"` requests messaging scopes; callback stores the scopes Meta actually granted (`/me/permissions`) and the Instagram account's `page_id`.

## Go-live checklist
1. Merge `feature/auto-dm`, run migration `20261127150000_auto_dm.sql`.
2. Vercel env: `META_WEBHOOK_VERIFY_TOKEN` (16+ random chars).
3. Meta Dashboard → Webhooks: `https://creatorflowai.prodxstore.com/api/public/webhooks/meta`; Instagram fields `comments, messages`; Page fields `feed, messages`.
4. Add Instagram + Messenger products; App Review for instagram_manage_messages, instagram_manage_comments, pages_messaging, pages_manage_metadata, pages_manage_engagement, pages_read_user_content.
5. Remove `soon: true` from the Auto DM sidebar item in `src/components/app-shell.tsx`.
