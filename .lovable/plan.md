# AI Thumbnail Studio — Pro Workflow Upgrade

Additive rebuild of `/thumbnails`. Keeps existing dark glassmorphism theme, projects table, layered renderer, and local library. Everything new plugs into the current `thumbnail-director` / `thumbnail-agents` pipeline.

## Step 1 — Planning UI (`src/routes/_authenticated/thumbnails.tsx`)

Replace the single textarea with a 2-step wizard. Step 1 is a form with collapsible "Advanced" section. All fields optional except **Video Title**.

Fields:
- **Title** (required), **Prompt** (optional — AI fills if empty), **Platform** (YouTube / Shorts / IG / FB / LinkedIn / Pinterest / TikTok / X)
- **Aspect ratio** chips: 16:9, 9:16, 4:5, 1:1, 3:4, 2:3, Custom (W/H inputs)
- **Style preset** (expanded to 21 presets — see below)
- **Text overlay mode**: Auto / Custom (textarea) / None
- **Main subject**: Man / Woman / Child / AI Robot / Product / Building / Animal / Vehicle / Logo / Upload / Custom
- **Face expression**: Happy / Shocked / Excited / Thinking / Fear / Angry / Confident / Confused / None
- **Background**: Realistic / Studio / Office / City / Nature / Cyberpunk / Luxury / Space / Minimal / Abstract / Classroom / Dark
- **Lighting**: Golden Hour / Studio / Neon / Moody / Soft / High Contrast / Sunset / Blue
- **Color palette**: Auto / Warm / Cool / Orange / Blue / Purple / Black&Gold / Green / Brand
- **CTR optimization checkboxes**: Large Face, Eye Contact, Rule of Thirds, Large Readable Text, High Contrast, Blur Background, Mobile Optimized, Safe Text Area
- **Brand kit toggles**: Logo / Colors / Font / Watermark (reads default brand kit via existing `brand-kit.functions`)
- **Concepts**: 4 / 8 / 12 / 16
- **Quality**: Fast / Balanced / Ultra

## Step 2 — AI Plan Preview

New server fn `planThumbnailBrief` (`src/lib/thumbnail-planner.functions.ts`) calls Lovable AI Gateway (`google/gemini-3.5-flash`) with structured JSON output:
```
{ sceneDescription, positivePrompt, negativePrompt, thumbnailText,
  composition, cameraAngle, lighting, colorPalette, ctrTips[] }
```
Rendered as editable textareas/inputs. "Regenerate plan" and "Generate images" buttons.

## Generation

Feeds edited plan into existing `renderConcept` pipeline, replicated N times (4/8/12/16). Passes aspect ratio down to image gen (`size` param), platform + palette + lighting appended into prompt template. Each concept saved to existing local library.

## Per-thumbnail Actions (result grid)

Extend existing card with dropdown menu:
- Preview (modal), Edit Prompt (reopens plan), Regenerate, Duplicate
- Replace Text (inline), Replace Background / Subject / Face (regen that layer via existing `regenerateLayer`)
- Crop (existing modal), Download PNG / JPG / WebP (canvas re-encode)
- Upscale, Remove Background, Magic Eraser — call new `thumbnail-edit.functions.ts` server fns that hit Gemini image edit endpoint. If the model can't do it, surface a clean toast.
- Publish (routes to existing publish flow)

## AI Quality Analysis

New `analyzeThumbnailQuality` server fn — returns CTR, Readability, Contrast, Mobile Visibility, Face Detection, Text Balance, Brand Consistency (0–100). Rendered as a `QualityScorePanel`-style card under each thumbnail.

## Reverse Engineer Mode

New tab in Step 1: **"Analyze existing thumbnail"**. Upload/drag image → server fn `reverseEngineerThumbnail` sends the image to Gemini vision with structured JSON schema: `{ style, composition, lighting, cameraAngle, colors[], prompt, negativePrompt, fontSuggestions[], textPlacement }`. Result shows with 3 CTAs: **Create Similar / Use This Style / Generate Variations** — each pre-fills the Step 1 form and jumps into Step 2.

## History

Extend existing `LocalThumbnail` store with: `platform`, `aspectRatio`, `styleId`, `prompt`, `versions[]`, `downloads`. Existing library grid gains: Duplicate, Delete, version count badge.

## Files

New:
- `src/lib/thumbnail-planner.functions.ts` — plan, reverse-engineer, quality analysis, edit ops
- `src/lib/thumbnail-presets.ts` — 21 style presets, platform/palette/lighting/background enums
- `src/components/thumbnail-wizard.tsx` — Step 1 form
- `src/components/thumbnail-plan-editor.tsx` — Step 2 editable plan
- `src/components/thumbnail-actions-menu.tsx` — per-card action dropdown
- `src/components/thumbnail-quality-card.tsx`
- `src/components/thumbnail-reverse-engineer.tsx`

Edited:
- `src/routes/_authenticated/thumbnails.tsx` — wire wizard + step state; keep existing renderer/library
- `src/lib/thumbnail-director.ts` — add extra style presets, aspect ratio support
- `src/lib/thumbnail-agents.ts` — accept aspect ratio + enriched prompt
- `src/lib/thumbnailLocalStore.ts` — extend schema (backwards compatible)

## Design

Reuses `glass`, `gradient-primary`, `neon-purple` tokens. No new global styles. Wizard uses same chip/pill patterns as existing style picker. Advanced sections collapsed by default via `<details>` or local state.

## Scope Note

This is a large feature — I'll implement in this single pass but keep new AI edit ops (upscale / bg remove / magic eraser) as best-effort wrappers around Gemini image editing; if a specific op isn't supported it degrades to a toast rather than blocking the flow.
