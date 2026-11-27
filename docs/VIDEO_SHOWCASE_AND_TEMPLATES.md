# Premium video showcase and templates

## Publishing from the landing admin

1. Create a draft in **Admin → Landing → Showcase**. Import a generated video or saved project available to your account, or upload approved footage. The starter selector provides eight recipes that can be saved without footage. They remain drafts until publication requirements are met.
2. Play the actual video. Confirm picture, audio where required, duration, dimensions, and content. Upload a poster or review the captured frame.
3. Set category tags, language, description, visual style, and provenance. The Studio import label describes how media was added. Independently verify authorship and obtain permission before publishing customer footage, likenesses, attribution, or prompts. Label example prompts explicitly.
4. Configure the optional version 1 template. Preview the content and separately confirm rights and quality review. Publish when ready. Use unpublish to return a card to draft, or adjust display order and featured status.
5. Verify the public gallery in a signed-out browser and open the template through sign-in. Repeat after unpublishing and verify that the card and new playback links are unavailable.

The gallery reuses published landing records and the existing client query cache. Posters reserve space and load lazily. The gallery creates a single native player on interaction, preserves portrait framing, and stops playback when the dialog closes. Cards show actual dimensions where known. The prompt search also filters by language and categories. Structured VideoObject data and public showcase analytics events are pending. Existing landing conversion integrations remain in place.

Public templates contain an allowlisted set of editable settings. Template links survive authentication through the existing return URL. Opening one loads settings without generation. Studio shows an estimate and asks for confirmation before starting paid generation. An unavailable advanced model requires an explicit alternative or motion disabled. The public schema excludes private references and credentials. Review free text for sensitive content and obtain approval before publication.

## Storage and deployment

Apply migration `20261127180000_private_video_showcase.sql` before deploying the matching application build. Use the existing Supabase URL, auth configuration, and server-only service role key. The migration adds the metadata and asset columns and restricts direct landing table access. Existing landing media for other sections continues through the published server projection.

New uploads go to the private `showcase-private` bucket. Administrators can insert immutable objects under their own user folder. Published rows get signed poster URLs for 30 minutes and a video URL for five minutes after an explicit request. On unpublish the server stops issuing fresh links. Previously issued links, browser and CDN caches, and downloaded copies can outlive that action. Use synthetic fixtures to verify role enforcement, direct URL rejection, and signed playback in the target environment. Delete unreferenced private objects only after confirming that no records use them.

Existing legacy URLs remain accessible under the old storage policies. To retire a legacy public link, first copy the approved clip and poster into private storage through the admin workflow and verify playback. Then remove the old object after checking other published records and surfaces for references. Review legacy drafts for public objects and retire those URLs before relying on private draft handling for all historical content.

To roll back safely, export landing rows and private media first, unpublish managed clips, and retain the private bucket. Restore only the prior table grants the previous app needs before deploying that app. Its gallery can read the legacy URL fields. Avoid making the private bucket public during rollback.

## Media preparation and limitations

Use web-sized H.264/AAC MP4 copies with fast-start and appropriately sized JPEG or WebP posters. Preserve the original export separately. A local example uses `ffmpeg -i original.mp4 -c:v libx264 -crf 23 -pix_fmt yuv420p -c:a aac -movflags +faststart showcase.mp4`. The admin uploader does not transcode, enforce codec/audio presence server-side, or assign subjective scores. The private bucket caps files at 50 MiB. Caption tracks, dedicated server-render ingestion, consent-aware showcase events, and before/after performance measurements remain pending.

The showcase publication gate covers private media and human review. Social publishing enforcement tied to a durable exact-export approval is still open. See [Video Quality Assurance](VIDEO_QUALITY_ASSURANCE.md).

## Validation

- Dependency installation completed. npm flagged opt-in dependency scripts. Local media checks use system FFmpeg.
- Vitest passed 140 tests across 20 files. TypeScript and the production build passed.
- Isolated PostgreSQL 17 passed the migration checks for roles, private bucket configuration, managed publication approval, unpublish, and legacy rows.
- The local FFmpeg worker produced verified audible 3840×2160 at 24 FPS and 720×720 at 30 FPS fixtures.
- Repository-wide ESLint reported errors. Hosted Supabase and signed-in landing, checkout, and lead capture checks remain pending.
- All media validation used deterministic local fixtures. No paid generation was run.
