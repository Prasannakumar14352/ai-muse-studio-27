# Professional video rendering

## Video Studio export

The browser draws a 720p or 1080p canvas at the chosen project aspect ratio.
Landscape, portrait and square use the actual output dimensions. The user
chooses 24 or 30 FPS, standard/high/maximum quality, fit/crop, scene overlays,
and MP4 or WebM. The browser still composes the cinematic movements and all
five audio layers. The final review can be reopened after export to reuse the
current session's assets and metadata without another AI generation.

Configured MP4 export runs FFmpeg on the existing authenticated transcode
host. FFprobe checks dimensions, average FPS, duration and codecs. The
transcoder preserves compliant H.264 video or AAC audio with stream copy
where possible. A configured MP4 failure returns the user to asset review
for an explicit retry or WebM selection. Legacy callers without settings
retain the previous fallback. WebM FPS is a browser scheduling target.
The configured MP4 stage normalizes to the requested exact rate.

MP4 conversion needs FFmpeg and FFprobe on a Node deployment that can start
processes. Configure `FFMPEG_PATH` and `FFPROBE_PATH` if the binaries are
outside the normal deployment paths. Device resources and browser codec
support still affect browser capture. Smaller assets are scaled to the canvas.

## Persistent worker

Apply these migrations after the existing Phase 1–3 migrations:

1. `20261127150000_durable_veo_clips.sql`
2. `20261127160000_professional_render_jobs.sql`

Run the dedicated worker on an always-on container host. It polls Supabase
and uses a database lease. The HTTP health endpoint is local to the container.
No callback URL or worker secret is needed. Its service-role key stays in the
worker environment. Keep `VIDEO_SERVER_RENDER_ENABLED=false` in the app
until a worker is connected and the staging smoke test succeeds. Set
`VIDEO_4K_EXPORT_ENABLED=true` only for a worker tested for 4K capacity.

```bash
docker compose -f workers/professional-render/compose.yaml up -d --build
docker compose -f workers/professional-render/compose.yaml logs -f
```

Supply `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` through deployment
environment bindings. The reference Compose configuration limits CPU,
memory, process count and temporary storage. Each container runs one job at a
time. A stale lease can be reclaimed after 90 seconds. Claiming is atomic,
and writes and completion require the current lease. Cancellation revokes
the lease and the worker notices it on its next heartbeat or phase update.
The worker reads original image, clip and separate audio objects and never
submits AI requests. Fit/crop preserves aspect ratio. Worker output can be
3840×2160, 2160×3840, or 2160×2160 for square 4K mode. Output dimensions
describe the encoded canvas. Lower-resolution sources are upscaled.

The v1 worker is a cut renderer with source trim, frame-count timing,
independent narration/music/ambience/effects/native layers, fades, looping,
music ducking and peak protection. It validates the MP4 with FFprobe and
checks the audio peak with FFmpeg when an audible mix was requested.
Cinematic transitions, camera effects, overlays and subtitles remain on the
browser renderer. The strict worker manifest rejects fields outside its
implemented contract. Server submission and monitoring are available via
authenticated API. Automatic manifest preparation and the Studio server-job
dashboard remain pending.

## Submit a worker job in staging

Use an authenticated account and an existing Supabase project belonging to
that account. Upload original source files to the write-once private
`professional-render-inputs` bucket under `<user-id>/`, with distinct
filenames. Use the Supabase authenticated storage client and MIME types
allowed by the migration. Sources are limited to 50 MiB each, 40 scenes,
48 separate audio placements and 180 seconds per job. Outputs are capped
at 100 MiB, subject to the Supabase deployment's smaller account limit.
No render fee is charged by the application.

POST the following manifest to `/api/professional-render` as JSON with an
`Authorization: Bearer <Supabase access token>` header. Replace IDs and paths
with real owned objects. Positions and lengths are in output frames.

```json
{
  "version": 1,
  "projectId": "087674c0-30ab-4e2c-a02a-dcd97ec35949",
  "resolution": "4k",
  "fps": 24,
  "aspectRatio": "16:9",
  "quality": "high",
  "fit": "fit",
  "audioSource": "hybrid",
  "duckMusic": true,
  "scenes": [
    {"path": "USER/shot.mp4", "kind": "clip", "frames": 96, "trimFrame": 0, "nativeGain": 0.35}
  ],
  "audio": [
    {"path": "USER/music.mp3", "track": "music", "startFrame": 0, "frames": 96, "gain": 0.25, "loop": true, "fadeFrames": 12}
  ]
}
```

A successful response has status 202 and a durable job ID. POST
`{"id":"<job-id>","operation":"status"}` to the same endpoint. A completed
response includes verified metadata and a short-lived signed URL. Use
`cancel` or `retry` in place of `status` when needed. The worker can continue
when the browser closes if it is deployed and connected. Full hosted
Supabase and worker lifecycle acceptance remains pending.

## Validation and rollback

Run `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, and
`npm run build`. With Vite on port 5191, run
`python tests/e2e/video-audio-mix.py` for Chromium exports. Run
`PYTHONDONTWRITEBYTECODE=1 python tests/e2e/professional-render-worker.py`
for local 4K/24 and square/30 composition. Execute both new SQL tests in
`supabase/tests` with `psql -v ON_ERROR_STOP=1` on a migrated local database.

After commercial and pricing verification, use the Veo staging checklist
in [advanced video models](ADVANCED_VIDEO_MODELS.md). Start with the
30-second 16:9 Hanuman project, Indian Mythology, Full Motion, Veo Fast 1080p
sources, hybrid audio, and 1080p/24 high-quality MP4. Verify both voices
(English and Telugu in separate runs) and each audio mode. Re-export the
same session assets at 720p. For 4K, use the original assets with the
cut-only worker manifest and record any scaling from 1080p sources.
Verify duration, audio separation, exact output metadata and one ledger
charge per provider request. Close the tab during a staging worker run
and resume monitoring via the job ID.

To roll back, disable server render and Veo submissions first. Reconcile
open Veo reservations, let active workers finish or cancel jobs, then
deploy the previous application. Retain private storage and history
until outputs and ledger entries have been reconciled.
