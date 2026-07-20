/**
 * Post-Generation Studio.
 *
 * Loads a single raw_video_output (the "visuals-only master") and lets the
 * user layer voice / subtitles / music / branding on top without re-rendering
 * scenes. Preview is a stacked <video> + <audio> composition in the browser.
 * Saving records rows in narration_versions / subtitle_versions /
 * final_video_exports so the same raw master can be re-used for many exports.
 *
 * Post-generation changes DO NOT consume scene credits. Only future TTS or
 * composite-render actions charge credits via their own server fns.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Mic2, Type, Music2, Sliders, Download, Play, Pause,
  RefreshCw, Save, Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CreatorFlowSelect } from "@/components/ui/creator-flow-select";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { MUSIC_LIBRARY } from "@/lib/video-blueprint";
import { SUBTITLE_STYLE_PRESETS, getStylePreset } from "@/lib/subtitle-style-presets";
import {
  getRawVideoOutputFn, listNarrationVersionsFn, upsertNarrationVersionFn,
  listSubtitleVersionsFn, upsertSubtitleVersionFn,
  listFinalVideoExportsFn, upsertFinalVideoExportFn, deleteFinalVideoExportFn,
  type NarrationVersion, type SubtitleVersion, type FinalVideoExport,
} from "@/lib/post-gen.functions";

export const Route = createFileRoute("/_authenticated/studio/$rawId")({
  component: StudioPage,
});

// ---------- Browser voices --------------------------------------------------

function useBrowserVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);
  return voices;
}

// ---------- Page -----------------------------------------------------------

function StudioPage() {
  const { rawId } = useParams({ from: "/_authenticated/studio/$rawId" });
  const getRaw = useServerFn(getRawVideoOutputFn);
  const listNarr = useServerFn(listNarrationVersionsFn);
  const listSubs = useServerFn(listSubtitleVersionsFn);
  const listExports = useServerFn(listFinalVideoExportsFn);
  const qc = useQueryClient();

  const raw = useQuery({
    queryKey: ["raw-video", rawId],
    queryFn: () => getRaw({ data: { id: rawId } }),
  });
  const narrations = useQuery({
    queryKey: ["narrations", rawId],
    queryFn: () => listNarr({ data: { rawVideoId: rawId } }),
  });
  const subtitles = useQuery({
    queryKey: ["subtitles", rawId],
    queryFn: () => listSubs({ data: { rawVideoId: rawId } }),
  });
  const exportsQ = useQuery({
    queryKey: ["exports", rawId],
    queryFn: () => listExports({ data: { rawVideoId: rawId } }),
  });

  const [selectedNarrationId, setSelectedNarrationId] = useState<string | null>(null);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [selectedMusicId, setSelectedMusicId] = useState<string | null>(null);
  const [musicVolume, setMusicVolume] = useState(0.35);

  useEffect(() => {
    if (!selectedNarrationId && narrations.data?.[0]) setSelectedNarrationId(narrations.data[0].id);
  }, [narrations.data, selectedNarrationId]);
  useEffect(() => {
    if (!selectedSubtitleId && subtitles.data?.[0]) setSelectedSubtitleId(subtitles.data[0].id);
  }, [subtitles.data, selectedSubtitleId]);

  const activeNarration = narrations.data?.find((n) => n.id === selectedNarrationId) ?? null;
  const activeSubtitle = subtitles.data?.find((s) => s.id === selectedSubtitleId) ?? null;
  const activeMusic = MUSIC_LIBRARY.find((m) => m.id === selectedMusicId) ?? null;

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["narrations", rawId] });
    void qc.invalidateQueries({ queryKey: ["subtitles", rawId] });
    void qc.invalidateQueries({ queryKey: ["exports", rawId] });
  };

  if (raw.isLoading) {
    return <AppShell title="Studio"><div className="p-8 text-muted-foreground">Loading raw master…</div></AppShell>;
  }
  if (!raw.data) {
    return (
      <AppShell title="Studio">
        <div className="p-8 space-y-4">
          <div className="text-lg font-medium">Raw master unavailable</div>
          <p className="text-sm text-muted-foreground max-w-lg">
            This video was generated before the Post-Generation Studio launched, so its reusable
            visuals-only master wasn&apos;t saved. Re-render it from the Videos page to unlock the Studio.
          </p>
          <Button asChild variant="outline"><Link to="/videos">Back to Videos</Link></Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Post-Generation Studio">
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon"><Link to="/videos"><ArrowLeft className="h-4 w-4" /></Link></Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold">Studio · Raw Master v{raw.data.version}</h1>
                <Badge variant="outline" className="text-[10px] uppercase">{raw.data.format}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {raw.data.width}×{raw.data.height} · {raw.data.duration_sec.toFixed(1)}s ·
                {" "}post-gen changes are free (no scene credits)
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4">
          <PreviewPane
            raw={raw.data}
            narration={activeNarration}
            subtitle={activeSubtitle}
            musicVolume={musicVolume}
          />

          <Card className="p-3 max-h-[calc(100vh-180px)] overflow-y-auto">
            <Tabs defaultValue="voice">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="voice"><Mic2 className="h-4 w-4 mr-1" />Voice</TabsTrigger>
                <TabsTrigger value="subs"><Type className="h-4 w-4 mr-1" />Subs</TabsTrigger>
                <TabsTrigger value="music"><Music2 className="h-4 w-4 mr-1" />Music</TabsTrigger>
                <TabsTrigger value="export"><Download className="h-4 w-4 mr-1" />Export</TabsTrigger>
              </TabsList>

              <TabsContent value="voice" className="pt-3">
                <VoiceTab
                  rawId={rawId}
                  narrations={narrations.data ?? []}
                  selectedId={selectedNarrationId}
                  onSelect={setSelectedNarrationId}
                  onChanged={invalidate}
                />
              </TabsContent>
              <TabsContent value="subs" className="pt-3">
                <SubtitleTab
                  rawId={rawId}
                  subtitles={subtitles.data ?? []}
                  selectedId={selectedSubtitleId}
                  onSelect={setSelectedSubtitleId}
                  onChanged={invalidate}
                />
              </TabsContent>
              <TabsContent value="music" className="pt-3">
                <MusicTab
                  selectedId={selectedMusicId}
                  onSelect={setSelectedMusicId}
                  volume={musicVolume}
                  onVolume={setMusicVolume}
                />
              </TabsContent>
              <TabsContent value="export" className="pt-3">
                <ExportTab
                  rawId={rawId}
                  raw={raw.data}
                  narrationId={selectedNarrationId}
                  subtitleId={selectedSubtitleId}
                  musicId={selectedMusicId}
                  musicVolume={musicVolume}
                  exports={exportsQ.data ?? []}
                  onChanged={invalidate}
                />
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

// ---------- Preview --------------------------------------------------------

function PreviewPane({
  raw, narration, subtitle, musicVolume,
}: {
  raw: NonNullable<Awaited<ReturnType<typeof getRawVideoOutputFn>>>;
  narration: NarrationVersion | null;
  subtitle: SubtitleVersion | null;
  musicVolume: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const narrRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    const onTime = () => setCurrentTime(v.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, []);

  function toggle() {
    const v = videoRef.current; const n = narrRef.current; if (!v) return;
    if (v.paused) { void v.play(); if (n && narration?.audio_url) void n.play(); }
    else { v.pause(); if (n) n.pause(); }
  }

  const cues = Array.isArray(subtitle?.cues) ? (subtitle!.cues as Array<{
    text?: string; startSec?: number; endSec?: number;
  }>) : [];
  const activeCue = cues.find((c) =>
    typeof c.startSec === "number" && typeof c.endSec === "number" &&
    currentTime >= c.startSec && currentTime <= c.endSec,
  );
  const style = subtitle ? getStylePreset(subtitle.style_preset).style : null;

  return (
    <Card className="p-3 space-y-3">
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
        <video ref={videoRef} src={raw.video_url} className="w-full h-full object-contain" playsInline />
        {narration?.audio_url ? (
          <audio ref={narrRef} src={narration.audio_url} preload="auto" />
        ) : null}
        {activeCue && style ? (
          <div className={`absolute left-0 right-0 px-6 flex justify-center pointer-events-none
            ${style.position === "top" ? "top-6" : style.position === "middle" ? "top-1/2 -translate-y-1/2" : "bottom-8"}`}>
            <span
              className={`px-3 py-1.5 rounded-md max-w-[80%] text-center
                ${style.font === "serif" ? "font-serif" : style.font === "mono" ? "font-mono" : style.font === "display" ? "font-bold tracking-tight" : ""}
                ${style.size === "sm" ? "text-sm" : style.size === "md" ? "text-base" : style.size === "lg" ? "text-xl" : "text-2xl md:text-3xl"}
                ${style.uppercase ? "uppercase tracking-wide" : ""}
                ${style.background === "solid" ? "bg-black/70" :
                  style.background === "gradient" ? "bg-gradient-to-r from-black/70 via-black/40 to-black/70" :
                  style.background === "blur" ? "backdrop-blur bg-black/30" : ""}`}
              style={{ color: style.color }}
            >
              {activeCue.text}
            </span>
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={toggle} className="gap-2">
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playing ? "Pause" : "Play"}
        </Button>
        <div className="text-xs text-muted-foreground tabular-nums">
          {currentTime.toFixed(1)}s / {raw.duration_sec.toFixed(1)}s
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs">
          {narration ? <Badge variant="outline">Voice: {narration.label ?? narration.voice_id}</Badge> : null}
          {subtitle ? <Badge variant="outline">Subs: {getStylePreset(subtitle.style_preset).label}</Badge> : null}
          <Badge variant="outline">Music vol {Math.round(musicVolume * 100)}%</Badge>
        </div>
      </div>
    </Card>
  );
}

// ---------- Voice tab ------------------------------------------------------

function VoiceTab({
  rawId, narrations, selectedId, onSelect, onChanged,
}: {
  rawId: string;
  narrations: NarrationVersion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
}) {
  const upsert = useServerFn(upsertNarrationVersionFn);
  const voices = useBrowserVoices();
  const [voiceId, setVoiceId] = useState<string>("");
  const [label, setLabel] = useState<string>("");
  const [speed, setSpeed] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [previewText, setPreviewText] = useState("This is how your narration will sound.");

  useEffect(() => { if (!voiceId && voices[0]) setVoiceId(voices[0].name); }, [voices, voiceId]);

  function previewInBrowser() {
    if (!("speechSynthesis" in window)) {
      toast({ title: "Browser preview unavailable", description: "Your browser does not support speech synthesis." });
      return;
    }
    const u = new SpeechSynthesisUtterance(previewText);
    const v = voices.find((x) => x.name === voiceId); if (v) u.voice = v;
    u.rate = speed; u.pitch = pitch;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  const save = useMutation({
    mutationFn: async () => upsert({ data: {
      rawVideoId: rawId, voiceId: voiceId || "browser-default", provider: "browser-preview",
      label: label || `${voiceId || "Preview"} @ ${speed}x`, speed, pitch, volume: 1,
      script: [{ text: previewText, startSec: 0, endSec: 5 }], status: "ready",
    } }),
    onSuccess: () => { onChanged(); toast({ title: "Narration preset saved" }); setLabel(""); },
    onError: (e) => toast({ title: "Save failed", description: e instanceof Error ? e.message : String(e) }),
  });

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        Preview uses the browser voice engine. Saving records the preset so a follow-up job can
        generate the final AI narration via the gateway.
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Voice</Label>
        <CreatorFlowSelect
          value={voiceId}
          onValueChange={setVoiceId}
          options={voices.map((v) => ({ value: v.name, label: `${v.name} · ${v.lang}` }))}
          placeholder="Pick a voice"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Speed {speed.toFixed(2)}x</Label>
          <input type="range" min={0.5} max={1.8} step={0.05} value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))} className="mt-2 w-full accent-primary" />
        </div>
        <div>
          <Label className="text-xs">Pitch {pitch.toFixed(2)}</Label>
          <input type="range" min={0.5} max={1.8} step={0.05} value={pitch}
            onChange={(e) => setPitch(Number(e.target.value))} className="mt-2 w-full accent-primary" />
        </div>
      </div>

      <div>
        <Label className="text-xs">Preview text</Label>
        <Input value={previewText} onChange={(e) => setPreviewText(e.target.value)} className="mt-1" />
      </div>
      <div>
        <Label className="text-xs">Preset label</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Hindi warm host"
          className="mt-1" />
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={previewInBrowser} className="gap-2">
          <Play className="h-4 w-4" />Preview
        </Button>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
          <Save className="h-4 w-4" />{save.isPending ? "Saving…" : "Save preset"}
        </Button>
      </div>

      <div className="border-t border-border/50 pt-3 space-y-2">
        <div className="text-xs font-medium">Saved narrations ({narrations.length})</div>
        {narrations.length === 0 ? (
          <div className="text-xs text-muted-foreground">No presets yet.</div>
        ) : narrations.map((n) => (
          <button key={n.id} onClick={() => onSelect(n.id)}
            className={`w-full text-left rounded-md border p-2 text-xs
              ${selectedId === n.id ? "border-primary/60 bg-primary/10" : "border-border/50 hover:border-primary/40"}`}>
            <div className="flex items-center justify-between">
              <span className="font-medium">{n.label ?? n.voice_id}</span>
              <Badge variant="outline" className="text-[10px]">{n.status}</Badge>
            </div>
            <div className="text-muted-foreground mt-0.5">
              {n.provider} · {n.speed.toFixed(2)}x · {n.audio_url ? "audio ready" : "preset only"}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Subtitle tab ---------------------------------------------------

function SubtitleTab({
  rawId, subtitles, selectedId, onSelect, onChanged,
}: {
  rawId: string;
  subtitles: SubtitleVersion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
}) {
  const upsert = useServerFn(upsertSubtitleVersionFn);
  const [presetId, setPresetId] = useState<string>(SUBTITLE_STYLE_PRESETS[0].id);
  const [label, setLabel] = useState("");
  const [cuesText, setCuesText] = useState(
    "0.0-3.0 Welcome to the studio\n3.0-6.5 Customize voice, subs, music",
  );

  const cues = useMemo(() => parseCues(cuesText), [cuesText]);

  const save = useMutation({
    mutationFn: async () => upsert({ data: {
      rawVideoId: rawId, stylePreset: presetId,
      style: getStylePreset(presetId).style, cues,
      label: label || getStylePreset(presetId).label,
    } }),
    onSuccess: () => { onChanged(); toast({ title: "Subtitle version saved" }); setLabel(""); },
    onError: (e) => toast({ title: "Save failed", description: e instanceof Error ? e.message : String(e) }),
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {SUBTITLE_STYLE_PRESETS.map((p) => (
          <button key={p.id} type="button" onClick={() => setPresetId(p.id)}
            className={`rounded-md border p-2 text-left text-xs transition-all
              ${presetId === p.id ? "border-primary/60 bg-primary/10" : "border-border/50 hover:border-primary/40"}`}>
            <div className="font-medium">{p.label}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{p.description}</div>
          </button>
        ))}
      </div>

      <div>
        <Label className="text-xs">Cues (one per line: <code>start-end text</code>)</Label>
        <textarea value={cuesText} onChange={(e) => setCuesText(e.target.value)}
          rows={5} className="mt-1 w-full rounded-md border border-border/60 bg-background p-2 text-xs font-mono" />
        <div className="text-[10px] text-muted-foreground mt-1">Parsed cues: {cues.length}</div>
      </div>
      <div>
        <Label className="text-xs">Preset label</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Optional label"
          className="mt-1" />
      </div>
      <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || cues.length === 0} className="gap-2">
        <Save className="h-4 w-4" />{save.isPending ? "Saving…" : "Save version"}
      </Button>

      <div className="border-t border-border/50 pt-3 space-y-2">
        <div className="text-xs font-medium">Saved subtitles ({subtitles.length})</div>
        {subtitles.length === 0 ? (
          <div className="text-xs text-muted-foreground">No subtitle versions yet.</div>
        ) : subtitles.map((s) => (
          <button key={s.id} onClick={() => onSelect(s.id)}
            className={`w-full text-left rounded-md border p-2 text-xs
              ${selectedId === s.id ? "border-primary/60 bg-primary/10" : "border-border/50 hover:border-primary/40"}`}>
            <div className="font-medium">{s.label ?? getStylePreset(s.style_preset).label}</div>
            <div className="text-muted-foreground text-[10px]">
              {Array.isArray(s.cues) ? s.cues.length : 0} cues
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function parseCues(text: string) {
  return text.split("\n").map((raw) => raw.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\s+(.+)$/);
    if (!m) return null;
    return { startSec: Number(m[1]), endSec: Number(m[2]), text: m[3] };
  }).filter((x): x is { startSec: number; endSec: number; text: string } => x !== null);
}

// ---------- Music tab ------------------------------------------------------

function MusicTab({
  selectedId, onSelect, volume, onVolume,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  volume: number;
  onVolume: (v: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Pick a track to layer over your raw master. Volume applies during final export.
      </div>
      <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
        {MUSIC_LIBRARY.map((t) => {
          const active = selectedId === t.id;
          return (
            <button key={t.id} type="button" onClick={() => onSelect(active ? null : t.id)}
              className={`rounded-md border p-2 text-left text-xs transition-all
                ${active ? "border-primary/60 bg-primary/10" : "border-border/50 hover:border-primary/40"}`}>
              <div className="font-medium">{t.label}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{t.mood} · {t.bpm} BPM</div>
            </button>
          );
        })}
      </div>
      <div>
        <Label className="text-xs">Music volume {Math.round(volume * 100)}%</Label>
        <input type="range" min={0} max={1} step={0.05} value={volume}
          onChange={(e) => onVolume(Number(e.target.value))} className="mt-2 w-full accent-primary" />
      </div>
    </div>
  );
}

// ---------- Export tab -----------------------------------------------------

function ExportTab({
  rawId, raw, narrationId, subtitleId, musicId, musicVolume, exports, onChanged,
}: {
  rawId: string;
  raw: NonNullable<Awaited<ReturnType<typeof getRawVideoOutputFn>>>;
  narrationId: string | null;
  subtitleId: string | null;
  musicId: string | null;
  musicVolume: number;
  exports: FinalVideoExport[];
  onChanged: () => void;
}) {
  const upsert = useServerFn(upsertFinalVideoExportFn);
  const del = useServerFn(deleteFinalVideoExportFn);
  const [name, setName] = useState("Export v1");

  const music = MUSIC_LIBRARY.find((m) => m.id === musicId) ?? null;

  const save = useMutation({
    mutationFn: async () => upsert({ data: {
      rawVideoId: rawId, narrationVersionId: narrationId, subtitleVersionId: subtitleId,
      name, music: music ? { id: music.id, label: music.label, volume: musicVolume } : null,
      audioMix: { musicVolume }, resolution: `${raw.width}x${raw.height}`,
      format: raw.format, videoUrl: raw.video_url, durationSec: raw.duration_sec,
      status: "ready",
      metadata: { note: "Preview export — points to raw master. Composite render coming in Phase 2." },
    } }),
    onSuccess: () => { onChanged(); toast({ title: "Export saved" }); },
    onError: (e) => toast({ title: "Save failed", description: e instanceof Error ? e.message : String(e) }),
  });

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border/50 bg-muted/30 p-3 text-xs space-y-1">
        <div className="flex items-center gap-1 font-medium"><Sparkles className="h-3 w-3" />Composition summary</div>
        <div className="text-muted-foreground">
          <div>Voice: {narrationId ? "attached" : "none"}</div>
          <div>Subtitles: {subtitleId ? "attached" : "none"}</div>
          <div>Music: {music?.label ?? "none"} · vol {Math.round(musicVolume * 100)}%</div>
          <div>Raw master: {raw.width}×{raw.height} · {raw.duration_sec.toFixed(1)}s</div>
        </div>
      </div>
      <div>
        <Label className="text-xs">Export name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
      </div>
      <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} className="w-full gap-2">
        <Save className="h-4 w-4" />{save.isPending ? "Saving…" : "Save export version"}
      </Button>
      <div className="text-[10px] text-muted-foreground">
        Saves the composition so it can be re-rendered with a single click when the composite renderer
        ships. Downloads today serve the raw master URL.
      </div>

      <div className="border-t border-border/50 pt-3 space-y-2">
        <div className="text-xs font-medium">Export history ({exports.length})</div>
        {exports.length === 0 ? (
          <div className="text-xs text-muted-foreground">No exports yet.</div>
        ) : exports.map((e) => (
          <div key={e.id} className="rounded-md border border-border/50 p-2 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-medium">{e.name}</span>
              <Badge variant="outline" className="text-[10px]">{e.status}</Badge>
            </div>
            <div className="text-[10px] text-muted-foreground">
              {new Date(e.created_at).toLocaleString()} · {e.resolution ?? "—"} · {e.format}
            </div>
            <div className="flex gap-1">
              {e.video_url ? (
                <Button asChild size="sm" variant="outline" className="h-7 text-[11px] gap-1">
                  <a href={e.video_url} target="_blank" rel="noreferrer" download>
                    <Download className="h-3 w-3" />Download
                  </a>
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1"
                onClick={async () => {
                  await del({ data: { id: e.id } }); onChanged();
                }}>
                <RefreshCw className="h-3 w-3" />Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
