# Character Lip-Sync — Foundation

This folder holds the foundation for real character lip-sync and dialogue
narration. Only the mock provider is wired up in this pass; real providers
(Sync.so, D-ID, Hedra, HeyGen, Runway Act-Two) plug in behind
`LipSyncProvider` in `provider.ts` without touching callers.

## What's shipped (foundation)

- `types.ts` — `SpeechMode`, `DialogueLine`, `Emotion`, language catalog.
- `provider.ts` — `LipSyncProvider` interface, registry, `MockLipSyncProvider`.
- DB: `dialogue_lines`, `lip_sync_jobs`, `provider_status`; extended `characters`
  with `voice_id`, `language`, `gender`, `age_range`, `outfit`, `description`.
- UI: `SpeechModePicker` for the video wizard.

## What's NOT shipped yet

- Real lip-sync provider integration (user selected "Mock only for now").
- Face detection (skipped for v1 per product decision).
- Timeline merge that swaps a scene's shot for the lip-sync output.
- Server functions to enqueue `lip_sync_jobs` and poll status.
- Multi-character dialogue routing / shot-reverse-shot planner.

## Contract rules

1. Narration audio is **never** treated as lip-sync. Only lines with
   `lipSyncRequired: true` and `speechType: "dialogue"` reach the provider.
2. Mock provider output MUST be labeled "Mock Preview" in the UI and MUST
   NOT deduct production credits.
3. When no production provider is configured, the studio must **not**
   silently fall back to fake mouth animation. Show a clear message and
   allow narration-only fallback only with explicit user confirmation.
4. `LOVABLE_API_KEY` and any provider secrets stay server-side. The client
   never receives raw credentials.
5. Credits for lip-sync are deducted only when a real provider starts work.
   Retries caused by technical failure must not double-charge.
