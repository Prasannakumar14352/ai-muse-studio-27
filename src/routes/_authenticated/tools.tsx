// AI Tools — coming soon. Explains the upcoming one-click tools and records
// interest per tool; nothing here generates content or spends credits yet.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Bell, Check, Wand2 } from "lucide-react";
import { trackFunnelEvent } from "@/lib/tracking.functions";
import { COMING_SOON_TOOLS, type ToolInterestEvent } from "@/lib/coming-soon-tools";

export const Route = createFileRoute("/_authenticated/tools")({
  head: () => ({ meta: [{ title: "AI Tools — coming soon · CreatorFlow AI" }] }),
  component: ToolsComingSoon,
});

function ToolsComingSoon() {
  const track = useServerFn(trackFunnelEvent);
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  async function notify(id: ToolInterestEvent, title: string) {
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
        <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-semibold rounded-full px-2.5 py-1 bg-white/[0.06] text-muted-foreground border border-border">
          <Wand2 className="w-3.5 h-3.5" /> Coming soon
        </span>
        <h1 className="text-3xl md:text-4xl font-bold">AI <span className="gradient-text">Tools</span></h1>
        <p className="text-muted-foreground max-w-2xl">
          One-click tools to finish your content — subtitles, clean cut-outs, HD quality, talking avatars and
          auto-assembled videos. Tap "Notify me" on the ones you want first.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {COMING_SOON_TOOLS.map((t) => {
          const done = !!saved[t.id];
          return (
            <div key={t.id} className="glass rounded-2xl p-5 border border-border flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                  <t.icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] uppercase tracking-widest font-semibold rounded-full px-2 py-0.5 bg-white/[0.06] text-muted-foreground border border-border">
                  Soon
                </span>
              </div>
              <div className="font-semibold">{t.title}</div>
              <p className="text-sm text-muted-foreground">{t.text}</p>
              <ul className="text-xs text-muted-foreground space-y-1 flex-1">
                {t.points.map((p) => (
                  <li key={p} className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" /> {p}
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

      <div className="glass rounded-2xl p-5 border border-border text-sm text-muted-foreground">
        Until then, make videos, images and voiceovers in <Link to="/videos" className="underline text-foreground">Projects</Link> or
        {" "}<Link to="/create" className="underline text-foreground">AI Studio</Link>.
      </div>
    </div>
  );
}
