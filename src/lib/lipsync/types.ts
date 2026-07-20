// Character lip-sync + dialogue narration — shared types.
// Foundation only. Real provider work is gated behind the abstraction in
// ./provider.ts; the wizard talks to these types, not to Supabase columns.

export type SpeechMode =
  | "narration_only"
  | "single_character"
  | "multi_character"
  | "narration_plus_character"
  | "no_voice";

export const SPEECH_MODES: ReadonlyArray<{
  id: SpeechMode;
  label: string;
  description: string;
  recommendedFor: string;
}> = [
  {
    id: "narration_only",
    label: "Narration only",
    description: "Voiceover plays over B-roll / generated scenes. No visible character speaks.",
    recommendedFor: "Educational, documentary, explainer, faceless.",
  },
  {
    id: "single_character",
    label: "Single talking character",
    description: "One on-screen character speaks with synced mouth movement.",
    recommendedFor: "Talking-avatar, talking-photo, spokesperson.",
  },
  {
    id: "multi_character",
    label: "Multi-character dialogue",
    description: "Two or more characters exchange dialogue with shot-reverse-shot.",
    recommendedFor: "Story scenes, interviews, devotional conversations.",
  },
  {
    id: "narration_plus_character",
    label: "Narration + character",
    description: "A narrator frames the video while an on-screen character delivers key lines.",
    recommendedFor: "Case studies, storytelling explainers.",
  },
  {
    id: "no_voice",
    label: "No voice",
    description: "Silent video. Music / SFX / captions carry the message.",
    recommendedFor: "Trailer cuts, ambient, purely visual.",
  },
];

export type SpeechType = "narration" | "dialogue" | "thought" | "vo";

export type Emotion =
  | "neutral" | "happy" | "excited" | "sad" | "concerned" | "angry"
  | "surprised" | "confident" | "calm" | "friendly" | "devotional" | "serious";

export const EMOTIONS: Emotion[] = [
  "neutral", "happy", "excited", "sad", "concerned", "angry",
  "surprised", "confident", "calm", "friendly", "devotional", "serious",
];

export const LIPSYNC_LANGUAGES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "en", label: "English" },
  { id: "hi", label: "Hindi" },
  { id: "te", label: "Telugu" },
  { id: "ta", label: "Tamil" },
  { id: "kn", label: "Kannada" },
  { id: "ml", label: "Malayalam" },
  { id: "mr", label: "Marathi" },
  { id: "bn", label: "Bengali" },
];

export type DialogueLine = {
  id: string;
  sceneId: string;
  speakerId: string;          // "narrator" or character uuid
  speakerName: string;
  speechType: SpeechType;
  text: string;
  emotion: Emotion;
  voiceId: string;
  language: string;
  startTime: number;
  endTime: number;
  lipSyncRequired: boolean;
  characterReferenceId?: string | null;
  audioUrl?: string | null;
  status?:
    | "pending" | "voice_ready"
    | "lip_sync_processing" | "lip_sync_complete" | "failed";
};

export type SceneSpeakerAssignment = {
  sceneId: string;
  activeSpeakerId: string | null;
  visibleCharacterIds: string[];
};

/** Public status label used by the wizard. */
export type LipSyncStatusLabel =
  | "voice_pending"
  | "voice_generated"
  | "face_detected"
  | "lip_sync_processing"
  | "lip_sync_complete"
  | "lip_sync_failed"
  | "manual_selection_required";
