import { AudioSettingsPanel } from "@/components/video-studio/AudioSettingsPanel";
// Structured Video Blueprint Editor.
// Renders the current blueprint from projects.metadata, autosaves edits,
// and exposes render actions with credit estimates + pre-render validation.

import { confirmDialog } from "@/components/confirm-dialog";
import { VOICE_CATALOG } from "@/lib/voice-catalog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { creditsLabel } from "@/lib/credits-label";
import { useServerFn } from "@tanstack/react-start";
import { shortenVoiceoverLines } from "@/lib/video-ai.functions";
import { maxWordsForScene } from "@/lib/video-duration";
import { detectTopicLanguage } from "@/lib/content-language";
import { toast } from "sonner";
import {
  AlertTriangle, Loader2, Check, Clock, Copy, Plus, RotateCcw, Save, Scissors,
  Trash2, ArrowUp, ArrowDown, Wand2, Undo2, Film, Mic2, Sparkles, Info,
  FileText, LayoutGrid, Type, Music2, Volume2, Users, History, Camera,
} from "lucide-react";
import { VideoBriefParserPanel } from "@/components/video-brief-parser-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  duplicateScene, emptyScene, estimateCredits, mergeScenes, reindexScenes,
  splitScene, totalDuration, validateBlueprint,
  type BlueprintScene, type CameraMovement, type Character, type MusicTrack,
  type RenderAction, type ShotReference, type SubtitleStyle,
  type TransitionStyle, type VideoBlueprint, type VideoBlueprintMetadata,
} from "@/lib/video-blueprint";
import {
  restoreBlueprintVersion, restoreOriginalBlueprint, saveBlueprintEdit,
} from "@/lib/video-blueprint-store";
import { TimelineEditor } from "@/components/video-studio/TimelineEditor";
import { ScriptEditor } from "@/components/video-studio/ScriptEditor";
import { SubtitleEditor } from "@/components/video-studio/SubtitleEditor";
import { MusicPicker } from "@/components/video-studio/MusicPicker";
import { SfxEditor } from "@/components/video-studio/SfxEditor";
import { CharacterLibrary } from "@/components/video-studio/CharacterLibrary";
import { VersionHistoryPanel } from "@/components/video-studio/VersionHistoryPanel";
import { ShotReplacementDialog } from "@/components/video-studio/ShotReplacementDialog";


const AUTOSAVE_MS = 900;

const CAMERA_OPTS: CameraMovement[] = [
  "static", "zoomIn", "zoomOut", "pushIn", "pullOut",
  "panLeft", "panRight", "tiltUp", "tiltDown", "orbit", "handheld",
];
const TRANSITION_OPTS: TransitionStyle[] = [
  "cut", "fade", "dissolve", "slide", "zoom", "wipe", "glitch", "morph",
];

export type RenderActionHandler = (
  action: RenderAction,
  ctx: { blueprint: VideoBlueprint; sceneId?: string },
) => void | Promise<void>;

export type VideoBlueprintEditorProps = {
  projectId: string;
  initialMetadata: VideoBlueprintMetadata;
  onMetadataChange?: (meta: VideoBlueprintMetadata) => void;
  onRender?: RenderActionHandler;
  onRegenerateScene?: (sceneId: string, blueprint: VideoBlueprint) => void | Promise<void>;
  onCancel?: () => void;
  /** Called with the number of scenes whose narration is longer than the scene (blocks approval). */
  onTimingIssuesChange?: (count: number) => void;
};

export function VideoBlueprintEditor({
  projectId, initialMetadata, onMetadataChange, onRender, onRegenerateScene, onCancel, onTimingIssuesChange,
}: VideoBlueprintEditorProps) {
  const [meta, setMeta] = useState<VideoBlueprintMetadata>(initialMetadata);
  const [bp, setBp] = useState<VideoBlueprint>(initialMetadata.currentBlueprint);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(initialMetadata.blueprintUpdatedAt);
  const [expandedScene, setExpandedScene] = useState<string | null>(bp.scenes[0]?.id ?? null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showParser, setShowParser] = useState(false);

  const issues = useMemo(() => validateBlueprint(bp), [bp]);
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const total = useMemo(() => totalDuration(bp), [bp]);
  // Narration longer than its scene overlaps the next one — these must be fixed before generating.
  const timingIssues = useMemo(() => issues.filter((i) => i.code === "vo_length"), [issues]);
  useEffect(() => { onTimingIssuesChange?.(timingIssues.length); }, [timingIssues.length, onTimingIssuesChange]);
  const shortenFn = useServerFn(shortenVoiceoverLines);
  const [shortening, setShortening] = useState(false);

  // ----- Autosave -----
  const commit = useCallback(async (next: VideoBlueprint) => {
    setSaving(true);
    try {
      const updated = await saveBlueprintEdit(projectId, next, "user_edit");
      setMeta(updated);
      setLastSavedAt(updated.blueprintUpdatedAt);
      setDirty(false);
      onMetadataChange?.(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast.error(`Autosave failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  }, [projectId, onMetadataChange]);

  const scheduleAutosave = useCallback((next: VideoBlueprint) => {
    setBp(next);
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void commit(next); }, AUTOSAVE_MS);
  }, [commit]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  // Warn on browser close if unsaved.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // ----- Global patch helper -----
  const patchGlobal = (patch: Partial<VideoBlueprint>) => {
    scheduleAutosave({ ...bp, ...patch });
  };
  const patchScene = (id: string, patch: Partial<BlueprintScene>) => {
    const scenes = bp.scenes.map((s) =>
      s.id === id ? { ...s, ...patch, edited: true } : s,
    );
    scheduleAutosave({ ...bp, scenes: reindexScenes(scenes) });
  };

  // ----- Scene actions -----
  const addScene = () => {
    const scenes = reindexScenes([...bp.scenes, emptyScene(total)]);
    scheduleAutosave({ ...bp, scenes });
    setExpandedScene(scenes[scenes.length - 1].id);
  };
  const deleteScene = (id: string) => {
    scheduleAutosave({ ...bp, scenes: reindexScenes(bp.scenes.filter((s) => s.id !== id)) });
  };
  const duplicate = (id: string) => {
    const idx = bp.scenes.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const dup = duplicateScene(bp.scenes[idx]);
    const scenes = [...bp.scenes.slice(0, idx + 1), dup, ...bp.scenes.slice(idx + 1)];
    scheduleAutosave({ ...bp, scenes: reindexScenes(scenes) });
  };
  const move = (id: string, dir: -1 | 1) => {
    const i = bp.scenes.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= bp.scenes.length) return;
    const scenes = bp.scenes.slice();
    [scenes[i], scenes[j]] = [scenes[j], scenes[i]];
    scheduleAutosave({ ...bp, scenes: reindexScenes(scenes) });
  };
  const split = (id: string) => {
    const idx = bp.scenes.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const [a, b] = splitScene(bp.scenes[idx]);
    const scenes = [...bp.scenes.slice(0, idx), a, b, ...bp.scenes.slice(idx + 1)];
    scheduleAutosave({ ...bp, scenes: reindexScenes(scenes) });
  };
  const mergeWithNext = (id: string) => {
    const idx = bp.scenes.findIndex((s) => s.id === id);
    if (idx < 0 || idx >= bp.scenes.length - 1) return;
    const merged = mergeScenes(bp.scenes[idx], bp.scenes[idx + 1]);
    const scenes = [...bp.scenes.slice(0, idx), merged, ...bp.scenes.slice(idx + 2)];
    scheduleAutosave({ ...bp, scenes: reindexScenes(scenes) });
  };

  // ---- Studio helpers (timeline / music / subtitles / characters / versions / shots) ----
  const [shotDialogSceneId, setShotDialogSceneId] = useState<string | null>(null);
  const shotDialogScene = useMemo(
    () => (shotDialogSceneId ? bp.scenes.find((s) => s.id === shotDialogSceneId) ?? null : null),
    [shotDialogSceneId, bp.scenes],
  );

  const setSceneDuration = (id: string, durationSec: number) => {
    const idx = bp.scenes.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const clamped = Math.max(0.5, Number(durationSec.toFixed(2)));
    const scenes = bp.scenes.slice();
    scenes[idx] = { ...scenes[idx], durationSec: clamped, endSec: scenes[idx].startSec + clamped, edited: true };
    scheduleAutosave({ ...bp, scenes: reindexScenes(scenes) });
  };
  const setShotReference = (id: string, ref: ShotReference | null) => {
    patchScene(id, { shotReference: ref });
  };
  const bulkReplaceScripts = (lines: string[]) => {
    const scenes = bp.scenes.map((s, i) =>
      lines[i] !== undefined ? { ...s, voiceover: lines[i], edited: true } : s,
    );
    scheduleAutosave({ ...bp, scenes });
  };
  const setMusic = (music: MusicTrack | undefined) =>
    patchGlobal({
      music,
      audio: music
        ? {
            ...bp.audio,
            musicVolume: music.volume,
            fadeInSeconds: Math.max(0, Math.min(5, music.fadeInSec)),
            fadeOutSeconds: Math.max(0, Math.min(5, music.fadeOutSec)),
            loopMusic: music.loop,
          }
        : bp.audio,
    });
  const setSubtitleStyle = (subtitleStyle: SubtitleStyle | undefined) => patchGlobal({ subtitleStyle });
  const setCharacters = (characterLibrary: Character[]) => patchGlobal({ characterLibrary });

  const restoreVersion = async (version: number) => {
    if (!confirm(`Restore version ${version}? Current version will remain in history.`)) return;
    const restored = await restoreBlueprintVersion(projectId, version);
    if (restored) {
      setMeta(restored);
      setBp(restored.currentBlueprint);
      setLastSavedAt(restored.blueprintUpdatedAt);
      setDirty(false);
      onMetadataChange?.(restored);
      toast.success(`Restored to v${version}`);
    }
  };
  const previewVersion = (version: number) => {
    const entry = meta.blueprintVersions?.find((v) => v.version === version);
    if (!entry) return;
    setBp(entry.blueprint);
    setDirty(true);
    toast.info(`Previewing v${version} — click Save now to commit or Restore to make it official.`);
  };

  const restoreOriginal = async () => {
    if (!(await confirmDialog({ title: "Restore the original AI blueprint?", description: "Your edits are saved as a version you can open from History.", confirmText: "Restore" }))) return;
    const restored = await restoreOriginalBlueprint(projectId);
    if (restored) {
      setMeta(restored);
      setBp(restored.currentBlueprint);
      setLastSavedAt(restored.blueprintUpdatedAt);
      setDirty(false);
      onMetadataChange?.(restored);
      toast.success("Restored the original AI blueprint");
    }
  };

  const requestRender = async (action: RenderAction) => {
    if (dirty && saveTimer.current) {
      clearTimeout(saveTimer.current);
      await commit(bp);
    }
    if (errors.length > 0) {
      toast.error("Please fix blueprint errors before rendering.");
      return;
    }
    if (timingIssues.length > 0) {
      toast.error(`${timingIssues.length} scene(s) have more narration than fits — use "Auto-shorten" or edit them first.`);
      return;
    }
    const cost = estimateCredits(bp, action);
    const label = ACTION_LABELS[action];
    if (!confirm(`${label}\n\nEstimated cost: ${creditsLabel(cost)}.\n\nProceed?`)) return;
    await onRender?.(action, { blueprint: bp });
  };

  const autoShorten = async () => {
    const lang = bp.language ?? detectTopicLanguage(bp.scenes.map((x) => x.voiceover).join(" "));
    const ids = new Set(timingIssues.map((i) => i.sceneId));
    const lines = bp.scenes
      .filter((x) => ids.has(x.id))
      .map((x) => ({ n: x.n, text: x.voiceover, maxWords: maxWordsForScene(x.durationSec, lang) }));
    if (!lines.length) return;
    setShortening(true);
    try {
      const r = await shortenFn({ data: { language: lang, lines } });
      const byN = new Map(r.lines.map((l) => [l.n, l.text]));
      if (!byN.size) { toast.error("Couldn't shorten automatically — please edit those lines."); return; }
      // Save right away (not on the autosave timer) so Approve uses the shortened lines.
      const next = { ...bp, scenes: bp.scenes.map((x) => (byN.has(x.n) ? { ...x, voiceover: byN.get(x.n)!, edited: true } : x)) };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setBp(next);
      await commit(next);
      const trimmed = r.trimmed ?? [];
      toast.success(`Shortened ${byN.size} line${byN.size === 1 ? "" : "s"}${trimmed.length ? ` — scene${trimmed.length === 1 ? "" : "s"} ${trimmed.join(", ")} had to be cut to fit; give ${trimmed.length === 1 ? "it" : "them"} a quick read` : ""}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't shorten lines");
    } finally { setShortening(false); }
  };

  const regenScene = async (sceneId: string) => {
    if (dirty && saveTimer.current) {
      clearTimeout(saveTimer.current);
      await commit(bp);
    }
    await onRegenerateScene?.(sceneId, bp);
    toast.info("Regenerating this scene only — your other edits are preserved.");
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header / status */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/50 bg-card/50 p-4">
        <div className="flex flex-col">
          <h2 className="text-xl font-semibold">Blueprint editor</h2>
          <p className="text-sm text-muted-foreground">
            Version {meta.blueprintVersion} · {bp.scenes.length} scenes · {total.toFixed(1)}s total
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {saving ? (
            <span className="flex items-center gap-1"><Save className="h-3 w-3 animate-pulse" /> Saving…</span>
          ) : dirty ? (
            <span className="flex items-center gap-1 text-amber-500"><Clock className="h-3 w-3" /> Unsaved changes</span>
          ) : lastSavedAt ? (
            <span className="flex items-center gap-1 text-emerald-500">
              <Check className="h-3 w-3" /> Saved {new Date(lastSavedAt).toLocaleTimeString()}
            </span>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => void commit(bp)} disabled={!dirty || saving}>
            Save now
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowParser((v) => !v)}>
            <FileText className="h-3 w-3 mr-1" /> {showParser ? "Close brief import" : "Import from brief"}
          </Button>
          <Button size="sm" variant="ghost" onClick={restoreOriginal}>
            <Undo2 className="h-3 w-3 mr-1" /> Restore AI original
          </Button>
        </div>
      </div>

      {showParser && (
        <VideoBriefParserPanel
          projectId={projectId}
          onCancel={() => setShowParser(false)}
          onApplied={(m) => {
            setMeta(m);
            setBp(m.currentBlueprint);
            setLastSavedAt(m.blueprintUpdatedAt);
            setDirty(false);
            onMetadataChange?.(m);
            setShowParser(false);
          }}
        />
      )}

      {/* Validation banner */}
      {(errors.length > 0 || warnings.length > 0) && (
        <Card className="p-4 border-amber-500/40 bg-amber-500/5">
          <div className="flex items-center gap-2 font-medium mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            {errors.length} error{errors.length === 1 ? "" : "s"} · {warnings.length} warning{warnings.length === 1 ? "" : "s"}
            {timingIssues.length > 0 && (
              <Button size="sm" className="ml-auto" disabled={shortening} onClick={() => void autoShorten()}>
                {shortening ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Wand2 className="h-3 w-3 mr-1" />}
                Auto-shorten {timingIssues.length} long line{timingIssues.length === 1 ? "" : "s"}
              </Button>
            )}
          </div>
          {timingIssues.length > 0 && (
            <p className="text-xs text-muted-foreground mb-2">
              Lines longer than their scene make the narration overlap the next scene and the video run long. Fix them before generating shots.
            </p>
          )}
          <ul className="text-xs space-y-1 max-h-32 overflow-auto">
            {[...errors, ...warnings].slice(0, 12).map((i, k) => (
              <li key={k} className={i.level === "error" ? "text-red-400" : "text-amber-400"}>
                • {i.message}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Studio tabs */}
      <Tabs defaultValue="scenes" className="w-full">
        <TabsList className="flex flex-wrap gap-1 h-auto">
          <TabsTrigger value="scenes"><LayoutGrid className="h-3 w-3 mr-1" /> Scenes</TabsTrigger>
          <TabsTrigger value="timeline"><Film className="h-3 w-3 mr-1" /> Timeline</TabsTrigger>
          <TabsTrigger value="script"><FileText className="h-3 w-3 mr-1" /> Script</TabsTrigger>
          <TabsTrigger value="subs"><Type className="h-3 w-3 mr-1" /> Subtitles</TabsTrigger>
          <TabsTrigger value="music"><Music2 className="h-3 w-3 mr-1" /> Music</TabsTrigger>
          <TabsTrigger value="sfx"><Volume2 className="h-3 w-3 mr-1" /> SFX</TabsTrigger>
          <TabsTrigger value="chars"><Users className="h-3 w-3 mr-1" /> Characters</TabsTrigger>
          <TabsTrigger value="versions"><History className="h-3 w-3 mr-1" /> Versions</TabsTrigger>
        </TabsList>

        <TabsContent value="scenes" className="space-y-6 mt-4">
      {/* Global fields */}
      <Card className="p-5 space-y-4">
        <h3 className="font-medium flex items-center gap-2"><Sparkles className="h-4 w-4" /> Global settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Title">
            <Input value={bp.title} onChange={(e) => patchGlobal({ title: e.target.value })} />
          </Field>
          <Field label="Total duration (sec)">
            <Input type="number" value={bp.totalDurationSec}
              onChange={(e) => patchGlobal({ totalDurationSec: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Platform">
            <Input value={bp.platform} onChange={(e) => patchGlobal({ platform: e.target.value })} />
          </Field>
          <Field label="Aspect ratio">
            <Select value={bp.aspectRatio} onValueChange={(v) => patchGlobal({ aspectRatio: v as VideoBlueprint["aspectRatio"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="16:9">16:9</SelectItem>
                <SelectItem value="9:16">9:16</SelectItem>
                <SelectItem value="1:1">1:1</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Video style">
            <Input value={bp.videoStyle} onChange={(e) => patchGlobal({ videoStyle: e.target.value as VideoBlueprint["videoStyle"] })} />
          </Field>
          <Field label="Audience">
            <Input value={bp.audience} onChange={(e) => patchGlobal({ audience: e.target.value })} />
          </Field>
          <Field label="Objective">
            <Input value={bp.objective} onChange={(e) => patchGlobal({ objective: e.target.value })} />
          </Field>
          <Field label="Brand">
            <Input value={bp.brand} onChange={(e) => patchGlobal({ brand: e.target.value })} />
          </Field>
          <Field label="Product">
            <Input value={bp.product} onChange={(e) => patchGlobal({ product: e.target.value })} />
          </Field>
          <Field label="CTA">
            <Input value={bp.cta} onChange={(e) => patchGlobal({ cta: e.target.value })} />
          </Field>
          <Field label="Transition style (default)">
            <Select value={bp.transitionStyle} onValueChange={(v) => patchGlobal({ transitionStyle: v as TransitionStyle })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRANSITION_OPTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Motion intensity">
            <Select value={bp.motionIntensity} onValueChange={(v) => patchGlobal({ motionIntensity: v as VideoBlueprint["motionIntensity"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="static">Static</SelectItem>
                <SelectItem value="subtle">Subtle</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Voice" full>
            <div className="grid grid-cols-3 gap-2">
              <Select value={bp.voice.voiceId} onValueChange={(v) => patchGlobal({ voice: { ...bp.voice, voiceId: v as VideoBlueprint["voice"]["voiceId"] } })}>
                <SelectTrigger><SelectValue placeholder="Voice" /></SelectTrigger>
                <SelectContent>
                  {VOICE_CATALOG.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.label} · {v.gender === "male" ? "Male" : "Female"} · {v.vibe}</SelectItem>
                  ))}
                  {["male", "female", "documentary_narrator"].includes(bp.voice.voiceId) && (
                    <SelectItem value={bp.voice.voiceId}>{bp.voice.voiceId.replace("_", " ")}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <Select value={bp.voice.pace} onValueChange={(v) => patchGlobal({ voice: { ...bp.voice, pace: v as VideoBlueprint["voice"]["pace"] } })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="slow">Slow</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="fast">Fast</SelectItem>
                </SelectContent>
              </Select>
              <Select value={bp.voice.emotion} onValueChange={(v) => patchGlobal({ voice: { ...bp.voice, emotion: v as VideoBlueprint["voice"]["emotion"] } })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["neutral", "energetic", "calm", "dramatic", "friendly"].map((e) => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Field>
          <Field label="Music direction" full>
            <Textarea rows={2} value={bp.musicDirection} onChange={(e) => patchGlobal({ musicDirection: e.target.value })} />
          </Field>
          <Field label="Global visual style" full>
            <Textarea rows={2} value={bp.globalVisualStyle} onChange={(e) => patchGlobal({ globalVisualStyle: e.target.value })} />
          </Field>
          <Field label="Global negative instructions" full>
            <Textarea rows={2} value={bp.globalNegative} onChange={(e) => patchGlobal({ globalNegative: e.target.value })} />
          </Field>
        </div>
      </Card>

      {/* Scenes */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium flex items-center gap-2"><Film className="h-4 w-4" /> Scenes ({bp.scenes.length})</h3>
          <Button size="sm" onClick={addScene}><Plus className="h-4 w-4 mr-1" /> Add scene</Button>
        </div>
        <div className="space-y-2">
          {bp.scenes.map((s, i) => (
            <div key={s.id} className="rounded-lg border border-border/50 bg-card/40">
              <button
                type="button"
                onClick={() => setExpandedScene(expandedScene === s.id ? null : s.id)}
                className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-accent/30"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Badge variant="outline" className="shrink-0">#{s.n}</Badge>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {s.startSec.toFixed(1)}–{s.endSec.toFixed(1)}s
                  </div>
                  <div className="truncate text-sm">{s.role}: {s.visual || <em className="opacity-60">no visual</em>}</div>
                  {s.edited && <Badge className="ml-1" variant="secondary">edited</Badge>}
                </div>
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <IconBtn title="Move up" onClick={() => move(s.id, -1)} disabled={i === 0}><ArrowUp className="h-3 w-3" /></IconBtn>
                  <IconBtn title="Move down" onClick={() => move(s.id, 1)} disabled={i === bp.scenes.length - 1}><ArrowDown className="h-3 w-3" /></IconBtn>
                  <IconBtn title="Duplicate" onClick={() => duplicate(s.id)}><Copy className="h-3 w-3" /></IconBtn>
                  <IconBtn title="Split" onClick={() => split(s.id)}><Scissors className="h-3 w-3" /></IconBtn>
                  <IconBtn title="Merge with next" onClick={() => mergeWithNext(s.id)} disabled={i >= bp.scenes.length - 1}>⇓</IconBtn>
                  <IconBtn title="Regenerate this scene" onClick={() => void regenScene(s.id)}><Wand2 className="h-3 w-3" /></IconBtn>
                  <IconBtn title="Delete" onClick={() => { if (confirm(`Delete scene ${s.n}?`)) deleteScene(s.id); }}><Trash2 className="h-3 w-3 text-red-400" /></IconBtn>
                </div>
              </button>
              {expandedScene === s.id && (
                <div className="p-4 border-t border-border/50 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Start (sec)">
                    <Input type="number" step={0.1} value={s.startSec}
                      onChange={(e) => patchScene(s.id, { startSec: Number(e.target.value), durationSec: Math.max(0.5, s.endSec - Number(e.target.value)) })} />
                  </Field>
                  <Field label="End (sec)">
                    <Input type="number" step={0.1} value={s.endSec}
                      onChange={(e) => patchScene(s.id, { endSec: Number(e.target.value), durationSec: Math.max(0.5, Number(e.target.value) - s.startSec) })} />
                  </Field>
                  <Field label="Duration (sec)">
                    <Input type="number" step={0.1} value={s.durationSec}
                      onChange={(e) => patchScene(s.id, { durationSec: Math.max(0.5, Number(e.target.value)), endSec: s.startSec + Math.max(0.5, Number(e.target.value)) })} />
                  </Field>
                  <Field label="Role">
                    <Input value={s.role} onChange={(e) => patchScene(s.id, { role: e.target.value })} />
                  </Field>
                  <Field label="Visual description" full>
                    <Textarea rows={2} value={s.visual} onChange={(e) => patchScene(s.id, { visual: e.target.value })} />
                  </Field>
                  <Field label="Image prompt" full>
                    <Textarea rows={3} value={s.imagePrompt} onChange={(e) => patchScene(s.id, { imagePrompt: e.target.value })} />
                  </Field>
                  <Field label="Image-to-video motion prompt" full>
                    <Textarea rows={2} value={s.videoPrompt} onChange={(e) => patchScene(s.id, { videoPrompt: e.target.value })} />
                  </Field>
                  <Field label="On-screen text" full>
                    <Input value={s.onScreenText} onChange={(e) => patchScene(s.id, { onScreenText: e.target.value })} />
                  </Field>
                  <Field label="Voiceover" full>
                    <Textarea rows={3} value={s.voiceover} onChange={(e) => patchScene(s.id, { voiceover: e.target.value })} />
                  </Field>
                  <Field label="Transition in">
                    <Select value={s.transitionIn} onValueChange={(v) => patchScene(s.id, { transitionIn: v as TransitionStyle })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{TRANSITION_OPTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Transition out">
                    <Select value={s.transitionOut} onValueChange={(v) => patchScene(s.id, { transitionOut: v as TransitionStyle })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{TRANSITION_OPTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Camera movement">
                    <Select value={s.cameraMovement} onValueChange={(v) => patchScene(s.id, { cameraMovement: v as CameraMovement })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CAMERA_OPTS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Subject movement">
                    <Input value={s.subjectMovement} onChange={(e) => patchScene(s.id, { subjectMovement: e.target.value })} />
                  </Field>
                  <Field label="Product placement" full>
                    <Input value={s.productPlacement} onChange={(e) => patchScene(s.id, { productPlacement: e.target.value })} />
                  </Field>
                  <Field label="Character reference" full>
                    <div className="flex items-center gap-2">
                      <Input className="flex-1" value={s.character.reference}
                        onChange={(e) => patchScene(s.id, { character: { ...s.character, reference: e.target.value } })} />
                      <Label className="flex items-center gap-2 text-xs">
                        <Switch checked={s.character.locked}
                          onCheckedChange={(v) => patchScene(s.id, { character: { ...s.character, locked: v } })} />
                        Lock
                      </Label>
                    </div>
                  </Field>
                  <Field label="Negative prompt" full>
                    <Textarea rows={2} value={s.negativePrompt} onChange={(e) => patchScene(s.id, { negativePrompt: e.target.value })} />
                  </Field>
                </div>
              )}
            </div>
          ))}
          {bp.scenes.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8">No scenes yet. Click <em>Add scene</em>.</div>
          )}
        </div>
      </Card>
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <TimelineEditor
            blueprint={bp}
            selectedSceneId={expandedScene}
            onSelectScene={(id) => setExpandedScene(id)}
            onResizeScene={setSceneDuration}
            onMoveScene={move}
          />
        </TabsContent>

        <TabsContent value="script" className="mt-4">
          <ScriptEditor
            blueprint={bp}
            onUpdateScene={patchScene}
            onBulkReplace={bulkReplaceScripts}
          />
        </TabsContent>

        <TabsContent value="subs" className="mt-4">
          <SubtitleEditor
            blueprint={bp}
            onUpdateScene={patchScene}
            onUpdateStyle={setSubtitleStyle}
          />
        </TabsContent>

        <TabsContent value="music" className="mt-4 space-y-4">
          <AudioSettingsPanel
            value={bp.audio}
            duration={bp.totalDurationSec}
            onChange={(audio) => patchGlobal({ audio })}
          />
          <MusicPicker
            value={bp.music}
            musicDirection={bp.musicDirection ?? ""}
            onChange={(v) => setMusic(v ?? undefined)}
            onDirectionChange={(d) => patchGlobal({ musicDirection: d })}
          />

        </TabsContent>

        <TabsContent value="sfx" className="mt-4">
          <SfxEditor blueprint={bp} onUpdateScene={patchScene} />
        </TabsContent>

        <TabsContent value="chars" className="mt-4">
          <CharacterLibrary
            blueprint={bp}
            onUpdateLibrary={setCharacters}
            onAssignToScene={(sceneId, character) =>
              patchScene(sceneId, {
                character: {
                  reference: character.description
                    ? `${character.name} — ${character.description}`
                    : character.name,
                  locked: character.lockAppearance !== false,
                },
              })
            }

          />
        </TabsContent>


        <TabsContent value="versions" className="mt-4">
          <VersionHistoryPanel
            metadata={meta}
            onRestore={restoreVersion}
            onPreview={previewVersion}
          />
        </TabsContent>
      </Tabs>

      <ShotReplacementDialog
        open={!!shotDialogSceneId}
        scene={shotDialogScene}
        onClose={() => setShotDialogSceneId(null)}
        onSave={setShotReference}
        onRegenerate={(id) => void regenScene(id)}
      />

      {/* Render actions */}
      <Card className="p-5">
        <h3 className="font-medium flex items-center gap-2 mb-3"><Mic2 className="h-4 w-4" /> Render actions</h3>
        <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
          <Info className="h-3 w-3" /> Renders always use your <b>current edited</b> blueprint. A snapshot is captured when rendering starts.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2">
          <RenderBtn action="render_full" bp={bp} onClick={requestRender} label="Render edited" primary />
          <RenderBtn action="regenerate_all" bp={bp} onClick={requestRender} label="Regenerate full video" />
          <RenderBtn action="regenerate_visuals" bp={bp} onClick={requestRender} label="Regenerate visuals only" />
          <RenderBtn action="regenerate_voiceover" bp={bp} onClick={requestRender} label="Regenerate VO only" />
          <RenderBtn action="rerender_final" bp={bp} onClick={requestRender} label="Re-render final MP4" />
        </div>
        {onCancel && (
          <div className="mt-4 flex justify-end">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <RotateCcw className="h-3 w-3 mr-1" /> Back
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------- Sub-components ----------

const ACTION_LABELS: Record<RenderAction, string> = {
  render_full: "Render the edited blueprint",
  regenerate_all: "Regenerate the full video",
  regenerate_visuals: "Regenerate only visuals",
  regenerate_voiceover: "Regenerate only voiceover",
  rerender_final: "Re-render the final MP4 from existing assets",
};

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function IconBtn({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
    >{children}</button>
  );
}

function RenderBtn({
  action, bp, onClick, label, primary,
}: {
  action: RenderAction;
  bp: VideoBlueprint;
  onClick: (a: RenderAction) => void | Promise<void>;
  label: string;
  primary?: boolean;
}) {
  const cost = estimateCredits(bp, action);
  return (
    <Button
      variant={primary ? "default" : "outline"}
      className="flex flex-col h-auto py-3 gap-1"
      onClick={() => void onClick(action)}
    >
      <span className="text-sm">{label}</span>
      <span className="text-[10px] opacity-70">~{creditsLabel(cost)}</span>
    </Button>
  );
}
