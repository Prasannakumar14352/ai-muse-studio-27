# Plan

Two features. Both scoped to the Videos module. No database, no Supabase storage, no cloud upload.

## Part A — Local video library (IndexedDB + localStorage)

New file `src/lib/videoLocalStore.ts` following the carousel local-store pattern (`src/lib/local-store.ts` + `src/lib/blob-store.ts`):

- **IndexedDB** (via existing `blob-store.ts` — already opens `cv-blobs` DB) holds the MP4/WebM blob and the thumbnail blob per video, keyed as `video:<id>` and `video-thumb:<id>`.
- **localStorage** holds the small metadata index (`cv:<uid>:videos-index` → id[], and `cv:<uid>:video:<id>` → metadata JSON).

Metadata stored per video:
`id, title, niche, topic, styleId, styleLabel, videoType, aspectRatio, duration_sec, extension, mime, youtube_title, youtube_description, hashtags, tags, chapters, pinned_comment, subtitles_vtt, created_at, video_blob_key, thumbnail_blob_key`.

Exports:
`saveGeneratedVideo(input) → LocalVideo`, `getGeneratedVideos()`, `getGeneratedVideoById(id)`, `deleteGeneratedVideo(id)`, `clearGeneratedVideos()`.

Videos page changes (`src/routes/_authenticated/videos.tsx`):

- After pipeline completes, call `saveGeneratedVideo(...)` with the render blob, thumbnail data URL, subtitles VTT, SEO fields, and the brief/niche/topic/style.
- New "Your videos" library section rendered on the page (visible in the idle/form state, not during processing). Each card shows thumbnail, title, duration/aspect chip, created date, and Download / Delete buttons. Clicking a card re-opens the result view for that saved video (hydrated from IDB via object URL).
- Refresh restores the library from IDB/localStorage on mount.
- No auto-upload anywhere.

## Part B — AI video clip generation per beat (with image fallback)

New server route `src/routes/api/generate-video-clip.ts`:

- POST `{ prompt, style, ratio, duration }` → `{ clip?: string /* data URL of mp4 */ }` or `{ ok: false, reason }`.
- Calls Lovable AI Gateway video endpoint if the gateway exposes one. If the model returns a non-2xx or the response isn't an mp4, respond with `{ ok: false }` so the client falls back to an image.
- Cap at ~5s per clip, low resolution (480p) to keep latency and cost reasonable.

Pipeline change in `src/lib/video-agents.ts`:

- New `VisualBeatAsset = { kind: "image" | "clip"; url: string; ... }`.
- `VisualGenerationAgent` for each beat first tries `fetchBeatClip(prompt, style, ratio, duration)`; on failure/null falls back to `fetchSceneImage(...)`. Progress reports both attempts as one "shot".
- Passes `kind` through so the renderer knows what to draw.

Renderer change in `src/lib/video-renderer.ts`:

- `RenderOptions.sceneMedia?: Array<{ kind: "image" | "clip"; url: string } | null>` (backwards-compatible with existing `sceneImages`).
- On load, images become `HTMLImageElement`; clips become muted, preloaded `HTMLVideoElement` (play/pause driven by the frame loop, `currentTime` synced to beat progress × clip.duration).
- `drawScene` accepts either and draws to canvas the same way, applying the existing camera motion (Ken Burns / pan / tilt) on top.
- Fallback path unchanged when a beat has no clip.

Cost note: clip generation is much more expensive than image generation. If the gateway doesn't expose a video model, every beat falls back to image and there is no cost impact vs today. If it does, expect a large jump — worth flagging in the UI so the user knows what's running.

## Files touched

- **New**: `src/lib/videoLocalStore.ts`, `src/routes/api/generate-video-clip.ts`
- **Edited**: `src/lib/video-agents.ts` (beat fetch + progress), `src/lib/video-renderer.ts` (clip playback), `src/routes/_authenticated/videos.tsx` (library UI + save-on-complete + rehydrate on click)

## Confirmation needed

1. OK to add the `/api/generate-video-clip` route even though we don't yet know a working Lovable video model id? It will safely fall back to images until a real provider is wired (i.e. today it behaves like current behavior, but the plumbing is ready).
2. OK for the library section to live directly on `/videos` (not a separate route), matching the carousels page pattern?
