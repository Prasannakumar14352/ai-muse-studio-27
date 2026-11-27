# Team Logbook

One line per completed workflow. Newest at the bottom.
Format: `YYYY-MM-DD | type | summary | branch/PR | status | pending approvals`

2026-11-27 | feature | Auto DM: Instagram/Facebook comment-to-DM + DM keyword replies (Meta webhook, send queue, rules UI, Creator+ gate, "Coming soon" until Meta keys) | feature/auto-dm | review + PR | merge to main; run migration 20261127150000_auto_dm on production; set META_WEBHOOK_VERIFY_TOKEN; Meta App Review
2026-11-27 | feature | ProdXStore Phase 2: HQ gets a Store section (sales, orders, products, reviews, messages, subscribers, offer banner) + All-revenue strip; pxs_* migrations and checkout edge functions recorded in repo; webhook skips CreatorFlow payments | feature/hq-store | PR | merge to main (deploys hq.prodxstore.com); then admin.prodxstore.com redirects to hq

## 2026-11-27 — Voiceover overlap (bug, small) + ProdXStore Phase 5 start
- Fix: AI clip audio (hybrid/native) now ducks to 12% under the voiceover; regression test `voiceover-overlap.test.ts`. PR #89. Evidence: 127/127 tests, tsc clean, build passes.
- Phase 5: KidsStories-Mega-pack PR #1 points India checkout to pay.prodxstore.com/checkout/kids-stories-bundle.
- Held: Mega Prompt Vault (relies on SuperProfile email delivery; no /thank-you page), Prompts Pack (not in store, price unknown), kids worksheets + metaads (repos not accessible from this session).
