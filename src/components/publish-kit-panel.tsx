import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Sparkles, Loader2, ShieldCheck, AlertTriangle, RefreshCw } from "lucide-react";
import {
  generatePublishKit,
  reviewVideoQuality,
  type PublishKit,
  type QualityReport,
} from "@/lib/publish-kit.functions";

type PanelProject = {
  id: string;
  title: string | null;
  topic: string | null;
  platform: string | null;
  content_type: string | null;
  format?: string | null;
  distribution?: unknown;
  quality_report?: unknown;
};

type PanelOutput = {
  script?: string | null;
  captions?: string | null;
  scenes?: Array<{ voiceover?: string; on_screen_text?: string; visual?: string }> | null;
} | null;

function normalizePlatform(p: string | null | undefined): "instagram" | "tiktok" | "youtube_shorts" | "facebook" | "linkedin" | "pinterest" {
  const v = (p || "").toLowerCase();
  if (v.includes("tiktok")) return "tiktok";
  if (v.includes("youtube")) return "youtube_shorts";
  if (v.includes("facebook")) return "facebook";
  if (v.includes("linkedin")) return "linkedin";
  if (v.includes("pinterest")) return "pinterest";
  return "instagram";
}

function normalizeFormat(project: PanelProject): "short" | "long" {
  // The content type is the source of truth: the stored `format` column
  // defaults to "long", which labelled 9:16 reels as "16:9 Long".
  const ct = (project.content_type || "").toLowerCase();
  if (ct.includes("reel") || ct.includes("short") || ct.includes("ugc") || ct.includes("carousel")) return "short";
  if (ct.includes("long")) return "long";
  if (project.format === "short" || project.format === "long") return project.format;
  return "long";
}

async function copy(text: string, label: string) {
  await navigator.clipboard.writeText(text);
  toast.success(`${label} copied`);
}

function ScoreBadge({ score, threshold }: { score: number; threshold: number }) {
  const ok = score >= threshold;
  return (
    <span
      className={
        "px-2 py-0.5 rounded-full text-xs font-semibold " +
        (ok ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400")
      }
    >
      {score}
    </span>
  );
}

export function PublishKitPanel({ project, output }: { project: PanelProject; output: PanelOutput }) {
  const genKit = useServerFn(generatePublishKit);
  const review = useServerFn(reviewVideoQuality);

  const initialKit = (project.distribution as PublishKit | null) ?? null;
  const initialReport = (project.quality_report as QualityReport | null) ?? null;
  const [kit, setKit] = useState<PublishKit | null>(initialKit);
  const [report, setReport] = useState<QualityReport | null>(initialReport);
  const [busy, setBusy] = useState<null | "kit" | "review" | "optimize">(null);

  const format = useMemo(() => normalizeFormat(project), [project]);
  const primary = useMemo(() => normalizePlatform(project.platform), [project.platform]);
  const script = useMemo(() => {
    if (output?.script) return output.script;
    if (output?.scenes) return output.scenes.map((s) => s.voiceover ?? "").filter(Boolean).join("\n");
    return "";
  }, [output]);
  const scenesSummary = useMemo(() => {
    if (!output?.scenes) return "";
    return output.scenes.map((s, i) => `Scene ${i + 1}: ${s.visual ?? ""}`).join("\n");
  }, [output?.scenes]);

  async function persist(next: { distribution?: PublishKit | null; quality_report?: QualityReport | null }) {
    // Cast through unknown — the generated Supabase type is a JSON union.
    await supabase.from("projects").update(next as never).eq("id", project.id);
  }

  async function handleGenerate() {
    setBusy("kit");
    try {
      const k = await genKit({
        data: {
          topic: project.topic ?? project.title ?? "",
          title: project.title ?? "",
          hook_line: output?.scenes?.[0]?.voiceover ?? "",
          script,
          format,
          primary_platform: primary,
          audience: "",
          tone: "cinematic",
        },
      });
      setKit(k);
      await persist({ distribution: k });
      toast.success("Publish kit ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate publish kit");
    } finally {
      setBusy(null);
    }
  }

  async function handleReview(kitToReview: PublishKit | null = kit) {
    setBusy("review");
    try {
      const r = await review({
        data: {
          topic: project.topic ?? project.title ?? "",
          title: project.title ?? "",
          hook_line: output?.scenes?.[0]?.voiceover ?? "",
          script,
          scenes_summary: scenesSummary,
          publish_kit: kitToReview,
          format,
        },
      });
      setReport(r);
      await persist({ quality_report: r });
      if (r.passed) toast.success(`Quality passed — overall ${r.overall}/100`);
      else toast.warning(`Overall ${r.overall}/100 — ${r.weakest_section} is weakest`);
      return r;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Quality review failed");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function handleOptimize() {
    // Simple loop: review → if failed, regenerate publish kit (targeted regen
    // of narrative sections lives in future agent work). Max 2 attempts.
    setBusy("optimize");
    try {
      let attempts = 0;
      let current = kit;
      let r = await handleReview(current);
      while (r && !r.passed && attempts < 2) {
        attempts++;
        // Regenerate the publish kit — it's the section this panel owns.
        if (r.weakest_section === "seo_completeness" || r.weakest_section === "cta_suitability" || r.weakest_section === "thumbnail_quality" || !current) {
          await handleGenerate();
          current = kit;
        }
        r = await handleReview(current);
      }
    } finally {
      setBusy(null);
    }
  }

  const platformOrder: Array<"instagram" | "tiktok" | "youtube_shorts" | "facebook"> = ["instagram", "tiktok", "youtube_shorts", "facebook"];

  return (
    <section className="glass rounded-2xl p-6 space-y-5 border border-[color:var(--neon-purple)]/20">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[color:var(--neon-purple)]" />
          <h2 className="text-lg font-semibold">Publish Kit</h2>
          {kit && (
            <span className="text-xs text-muted-foreground">
              {format === "short" ? "9:16 Shorts" : "16:9 Long"} · primary: {primary.replace("_", " ")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerate}
            disabled={busy !== null}
            className="rounded-lg gradient-primary text-white px-3 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-60"
          >
            {busy === "kit" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {kit ? "Regenerate kit" : "Generate kit"}
          </button>
          <button
            onClick={handleOptimize}
            disabled={busy !== null || !kit}
            className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-60"
            title="Runs quality review and regenerates weak sections until they pass"
          >
            {busy === "optimize" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Optimize
          </button>
        </div>
      </header>

      {!kit && (
        <div className="text-sm text-muted-foreground border border-dashed border-white/10 rounded-xl p-4">
          Generate a ready-to-post distribution kit: SEO title & description, per-platform captions & hashtags,
          pinned comment, CTA, and a thumbnail concept + prompt. Then click <span className="text-foreground">Optimize</span> to
          score across 8 dimensions and auto-fix weak sections.
        </div>
      )}

      {report && (
        <div className="rounded-xl border border-white/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {report.passed ? (
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              )}
              <span className="font-semibold">Quality {report.overall}/100</span>
              <span className="text-xs text-muted-foreground">{report.passed ? "Production quality" : `${report.weakest_section} needs work`}</span>
            </div>
            <button
              onClick={() => handleReview()}
              disabled={busy !== null}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Re-run review
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {report.scores.map((s) => (
              <div key={s.section} className="flex items-center justify-between rounded-lg bg-white/5 px-2 py-1.5">
                <span className="capitalize text-muted-foreground">{s.section.replace(/_/g, " ")}</span>
                <ScoreBadge score={s.score} threshold={s.threshold} />
              </div>
            ))}
          </div>
          {report.suggestions.length > 0 && (
            <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
              {report.suggestions.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          )}
        </div>
      )}

      {kit && (
        <div className="space-y-4">
          <KitField label="SEO title" value={kit.seo_title} />
          <KitField label="SEO description" value={kit.seo_description} multiline />
          <KitField label="Keywords" value={kit.keywords.join(", ")} />
          <KitField label={`CTA (${kit.cta_type})`} value={kit.cta_line} />
          <KitField label="Pinned first comment" value={kit.pinned_comment} multiline />

          <div className="rounded-xl border border-white/10 p-4 space-y-2">
            <div className="text-sm font-semibold">Thumbnail concept</div>
            <div className="text-sm text-muted-foreground">{kit.thumbnail.concept}</div>
            <KitField label="Thumbnail prompt" value={kit.thumbnail.prompt} multiline compact />
          </div>

          <div className="space-y-3">
            <div className="text-sm font-semibold">Per-platform</div>
            {platformOrder.map((p) => {
              const pk = kit.platforms[p];
              if (!pk) return null;
              const combined = `${pk.caption}\n\n${pk.hashtags.join(" ")}`;
              return (
                <div key={p} className="rounded-xl border border-white/10 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium capitalize">
                      {p.replace("_", " ")}
                      {p === "tiktok" && <span className="ml-2 text-[11px] font-normal normal-case text-muted-foreground">copy &amp; post manually</span>}
                    </div>
                    <button
                      onClick={() => copy(combined, p.replace("_", " ") + " post")}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" /> Copy caption + tags
                    </button>
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{pk.caption}</div>
                  <div className="text-xs text-muted-foreground">{pk.hashtags.join(" ")}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function KitField({ label, value, multiline, compact }: { label: string; value: string; multiline?: boolean; compact?: boolean }) {
  return (
    <div className={"flex items-start gap-3 " + (compact ? "" : "border-b border-white/5 pb-3")}>
      <div className="min-w-[140px] text-xs uppercase tracking-wide text-muted-foreground pt-1">{label}</div>
      <div className={"flex-1 text-sm " + (multiline ? "whitespace-pre-wrap" : "")}>{value}</div>
      <button aria-label="Copy"
        onClick={() => copy(value, label)}
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
      >
        <Copy className="w-3 h-3" />
      </button>
    </div>
  );
}
