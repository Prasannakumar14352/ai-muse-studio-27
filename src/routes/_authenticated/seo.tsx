import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Sparkles, RefreshCw } from "lucide-react";
import { CreatorFlowSelect } from "@/components/ui/creator-flow-select";
import { useCreditGuard } from "@/lib/use-credit-guard";
import { generateSeoPackageFn, regenerateSeoSectionFn, SEO_CONTENT_TYPES, type SeoContentType } from "@/lib/seo-package.functions";

export const Route = createFileRoute("/_authenticated/seo")({ component: SeoPage });

const TYPE_LABELS: Record<SeoContentType, string> = {
  blog: "Blog / Article",
  product: "Product listing",
  youtube: "YouTube video",
  landing: "Landing page",
};

function SeoPage() {
  const { runWithCredits, InsufficientDialog } = useCreditGuard();
  const [contentType, setContentType] = useState<SeoContentType>("blog");
  const [topic, setTopic] = useState("");
  const [primary, setPrimary] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("professional");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [pkg, setPkg] = useState<Record<string, unknown> | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const idem = useRef<string>(crypto.randomUUID());

  const gen = useServerFn(generateSeoPackageFn);
  const regen = useServerFn(regenerateSeoSectionFn);

  const genM = useMutation({
    mutationFn: async () => {
      return await runWithCredits(
        { action: "generic", amount: 5, description: `SEO package · ${contentType}`, inputHash: idem.current },
        () => gen({ data: {
          contentType, topic, primaryKeyword: primary, audience, tone, length,
          idempotencyKey: idem.current, projectId: projectId ?? null,
          brand: "", region: "", language: "English", secondaryKeywords: "", cta: "",
        } }),
      );
    },
    onSuccess: (r) => {
      const res = r as { projectId: string | null; package: Record<string, unknown> };
      setPkg(res.package); setProjectId(res.projectId);
      toast.success("SEO package ready");
      idem.current = crypto.randomUUID();
    },
    onError: (e: unknown) => { const err = e as { code?: string; message?: string }; if (err?.code !== "insufficient_credits") toast.error(err?.message || "Generation failed"); },
  });

  const regenM = useMutation({
    mutationFn: async (sectionKey: string) => {
      if (!projectId) throw new Error("No project");
      const key = `${idem.current}:${sectionKey}:${Date.now()}`;
      return await runWithCredits(
        { action: "generic", amount: 1, description: `Regenerate ${sectionKey}`, inputHash: key, projectId },
        () => regen({ data: { projectId, sectionKey, instruction: "regenerate", idempotencyKey: key } }),
      );
    },
    onSuccess: (r) => {
      const res = r as { sectionKey: string; value: unknown };
      setPkg((p) => (p ? { ...p, [res.sectionKey]: res.value } : p));
      toast.success("Section updated");
    },
    onError: (e: unknown) => { const err = e as { code?: string; message?: string }; if (err?.code !== "insufficient_credits") toast.error(err?.message || "Failed"); },
  });

  const sections = useMemo(() => (pkg ? Object.entries(pkg).filter(([k]) => k !== "kind") : []), [pkg]);
  const canGen = topic.trim().length >= 3 && !genM.isPending;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">SEO Content Package</h1>
        <p className="mt-1 text-sm text-white/60">
          Generate a structured, editable SEO package. Keyword suggestions are AI-generated
          and clearly labelled — search volume, difficulty, and ranking claims are never
          fabricated.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-white/70">Content type</span>
          <CreatorFlowSelect
            value={contentType}
            onValueChange={(v) => setContentType(v as SeoContentType)}
            options={SEO_CONTENT_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-white/70">Length</span>
          <CreatorFlowSelect
            value={length}
            onValueChange={(v) => setLength(v as typeof length)}
            options={[
              { value: "short", label: "Short" },
              { value: "medium", label: "Medium" },
              { value: "long", label: "Long" },
            ]}
          />
        </label>
        <label className="col-span-full space-y-1 text-sm">
          <span className="text-white/70">Topic *</span>
          <input
            value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={300}
            placeholder="e.g. Beginner's guide to AI-generated Instagram Reels for coaches"
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-white/30"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-white/70">Primary keyword (optional)</span>
          <input value={primary} onChange={(e) => setPrimary(e.target.value)} maxLength={120}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-white/70">Audience (optional)</span>
          <input value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={240}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-white/70">Tone</span>
          <input value={tone} onChange={(e) => setTone(e.target.value)} maxLength={60}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white" />
        </label>
        <div className="col-span-full flex justify-end">
          <button
            onClick={() => genM.mutate()} disabled={!canGen}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-pink-500 to-orange-500 px-4 py-2 text-sm font-medium text-white shadow-lg disabled:opacity-50"
          >
            {genM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate SEO package · 5 credits
          </button>
        </div>
      </section>

      {pkg && (
        <section className="space-y-3">
          <div className="text-sm text-white/60">
            Editable sections — regenerate individually for 1 credit each. All keyword
            terms below are AI suggestions; validate volume and difficulty in your
            preferred SEO tool.
          </div>
          {sections.map(([key, value]) => (
            <div key={key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold uppercase tracking-wide text-white/80">{key}</div>
                <button
                  onClick={() => regenM.mutate(key)}
                  disabled={regenM.isPending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-xs text-white hover:bg-white/15 disabled:opacity-50"
                >
                  {regenM.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Regenerate
                </button>
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-white/85">
                {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
              </pre>
            </div>
          ))}
        </section>
      )}

      {InsufficientDialog}
    </div>
  );
}
