# Audio generation engine

## Configuration and rollout

The Video Studio audio controls default to narration on and paid tracks off.
Apply `supabase/migrations/20261127130000_video_audio_generation.sql` before
testing paid generation. It creates the private `video-generated-audio` bucket,
the generation table and service-role admission and settlement functions.
Regenerate the Supabase types after applying the migration.

The service uses the existing server variables `FAL_KEY`, `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Keep
`VIDEO_PAID_AUDIO_ENABLED=false` in production until provider pricing,
commercial entitlement and a live staging run have been confirmed. The flag
must be the server-side string `true` to allow submissions. Existing assets can
still be retrieved when new submissions are disabled. Keep both keys off the
client and allow the server to reach `queue.fal.run`, the fal media host family
and the configured Supabase service.

## Provider contracts and estimate

The implementation follows the fal contracts independently checked and supplied
with the feature request on November 27, 2026. The cloud proxy denied direct
access to the documentation. Mocked REST queue tests verify the implemented
contracts locally. Live compatibility, current pricing and model-specific
commercial and end-user SaaS rights still require verification.

| Layer | Model | Request | Supplied pricing snapshot |
| --- | --- | --- | --- |
| Music | `elevenlabs/music/v2.5` | Prompt, 3,000–600,000 ms, instrumental, MP3 48 kHz 192 kbps | USD 0.60 per started output minute |
| SFX | `elevenlabs/sound-effects/v3` | Text, 0.5–30 s, influence 0.5, MP3 44.1 kHz 128 kbps | USD 0.002 per second |
| Ambience | `elevenlabs/sound-effects/v3` | Same effect schema with looping enabled | USD 0.002 per second |

Both requests enable the provider safety checker. Music uses prompt-based
original instrumental generation. The UI reports an upper estimate before
generation. The server computes the charge from the requested output duration
and the existing margin formula. Thirty and sixty seconds of music each reserve
112 credits. Ninety seconds reserves 223 credits. The default 3-second effect
reserves 2 credits. A default 15-second ambience loop reserves 6 credits.
The queue result contract supplies an audio URL. Confirm whether live invoices
can differ from the requested duration before rollout. There is no automatic
post-settlement repricing based on provider invoices.

- [Music API](https://fal.ai/models/elevenlabs/music/v2.5/api)
- [Music pricing](https://fal.ai/models/elevenlabs/music/v2.5)
- [Sound Effects API](https://fal.ai/models/elevenlabs/sound-effects/v3/api)
- [Sound Effects pricing](https://fal.ai/models/elevenlabs/sound-effects/v3)
- [Pricing API](https://fal.ai/docs/documentation/model-apis/pricing)
- [fal terms](https://fal.ai/legal/terms-of-service)

## Generation and recovery

`POST /api/generate-audio` accepts a signed-in user's job UUID, track kind,
slot, revision, prompt and duration. Poll the same route with the returned
`assetId`. Browser-local video jobs are namespaced under the authenticated user
on the server. Status, signed URLs and settlement are scoped to the owning
user. Signed URLs expire after 15 minutes and can be refreshed with a status
request. Provider credentials and storage paths stay server-side.

Admission locks the user's row namespace and checks the unique
user/job/track/slot/revision key before reserving credits. The same request
reuses its record. Initial generation permits up to one music track, four
effects and three ambience assets per job. Admission caps live requests and
the rate of new submissions per user. A confirmed regeneration can use up to
two additional revisions per slot. Pending submissions reuse their existing
provider request ID. The database calls the existing credit ledger to settle
a stored success or refund a definitive provider failure.

A timeout or an uncertain credit reservation leaves the request in
`uncertain`. Operators must reconcile the provider request and credit ledger
before releasing it or marking it failed. Use the row ID to look up the
`video-audio:<row-id>` ledger idempotency key if a failure interrupted the
reservation write. Never resubmit blindly. Temporary asset download, storage
and status failures can be polled again. Review blocks a requested track that
has no ready asset and offers status refresh, retry, regeneration and mute.
Some edits that change an already-submitted prompt can exhaust available slots.
The current UI surfaces that state and allows the track to be muted or a new
job to be created.

Provider downloads use a HTTPS host allowlist, no redirect, MIME and size
checks and MPEG Layer III frame validation. The browser decodes the actual MP3
before mixing. Server MP3 validation checks structure and cannot establish
audibility or decode every frame's payload.

## Timeline and rendering

Effects use stable blueprint scene IDs and relative offsets. The planner
chooses action-specific sounds or uses explicit cues from the existing SFX
editor. Similar scenes reuse an ambience asset. The renderer maps a scene's
audio to its final beat durations, loops or trims the score, blends ambience
boundaries, and applies track gains and narration-driven ducking. A Web Audio
compressor provides peak protection before the audio joins the canvas stream
in MediaRecorder. Both clean narration and narration-disabled mixes use the
same renderer and existing MP4 export. Combined preview uses the same
scheduler offline and is limited to five minutes.

## Tests and acceptance

Run `npm ci`, `npm test`, `npm run typecheck`, `npm run lint` and
`npm run build`. Exercise settlement and permissions on a migrated local
Supabase database with
`psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/video_audio_generation.sql`. Run `npm run dev -- --host 127.0.0.1 --port 5191` and
`python tests/e2e/video-audio-mix.py` for local Chromium export checks.
The smoke test requires Python Playwright, Chromium, FFmpeg and FFprobe. It
uses deterministic tones, validates ducking in Web Audio and verifies audible
AAC after converting music-only and SFX-only exports.

Live paid acceptance is pending. In staging, create the 30-second 16:9
**Hanuman — The Awakening of Divine Power** project. Choose Indian Mythology,
Full Motion at Premium quality, character consistency, deep male English
narration, Divine orchestral music, effects and ambience. Approve the estimate,
inspect the credit ledger once per requested asset and preview the combined mix.

- 0–6 s: ocean waves, coastal wind and a gentle musical opening.
- 6–12 s: divine energy and rising strings.
- 12–18 s: impact on the leap.
- 18–24 s: wind rush over the ocean.
- 24–30 s: orchestral resolution and a controlled fade.

Reorder and remove a scene, verify offsets without a second charge for reused
assets, and export the MP4. Check duration, character continuity, intelligible
narration and audible layers. Repeat with Telugu narration and a separate
music-only video. Exercise an insufficient-credit request and a provider
failure, confirm the ledger and ensure render stays blocked until retry or
explicit mute. Confirm commercial entitlement with the provider before enabling
paid generation.

To roll back, disable `VIDEO_PAID_AUDIO_ENABLED` first, reconcile pending
reservations, and deploy the prior application build. Retain job rows and
private storage for settlement and account retention. Remove them only after
that data is accounted for.

Asset review can also mix audio already present in video clips. The
[advanced model and clip audio guide](ADVANCED_VIDEO_MODELS.md) covers the
fifth audio layer, source selection and local export verification.

For configurable browser exports and the separate cut-based worker, see [professional video rendering](PROFESSIONAL_VIDEO_RENDERING.md).

See [Video quality assurance](VIDEO_QUALITY_ASSURANCE.md) for sampled narration checks, selective repair, and server audio validation.
