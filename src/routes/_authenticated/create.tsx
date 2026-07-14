// "Quick brief" create screen. Uses the shared <ProjectBriefForm/> so the
// input UI matches exactly what the /projects/$id editor shows when a user
// edits an existing brief. After generation we hand off to that editor —
// create and edit share both the form component AND the destination.

import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateProject, generateCarousel, generateCaptions, generateHashtags } from "@/lib/generators";
import { generateAiCarousel } from "@/lib/carousel-ai.functions";
import { generateAiVideoScript } from "@/lib/video-ai.functions";
import { STYLES, GENERATION_COST } from "@/lib/constants";
import { deductUsage, getAccessInfo, canGenerate } from "@/lib/access";
import { saveOutput } from "@/lib/local-store";
import { useQueryClient } from "@tanstack/react-query";
import { ProjectBriefForm, type ProjectBrief } from "@/components/project-brief-form";
import { ContentTypePicker } from "@/components/content-type-picker";
import { CONTENT_TYPES_BY_ID, type ContentTypeId } from "@/lib/content-types";
import { getTemplateBySlugFn } from "@/lib/templates.functions";
import { ArrowLeft, Sparkles } from "lucide-react";

const VALID_TYPES = new Set<ContentTypeId>([
  "long_video", "short_reel", "talking_object", "documentary", "product_promo",
  "carousel", "ai_image", "thumbnail", "caption_only", "seo_pack", "linkedin_post",
]);

export const Route = createFileRoute("/_authenticated/create")({
  validateSearch: (s: Record<string, unknown>): { type?: ContentTypeId; template?: string } => {
    const t = typeof s.type === "string" && VALID_TYPES.has(s.type as ContentTypeId)
      ? (s.type as ContentTypeId) : undefined;
    const template = typeof s.template === "string" ? s.template : undefined;
    return { ...(t ? { type: t } : {}), ...(template ? { template } : {}) };
  },
  component: CreatePage,
});


function CreatePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const [loading, setLoading] = useState(false);
  const selectedType = search.type as ContentTypeId | undefined;
  const selectedMeta = selectedType ? CONTENT_TYPES_BY_ID[selectedType] ?? null : null;

  // Optional template pre-fill from ?template=slug
  const { data: template } = useQuery({
    queryKey: ["template", search.template],
    enabled: !!search.template,
    queryFn: () => getTemplateBySlugFn({ data: { slug: search.template! } }),
  });

  useEffect(() => {
    if (template) toast.success(`Template loaded: ${template.name}`, { duration: 2500 });
  }, [template]);



  async function handleGenerate(form: ProjectBrief) {
    if (!form.topic.trim()) { toast.error("Please enter a topic"); return; }
    setLoading(true);
    try {
      const access = await getAccessInfo();
      if (!access) throw new Error("Not signed in");

      if (!canGenerate(access, GENERATION_COST)) {
        toast.error("Not enough credits. Upgrade your plan or add credits.", {
          action: { label: "See plans", onClick: () => navigate({ to: "/pricing" }) },
        });
        setLoading(false);
        return;
      }

      const isCarousel = form.content_type === "carousel";

      let aiCarousel: Awaited<ReturnType<typeof generateAiCarousel>> | null = null;
      if (isCarousel) {
        try {
          const styleLabel = STYLES.find((s) => s.id === form.style)?.label ?? form.style;
          aiCarousel = await generateAiCarousel({
            data: {
              topic: form.topic, tone: form.tone, platform: form.platform,
              styleLabel, slideCount: form.slide_count, aspectRatio: form.aspect_ratio,
            },
          });
        } catch (e) {
          console.warn("AI carousel generation failed, using template:", e);
          toast.warning("AI carousel generator unavailable — using template.");
        }
      }

      const output = isCarousel
        ? (aiCarousel ?? generateCarousel({
            topic: form.topic, tone: form.tone, platform: form.platform, style: form.style,
            slideCount: form.slide_count, aspectRatio: form.aspect_ratio,
          }))
        : generateProject({
            topic: form.topic, tone: form.tone, platform: form.platform,
            style: form.style, contentType: form.content_type,
          });

      const { data: project, error: pErr } = await supabase.from("projects").insert({
        user_id: access.userId,
        title: output.title,
        content_type: form.content_type,
        topic: form.topic,
        audience: form.audience,
        platform: form.platform,
        tone: form.tone,
        style: form.style,
        voice: form.voice,
        music: form.music,
        status: "generated",
      }).select().single();
      if (pErr) throw pErr;

      if (isCarousel) {
        const styleLabel = STYLES.find((s) => s.id === form.style)?.label ?? form.style;
        if (aiCarousel) {
          const slides = aiCarousel.slides;
          const script = slides.map((s) =>
            `Slide ${s.n} — ${s.role} [${s.label}]\n${s.emoji ? s.emoji + " " : ""}${s.headline}\n\n${s.body}\n${(s.bullets ?? []).map((b) => `• ${b}`).join("\n")}\n\nKey takeaway: ${s.bottom_highlight}\nVisual: ${s.visual}`
          ).join("\n\n---\n\n");
          const captions = `${aiCarousel.title}\n\n${slides[0]?.headline ?? ""}\n${slides[0]?.body ?? ""}\n\nSave this — share with someone who needs it.`;
          const hashtags = generateCarousel({
            topic: form.topic, tone: form.tone, platform: form.platform, style: form.style,
            slideCount: form.slide_count, aspectRatio: form.aspect_ratio,
          }).hashtags;
          await saveOutput(project.id, {
            title: aiCarousel.title,
            hook: slides[0]?.headline ?? "",
            script,
            captions,
            hashtags,
            scenes: [],
            image_prompts: slides.map((s) => ({ n: s.n, prompt: s.image_prompt, style: styleLabel })),
            thumbnail_ideas: [],
            carousel_slides: slides.map((s) => ({
              n: s.n, role: s.role, headline: s.headline, body: s.body, visual: s.visual,
              label: s.label, emoji: s.emoji, bullets: s.bullets, bottom_highlight: s.bottom_highlight,
            })),
            aspect_ratio: form.aspect_ratio,
            slide_count: form.slide_count,
          });
        } else {
          const c = output as ReturnType<typeof generateCarousel>;
          await saveOutput(project.id, {
            title: c.title,
            hook: "",
            script: c.script,
            captions: c.captions,
            hashtags: c.hashtags,
            scenes: [],
            image_prompts: c.image_prompts,
            thumbnail_ideas: [],
            carousel_slides: c.slides,
            aspect_ratio: form.aspect_ratio,
            slide_count: form.slide_count,
          });
        }
      } else {
        const styleLabel = STYLES.find((s) => s.id === form.style)?.label ?? form.style;
        let aiVideo: Awaited<ReturnType<typeof generateAiVideoScript>> | null = null;
        try {
          aiVideo = await generateAiVideoScript({
            data: {
              topic: form.topic, tone: form.tone, platform: form.platform,
              styleLabel, contentType: form.content_type, audience: form.audience,
              ...(form.content_type === "long_video"
                ? { targetLengthSec: form.long_video_length_sec }
                : {}),
            },
          });
        } catch (e) {
          console.warn("AI video script failed, using template:", e);
          toast.warning("AI script generator unavailable — using template.");
        }

        if (aiVideo) {
          const scenes = aiVideo.scenes.map((s) => ({
            n: s.n,
            visual: s.visual,
            voiceover: s.voiceover,
            duration: s.duration || "3s",
            on_screen_text: s.on_screen_text || "",
          }));
          const script = aiVideo.scenes.map((s) =>
            `Scene ${s.n} (${s.time_range}) — ${s.role}\nVoiceover: ${s.voiceover}\n${s.on_screen_text ? `On-screen text: ${s.on_screen_text}\n` : ""}Visual: ${s.visual}`
          ).join("\n\n---\n\n");
          await saveOutput(project.id, {
            title: aiVideo.reel_title || aiVideo.title,
            hook: aiVideo.scenes[0]?.voiceover ?? "",
            script,
            captions: aiVideo.caption || generateCaptions(form.topic, form.platform, form.tone).join("\n\n---\n\n"),
            hashtags: aiVideo.hashtags?.length ? aiVideo.hashtags : generateHashtags(form.topic, form.platform),
            scenes,
            image_prompts: aiVideo.scenes.map((s) => ({ n: s.n, prompt: s.image_prompt, style: styleLabel })),
            thumbnail_ideas: [],
          });
        } else {
          const p = output as ReturnType<typeof generateProject>;
          await saveOutput(project.id, {
            title: p.title,
            hook: p.hook,
            script: p.script,
            captions: p.captions,
            hashtags: p.hashtags,
            scenes: p.scenes,
            image_prompts: p.image_prompts,
            thumbnail_ideas: p.thumbnail_ideas,
          });
        }
      }

      const result = await deductUsage({
        amount: GENERATION_COST,
        projectId: project.id,
        description: `Generated ${form.content_type}: ${output.title}`,
      });
      if (!result.ok && result.error !== "not_authenticated") {
        console.warn("Deduction failed:", result.error);
      }

      qc.invalidateQueries({ queryKey: ["access"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["projects-section"] });
      qc.invalidateQueries({ queryKey: ["recent-projects"] });
      toast.success(access.isAdmin ? "Generated (admin — no credits used)" : "Project generated!");
      navigate({ to: "/projects/$id", params: { id: project.id } });
    } catch (err) {
      console.error("[create] generation failed", err);
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  // Step 1: content-type hub. Shown when no ?type= is set.
  if (!selectedMeta) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">
            Start a <span className="gradient-text">new project</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            Pick the kind of content you want to create — each type opens a guided workflow tuned for it.
          </p>
        </div>
        <ContentTypePicker />
      </div>
    );
  }

  // Carousel has its own dedicated multi-step workflow.
  if (selectedMeta.route === "/create/carousel") {
    // Soft redirect via Link — keeps back button clean.
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Link to="/create" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Change content type
        </Link>
        <div className="glass rounded-2xl p-6 border">
          <div className="font-semibold">{selectedMeta.label}</div>
          <p className="text-sm text-muted-foreground mt-1">{selectedMeta.description}</p>
          <Link
            to="/create/carousel"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg gradient-primary text-white px-4 py-2 text-sm font-medium shadow-[var(--shadow-glow)]"
          >
            Open Carousel workflow →
          </Link>
        </div>
      </div>
    );
  }

  // Step 2: full brief form, preseeded with the chosen content type.
  const initialBrief: Partial<ProjectBrief> = {
    content_type: selectedMeta.id,
    ...(selectedMeta.aspect ? { aspect_ratio: selectedMeta.aspect } : {}),
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link to="/create" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Change content type
      </Link>
      <div>
        <h1 className="text-3xl md:text-4xl font-bold">
          New <span className="gradient-text">{selectedMeta.label}</span>
        </h1>
        <p className="text-muted-foreground mt-1">{selectedMeta.description}</p>
      </div>

      <div className="glass rounded-2xl p-4 border border-[color:var(--neon-purple)]/40 bg-[color:var(--neon-purple)]/5 text-sm">
        <span className="font-semibold">One flow for create + edit.</span>{" "}
        <span className="text-muted-foreground">
          The same brief form appears on the project editor — regenerate script, scenes, captions, images or render from there.
        </span>
      </div>

      <ProjectBriefForm
        initial={initialBrief}
        loading={loading}
        onSubmit={handleGenerate}
        submitLabel="Generate & open editor"
      />
    </div>
  );
}

