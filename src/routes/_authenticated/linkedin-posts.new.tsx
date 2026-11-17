import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  generateLinkedinPost,
  regenerateLinkedinSection,
  scoreLinkedinPost,
  POST_TYPES,
  WRITING_STYLES,
  EMOJI_LEVELS,
  CTA_TYPES,
  type LinkedinPostContent,
  type LinkedinVariation,
  type LinkedinScoreCard,
} from "@/lib/linkedin-ai.functions";
import { Linkedin, Wand2, ArrowLeft, Copy, Save, RefreshCw, Sparkles, FileDown, Send, Star } from "lucide-react";
import { consumeResearchPrefill, type ResearchPrefill } from "@/lib/research-prefill";
import { HandoffBanner } from "@/components/handoff-banner";
import { useAutogen } from "@/lib/use-autogen";
import {
  BUILT_IN_VOICES,
  listBrandVoices,
  saveBrandVoice,
  type LinkedinBrandVoice,
} from "@/lib/linkedin-brand-voices";
import {
  copyToClipboard,
  exportTxt,
  exportMarkdown,
  exportDoc,
  exportPdf,
} from "@/lib/linkedin-exports";
import { promptDialog } from "@/components/prompt-dialog";

export const Route = createFileRoute("/_authenticated/linkedin-posts/new")({
  component: NewLinkedinPostPage,
});

const GOALS = [
  "Build authority", "Generate engagement", "Generate leads", "Promote a product",
  "Share knowledge", "Announce an update", "Drive website traffic", "Recruit",
  "Build personal brand",
];
const LENGTHS = ["Short", "Medium", "Long", "Custom"] as const;
const TONES = [
  "Professional", "Conversational", "Authoritative", "Educational",
  "Story-driven", "Inspirational", "Bold", "Minimal", "Technical",
];
const INPUT_SOURCES = [
  { id: "topic", label: "Topic" },
  { id: "url", label: "URL" },
  { id: "youtube", label: "YouTube" },
  { id: "article", label: "Article" },
  { id: "pdf_text", label: "PDF text" },
  { id: "image_desc", label: "Image desc" },
  { id: "existing", label: "Existing post" },
] as const;

const DRAFT_KEY = "cf:linkedin:studio:draft:v1";

function NewLinkedinPostPage() {
  const navigate = useNavigate();
  const run = useServerFn(generateLinkedinPost);
  const runRegen = useServerFn(regenerateLinkedinSection);
  const runScore = useServerFn(scoreLinkedinPost);

  const [handoff, setHandoff] = useState<ResearchPrefill | null>(() => consumeResearchPrefill("linkedin"));
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [regenBusy, setRegenBusy] = useState<string | null>(null);
  const [content, setContent] = useState<LinkedinPostContent | null>(null);
  const [voices, setVoices] = useState<LinkedinBrandVoice[]>(() => (typeof window === "undefined" ? BUILT_IN_VOICES : listBrandVoices()));
  const [activeVariationIdx, setActiveVariationIdx] = useState(0);

  // --- Inputs
  const [topic, setTopic] = useState(handoff?.topic ?? "");
  const [audience, setAudience] = useState(handoff?.audience ?? "");
  const [industry, setIndustry] = useState("");
  const [goal, setGoal] = useState("Build authority");
  const [tone, setTone] = useState("Professional");
  const [postType, setPostType] = useState<string>("auto");
  const [writingStyle, setWritingStyle] = useState<(typeof WRITING_STYLES)[number]>("Professional");
  const [length, setLength] = useState<(typeof LENGTHS)[number]>("Medium");
  const [customWords, setCustomWords] = useState<number>(220);
  const [brand, setBrand] = useState("");
  const [cta, setCta] = useState(handoff?.cta ?? "");
  const [ctaType, setCtaType] = useState<string>("auto");
  const [language, setLanguage] = useState("English");
  const [emojiLevel, setEmojiLevel] = useState<(typeof EMOJI_LEVELS)[number]>("minimal");
  const [variationCount, setVariationCount] = useState(3);
  const [hashtagCount, setHashtagCount] = useState(6);
  const [includeImage, setIncludeImage] = useState(false);
  const [includeCarousel, setIncludeCarousel] = useState(false);
  const [includeHashtags, setIncludeHashtags] = useState(true);
  const [inputSource, setInputSource] = useState<(typeof INPUT_SOURCES)[number]["id"]>("topic");
  const [sourceText, setSourceText] = useState("");
  const [useStrategy, setUseStrategy] = useState(false);
  const [brandVoiceId, setBrandVoiceId] = useState<string>("");
  const [voiceDesc, setVoiceDesc] = useState("");

  // ---- Auto-save draft
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      if (d && !topic && d.topic) {
        setTopic(d.topic || ""); setAudience(d.audience || ""); setIndustry(d.industry || "");
        setGoal(d.goal || goal); setTone(d.tone || tone); setPostType(d.postType || "auto");
        setWritingStyle(d.writingStyle || "Professional"); setLength(d.length || "Medium");
        setBrand(d.brand || ""); setCta(d.cta || ""); setCtaType(d.ctaType || "auto");
        setLanguage(d.language || "English"); setEmojiLevel(d.emojiLevel || "minimal");
        setVariationCount(d.variationCount || 3); setHashtagCount(d.hashtagCount || 6);
        setInputSource(d.inputSource || "topic"); setSourceText(d.sourceText || "");
        setBrandVoiceId(d.brandVoiceId || ""); setVoiceDesc(d.voiceDesc || "");
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify({
          topic, audience, industry, goal, tone, postType, writingStyle, length, brand, cta, ctaType,
          language, emojiLevel, variationCount, hashtagCount, inputSource, sourceText, brandVoiceId, voiceDesc,
        }));
      } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(t);
  }, [topic, audience, industry, goal, tone, postType, writingStyle, length, brand, cta, ctaType, language, emojiLevel, variationCount, hashtagCount, inputSource, sourceText, brandVoiceId, voiceDesc]);

  // Effective brand voice
  const brandVoice = useMemo(() => {
    if (brandVoiceId) {
      const v = voices.find((x) => x.id === brandVoiceId);
      if (v) return v;
    }
    return null;
  }, [brandVoiceId, voices]);

  async function generate() {
    if (!topic.trim()) return toast.error("Enter a topic");
    setBusy(true);
    try {
      const res = await run({
        data: {
          topic, audience, industry, goal, tone,
          writing_style: (brandVoice?.writing_style as (typeof WRITING_STYLES)[number]) || writingStyle,
          post_type: postType, length,
          custom_length_words: length === "Custom" ? customWords : undefined,
          brand,
          brand_voice: brandVoice ? `${brandVoice.name}: ${brandVoice.description}` : voiceDesc,
          cta, cta_type: ctaType, language,
          emoji_level: (brandVoice?.emoji_level as (typeof EMOJI_LEVELS)[number]) || emojiLevel,
          variation_count: variationCount,
          hashtag_count: hashtagCount,
          include_image: includeImage,
          include_carousel: includeCarousel,
          include_hashtags: includeHashtags,
          input_source: inputSource,
          source_text: sourceText,
          use_strategy_context: useStrategy,
        },
      });
      setContent(res.content);
      setActiveVariationIdx(0);
      setStep(2);
      if (res.mode === "demo") {
        toast.message("Showing draft content", { description: res.safeError ?? "AI is warming up — you can regenerate anytime." });
      } else {
        toast.success("Post generated");
      }
    } catch (e) {
      toast.error("Couldn't generate — try again", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  useAutogen(handoff, () => {
    if (topic.trim()) {
      toast.message("Generation started", { description: "Auto-generating from Viral Research…" });
      void generate();
    }
  });

  async function regen(section: "hook" | "cta" | "hashtags" | "body" | "conclusion" | "first_comment") {
    if (!content) return;
    setRegenBusy(section);
    try {
      const activeBody = content.variations?.[activeVariationIdx]?.body ?? content.body;
      const res = await runRegen({
        data: {
          section,
          topic, audience, tone,
          writing_style: (brandVoice?.writing_style as string) || writingStyle,
          post_type: postType === "auto" ? (content.post_type_suggested || "Educational") : postType,
          emoji_level: (brandVoice?.emoji_level as (typeof EMOJI_LEVELS)[number]) || emojiLevel,
          current_body: activeBody,
          cta_type: ctaType,
          hashtag_count: hashtagCount,
          brand_voice: brandVoice ? brandVoice.description : voiceDesc,
        },
      });
      const r = res.result;
      setContent((prev) => {
        if (!prev) return prev;
        const next: LinkedinPostContent = { ...prev };
        if (r.hook || r.hooks) {
          next.hooks = r.hooks?.length ? r.hooks : next.hooks;
          next.recommended_hook = r.hook || next.hooks[0] || next.recommended_hook;
        }
        if (r.cta || r.ctas) {
          next.cta = r.cta || next.cta;
          next.ctas = r.ctas || next.ctas;
        }
        if (r.hashtags) next.hashtags = r.hashtags;
        if (r.hashtag_mix) next.hashtag_mix = r.hashtag_mix;
        if (r.body) {
          if (next.variations?.length) {
            const vs = [...next.variations];
            vs[activeVariationIdx] = { ...vs[activeVariationIdx], body: r.body, char_count: r.body.length };
            next.variations = vs;
          }
          next.body = r.body;
        }
        if (r.conclusion) {
          const b = next.variations?.[activeVariationIdx]?.body ?? next.body;
          const parts = b.split(/\n{2,}/);
          parts[parts.length - 1] = r.conclusion;
          const newBody = parts.join("\n\n");
          if (next.variations?.length) {
            const vs = [...next.variations];
            vs[activeVariationIdx] = { ...vs[activeVariationIdx], body: newBody, char_count: newBody.length };
            next.variations = vs;
          }
          next.body = newBody;
        }
        if (r.first_comment) next.first_comment = r.first_comment;
        return next;
      });
      toast.success(`Regenerated ${section.replace("_", " ")}`);
    } catch (e) {
      toast.error("Couldn't regenerate", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setRegenBusy(null);
    }
  }

  async function rescore() {
    if (!content) return;
    setScoring(true);
    try {
      const body = content.variations?.[activeVariationIdx]?.body ?? content.body;
      const res = await runScore({
        data: {
          body, topic, audience,
          post_type: postType === "auto" ? (content.post_type_suggested || "Educational") : postType,
        },
      });
      setContent((prev) => prev ? { ...prev, scores: res.scores, improvements: res.improvements } : prev);
      toast.success("Re-scored");
    } catch (e) {
      toast.error("Couldn't score", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setScoring(false);
    }
  }

  async function save(status: "draft" | "generated") {
    if (!content) return;
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");
      const title = (content.headlines[0] || topic).slice(0, 140);
      const activeBody = content.variations?.[activeVariationIdx]?.body ?? content.body;
      const { data, error } = await supabase
        .from("projects")
        .insert({
          user_id: uid,
          title, topic, audience, tone,
          content_type: "linkedin_post",
          format: "text",
          status,
          publish_status: "unpublished",
          metadata: {
            ...content,
            active_variation_index: activeVariationIdx,
            selected_body: activeBody,
            post_type: postType === "auto" ? content.post_type_suggested : postType,
            writing_style: writingStyle,
            emoji_level: emojiLevel,
            goal, industry, length, language, brand,
            brand_voice_id: brandVoiceId || null,
            brand_voice_desc: voiceDesc,
            hashtag_count: hashtagCount,
            variation_count: variationCount,
          },
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success(status === "draft" ? "Draft saved" : "Post saved");
      navigate({ to: "/linkedin-posts/$id", params: { id: data.id } });
    } catch (e) {
      toast.error("Couldn't save", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  }

  function activeBody(): string {
    return content?.variations?.[activeVariationIdx]?.body ?? content?.body ?? "";
  }

  function currentTitle(): string {
    return (content?.headlines[0] || topic || "linkedin-post").slice(0, 80);
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <HandoffBanner prefill={handoff} onDismiss={() => setHandoff(null)} />
      <div className="flex items-center gap-3">
        <Link to="/linkedin-posts" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
      </div>
      <div>
        <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-3">
          <Linkedin className="w-7 h-7 text-[#0A66C2]" /> LinkedIn <span className="gradient-text">Content Studio</span>
        </h1>
        <p className="text-muted-foreground mt-1">Step {step} of 2 · {step === 1 ? "Configure the post" : "Review, regenerate & export"}</p>
      </div>

      {step === 1 && (
        <div className="glass rounded-2xl p-6 space-y-5">
          {/* Input source + text */}
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Input source</div>
            <div className="flex flex-wrap gap-2">
              {INPUT_SOURCES.map((s) => (
                <button key={s.id} onClick={() => setInputSource(s.id)}
                  className={`px-3 py-1.5 rounded-full text-xs border ${inputSource === s.id ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>{s.label}</button>
              ))}
            </div>
          </div>

          <Field label="Topic *">
            <input value={topic} onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Why most GIS dashboards fail in production"
              className="w-full bg-input/50 border border-border rounded-lg px-4 py-2.5" />
          </Field>

          {inputSource !== "topic" && (
            <Field label={`${INPUT_SOURCES.find((s) => s.id === inputSource)?.label} content`}>
              <textarea value={sourceText} onChange={(e) => setSourceText(e.target.value)}
                rows={4}
                placeholder={
                  inputSource === "url" ? "Paste the URL and a short summary…" :
                  inputSource === "youtube" ? "Paste the video URL and key takeaways…" :
                  inputSource === "article" ? "Paste the article text or key excerpts…" :
                  inputSource === "pdf_text" ? "Paste extracted PDF text here…" :
                  inputSource === "image_desc" ? "Describe the image the AI should reference…" :
                  "Paste your existing post to remix…"
                }
                className="w-full bg-input/50 border border-border rounded-lg px-4 py-2.5" />
              <p className="mt-1 text-[11px] text-muted-foreground">Paste raw text or a URL — AI uses only what you provide (no browsing).</p>
            </Field>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Target audience">
              <input value={audience} onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g. Senior engineering leaders"
                className="w-full bg-input/50 border border-border rounded-lg px-4 py-2.5" />
            </Field>
            <Field label="Industry">
              <input value={industry} onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g. Geospatial / SaaS"
                className="w-full bg-input/50 border border-border rounded-lg px-4 py-2.5" />
            </Field>
          </div>

          <ChipRow label="Post type" options={[...POST_TYPES]} value={postType} onChange={setPostType} labelFor={(o) => o === "auto" ? "Let AI decide" : o} />
          <ChipRow label="Writing style" options={[...WRITING_STYLES]} value={writingStyle} onChange={(v) => setWritingStyle(v as (typeof WRITING_STYLES)[number])} />
          <ChipRow label="Goal" options={GOALS} value={goal} onChange={setGoal} />
          <ChipRow label="Tone" options={TONES} value={tone} onChange={setTone} />

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Length</div>
              <div className="flex flex-wrap gap-2 items-center">
                {LENGTHS.map((l) => (
                  <button key={l} onClick={() => setLength(l)}
                    className={`px-3 py-1.5 rounded-full text-xs border ${length === l ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>{l}</button>
                ))}
                {length === "Custom" && (
                  <input type="number" min={40} max={2000} value={customWords}
                    onChange={(e) => setCustomWords(Number(e.target.value) || 220)}
                    className="w-24 bg-input/50 border border-border rounded-lg px-3 py-1.5 text-xs" />
                )}
                {length === "Custom" && <span className="text-xs text-muted-foreground">words</span>}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Emoji level</div>
              <div className="flex flex-wrap gap-2">
                {EMOJI_LEVELS.map((l) => (
                  <button key={l} onClick={() => setEmojiLevel(l)}
                    className={`px-3 py-1.5 rounded-full text-xs border capitalize ${emojiLevel === l ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>{l}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Variations</div>
              <input type="number" min={1} max={6} value={variationCount}
                onChange={(e) => setVariationCount(Math.max(1, Math.min(6, Number(e.target.value) || 1)))}
                className="w-full bg-input/50 border border-border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Hashtag count</div>
              <input type="number" min={0} max={15} value={hashtagCount}
                onChange={(e) => setHashtagCount(Math.max(0, Math.min(15, Number(e.target.value) || 0)))}
                disabled={!includeHashtags}
                className="w-full bg-input/50 border border-border rounded-lg px-3 py-2 text-sm disabled:opacity-50" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">CTA type</div>
              <div className="flex flex-wrap gap-1.5">
                {CTA_TYPES.map((c) => (
                  <button key={c} onClick={() => setCtaType(c)}
                    className={`px-2.5 py-1 rounded-full text-[11px] border ${ctaType === c ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>{c === "auto" ? "Let AI decide" : c}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Brand voice */}
          <div className="rounded-xl border border-border/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Brand voice</div>
              <button
                onClick={async () => {
                  if (!voiceDesc.trim()) return toast.error("Add a voice description first");
                  const name = (await promptDialog({ title: "Save brand voice", placeholder: "e.g. Friendly founder", confirmText: "Save" })) ?? "";
                  if (!name.trim()) return;
                  const v = saveBrandVoice({ name: name.trim(), description: voiceDesc, writing_style: writingStyle, tone, emoji_level: emojiLevel });
                  setVoices((prev) => [...prev, v]);
                  setBrandVoiceId(v.id);
                  toast.success("Brand voice saved");
                }}
                className="text-[11px] px-2 py-1 rounded-md border border-border/60 hover:bg-white/5"
              >
                Save current as voice
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setBrandVoiceId("")}
                className={`px-3 py-1.5 rounded-full text-xs border ${!brandVoiceId ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>None</button>
              {voices.map((v) => (
                <button key={v.id} onClick={() => setBrandVoiceId(v.id)}
                  className={`px-3 py-1.5 rounded-full text-xs border ${brandVoiceId === v.id ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>{v.name}</button>
              ))}
            </div>
            <Field label="Voice description (used when no preset is selected)">
              <textarea value={voiceDesc} onChange={(e) => setVoiceDesc(e.target.value)}
                rows={2}
                placeholder="e.g. First-person, honest, opinionated. Concrete numbers over adjectives. Never corporate."
                className="w-full bg-input/50 border border-border rounded-lg px-4 py-2 text-sm" />
            </Field>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <Field label="Brand (optional)">
              <input value={brand} onChange={(e) => setBrand(e.target.value)}
                className="w-full bg-input/50 border border-border rounded-lg px-4 py-2.5" />
            </Field>
            <Field label="Preferred CTA (optional)">
              <input value={cta} onChange={(e) => setCta(e.target.value)}
                placeholder="e.g. DM me 'GIS' for the template"
                className="w-full bg-input/50 border border-border rounded-lg px-4 py-2.5" />
            </Field>
            <Field label="Language">
              <input value={language} onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-input/50 border border-border rounded-lg px-4 py-2.5" />
            </Field>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <Toggle label="Include hashtags" value={includeHashtags} onChange={setIncludeHashtags} />
            <Toggle label="Plan a LinkedIn image" value={includeImage} onChange={setIncludeImage} />
            <Toggle label="Plan a document carousel" value={includeCarousel} onChange={setIncludeCarousel} />
            <Toggle label="Use active strategy context" value={useStrategy} onChange={setUseStrategy} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Strategy context is <b>off by default</b> so posts about unrelated topics (kids education, personal projects, etc.) aren&apos;t contaminated with your business project context.
          </p>

          <button onClick={generate} disabled={busy}
            className="rounded-lg gradient-primary text-white px-6 py-2.5 text-sm font-medium flex items-center gap-2 shadow-[var(--shadow-glow)] disabled:opacity-60">
            <Wand2 className="w-4 h-4" /> {busy ? "Generating…" : "Generate LinkedIn post"}
          </button>
        </div>
      )}

      {step === 2 && content && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap gap-2 items-center">
            <button onClick={() => setStep(1)} className="px-3 py-1.5 text-xs rounded-lg border border-border/60 hover:bg-white/5">Back to inputs</button>
            <button onClick={generate} disabled={busy} className="px-3 py-1.5 text-xs rounded-lg border border-border/60 hover:bg-white/5 inline-flex items-center gap-1">
              <Wand2 className="w-3.5 h-3.5" /> {busy ? "Regenerating…" : "Regenerate all"}
            </button>
            <button onClick={rescore} disabled={scoring} className="px-3 py-1.5 text-xs rounded-lg border border-border/60 hover:bg-white/5 inline-flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> {scoring ? "Scoring…" : "Re-score"}
            </button>
            <div className="flex-1" />
            <button onClick={() => save("draft")} disabled={saving} className="px-3 py-1.5 text-xs rounded-lg border border-border/60 hover:bg-white/5 inline-flex items-center gap-1">
              <Save className="w-3.5 h-3.5" /> Save draft
            </button>
            <button onClick={() => save("generated")} disabled={saving} className="px-3 py-1.5 text-xs rounded-lg gradient-primary text-white inline-flex items-center gap-1">
              <Save className="w-3.5 h-3.5" /> Save & open
            </button>
            <button
              onClick={() => toast.message("LinkedIn publishing coming soon", { description: "Connect a LinkedIn account from Connections to enable direct publishing." })}
              className="px-3 py-1.5 text-xs rounded-lg border border-[#0A66C2]/40 text-[#0A66C2] hover:bg-[#0A66C2]/10 inline-flex items-center gap-1"
            >
              <Send className="w-3.5 h-3.5" /> Publish
            </button>
          </div>

          {/* Two-col: editor + preview/score */}
          <div className="grid lg:grid-cols-3 gap-4">
            {/* LEFT — content + variations */}
            <div className="lg:col-span-2 space-y-4">
              {/* Variations tabs */}
              {content.variations && content.variations.length > 0 && (
                <div className="glass rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Variations</div>
                    <div className="text-[11px] text-muted-foreground">
                      {content.post_type_suggested && postType === "auto" ? `AI chose: ${content.post_type_suggested}` : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {content.variations.map((v, i) => (
                      <button key={v.id} onClick={() => setActiveVariationIdx(i)}
                        className={`px-3 py-1.5 rounded-full text-xs border ${activeVariationIdx === i ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>
                        {v.label} · {v.char_count} chars
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={activeBody()}
                    onChange={(e) => setContent((prev) => {
                      if (!prev?.variations) return prev;
                      const vs = [...prev.variations];
                      vs[activeVariationIdx] = { ...vs[activeVariationIdx], body: e.target.value, char_count: e.target.value.length };
                      return { ...prev, variations: vs, body: e.target.value };
                    })}
                    rows={16}
                    className="w-full bg-input/50 border border-border rounded-lg px-4 py-3 text-sm whitespace-pre-wrap"
                  />
                  <MetaRow body={activeBody()} />

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(["hook", "body", "cta", "conclusion", "hashtags", "first_comment"] as const).map((s) => (
                      <button key={s} onClick={() => regen(s)} disabled={regenBusy !== null}
                        className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md border border-border/60 hover:bg-white/5 disabled:opacity-50">
                        <RefreshCw className={`w-3 h-3 ${regenBusy === s ? "animate-spin" : ""}`} /> Regenerate {s.replace("_", " ")}
                      </button>
                    ))}
                    <button onClick={() => copyToClipboard(activeBody()).then(() => toast.success("Copied"))}
                      className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md border border-border/60 hover:bg-white/5">
                      <Copy className="w-3 h-3" /> Copy
                    </button>
                  </div>
                </div>
              )}

              {/* Hooks */}
              <Section title={`Hooks (${content.hooks.length})`}>
                <ul className="space-y-1.5 text-sm">
                  {content.hooks.map((h, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-[color:var(--neon-pink)] w-5">→</span>
                      <span className="flex-1">{h}</span>
                      <button onClick={() => copyToClipboard(h).then(() => toast.success("Copied"))} className="text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /></button>
                    </li>
                  ))}
                </ul>
              </Section>

              {/* Headlines */}
              <Section title="10 headline options">
                <ul className="space-y-1.5 text-sm">
                  {content.headlines.map((h, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-muted-foreground w-5">{i + 1}.</span>
                      <span className="flex-1">{h}</span>
                      <button onClick={() => copyToClipboard(h).then(() => toast.success("Copied"))} className="text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /></button>
                    </li>
                  ))}
                </ul>
              </Section>

              {/* CTAs */}
              <div className="grid md:grid-cols-2 gap-4">
                <Section title="CTA options" copyText={content.cta}>
                  <p className="text-sm mb-2 font-medium">{content.cta}</p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {(content.ctas ?? []).map((c, i) => (
                      <li key={i} className="flex gap-2">
                        <span>•</span>
                        <button className="text-left flex-1 hover:text-foreground" onClick={() => setContent((prev) => prev ? { ...prev, cta: c } : prev)}>{c}</button>
                      </li>
                    ))}
                  </ul>
                </Section>
                <Section title="First comment" copyText={content.first_comment}>
                  <p className="text-sm whitespace-pre-wrap">{content.first_comment}</p>
                </Section>
              </div>

              {/* Hashtags */}
              <Section title="Hashtags" copyText={content.hashtags.join(" ")}>
                {content.hashtag_mix ? (
                  <div className="space-y-2 mb-3">
                    {(["trending", "niche", "broad"] as const).map((k) => (
                      <div key={k}>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{k}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {(content.hashtag_mix?.[k] ?? []).map((h) => (
                            <span key={h} className="text-xs glass px-2 py-1 rounded-full">{h.startsWith("#") ? h : `#${h}`}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/40">
                  {content.hashtags.map((h) => <span key={h} className="text-xs glass px-2 py-1 rounded-full">{h}</span>)}
                </div>
              </Section>

              {/* Image + carousel briefs */}
              {(includeImage || content.image_prompt || (content.image_prompts?.length ?? 0) > 0) && (
                <Section title="LinkedIn image brief">
                  <p className="text-sm text-muted-foreground">{content.image_concept}</p>
                  <p className="text-xs text-muted-foreground/80 mt-2"><span className="font-medium text-foreground">Prompt:</span> {content.image_prompt}</p>
                  <p className="text-xs text-muted-foreground/80 mt-1"><span className="font-medium text-foreground">Alt:</span> {content.accessibility_alt}</p>
                  {(content.image_prompts?.length ?? 0) > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Alternate concepts</div>
                      {content.image_prompts!.map((p, i) => (
                        <div key={i} className="text-xs text-muted-foreground flex gap-2">
                          <span>{i + 1}.</span><span className="flex-1">{p}</span>
                          <button onClick={() => copyToClipboard(p).then(() => toast.success("Copied"))} className="hover:text-foreground"><Copy className="w-3 h-3" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-3">Save the post, then open the <span className="text-foreground">Image</span> tab to render the final 1200×627 / 1080×1080 / 1080×1350 asset.</p>
                </Section>
              )}

              {(includeCarousel || content.carousel_concept || content.carousel_outline?.slides?.length) && (
                <Section title="Document carousel outline">
                  {content.carousel_outline?.cover ? (
                    <div className="space-y-2 text-sm">
                      <div><span className="text-[11px] uppercase text-muted-foreground">Cover</span><div className="font-medium">{content.carousel_outline.cover}</div></div>
                      <ol className="space-y-1.5">
                        {content.carousel_outline.slides.map((s, i) => (
                          <li key={i} className="text-xs">
                            <span className="text-muted-foreground">Slide {i + 1}:</span> <span className="font-medium">{s.title}</span> — <span className="text-muted-foreground">{s.body}</span>
                          </li>
                        ))}
                      </ol>
                      <div><span className="text-[11px] uppercase text-muted-foreground">CTA</span><div className="font-medium">{content.carousel_outline.cta}</div></div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{content.carousel_concept}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-3">Save the post, then open the <span className="text-foreground">Carousel</span> tab to generate, edit, and export the full slide deck (PDF/ZIP).</p>
                </Section>
              )}

              {/* Exports */}
              <div className="glass rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold flex items-center gap-2"><FileDown className="w-4 h-4" /> Export</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ExportBtn label="Copy" onClick={() => copyToClipboard(activeBody()).then(() => toast.success("Copied"))} />
                  <ExportBtn label="Markdown" onClick={() => exportMarkdown(currentTitle(), activeBody(), { title: content.headlines[0], hashtags: content.hashtags, cta: content.cta })} />
                  <ExportBtn label="TXT" onClick={() => exportTxt(currentTitle(), activeBody(), { title: content.headlines[0], hashtags: content.hashtags, cta: content.cta })} />
                  <ExportBtn label="DOC" onClick={() => exportDoc(currentTitle(), activeBody(), { title: content.headlines[0], hashtags: content.hashtags, cta: content.cta })} />
                  <ExportBtn label="PDF" onClick={() => exportPdf(currentTitle(), activeBody(), { title: content.headlines[0], hashtags: content.hashtags, cta: content.cta })} />
                </div>
              </div>
            </div>

            {/* RIGHT — live preview + score */}
            <div className="space-y-4">
              <LivePreview body={activeBody()} hashtags={content.hashtags} />
              <ScorePanel scores={content.scores} improvements={content.improvements} />
              <Section title="Engagement strategy">
                <p className="text-sm whitespace-pre-wrap">{content.engagement_strategy}</p>
              </Section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ------- Presentational -------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">{label}</div>
      {children}
    </label>
  );
}

function ChipRow({ label, options, value, onChange, labelFor }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void; labelFor?: (o: string) => string;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o} onClick={() => onChange(o)}
            className={`px-3 py-1.5 rounded-full text-xs border ${value === o ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>{labelFor ? labelFor(o) : o}</button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="accent-[color:var(--brand-orange)]" />
      <span>{label}</span>
    </label>
  );
}

function Section({ title, children, copyText: c }: { title: string; children: React.ReactNode; copyText?: string }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">{title}</h3>
        {c && (
          <button
            onClick={() => { navigator.clipboard.writeText(c); toast.success("Copied"); }}
            className="text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <Copy className="w-3.5 h-3.5" /> Copy
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function ExportBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="text-xs px-3 py-1.5 rounded-lg border border-border/60 hover:bg-white/5">{label}</button>
  );
}

function MetaRow({ body }: { body: string }) {
  const chars = body.length;
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const readSec = Math.max(15, Math.round(words / 3.5));
  return (
    <div className="mt-2 text-[11px] text-muted-foreground flex flex-wrap gap-3">
      <span>{chars} chars</span>
      <span>{words} words</span>
      <span>≈ {Math.floor(readSec / 60)}:{String(readSec % 60).padStart(2, "0")} read</span>
      <span className={chars > 3000 ? "text-red-400" : chars > 1300 ? "text-amber-400" : "text-emerald-400"}>
        LinkedIn limit 3000
      </span>
    </div>
  );
}

function LivePreview({ body, hashtags }: { body: string; hashtags: string[] }) {
  const [expanded, setExpanded] = useState(true);
  const trimmed = expanded || body.length <= 400 ? body : body.slice(0, 400) + "…";
  return (
    <div className="glass rounded-2xl p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Live LinkedIn preview</div>
      <div className="rounded-xl border border-border/60 bg-white/[0.02] p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0A66C2] to-[color:var(--neon-pink)]" />
          <div className="text-sm">
            <div className="font-semibold">You</div>
            <div className="text-[11px] text-muted-foreground">now · 🌐</div>
          </div>
        </div>
        <div className="text-sm whitespace-pre-wrap leading-relaxed">{trimmed}</div>
        {hashtags.length > 0 && (
          <div className="mt-2 text-sm text-[#0A66C2]">{hashtags.join(" ")}</div>
        )}
        {body.length > 400 && (
          <button onClick={() => setExpanded((v) => !v)} className="mt-2 text-xs text-muted-foreground hover:text-foreground">
            {expanded ? "Show less" : "…see more"}
          </button>
        )}
      </div>
    </div>
  );
}

function ScorePanel({ scores, improvements }: { scores?: LinkedinScoreCard; improvements?: string[] }) {
  if (!scores) return null;
  const rows: [keyof LinkedinScoreCard, string][] = [
    ["engagement", "Engagement"], ["readability", "Readability"], ["professional_tone", "Tone"],
    ["virality", "Virality"], ["storytelling", "Storytelling"], ["cta_strength", "CTA strength"],
  ];
  const overall = Math.round(scores.overall);
  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2"><Star className="w-4 h-4" /> LinkedIn score</h3>
        <div className={`text-3xl font-bold ${overall >= 80 ? "text-emerald-400" : overall >= 60 ? "text-amber-400" : "text-red-400"}`}>{overall}</div>
      </div>
      <div className="space-y-2">
        {rows.map(([k, label]) => {
          const v = Math.round(Number(scores[k] ?? 0));
          return (
            <div key={k}>
              <div className="flex justify-between text-xs mb-1">
                <span>{label}</span><span className="text-muted-foreground">{v}</span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#0A66C2] via-[color:var(--brand-orange)] to-[color:var(--neon-pink)]" style={{ width: `${Math.min(100, v)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {improvements?.length ? (
        <div className="pt-2 border-t border-border/40">
          <div className="text-xs font-semibold mb-2">Suggestions</div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {improvements.map((r, i) => <li key={i}>→ {r}</li>)}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
