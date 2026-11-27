# Phase 7 production readiness

## Issue register

| Priority | Evidence | Status |
| --- | --- | --- |
| P0 | Publish-now previously called the service-role worker after a user-scoped update matched zero rows | Worker lookup now scopes user-triggered dispatch to the authenticated owner |
| P0 | The worker parsed caller-supplied storage paths and could sign them with the service role. It also fetched arbitrary media URLs | The worker signs only owned renders on the configured Supabase origin or immutable approved video objects. Browser image publishing stages its media before queuing |
| P0 | The Studio approval checkbox was local state. Scheduled jobs could send other video URLs | Added private exact-export approval and enforced it in the shared worker. Protected approval bindings and provider state in the database |
| P0 | Razorpay failure processing could race a captured payment. Logs retained request headers and full payload | Failed updates now match pending payments only, a verified success can supersede a prior failure, and the webhook keeps event metadata |
| P0 | Plan and auto-debit fulfillment can change payment status before activating entitlement | Open launch blocker for subscriptions. One-time credit packs now claim the captured payment and increment the wallet atomically. Reconcile historical payments before enabling remediation |
| P1 | Legacy video jobs have no approved snapshot. Some images are remote or mutable | Legacy video jobs fail closed. Restage remote images through the publishing dialog. Validate third-party image CORS in staging |
| P1 | Publish claim identification had a race for resumable Instagram containers | The worker now compares the timestamp of the row it read when claiming it. Provider-side success followed by a lost response still needs reconciliation |
| P1 | Full Supabase installation and upgrade, concurrent credit reservations, real worker recovery, and OAuth/payment staging coverage are required | Open. Local regression tests provide narrower evidence |
| P1 | Dependency audit reports high-severity advisories, including build tooling and direct runtime dependencies | Review deploy reachability and compatible updates before release. No forced upgrade applied |
| P2 | Server rendering has explicit cinematic compatibility gaps and showcase metadata lacks published video SEO | Preserve warnings and retain the browser rendering option |
| P3 | Durable narration and soundtrack version browsing and consent-aware showcase analytics | Deferred |

## Exact-export approval

Watch the result in Video Studio and confirm review. The client stages the export in its private account folder and sends its SHA-256 digest. The server checks ownership, bounds the file to 50 MiB, probes dimensions, duration, container, and streams with FFprobe, compares the digest, and copies the verified bytes into the private service-owned bucket. The approval UUID is the immutable asset version. A missing audio stream requires acknowledgement. An audio stream does not demonstrate audibility or quality. FFprobe is a structural check. Human review remains required.

The shared dispatch worker checks owner, optional project, and revocation. An Instagram container is checked again before final publication. Queued posts keep their approval ID and cannot replace the approved bytes. Relevant persisted project edits revoke project-bound approvals. Browser-only Studio results use standalone export snapshots. Re-rendering requires a new approval for the replacement. Existing standalone scheduled posts retain their original authorized snapshot until manually revoked or cancelled. An external request already accepted by a social network can complete after revocation.

Approved media is signed only for dispatch. Legacy videos in queued jobs must be re-approved and queued through the supported Studio workflow. Older video entry points outside this workflow require separate approval integration. Files exceeding the limit can still be downloaded for manual publication. A staging retention job and a persistent UI for retrieving prior standalone approvals remain open.

## Staging and migration

1. Back up the staging database and storage metadata. Restore a sanitized existing snapshot and separately create a clean local Supabase project.
2. Apply the current migration chain locally. Review the audio, Veo, professional rendering, worker heartbeat, and private showcase migrations from November 27 and the new `20261128120000_video_publish_approvals.sql` and `20261128121000_atomic_credit_pack_fulfillment.sql`. Run SQL checks using authenticated, anonymous and service accounts.
3. Deploy the matching build to staging with working FFprobe. Create two fixture accounts and verify ownership, revocation, retry, reschedule, worker revalidation, and binds to the original export. Use mocked adapters.
4. Move legacy public showcase assets by copying them into private storage, checking all references, and verifying replacement playback before removing any old public object. Existing downloaded and cached copies can remain accessible.
5. Keep new paid capabilities disabled until authorized acceptance runs and account-specific commercial terms and pricing are verified.

For recovery, stop the scheduler and direct publishing before rolling back application code. Leave approval records and assets intact for audit and resume with a forward fix. Older workers bypass the new gate, so keep them disabled while an older app is deployed. This work applied no production migrations.

## Configuration

| Variables | Classification |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, corresponding `VITE_SUPABASE_*` browser values | Required public configuration |
| `SUPABASE_SERVICE_ROLE_KEY` | Required server-only secret |
| `FAL_KEY` | Optional server-only provider secret |
| `VIDEO_PAID_AUDIO_ENABLED`, `VIDEO_ADVANCED_MODELS_ENABLED`, `VIDEO_SERVER_RENDER_ENABLED`, `VIDEO_4K_EXPORT_ENABLED` | Server feature flags |
| `FFMPEG_PATH`, `FFPROBE_PATH` | Optional server executable overrides. FFprobe must work for approval |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_ENV` | Server payment settings or Admin Payment Settings. Use test credentials for staging |
| `PUBLISH_CRON_SECRET` | Optional server-only scheduler secret when using the environment-based hook credential |
| Social OAuth client credentials, app access grants and encryption configuration | Required for external publishing, managed separately from browser environment |

Admin Readiness reports configuration separately from actual executable and schema checks. The existing video reconciliation view reports linked ledger records without mutating balances.

## Provider and acceptance checklist

Pricing, rate limits, commercial usage and availability must be verified against the actual account for each provider. Integration docs describe the repository contracts. No live provider response, paid test, real social post or payment was executed here. Consult [fal model catalog](https://fal.ai/models), [OpenRouter API](https://openrouter.ai/docs/api/reference/overview), and [ElevenLabs API](https://elevenlabs.io/docs/api-reference/introduction). Check MiniMax H3 Turbo, Kling 2.5 Turbo Pro, Veo 3.1 Fast and Standard, and ElevenLabs TTS, Music and Sound Effects model contracts separately before enabling corresponding flags. Record max duration, dimensions, supported inputs, retry semantics and estimated charge for the chosen model and approved test account.

| Acceptance project | Pre-release check |
| --- | --- |
| Hanuman — The Awakening of Divine Power | 30 s mythology, 16:9, Veo Fast when enabled, hybrid audio, 1080p 24 FPS MP4 |
| The Little Village Hero | 45 s Telugu 3D, 9:16, native speaker checks for script and narration, music and effects, 1080p 30 FPS |
| Premium Laptop Bag Commercial | 20 s portrait, original product reference, appearance review, 1080p |
| India in 2100 | 60 s landscape documentary with speculative scenes explicitly identified |
| Native audio | Audible original scene audio with external tracks disabled |
| Music only | Audible soundtrack without narration |
| Selective repair | Replace only failed shot and preserve existing paid assets |
| Professional rendering | Export existing assets at 720p, 1080p and all 4K aspect ratios, verify codecs and dimensions |
| Publishing | Approved bytes only, wrong owner and stale or revoked export mix rejected, mock every dispatch |
| Customer journey | Sign-up, verified test payment, entitlement, generation, export and atomic remaining balance |

Run these in staging with deterministic media, mock providers, and test-only payment credentials before executing a separately approved live run. See [Video quality assurance](VIDEO_QUALITY_ASSURANCE.md) and [Showcase and templates](VIDEO_SHOWCASE_AND_TEMPLATES.md).
