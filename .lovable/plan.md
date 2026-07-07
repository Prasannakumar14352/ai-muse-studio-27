# Async Parallel Video Pipeline

Rewrite the Videos generation pipeline to feel like a modern batch renderer: fast planning phase, hundreds of short shots generated in parallel with per-shot retry, live progress, resumable state in IndexedDB, and a Scene Viewer the user can browse while rendering continues.

## Goals

- 9-minute doc: planning done in seconds, shots stream in parallel, final render kicks off only when all shots are ready.
- Never block the UI. Refresh-safe. Per-shot retry, not per-project retry.
- Real counters ("47 / 132 shots"), not a fake progress bar.

## Phase 1 — Planning (seconds, sequential, cheap)

Runs the existing agents in this order and persists each output to the job record in IndexedDB:

1. Research
2. Script
3. Storyboard (existing beat structure)
4. Narration (TTS per section, streamed)
5. Timeline: split storyboard into **3–5 s shots**. For a 9-min video that's ~120–180 shots. Each shot: `{ id, index, start, end, duration, prompt, style, ratio, narrationSliceRef, status: "pending" }`.

Output: a `VideoJob` object with `shots: Shot[]`. Saved to IDB immediately — this is the resume anchor.

## Phase 2 — Parallel shot generation (the bulk of the work)

New module `src/lib/video-shot-runner.ts`:

- Concurrency-limited worker pool (default 6, configurable). Uses `Promise` scheduling, not sequential `await`s.
- Each worker pulls the next `pending` shot, calls `/api/generate-video-clip` (falls back to `/api/generate-image` on non-ok), writes the resulting blob to IDB under `shot:<jobId>:<shotId>`, updates shot status to `done | failed`, persists the job.
- Retry: exponential backoff up to N per shot. On final failure the shot stays `failed` but the pool continues. UI exposes a "Retry failed shots" action that requeues only failed shots.
- Emits events via an `EventTarget` on the job: `shot:done`, `shot:failed`, `progress`. UI subscribes for live counters and Scene Viewer updates.
- Cancellable via `AbortController` stored on the job runtime (not persisted).

Shot blob storage reuses `blob-store.ts` (already IDB-backed). Metadata (status, attempts, blob key, error) lives in the job record in localStorage under `cv:<uid>:videojob:<id>` plus an index key.

## Phase 3 — Assembly & render (only after Phase 2 completes, or user hits "Render now")

Runs the existing `RenderAgent`, but fed by the IDB shot blobs instead of in-memory arrays. Steps run sequentially inside the render agent and report progress on a separate channel (`render:progress`):

1. Sync narration to timeline (already computed)
2. Sync subtitles VTT
3. Mix music bed + SFX
4. Encode final MP4/WebM
5. Save via `saveGeneratedVideo` (existing), mark job `complete`

Render progress bar shows encoder frame progress and is visually separate from the shots counter.

## Phase 4 — Resume

On app mount, the Videos page:

1. Loads all jobs from IDB.
2. For jobs in `planning | generating | rendering` states, offers "Resume".
3. Resuming re-hydrates the job, spins the worker pool back up, and skips any shot already `done` in IDB.

## UI changes (`src/routes/_authenticated/videos.tsx`)

- Landing view keeps the library. New card in the library: **in-progress jobs** with shot counter and a Resume/Cancel button.
- When a job is active, replace the current single-progress screen with a dashboard:
  - Phase indicator (Planning → Generating shots → Rendering).
  - "Generated 47 / 132 shots" counter + small sparkline of completion rate.
  - Failed-shot count with "Retry failed" button.
  - **Scene Viewer**: grid of shot thumbnails, each clickable to preview the clip/image. Grid updates live as shots complete. Shots still pending show a placeholder tile; failed shots show a retry tile.
  - Cancel button that aborts the pool without deleting completed shots (so resume still works).
- Render phase adds a second progress bar labelled "Encoding final video".
- All of this is non-blocking; the user can navigate away and come back.

## Files

- **New**
  - `src/lib/video-job-store.ts` — IDB+localStorage job persistence (jobs, shots metadata, shot blobs). Modeled on `videoLocalStore.ts`.
  - `src/lib/video-shot-runner.ts` — worker pool, retry, event emitter, cancel.
  - `src/lib/video-timeline.ts` — split storyboard into 3–5s shots with narration slices.
  - `src/components/video/SceneViewer.tsx` — thumbnail grid + preview modal.
  - `src/components/video/JobDashboard.tsx` — phase indicator, counters, retry, cancel.
- **Edited**
  - `src/lib/video-agents.ts` — refactor pipeline into `runPlanning(job)` + delegate shot generation to `video-shot-runner`. Remove the current per-beat serial loop.
  - `src/lib/video-renderer.ts` — accept shots from IDB blob keys; emit render progress on its own channel.
  - `src/routes/_authenticated/videos.tsx` — three views: landing (with in-progress jobs), job dashboard, result. Resume-on-mount logic.
  - `src/routes/api/generate-video-clip.ts` — unchanged contract; still falls back to image when the video model isn't wired.

## Technical notes

- Concurrency default 6 is a starting point. `/api/generate-video-clip` today returns `ok:false` and the runner falls back to `/api/generate-image`, which is safe to fan out. If a real video model gets wired later, drop concurrency to 2–3 to respect provider limits — a single constant in `video-shot-runner.ts`.
- No database, no Supabase storage. Everything stays in IDB/localStorage, per the earlier local-first constraint.
- Job state machine: `planning → generating → (paused | rendering) → complete | failed`. `paused` is what a cancelled or interrupted job becomes; resume flips it back to `generating`.
- Shot state machine: `pending → running → done | failed`. `failed` is retryable; `done` is skipped on resume.
- Existing `saveGeneratedVideo` / `thumbnailLocalStore` remain the final delivery surface — this plan only changes how we get there.

## Out of scope

- Actual text-to-video model wiring (still gated on a working provider).
- Server-side rendering / offloading encode off the browser.
- Multi-tab coordination (a second tab resuming the same job). First tab wins; second tab shows read-only view.

## Confirmation

1. OK with default worker-pool concurrency of 6 for image fallback? I'll expose a constant so we can tune later.
2. Scene Viewer as a grid inside the job dashboard (not a separate route)?
3. On resume after refresh: auto-resume in the background, or require the user to click "Resume"? I'm defaulting to explicit Resume so we never burn credits without consent.
