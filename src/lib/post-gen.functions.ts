/**
 * Post-Generation Studio server functions.
 *
 * Owns CRUD for the four new tables that split "raw visual master" from
 * "final composited exports":
 *   - raw_video_outputs        (reusable visuals-only master)
 *   - narration_versions       (per-voice narration attempts)
 *   - subtitle_versions        (per-style subtitle presets + cues)
 *   - final_video_exports      (concrete combination = one downloadable version)
 *
 * All fns are scoped to the signed-in owner via RLS. No credit charges happen
 * here — the actual TTS / composite render fns (created in a follow-up) will
 * hit `reserve_credits` on their own.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ---------- Shared types (row-shaped, JSON-safe) ---------------------------

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export type RawVideoOutput = {
  id: string;
  user_id: string;
  project_id: string | null;
  blueprint_id: string | null;
  video_url: string;
  format: string;
  duration_sec: number;
  width: number;
  height: number;
  status: string;
  version: number;
  scene_manifest: Json;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type NarrationVersion = {
  id: string;
  user_id: string;
  raw_video_id: string;
  label: string | null;
  voice_id: string;
  provider: string;
  language: string | null;
  style: string | null;
  speed: number;
  pitch: number;
  volume: number;
  script: Json;
  audio_url: string | null;
  duration_sec: number | null;
  status: string;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type SubtitleVersion = {
  id: string;
  user_id: string;
  raw_video_id: string;
  label: string | null;
  style_preset: string;
  style: Json;
  cues: Json;
  created_at: string;
  updated_at: string;
};

export type FinalVideoExport = {
  id: string;
  user_id: string;
  raw_video_id: string;
  narration_version_id: string | null;
  subtitle_version_id: string | null;
  name: string;
  music: Json;
  branding: Json;
  audio_mix: Json;
  resolution: string | null;
  format: string;
  video_url: string | null;
  duration_sec: number | null;
  status: string;
  error: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

// ---------- raw_video_outputs ----------------------------------------------

const createRawSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  blueprintId: z.string().max(200).nullable().optional(),
  videoUrl: z.string().url(),
  format: z.string().max(16).default("webm"),
  durationSec: z.number().min(0),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sceneManifest: z.any().optional(),
  metadata: z.any().optional(),
});

export const createRawVideoOutputFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => createRawSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("raw_video_outputs")
      .insert({
        user_id: context.userId,
        project_id: data.projectId ?? null,
        blueprint_id: data.blueprintId ?? null,
        video_url: data.videoUrl,
        format: data.format,
        duration_sec: data.durationSec,
        width: data.width,
        height: data.height,
        scene_manifest: (data.sceneManifest ?? []) as never,
        metadata: (data.metadata ?? {}) as never,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as RawVideoOutput;
  });

export const getRawVideoOutputFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("raw_video_outputs").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    return (row as unknown as RawVideoOutput | null);
  });

export const listRawVideoOutputsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({
      projectId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(100).default(20),
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("raw_video_outputs")
      .select("*").order("created_at", { ascending: false }).limit(data.limit);
    if (data.projectId) q = q.eq("project_id", data.projectId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as RawVideoOutput[];
  });

// ---------- narration_versions ---------------------------------------------

const upsertNarrationSchema = z.object({
  id: z.string().uuid().optional(),
  rawVideoId: z.string().uuid(),
  label: z.string().max(120).nullable().optional(),
  voiceId: z.string().min(1).max(120),
  provider: z.string().max(64).default("lovable-tts"),
  language: z.string().max(32).nullable().optional(),
  style: z.string().max(64).nullable().optional(),
  speed: z.number().min(0.5).max(2).default(1),
  pitch: z.number().min(0.5).max(2).default(1),
  volume: z.number().min(0).max(1).default(1),
  script: z.any().optional(),
  audioUrl: z.string().url().nullable().optional(),
  durationSec: z.number().min(0).nullable().optional(),
  status: z.enum(["pending", "processing", "ready", "failed"]).default("pending"),
  error: z.string().max(400).nullable().optional(),
});

export const upsertNarrationVersionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => upsertNarrationSchema.parse(v))
  .handler(async ({ data, context }) => {
    const payload = {
      user_id: context.userId,
      raw_video_id: data.rawVideoId,
      label: data.label ?? null,
      voice_id: data.voiceId,
      provider: data.provider,
      language: data.language ?? null,
      style: data.style ?? null,
      speed: data.speed,
      pitch: data.pitch,
      volume: data.volume,
      script: (data.script ?? []) as never,
      audio_url: data.audioUrl ?? null,
      duration_sec: data.durationSec ?? null,
      status: data.status,
      error: data.error ?? null,
    };
    const client = context.supabase;
    if (data.id) {
      // Post-generation edits (voice tweak, re-preview) are free.
      const { data: row, error } = await client
        .from("narration_versions").update(payload).eq("id", data.id).select("*").single();
      if (error) throw new Error(error.message);
      return row as unknown as NarrationVersion;
    }
    // Charge 1 credit only when a NEW narration version with an audio_url is
    // being created (a real TTS render). Drafts without audio are free.
    const shouldCharge = !!data.audioUrl && data.status === "ready";
    const insert = async () => {
      const { data: row, error } = await client
        .from("narration_versions").insert(payload).select("*").single();
      if (error) throw new Error(error.message);
      return row as unknown as NarrationVersion;
    };
    if (!shouldCharge) return insert();
    const { withCharge } = await import("@/lib/credits-guard.server");
    return withCharge(
      { userId: context.userId, action: "narration", description: "Narration generated" },
      insert,
    );
  });

export const listNarrationVersionsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ rawVideoId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("narration_versions").select("*")
      .eq("raw_video_id", data.rawVideoId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as NarrationVersion[];
  });

export const deleteNarrationVersionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("narration_versions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- subtitle_versions ----------------------------------------------

const upsertSubtitleSchema = z.object({
  id: z.string().uuid().optional(),
  rawVideoId: z.string().uuid(),
  label: z.string().max(120).nullable().optional(),
  stylePreset: z.string().max(64).default("clean-minimal"),
  style: z.any().optional(),
  cues: z.any().optional(),
});

export const upsertSubtitleVersionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => upsertSubtitleSchema.parse(v))
  .handler(async ({ data, context }) => {
    const payload = {
      user_id: context.userId,
      raw_video_id: data.rawVideoId,
      label: data.label ?? null,
      style_preset: data.stylePreset,
      style: (data.style ?? {}) as never,
      cues: (data.cues ?? []) as never,
    };
    const client = context.supabase;
    if (data.id) {
      const { data: row, error } = await client
        .from("subtitle_versions").update(payload).eq("id", data.id).select("*").single();
      if (error) throw new Error(error.message);
      return row as unknown as SubtitleVersion;
    }
    const { data: row, error } = await client
      .from("subtitle_versions").insert(payload).select("*").single();
    if (error) throw new Error(error.message);
    return row as unknown as SubtitleVersion;
  });

export const listSubtitleVersionsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ rawVideoId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("subtitle_versions").select("*")
      .eq("raw_video_id", data.rawVideoId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as SubtitleVersion[];
  });

// ---------- final_video_exports --------------------------------------------

const upsertFinalExportSchema = z.object({
  id: z.string().uuid().optional(),
  rawVideoId: z.string().uuid(),
  narrationVersionId: z.string().uuid().nullable().optional(),
  subtitleVersionId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(120).default("Export"),
  music: z.any().nullable().optional(),
  branding: z.any().nullable().optional(),
  audioMix: z.any().optional(),
  resolution: z.string().max(32).nullable().optional(),
  format: z.string().max(16).default("webm"),
  videoUrl: z.string().url().nullable().optional(),
  durationSec: z.number().min(0).nullable().optional(),
  status: z.enum(["draft", "processing", "ready", "failed"]).default("draft"),
  error: z.string().max(400).nullable().optional(),
  metadata: z.any().optional(),
});

export const upsertFinalVideoExportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => upsertFinalExportSchema.parse(v))
  .handler(async ({ data, context }) => {
    const payload = {
      user_id: context.userId,
      raw_video_id: data.rawVideoId,
      narration_version_id: data.narrationVersionId ?? null,
      subtitle_version_id: data.subtitleVersionId ?? null,
      name: data.name,
      music: (data.music ?? null) as never,
      branding: (data.branding ?? null) as never,
      audio_mix: (data.audioMix ?? {}) as never,
      resolution: data.resolution ?? null,
      format: data.format,
      video_url: data.videoUrl ?? null,
      duration_sec: data.durationSec ?? null,
      status: data.status,
      error: data.error ?? null,
      metadata: (data.metadata ?? {}) as never,
    };
    const client = context.supabase;
    if (data.id) {
      const { data: row, error } = await client
        .from("final_video_exports").update(payload).eq("id", data.id).select("*").single();
      if (error) throw new Error(error.message);
      return row as unknown as FinalVideoExport;
    }
    const { data: row, error } = await client
      .from("final_video_exports").insert(payload).select("*").single();
    if (error) throw new Error(error.message);
    return row as unknown as FinalVideoExport;
  });

export const listFinalVideoExportsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ rawVideoId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("final_video_exports").select("*")
      .eq("raw_video_id", data.rawVideoId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as FinalVideoExport[];
  });

export const deleteFinalVideoExportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("final_video_exports").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
