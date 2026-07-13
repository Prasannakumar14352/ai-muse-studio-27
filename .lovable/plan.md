# Video Blueprint System — Rollout Plan

## Phase 1 + 2 (partial) — LANDED

### Files added
- `src/lib/video-blueprint.ts` — types, factory, mutations, validation, credit estimator, versioning + snapshot builders.
- `src/lib/video-blueprint-store.ts` — read/write helpers against `projects.metadata` (no new tables).
- `src/components/video-blueprint-editor.tsx` — full structured editor UI.

### Metadata structure (inside `projects.metadata.videoBlueprint`)
```
{
  originalAiBlueprint: VideoBlueprint,
  currentBlueprint:    VideoBlueprint,
  blueprintVersion:    number,          // monotonically increments
  blueprintUpdatedAt:  ISO string,
  blueprintSource:     "ai" | "user_edit" | "regenerate_scene" | "restore",
  blueprintVersions:   BlueprintVersionEntry[],  // capped to latest 10
  renderSnapshot:      RenderSnapshot | null,    // immutable copy used by last render
  blueprintVersionUsed: number | null            // version that snapshot represents
}
```

### Editor behavior
- Global fields: title, total duration, platform, aspect ratio, video style, audience, objective, brand, product, CTA, global visual style, global negative, music direction, voice (id + pace + emotion), default transition, motion intensity.
- Per-scene: id, n, start/end/duration, role, visual, image prompt, video (motion) prompt, on-screen text, voiceover, transition in/out, camera movement, subject movement, product placement, character reference + lock, negative prompt.
- Scene actions: add, delete, duplicate, move up/down (reorder), split, merge with next, regenerate one scene (via callback), restore AI original.
- Autosave: debounced 900 ms → `saveBlueprintEdit` bumps `blueprintVersion` and prepends to `blueprintVersions` (cap 10).
- Unsaved-changes indicator + `beforeunload` warning.
- Manual `Save now` + `Restore AI original` (saved as a new version so it can be undone).
- Pre-render validation runs on every render click: aspect ratio, per-scene duration, empty visuals, VO length vs duration, long on-screen text, total-duration drift > 15%, promotional CTA + product-scene requirements.
- Credit estimate shown on every render button (`estimateCredits`).
- Render callbacks: `render_full`, `regenerate_all`, `regenerate_visuals`, `regenerate_voiceover`, `rerender_final`, plus per-scene `onRegenerateScene(sceneId, blueprint)`.

### Render snapshot behavior
- `saveRenderSnapshot(projectId, brief)` writes an immutable copy of `currentBlueprint` into `renderSnapshot` and records `blueprintVersionUsed`.
- Pipeline callers should call `saveRenderSnapshot` before generation begins, then render from `snapshot.blueprint`.
- `hasEditsSinceSnapshot(meta)` detects that the user kept editing during a render — the caller should preserve those edits (they remain in `currentBlueprint`) and surface a toast: "Your edits since the last render are preserved for the next one."

## Test steps (data layer + editor)
1. Create/open any project row; call `initBlueprintMetadata(projectId, buildBlueprintFromPlanning(brief, script))` from the console (or from the pipeline once wired).
2. Mount `<VideoBlueprintEditor projectId=... initialMetadata=... />` in a sandbox route.
3. Edit any global field → within ~1 s see "Saved HH:MM:SS"; refresh the page → edits persist.
4. Add / duplicate / reorder / split / merge scenes → `n` and time ranges re-index.
5. Restore AI original → global fields and scenes revert; a new version is appended (so the restore itself is undoable via history).
6. Trigger a promotional case (fill `product`, leave `cta` empty) → red "missing CTA" error blocks rendering.
7. Click any render button → confirm dialog shows estimated credits; on confirm, `onRender` fires.

## Phase 2 REMAINING (next turn — pipeline wire-in)
The following requires surgical edits to `src/lib/video-agents.ts` and `src/routes/_authenticated/videos.tsx` (1 850 + 1 809 lines) and is intentionally staged in a follow-up turn to avoid destabilizing the running pipeline:

1. **Split `runVideoJobPipeline`** into:
   - `runPlanning(brief, opts) → { script, research, retentionEngine, storyboard, direction }`
   - `runFromBlueprint(brief, blueprint, opts) → PipelineResult`
     - Converts the edited blueprint back to `AiVideoScript` via `blueprintToScript(bp)`.
     - Re-runs `expandScriptToBeats` (or a slimmer beat mapper) to align with the new scene set.
     - Honors per-scene overrides for camera, transition, product placement, character lock, negative prompt.
     - Preserves already-generated shot blobs whose scene wasn't edited (skip regen when scene marker still matches).
2. **Add a "review" view** to `videos.tsx` between planning and shot generation that hosts `<VideoBlueprintEditor />`, wired to:
   - `initBlueprintMetadata` immediately after planning finishes.
   - `onRender` → `saveRenderSnapshot` → `runFromBlueprint`.
   - `onRegenerateScene` → run only that beat through `generateOneShot` and update just that entry.
3. **Selective render actions**:
   - `regenerate_visuals` → keep VO + timeline, re-run shot pool.
   - `regenerate_voiceover` → keep visuals, re-run VoiceoverAgent + SubtitleAgent.
   - `rerender_final` → skip shots + VO, jump to RenderAgent using cached blobs.
4. **"Edits during render" notifier**: on render completion, if `hasEditsSinceSnapshot(meta)` is true, show toast "Your latest edits are queued for the next render."

## Phase 3 — LANDED
- `src/lib/video-brief-parser.ts` — flexible label parser (Title/Duration/Format/Audience/Style/CTA/Music/Voice/Character/Product + per-scene Visual/Text/VO/Camera/Transition/Motion/Negative/Product Placement); tolerates markdown, bullets, numbering; extracts scene timings from "(0-3 sec)" / "3s" / "0:03-0:06"; retains leftover text as `unmappedNotes`; runs `validateBlueprint` on the parsed result.
- `src/components/video-brief-parser-panel.tsx` — paste area (with clipboard paste + example), Parse preview → Apply / Cancel / Undo / Edit Parsed Result. Apply routes through `saveBlueprintEdit` so version history is preserved and the original AI blueprint is never overwritten.
- Wired into `video-blueprint-editor.tsx` via "Import from brief" toggle in header.

## Known limitations of the current slice
- The editor persists to `projects.metadata` but the video pipeline still runs against its own AI-generated script — until step 1 above is done, edits do not yet change what gets rendered.
- `estimateCredits` uses ballpark numbers; align with `src/lib/credit-costs.ts` in a follow-up.
- Drag-and-drop reorder is button-based (▲▼); DnD can be added when we bring the same UX from `linkedin-carousel-studio`.
- No inline preview of scene thumbnails yet — will hook into the shot blob store during the pipeline wire-in.
