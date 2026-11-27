# Veo and native clip audio

Veo 3.1 Fast and Standard use the existing fal queue through
`fal-ai/veo3.1/fast/image-to-video` and `fal-ai/veo3.1/image-to-video`.
MiniMax and Kling retain their prior endpoint and pricing behavior.

The supplied endpoint-specific contract from November 27, 2026 uses
`prompt`, `image_url`, `duration` (`4s`, `6s`, `8s`), `aspect_ratio`
(`16:9`, `9:16`), `resolution` (`720p`, `1080p`), and explicit
`generate_audio`. Safety parameters use provider defaults. Square
inputs and 4K sources are disabled. JPEG, PNG and WebP source images go
through the authenticated route with an 8 MB limit. The response must
contain a video URL from fal media storage.

| Model | Silent USD/s | Native audio USD/s |
| --- | ---: | ---: |
| Fast | 0.10 | 0.15 |
| Standard | 0.20 | 0.40 |

The server rounds the requested beat up to a supported provider clip
duration, capped at eight seconds, and reserves credits using the
existing margin formula. Native audio cost is shown separately. The rate
table is a snapshot, so verify current pricing and SaaS/commercial
entitlement before enabling the feature. No live paid request was made
during development.

Apply the durable clip migration and configure the existing server-side
`FAL_KEY`. Set `VIDEO_ADVANCED_MODELS_ENABLED=true` only after staging
approval and entitlement review. The flag defaults off. Veo uses an
owner-scoped job/shot/revision identity so retries resume the same queue
request. Explicit paid revisions require a settled prior request.
A transport failure that leaves submission or reservation ambiguous
requires operator reconciliation before changing the durable row.
Completed clips are stored privately with short-lived signed URLs.
Definitive provider failures settle through the existing refund RPC.
The asset review offers a confirmed MiniMax fallback on a failed shot.
Fallback does not discard or independently refund an uncertain Veo job.

The Separate mode requests silent clips and keeps the paid soundtrack
options. Native mode excludes separate audio generation from the
pipeline. Hybrid uses the native clip and explicitly selected separate
layers. For hybrid, the prompt asks for physical sounds and ambience
without speech or a score, but providers may return either. Watch
original clip audio in the review lightbox and use clip mute or level
controls before rendering.

- [Veo Fast API](https://fal.ai/models/fal-ai/veo3.1/fast/image-to-video/api)
- [Veo Standard API](https://fal.ai/models/fal-ai/veo3.1/image-to-video/api)
- [Veo rate snapshot source](https://fal.ai/models/fal-ai/veo3.1)
- [fal pricing API](https://fal.ai/docs/documentation/model-apis/pricing)
- [Professional export and staging checklist](PROFESSIONAL_VIDEO_RENDERING.md)
