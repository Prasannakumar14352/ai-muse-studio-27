# Cinematic video engine

## Visual direction

Video Studio offers Indian Mythology, Epic Fantasy and Photorealistic Cinema
alongside its existing presets. Their camera, lighting, palette, continuity and
sound direction are defined in `src/lib/visual-director.ts`. The style cards
reuse bundled assets.

Advanced Visual Instructions accepts up to 1,000 characters. Video Studio
carries the field in the generation brief and saves it in the blueprint.
Both script planning paths pass the field as visual guidance. The shot
planner and character reference prompts use the same guidance. Script-to-Video
continues to take narration from the submitted script lines.

The Visual Director uses scene action to select aerial, tracking, low-angle
and other framings for the new presets. Explicit scene descriptions take
precedence over fallback environments. The reference workflow can describe
non-human anatomy, fur and ornaments. For shots that need a reference and
explicitly request consistency, a missing reference or failed reference image
operation marks the shot failed so it can be retried.

## Audio generation

Generated music, ambience and effects are opt-in. See the
[Audio Generation Engine](AUDIO_GENERATION_ENGINE.md) for the provider
contracts, pricing, deployment gate, preview and export workflow.
Live provider acceptance remains pending.

## Validation

Run `npm ci`, `npm test`, `npm run typecheck`, `npm run lint` and
`npm run build` from the repository root. The new director tests generate
prompts locally and consume no provider credits.

For live verification, use a test account with existing image, motion and
narration provider configuration. Create a 30-second, 16:9 video titled
“Hanuman — The Awakening of Divine Power” using Indian Mythology, Full Motion,
Premium quality and character consistency. Request a mountain overlooking the
ocean at sunrise, remembrance of Lord Rama, the leap, flight above ocean waves
and Golden Lanka on the horizon. Use a deep male English voice. Confirm that the
reference and generated frames retain Hanuman’s appearance, the scenery follows
the brief, the flight and leap have distinct framing, and an MP4 can be
downloaded. Repeat with a Telugu script and compare the narration against the
creator’s lines. With a test provider failure, verify the reference warning and
retry. Live generation is pending. Use the audio engine acceptance checklist to verify paid tracks and credit settlement in staging.

## Deployment and rollback

Deploy through the existing application pipeline after build and review.
Revert the feature commit to roll back. Existing projects using legacy styles
continue to use their existing IDs. Projects created with the new IDs should
be changed to a legacy style before rerendering on a rollback build.

See the [advanced model and clip audio guide](ADVANCED_VIDEO_MODELS.md) for Veo
availability and the Full Motion review acknowledgement.

For export settings and the worker staging checklist, see [professional video rendering](PROFESSIONAL_VIDEO_RENDERING.md).
