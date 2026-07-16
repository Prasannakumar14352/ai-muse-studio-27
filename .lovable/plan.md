# LinkedIn Content Studio Upgrade

Transform the existing LinkedIn Post Generator into a unified AI LinkedIn Content Studio. Work is grouped so each phase leaves the app fully working.

## Scope decisions (please confirm)
- **Publish integration**: architecture only — keep a stub "Publish to LinkedIn" button wired to the existing platform-connection hook. No new LinkedIn OAuth work now.
- **File uploads (PDF/image/URL/YouTube)**: use existing content-extraction path where already available; fall back to "paste text/URL" for PDFs (no new parser this pass).
- **Carousel & Image generators**: reuse existing `linkedin-carousel-studio` and `linkedin-image-studio`, invoked from the new Studio with post context prefilled — no duplicate implementations.
- **Brand voice**: extend existing `brand_kits` (add saved custom voices JSON) rather than a new table.

## Phase 1 — Backend
1. Extend `src/lib/linkedin-ai.functions.ts`:
   - Add `post_type` enum (20 types + `auto`), `writing_style` (12), `emoji_level`, `variation_count`, `cta_type`, `hashtag_mix {trending, niche, broad}`, `input_source {topic|url|youtube|article|pdf_text|image_desc|existing}`, `brand_voice_id`.
   - Return: `hooks[10]`, `variations[]` (each: type, body, reading_time, char_count), `hashtags {trending[], niche[], broad[]}`, `ctas[]`, `carousel_outline`, `image_prompts[]`, `scores {engagement, readability, tone, virality, storytelling, cta, overall}`, `improvements[]`.
   - New section-level fns: `regenerateHook`, `regenerateCTA`, `regenerateHashtags`, `regenerateBody`, `regenerateConclusion`.
   - Add context-isolation instruction: ignore active strategy unless `use_strategy_context: true`.
2. Add `scoreLinkedinPostFn` (reuses `gatewayChatJson`) returning the score card + suggestions.
3. Persist saved brand voices under `brand_kits.custom_voices` (JSONB) — additive migration + GRANTs already exist.

## Phase 2 — Studio UI (`linkedin-posts.new.tsx` → wizard)
5-step wizard using existing `GenerationWizard` primitives:
1. **Input** — source picker (Topic/URL/YouTube/Article/PDF text/Image desc/Existing), post-type grid (with "Let AI decide"), audience/goal/industry, brand-voice picker (+ Save current), use-strategy toggle (default off).
2. **Style** — writing style, tone, emoji level, length, variation count, CTA type, hashtag mix + count.
3. **Plan** — hooks list (regenerate, pick), outline preview, editable brief.
4. **Generate** — shows variations side-by-side, LinkedIn Score panel per variation, live preview, char/read-time, section regenerate buttons (hook/body/CTA/hashtags/conclusion), "Generate Carousel" + "Generate Image" launchers passing post context.
5. **Export & Publish** — Copy / Markdown / TXT / DOCX / PDF, "Save as favorite", "Duplicate", stub "Publish to LinkedIn" (disabled with tooltip until connection).

## Phase 3 — UX polish
- Live LinkedIn-style preview card (avatar, name, timestamp mock).
- Auto-save draft to `sessionStorage` per wizard.
- Recent history + Favorites tabs on `linkedin-posts.index.tsx` (favorites stored via existing `template_favorites` pattern → new `linkedin_favorites` boolean on posts row).
- One-click copy/regenerate buttons using shared `AssetActions`.

## Phase 4 — Exports
- Markdown/TXT: pure client conversion.
- DOCX: use `docx` package (already in deps if present, else `bun add docx`).
- PDF: reuse existing carousel PDF export util (`jspdf`).

## Phase 5 — Verify
- `bunx tsgo --noEmit`.
- Manual smoke: generate a "kids education" post with no strategy → confirm no business-context bleed.

## Out of scope this pass
- Real LinkedIn API publishing (button stub only).
- Native PDF/YouTube transcription (accept pasted text/summary).
- New DB tables beyond additive columns.

Proceed with all phases?
