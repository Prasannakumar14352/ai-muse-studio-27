import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateLinkedinPost, type LinkedinPostContent } from "@/lib/linkedin-ai.functions";
import { Linkedin, Wand2, ArrowLeft, Copy, Save } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { consumeResearchPrefill, type ResearchPrefill } from "@/lib/research-prefill";
import { HandoffBanner } from "@/components/handoff-banner";

export const Route = createFileRoute("/_authenticated/linkedin-posts/new")({
  component: NewLinkedinPostPage,
});

const POST_TYPES = [
  "Educational", "Personal Story", "Thought Leadership", "Industry Insight",
  "Company Update", "Product Launch", "Case Study", "Tips",
  "Career Advice", "Software Development", "GIS", "AI News",
  "Marketing", "Business", "Custom",
];
const GOALS = [
  "Build authority", "Generate engagement", "Generate leads", "Promote a product",
  "Share knowledge", "Announce an update", "Drive website traffic", "Recruit",
  "Build personal brand", "Custom",
];
const LENGTHS = ["Short", "Medium", "Long", "Custom"] as const;
const TONES = [
  "Professional", "Conversational", "Authoritative", "Educational",
  "Story-driven", "Inspirational", "Bold", "Minimal", "Technical", "Custom",
];

function NewLinkedinPostPage() {
  const navigate = useNavigate();
  const run = useServerFn(generateLinkedinPost);

  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState<LinkedinPostContent | null>(null);

  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [industry, setIndustry] = useState("");
  const [goal, setGoal] = useState("Build authority");
  const [tone, setTone] = useState("Professional");
  const [postType, setPostType] = useState("Educational");
  const [length, setLength] = useState<(typeof LENGTHS)[number]>("Medium");
  const [customWords, setCustomWords] = useState<number>(220);
  const [brand, setBrand] = useState("");
  const [cta, setCta] = useState("");
  const [language, setLanguage] = useState("English");
  const [includeImage, setIncludeImage] = useState(false);
  const [includeCarousel, setIncludeCarousel] = useState(false);
  const [includeHashtags, setIncludeHashtags] = useState(true);

  async function generate() {
    if (!topic.trim()) return toast.error("Enter a topic");
    setBusy(true);
    try {
      const res = await run({
        data: {
          topic, audience, industry, goal, tone,
          post_type: postType, length,
          custom_length_words: length === "Custom" ? customWords : undefined,
          brand, cta, language,
          include_image: includeImage,
          include_carousel: includeCarousel,
          include_hashtags: includeHashtags,
        },
      });
      setContent(res.content);
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

  async function save(status: "draft" | "generated") {
    if (!content) return;
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");
      const title = (content.headlines[0] || topic).slice(0, 140);
      const { data, error } = await supabase
        .from("projects")
        .insert({
          user_id: uid,
          title,
          topic,
          audience,
          tone,
          content_type: "linkedin_post",
          format: "text",
          status,
          publish_status: "unpublished",
          metadata: {
            ...content,
            post_type: postType,
            goal,
            industry,
            length,
            language,
            brand,
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

  async function copyText(text: string, label = "Copied") {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link to="/linkedin-posts" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
      </div>
      <div>
        <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-3">
          <Linkedin className="w-7 h-7 text-[#0A66C2]" /> New <span className="gradient-text">LinkedIn Post</span>
        </h1>
        <p className="text-muted-foreground mt-1">Step {step} of 2 · {step === 1 ? "Post details" : "Review & save"}</p>
      </div>

      {step === 1 && (
        <div className="glass rounded-2xl p-6 space-y-5">
          <Field label="Topic *">
            <input value={topic} onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Why most GIS dashboards fail in production"
              className="w-full bg-input/50 border border-border rounded-lg px-4 py-2.5" />
          </Field>

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

          <ChipRow label="Post type" options={POST_TYPES} value={postType} onChange={setPostType} />
          <ChipRow label="Goal" options={GOALS} value={goal} onChange={setGoal} />
          <ChipRow label="Tone" options={TONES} value={tone} onChange={setTone} />

          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Length</div>
            <div className="flex flex-wrap gap-2 items-center">
              {LENGTHS.map((l) => (
                <button key={l} onClick={() => setLength(l)}
                  className={`px-3 py-1.5 rounded-full text-xs border ${length === l ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>{l}</button>
              ))}
              {length === "Custom" && (
                <input
                  type="number" min={40} max={2000}
                  value={customWords}
                  onChange={(e) => setCustomWords(Number(e.target.value) || 220)}
                  className="w-24 bg-input/50 border border-border rounded-lg px-3 py-1.5 text-xs"
                />
              )}
              {length === "Custom" && <span className="text-xs text-muted-foreground">words</span>}
            </div>
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
          </div>
          <p className="text-[11px] text-muted-foreground">
            After you save this post, open it to generate the final LinkedIn image and document carousel in the built-in studios.
          </p>

          <button
            onClick={generate}
            disabled={busy}
            className="rounded-lg gradient-primary text-white px-6 py-2.5 text-sm font-medium flex items-center gap-2 shadow-[var(--shadow-glow)] disabled:opacity-60"
          >
            <Wand2 className="w-4 h-4" /> {busy ? "Generating…" : "Generate LinkedIn post"}
          </button>
        </div>
      )}

      {step === 2 && content && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setStep(1)} className="px-3 py-1.5 text-xs rounded-lg border border-border/60 hover:bg-white/5">Back to inputs</button>
            <button onClick={generate} disabled={busy} className="px-3 py-1.5 text-xs rounded-lg border border-border/60 hover:bg-white/5 inline-flex items-center gap-1">
              <Wand2 className="w-3.5 h-3.5" /> {busy ? "Regenerating…" : "Regenerate"}
            </button>
            <button onClick={() => save("draft")} disabled={saving} className="px-3 py-1.5 text-xs rounded-lg border border-border/60 hover:bg-white/5 inline-flex items-center gap-1">
              <Save className="w-3.5 h-3.5" /> Save as draft
            </button>
            <button onClick={() => save("generated")} disabled={saving} className="px-3 py-1.5 text-xs rounded-lg gradient-primary text-white inline-flex items-center gap-1">
              <Save className="w-3.5 h-3.5" /> Save & open
            </button>
          </div>

          <Section title="Recommended hook">
            <p className="text-sm whitespace-pre-wrap">{content.recommended_hook}</p>
          </Section>

          <Section title="Post body" copyText={content.body}>
            <textarea
              value={content.body}
              onChange={(e) => setContent({ ...content, body: e.target.value })}
              rows={14}
              className="w-full bg-input/50 border border-border rounded-lg px-4 py-3 text-sm whitespace-pre-wrap"
            />
          </Section>

          <Section title="Alternate version" copyText={content.alternate_body}>
            <textarea
              value={content.alternate_body}
              onChange={(e) => setContent({ ...content, alternate_body: e.target.value })}
              rows={8}
              className="w-full bg-input/50 border border-border rounded-lg px-4 py-3 text-sm"
            />
          </Section>

          <div className="grid md:grid-cols-2 gap-4">
            <Section title="10 headline options">
              <ul className="space-y-1.5 text-sm">
                {content.headlines.map((h, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-muted-foreground w-5">{i + 1}.</span>
                    <span className="flex-1">{h}</span>
                    <button onClick={() => copyText(h)} className="text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /></button>
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="5 hooks">
              <ul className="space-y-1.5 text-sm">
                {content.hooks.map((h, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-[color:var(--neon-pink)] w-5">→</span>
                    <span className="flex-1">{h}</span>
                    <button onClick={() => copyText(h)} className="text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /></button>
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Section title="CTA" copyText={content.cta}>
              <p className="text-sm">{content.cta}</p>
            </Section>
            <Section title="First comment" copyText={content.first_comment}>
              <p className="text-sm whitespace-pre-wrap">{content.first_comment}</p>
            </Section>
          </div>

          <Section title="Hashtags" copyText={content.hashtags.join(" ")}>
            <div className="flex flex-wrap gap-1.5">
              {content.hashtags.map((h) => <span key={h} className="text-xs glass px-2 py-1 rounded-full">{h}</span>)}
            </div>
          </Section>

          <Section title="Engagement strategy">
            <p className="text-sm whitespace-pre-wrap">{content.engagement_strategy}</p>
          </Section>

          {(includeImage || content.image_prompt) && (
            <Section title="LinkedIn image brief">
              <p className="text-sm text-muted-foreground">{content.image_concept}</p>
              <p className="text-xs text-muted-foreground/80 mt-2"><span className="font-medium text-foreground">Prompt:</span> {content.image_prompt}</p>
              <p className="text-xs text-muted-foreground/80 mt-1"><span className="font-medium text-foreground">Alt:</span> {content.accessibility_alt}</p>
              <p className="text-[11px] text-muted-foreground mt-3">Save the post, then open the <span className="text-foreground">Image</span> tab to render the final 1200×627 / 1080×1080 / 1080×1350 asset.</p>
            </Section>
          )}

          {(includeCarousel || content.carousel_concept) && (
            <Section title="Document carousel brief">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{content.carousel_concept}</p>
              <p className="text-[11px] text-muted-foreground mt-3">Save the post, then open the <span className="text-foreground">Carousel</span> tab to generate, edit, and export the full slide deck (PDF/ZIP).</p>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">{label}</div>
      {children}
    </label>
  );
}

function ChipRow({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o} onClick={() => onChange(o)}
            className={`px-3 py-1.5 rounded-full text-xs border ${value === o ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>{o}</button>
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
