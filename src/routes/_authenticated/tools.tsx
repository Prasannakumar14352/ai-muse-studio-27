// AI Tools — coming soon. Explains the upcoming one-click tools and records
// interest per tool; nothing here generates content or spends credits yet.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Bell, Captions, Check, Clapperboard, Eraser, MonitorUp, Mic, Wand2 } from "lucide-react";
import { trackFunnelEvent } from "@/lib/tracking.functions";

export const Route = createFileRoute("/_authenticated/tools")({
  head: () => ({ meta: [{ title: "AI Tools — coming soon · CreatorFlow AI" }] }),
  component: ToolsComingSoon,
});

type ToolEvent =
  | "tool_subtitles_interest"
  | "tool_bg_remove_interest"
  | "tool_upscale_interest"
  | "tool_talking_photo_interest"
  | "tool_scene_stitch_interest";

const TOOLS: ReadonlyArray<{ id: ToolEvent; icon: typeof Wand2; title: string; text: string; points: string[] }> = [
  {
    id: "tool_subtitles_interest",
    icon: Captions,
    title: "Auto Subtitles",
    text: "Upload a video or use one from your projects — we transcribe the speech and burn in styled, word-by-word captions.",
    points: ["Telugu, Hindi, English and more", "Reel-style animated caption themes", "Download .srt or burned-in MP4"],
  },
  {
    id: "tool_bg_remove_interest",
    icon: Eraser,
    title: "Background Remover",
    text: "Cut out the subject of any image in one click — ready for thumbnails, product posts and carousels.",
    points: ["Transparent PNG output", "Swap in a colour or new background", "Works with your Media Library"],
  },
  {
    id: "tool_upscale_interest",
    icon: MonitorUp,
    title: "HD Upscaler",
    text: "Sharpen low-resolution images and videos up to Full HD (1080p) and beyond without losing detail.",
    points: ["Images up to 4×", "Videos to 1080p", "One click from any project"],
  },
  {
    id: "tool_talking_photo_interest",
    icon: Mic,
    title: "Talking Photo",
    text: "Turn a single photo into a speaking avatar, lip-synced to your script or AI voiceover in any language.",
    points: ["Use your own or an AI voice", "Multilingual lip-sync", "Perfect for faceless channels"],
  },
  {
    id: "tool_scene_stitch_interest",
    icon: Clapperboard,
    title: "Scene Stitcher",
    text: "Join several clips with a voiceover and music into one finished 30–60 second video, assembled automatically.",
    points: ["Auto timing to the voiceover", "Transitions and captions included", "Publish straight to YouTube"],
  },
];

function ToolsComingSoon() {
  const track = useServerFn(trackFunnelEvent);
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  async function notify(id: ToolEvent, title: string) {
    try {
      await track({ data: { event: id, meta: { page: "tools" } } });
      setSaved((s) => ({ ...s, [id]: true }));
      toast.success(`Thanks — we'll let you know when ${title} launches.`);
    } catch {
      toast.error("Couldn't save that — please try again.");
    }
  }

  return (
    <div className="max-w-5xl space-y-8">
      <div className="space-y-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-semibold rounded-full px-2.5 py-1 bg-violet-500/15 text-violet-200 border border-violet-400/20">
          <Wand2 className="w-3.5 h-3.5" /> Coming soon
        </span>
        <h1 className="text-3xl md:text-4xl font-bold">AI <span className="gradient-text">Tools</span></h1>
        <p className="text-muted-foreground max-w-2xl">
          One-click tools to finish your content — subtitles, clean cut-outs, HD quality, talking avatars and
          auto-assembled videos. Tap "Notify me" on the ones you want first.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {TOOLS.map((t) => {
          const done = !!saved[t.id];
          return (
            <div key={t.id} className="glass rounded-2xl p-5 border border-white/10 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                  <t.icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] uppercase tracking-widest font-semibold rounded-full px-2 py-0.5 bg-violet-500/15 text-violet-200 border border-violet-400/20">
                  Soon
                </span>
              </div>
              <div className="font-semibold">{t.title}</div>
              <p className="text-sm text-muted-foreground">{t.text}</p>
              <ul className="text-xs text-muted-foreground space-y-1 flex-1">
                {t.points.map((p) => (
                  <li key={p} className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-violet-300" /> {p}
                  </li>
                ))}
              </ul>
              <button onClick={() => notify(t.id, t.title)} disabled={done}
                className="rounded-lg gradient-primary text-white px-3 py-2 text-sm inline-flex items-center justify-center gap-2 disabled:opacity-70">
                {done ? <Check className="w-4 h-4" /> : <Bell className="w-4 h-4" />} {done ? "You're on the list" : "Notify me"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="glass rounded-2xl p-5 border border-white/10 text-sm text-muted-foreground">
        Until then, make videos, images and voiceovers in <Link to="/videos" className="underline text-foreground">Projects</Link> or
        {" "}<Link to="/create" className="underline text-foreground">AI Studio</Link>.
      </div>
    </div>
  );
}
