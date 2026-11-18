// Model Studio — run top third-party AI models (Seedance video, FLUX images,
// ElevenLabs multilingual voice) from one place, paid for with credits.
import { CreatorFlowSelect } from "@/components/ui/creator-flow-select";
import { saveUrlToLibrary } from "@/lib/save-to-library";
import { creditsLabel } from "@/lib/credits-label";
import { PublishButton } from "@/components/publish-actions";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AudioLines,
  Clapperboard,
  Download,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  AlertTriangle,
  Lock,
  Library,
} from "lucide-react";
import { MODEL_CATALOG, creditsFor, type ModelKind } from "@/lib/model-catalog";
import { usePlanAccess, useUpgradeDialog } from "@/lib/use-plan-access";
import { TIER_LABEL } from "@/lib/plan-access";
import {
  getModelStudioStatusFn,
  listModelGenerationsFn,
  pollModelGenerationFn,
  startModelGenerationFn,
  type ModelGeneration,
} from "@/lib/model-studio.functions";

export const Route = createFileRoute("/_authenticated/model-studio")({
  component: ModelStudioPage,
});

const TABS: Array<{
  kind: ModelKind;
  label: string;
  icon: typeof Clapperboard;
  placeholder: string;
}> = [
  {
    kind: "video",
    label: "Video",
    icon: Clapperboard,
    placeholder:
      "A slow dolly shot of a village temple at sunrise, mist over paddy fields, cinematic lighting",
  },
  {
    kind: "image",
    label: "Image",
    icon: ImageIcon,
    placeholder: "Product photo of a brass diya on a marble table, soft studio light, 85mm",
  },
  {
    kind: "audio",
    label: "Voice",
    icon: AudioLines,
    placeholder: "Type the narration in any language — English, हिन्दी, தமிழ், తెలుగు…",
  },
];

function ModelStudioPage() {
  const qc = useQueryClient();
  const { canFeature } = usePlanAccess();
  const openUpgrade = useUpgradeDialog();
  const [kind, setKind] = useState<ModelKind>("video");
  const models = useMemo(() => MODEL_CATALOG.filter((m) => m.kind === kind), [kind]);
  const [modelId, setModelId] = useState(models[0].id);
  const model = MODEL_CATALOG.find((m) => m.id === modelId) ?? models[0];

  // Each tab keeps its own prompt, so an image prompt doesn't follow you to Voice.
  const [prompts, setPrompts] = useState<Record<ModelKind, string>>({} as Record<ModelKind, string>);
  const prompt = prompts[kind] ?? "";
  const setPrompt = (v: string) => setPrompts((p) => ({ ...p, [kind]: v }));
  const [durationSec, setDurationSec] = useState(5);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [voice, setVoice] = useState("Aria");

  // Reset per-model options when switching tabs/models.
  useEffect(() => {
    // Prefer the first model this plan can use.
    setModelId((models.find((m) => canFeature(`model:${m.id}`).allowed) ?? models[0]).id);
  }, [models, canFeature]);
  useEffect(() => {
    if (model.durations && !model.durations.includes(durationSec))
      setDurationSec(model.durations[0]);
    if (model.aspectRatios && !model.aspectRatios.includes(aspectRatio))
      setAspectRatio(model.aspectRatios[0]);
    if (model.voices && !model.voices.includes(voice)) setVoice(model.voices[0]);
  }, [model, durationSec, aspectRatio, voice]);

  const credits = creditsFor(model, {
    durationSec: model.kind === "video" ? durationSec : undefined,
    textLength: prompt.length,
    numImages: 1,
  });

  const status$ = useServerFn(getModelStudioStatusFn);
  const list$ = useServerFn(listModelGenerationsFn);
  const start$ = useServerFn(startModelGenerationFn);
  const poll$ = useServerFn(pollModelGenerationFn);

  const statusQ = useQuery({ queryKey: ["model-studio-status"], queryFn: () => status$() });
  const listQ = useQuery({
    queryKey: ["model-generations"],
    queryFn: () => list$(),
    refetchInterval: (q) =>
      (q.state.data as ModelGeneration[] | undefined)?.some((g) => g.status === "queued")
        ? 6000
        : false,
  });

  // Advance queued jobs at the provider while the page is open.
  const queuedIds = (listQ.data ?? [])
    .filter((g) => g.status === "queued")
    .map((g) => g.id)
    .join(",");
  useEffect(() => {
    if (!queuedIds) return;
    const timer = setInterval(async () => {
      const ids = queuedIds.split(",");
      const results = await Promise.allSettled(ids.map((id) => poll$({ data: { id } })));
      const done = results.some((r) => r.status === "fulfilled" && r.value.status !== "queued");
      if (done) {
        qc.invalidateQueries({ queryKey: ["model-generations"] });
        qc.invalidateQueries({ queryKey: ["access"] });
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [queuedIds, poll$, qc]);

  const startM = useMutation({
    mutationFn: () =>
      start$({
        data: {
          modelId: model.id,
          prompt,
          durationSec: model.kind === "video" ? durationSec : undefined,
          aspectRatio: model.aspectRatios ? aspectRatio : undefined,
          voice: model.voices ? voice : undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Generation started", {
        description: `${model.label} · ${creditsLabel(credits)} reserved`,
      });
      qc.invalidateQueries({ queryKey: ["model-generations"] });
      qc.invalidateQueries({ queryKey: ["access"] });
    },
    onError: (e: Error) => {
      if (!e.message.startsWith("insufficient_credits")) toast.error(e.message);
    },
  });

  const tab = TABS.find((t) => t.kind === kind)!;
  const notConfigured = statusQ.data && !statusQ.data.configured;
  const modelLock = canFeature(`model:${model.id}`);
  const tooLong = model.maxChars ? prompt.length > model.maxChars : prompt.length > 2000;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" /> Model Studio
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Use the world's top AI models for video, images and voice. One credit balance for all of
          them.
        </p>
      </div>

      {notConfigured && (
        <div className="glass rounded-xl border border-amber-500/40 p-4 text-sm flex gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
          <div>
            Model Studio isn't switched on yet. An admin needs to add the <code>FAL_KEY</code>{" "}
            secret.
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.kind}
            onClick={() => setKind(t.kind)}
            className={`px-4 py-2 rounded-full text-sm border inline-flex items-center gap-2 ${kind === t.kind ? "gradient-primary text-white border-transparent" : "glass border-border"}`}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {models.map((m) => {
          const lock = canFeature(`model:${m.id}`);
          return (
            <button
              key={m.id}
              onClick={() =>
                lock.allowed
                  ? setModelId(m.id)
                  : openUpgrade({ label: m.label, required: lock.required })
              }
              className={`text-left rounded-xl p-4 border transition ${!lock.allowed ? "opacity-60 glass border-border" : m.id === model.id ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "glass border-border hover:border-primary/50"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{m.label}</div>
                {!lock.allowed ? (
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide rounded-full bg-white/10 text-muted-foreground px-2 py-0.5">
                    <Lock className="h-3 w-3" /> {TIER_LABEL[lock.required]}
                  </span>
                ) : (
                  m.badge && (
                    <span className="text-[10px] uppercase tracking-wide rounded-full bg-primary/15 text-primary px-2 py-0.5">
                      {m.badge}
                    </span>
                  )
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{m.vendor}</div>
              <div className="text-xs text-muted-foreground mt-2">{m.description}</div>
            </button>
          );
        })}
      </div>

      <div className="glass rounded-xl border border-border p-5 space-y-4">
        <label className="block">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
            {kind === "audio" ? "Text to speak" : "Prompt"}
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder={tab.placeholder}
            className="input-base w-full resize-y"
          />
          <div className={`text-xs mt-1 ${tooLong ? "text-destructive" : "text-muted-foreground"}`}>
            {prompt.length} / {model.maxChars ?? 2000} characters
          </div>
        </label>

        <div className="flex flex-wrap gap-6">
          {model.durations && (
            <OptionGroup
              label="Duration"
              value={String(durationSec)}
              options={model.durations.map(String)}
              format={(v) => `${v}s`}
              onChange={(v) => setDurationSec(Number(v))}
            />
          )}
          {model.aspectRatios && (
            <OptionGroup
              label="Aspect ratio"
              value={aspectRatio}
              options={model.aspectRatios}
              onChange={setAspectRatio}
            />
          )}
          {model.voices && (
            <div className="block max-w-xs">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                Voice
              </div>
              <CreatorFlowSelect
                value={voice}
                onValueChange={setVoice}
                options={model.voices}
                ariaLabel="Voice"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 pt-2">
          <div className="text-sm text-muted-foreground">
            Cost: <span className="font-semibold text-foreground">{creditsLabel(credits)}</span>
          </div>
          <button
            onClick={() => startM.mutate()}
            disabled={
              startM.isPending ||
              prompt.trim().length < 2 ||
              tooLong ||
              !!notConfigured ||
              !modelLock.allowed
            }
            className="rounded-lg gradient-primary text-white px-5 py-2.5 text-sm font-medium inline-flex items-center gap-2 shadow-[var(--shadow-glow)] disabled:opacity-60"
          >
            {startM.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Your {tab.label.toLowerCase()} generations</h2>
        {listQ.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {listQ.data && listQ.data.filter((g) => g.kind === kind).length === 0 && (
          <div className="text-sm text-muted-foreground">
            Nothing yet — your results will appear here.
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {listQ.data?.filter((g) => g.kind === kind).map((g) => (
            <GenerationCard key={g.id} g={g} />
          ))}
        </div>
      </div>
    </div>
  );
}

function OptionGroup(props: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  format?: (v: string) => string;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
        {props.label}
      </div>
      <div className="flex gap-2">
        {props.options.map((o) => (
          <button
            key={o}
            onClick={() => props.onChange(o)}
            className={`px-3 py-1.5 rounded-full text-xs border ${props.value === o ? "gradient-primary text-white border-transparent" : "glass border-border"}`}
          >
            {props.format ? props.format(o) : o}
          </button>
        ))}
      </div>
    </div>
  );
}

function GenerationCard({ g }: { g: ModelGeneration }) {
  const model = MODEL_CATALOG.find((m) => m.id === g.model_id);
  return (
    <div className="glass rounded-xl border border-border overflow-hidden">
      <div className="bg-black/20 aspect-video flex items-center justify-center">
        {g.status === "queued" && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Generating…
          </div>
        )}
        {g.status === "failed" && (
          <div className="text-sm text-destructive px-4 text-center">
            Failed — credits refunded.
            <div className="text-xs opacity-70 mt-1 line-clamp-2">{g.error}</div>
          </div>
        )}
        {g.status === "completed" && g.output_url && g.kind === "video" && (
          <video src={g.output_url} controls className="w-full h-full object-contain" />
        )}
        {g.status === "completed" && g.output_url && g.kind === "image" && (
          <img src={g.output_url} alt={g.prompt} className="w-full h-full object-contain" />
        )}
        {g.status === "completed" && g.output_url && g.kind === "audio" && (
          <audio src={g.output_url} controls className="w-11/12" />
        )}
      </div>
      <div className="p-3 space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {model?.label ?? g.model_id} · {creditsLabel(g.credits)}
          </span>
          {g.status === "completed" && g.output_url && (
            <span className="inline-flex items-center gap-3">
              {(g.kind === "video" || g.kind === "image") && (
                <PublishButton
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                  content={{
                    title: g.prompt.slice(0, 80) || (model?.label ?? "AI generation"),
                    caption: "",
                    defaultPlatform: g.kind === "video" ? "youtube" : "instagram",
                    media: [{ url: g.output_url, kind: g.kind, name: g.kind === "video" ? "video.mp4" : "image.jpg" }],
                  }}
                />
              )}
              <SaveToLibraryButton g={g} title={g.prompt.slice(0, 80) || (model?.label ?? "AI generation")} />
              <a
                href={g.output_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <Download className="h-3.5 w-3.5" /> Download
              </a>
            </span>
          )}
        </div>
        <div className="text-sm line-clamp-2">{g.prompt}</div>
      </div>
    </div>
  );
}

function SaveToLibraryButton({ g, title }: { g: ModelGeneration; title: string }) {
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  if (!g.output_url) return null;
  const kind = g.kind === "audio" ? "voiceover" : g.kind === "video" ? "video" : "image";
  return (
    <button
      type="button"
      disabled={state !== "idle"}
      onClick={async () => {
        setState("saving");
        try {
          await saveUrlToLibrary({ url: g.output_url!, kind, title, tags: ["model-studio"], metadata: { model: g.model_id } });
          setState("saved");
          toast.success("Saved to Media Library");
        } catch (e) {
          setState("idle");
          toast.error(e instanceof Error ? e.message : "Couldn't save");
        }
      }}
      className="inline-flex items-center gap-1 text-primary hover:underline disabled:opacity-60 disabled:no-underline"
    >
      {state === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Library className="h-3.5 w-3.5" />}
      {state === "saved" ? "In Library" : "Save to Library"}
    </button>
  );
}
