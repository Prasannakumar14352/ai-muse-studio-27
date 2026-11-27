# Advanced video models and clip audio

## Availability

Video Studio still offers MiniMax H3 Turbo and Kling 2.5 Turbo Pro.
Previously saved `standard` and `premium` tiers keep their endpoint and
credit behavior. No Veo model was present in the Model Studio catalog
at the Phase 2 merge.

| Model | Endpoint | Silent USD/s | Native-audio USD/s |
| --- | --- | ---: | ---: |
| Veo 3.1 Fast | `fal-ai/veo3.1/fast/image-to-video` | 0.10 | 0.15 |
| Veo 3.1 Standard | `fal-ai/veo3.1/image-to-video` | 0.20 | 0.40 |

Those rates are the supplied November 27, 2026 snapshot for 720p and
1080p. Quotes use provider-generated seconds and the existing
`ceil(cost × MARKUP / CREDIT_FLOOR_USD)` conversion. The native uplift
is the difference between the rounded combined and silent quotes.
Veo quotes are informational. No Veo credits are reserved.

The supplied minimum payload is `{ "prompt": "...", "image_url": "..." }`.
The fal documentation and machine-readable schema requests returned HTTP 403
in this environment. Clip duration defaults and choices, aspect ratio,
resolution, native audio, negative prompt, seed, safety parameters and
reference-image options remain unverified. Both entries are disabled in
the UI, and the authenticated route rejects them before any provider
submission or credit reservation. Even setting
`VIDEO_ADVANCED_MODELS_ENABLED=true` leaves the schema gate in place.

- [Fast API](https://fal.ai/models/fal-ai/veo3.1/fast/image-to-video/api)
- [Standard API](https://fal.ai/models/fal-ai/veo3.1/image-to-video/api)
- [Veo pricing snapshot source](https://fal.ai/models/fal-ai/veo3.1)
- [fal pricing API](https://fal.ai/docs/documentation/model-apis/pricing)

## Clip audio and review

Asset review offers separate soundtrack, clip audio only, and hybrid once
the job contains a video clip. Clip audio uses sound that is already present
in a local asset, including a clip supplied through the existing media picker.
The lightbox shows source duration and dimensions, with the original audio
available in its playback controls. Review supports global clip-audio gain
and per-shot mute. Clip-only export excludes Phase 2 tracks from the mix.
Hybrid preserves selected Phase 2 tracks. If clip dialogue or music overlaps
the soundtrack, preview the clip and mute it or adjust its gain.

The renderer routes the same video element that draws frames into Web Audio.
Its output goes through the Phase 2 mix bus and into MediaRecorder, so clip
audio starts, pauses and loops with the rendered clip. The source element
does not play out to the speakers during export. A clip enabled for audio must
load as usable same-origin media. Full Motion review requires acknowledgement
if any still image remains in place of a clip.

The combined Phase 2 preview covers separate tracks. Preview original clip
audio in the clip lightbox. Clip audio settings cannot create missing sound.
The source dimensions shown in review are independent of final export
resolution. The renderer has no new 1080p or 4K export setting.

## Deployment and remaining work

No new database migration or provider secret is required for the shipped
clip-audio path. Keep `VIDEO_ADVANCED_MODELS_ENABLED=false`. The existing
server-side `FAL_KEY` is used by the working legacy integrations and would
also be used by Veo. The Phase 2 `VIDEO_PAID_AUDIO_ENABLED` flag continues to
control paid soundtrack assets.

Before enabling Veo, confirm endpoint schemas and billed duration, pricing
and commercial entitlement. Then implement allowlisted submission and
durable per-clip request identity, status recovery, asset storage and
settlement. Verify provider-native output, per-clip fallback and the
resolution controls in staging. Remain on the legacy models until those
steps are complete. To roll back the clip-audio path, deploy the previous
build. Existing shot media remains in the job.

## Verification

Run `npm ci`, `npm test`, `npm run typecheck`, `npm run lint` and
`npm run build`. With Vite listening on port 5191, run
`python tests/e2e/video-audio-mix.py`. The fixture uses generated local tones
and a local MP4, tests Phase 2 audio, native-only, and hybrid export, then
checks for the expected frequencies in AAC after FFmpeg conversion.

Live paid acceptance remains pending. After Veo activation, create the
30-second 16:9 **Hanuman — The Awakening of Divine Power** project with Indian
Mythology, character consistency, Full Motion, Veo Fast, and 1080p source
where confirmed. Use hybrid audio, deep male English narration and divine
orchestral instrumental music. Check the mountain, golden aura, leap, ocean
flight and Lanka reveal. Confirm ambience synchronization, visual continuity,
narration clarity, the MP4 audio stream, and charges for generated duration.
Repeat with Telugu narration, native-only audio and separate soundtrack mode.
