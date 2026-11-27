# Video quality review and Studio rendering

## Quality evidence

Studio Asset Review lists deterministic findings with a stage, severity,
asset, evidence, repair, and whether the finding blocks export. It identifies
missing previews and failed assets, exact repeated narration, script scenes
with no visual description, absence of Telugu characters in Telugu narration,
a narration-duration overrun, missing enabled narration or soundtrack assets,
and Full Motion stills. Script structure, uncertain historical or mythological
claims and character identity remain human checks. No AI quality assessment or
numeric score is synthesized.

Run **Inspect source dimensions and image samples** to probe up to 40 local
previews. The inspector reads actual picture dimensions, video duration,
sampled image luminance, and repeated 16×16 pixel samples. A short edge below
720 pixels or luminance range below 5/255 is advisory. Intentional repetition,
darkness and stillness can be valid. An unreadable picture blocks export
until repaired or successfully re-inspected. Narration QA shows sampled
peak amplitude and flags values below −65 dBFS or a meaningful share of
full-scale samples. It does not assess speech intelligibility.

Configured browser exports must decode picture dimensions and stay within a
duration tolerance of the greater of 0.5 seconds, three frames, or 2% of
planned runtime. MP4 encoding retains the existing FFprobe verification of
format, frame rate and audio stream. The worker also reports dark intervals
and frozen-frame candidates and rejects a requested audio mix that is
silent. The worker diagnostics use 0.5-second dark runs and 1.5-second
static runs. They are advisory because fades and still images are deliberate
in many cuts.

## Approval and selective repair

Review acknowledgements are saved in the local Studio job with a timestamp,
reason and accepted warning IDs. Changed assets invalidate the approval for
the open review. Critical asset failures block browser and server export in
Studio. The server checks ownership and validates the immutable manifest
independently. Final playback review is explicit in the result screen.
The existing publishing UI still has no connected publishing action there.
Cross-endpoint publishing policy enforcement remains pending.

Shot regeneration preserves a previous local copy. Restore swaps the
current and previous shot without provider work. A failed replacement
preserves a previously usable shot. Studio confirms estimated generation
costs and shows the available balance when present. Same-revision Veo
recovery reuses the durable request. A requested new revision and the
existing MiniMax fallback require separate confirmation. Narration can be
regenerated per scene using the existing voice and text. Audio review
preserves existing status refresh and credit-confirmed soundtrack
regeneration. Permanent narration and soundtrack version history,
reference-only regeneration and image/motion separation remain pending.
Admin Readiness includes a read-only snapshot for recent audio and Veo
records, provider request IDs, storage state and ledger settlement.
Operators still reconcile ambiguous submissions through the existing approved workflow. The existing credit ledger is
still authoritative and server rendering adds no AI generation charge.

## Server render deployment

Apply the Phase 2–4 migrations, then
`20261127170000_render_worker_presence.sql`. Deploy the updated worker with
the existing Supabase service-role environment bindings. The worker reports
presence; Studio exposes submission only while the availability endpoint
sees a recent heartbeat. The Phase 4 server/4K flags remain required.
Manifest v2 carries Studio scene IDs, structured still-image movement,
optional flash entrances, on-screen text and narration speed. Older workers
can only claim v1 jobs. Noto fonts are installed in the worker image,
including Telugu. Text enters filters through a file with expansion disabled.

Studio prepares the manifest from approved local shots, original narration
and authorized soundtrack assets. The same timing planner provides browser
and server beat timing; cumulative frame rounding prevents drift. Studio
uploads originals under its owner-scoped private namespace. It requires
explicit acknowledgement of compatibility limits before submission.
Unsupported transitions, dynamic subtitles and unsupported camera effects
require browser render. Server availability, job ID, progress, cancel, retry
and signed download are visible in Studio. The last job can be monitored from
the landing page after reload. Hosted operation remains to be verified.
Unreferenced immutable uploads require an operator retention policy.

## Tests and staging

Run `npm test`, `npm run typecheck`, `npm run build`, `npm run lint`, and
`PYTHONDONTWRITEBYTECODE=1 python tests/e2e/professional-render-worker.py`.
With Vite on port 5191 run `python tests/e2e/video-audio-mix.py`.
Run `supabase/tests/render_worker_presence.sql` against a migrated local
database. Automated tests use media fixtures and mocked providers.

In staging, use the 30-second Hanuman project with Veo Fast 1080p sources,
Indian Mythology, Full Motion, hybrid audio, deep male narration and a 1080p
24 FPS MP4. Confirm picture, motion, narration and audio findings, replace
one failed shot, restore its prior version if appropriate, then verify
other shots are unchanged. Repeat with Telugu narration and inspect Telugu
scene text. Export the same session at another resolution, check the
ledger, and verify worker job recovery after closing the tab. Live paid
requests require separate approval.

Roll back by disabling server submission, draining active jobs, and
deploying the previous app and worker. Keep the new worker until all v2
jobs are completed or cancelled. Preserve both input and output storage
for jobs that may still be inspected, downloaded or retried.
