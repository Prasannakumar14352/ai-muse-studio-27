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

## Audio status

Paid music, ambience and sound effects remain pending. This change introduces
no new endpoints, credits, environment variables or database migrations.
Existing narration and export behavior continue through the existing renderer.
Provider schemas, pricing and commercial terms still require verification
before enabling paid generation. The cloud proxy returned HTTP 403 for the
official fal.ai and ElevenLabs documentation during this task.

- [fal.ai Music model documentation](https://fal.ai/models/fal-ai/elevenlabs/music/api)
- [fal.ai Sound Effects model documentation](https://fal.ai/models/fal-ai/elevenlabs/sound-effects/api)
- [ElevenLabs Music API](https://elevenlabs.io/docs/api-reference/music/compose)
- [ElevenLabs Sound Effects API](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert)

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
retry. Live generation is pending. Music, ambience, effects, ducking and their
credit and export checks await completion of Phase 2.

## Deployment and rollback

Deploy through the existing application pipeline after build and review.
Revert the feature commit to roll back. Existing projects using legacy styles
continue to use their existing IDs. Projects created with the new IDs should
be changed to a legacy style before rerendering on a rollback build.
