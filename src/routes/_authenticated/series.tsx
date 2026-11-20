// Series Autopilot — coming soon. A board that explains the feature and
// records interest; nothing here creates or posts content yet.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Bell, CalendarClock, Check, Clapperboard, ListOrdered, Repeat, Send, Sparkles } from "lucide-react";
import { trackFunnelEvent } from "@/lib/tracking.functions";

export const Route = createFileRoute("/_authenticated/series")({
  head: () => ({ meta: [{ title: "Series Autopilot — coming soon · CreatorFlow AI" }] }),
  component: SeriesComingSoon,
});

const STEPS = [
  { icon: ListOrdered, title: "Describe the series", text: "Pick a niche, language, video length, style and voice, and how many episodes." },
  { icon: CalendarClock, title: "Choose channel and schedule", text: "Select your connected channel and the days and time each episode goes out." },
  { icon: Sparkles, title: "AI plans the season", text: "Episode titles, hooks and full scripts — review or edit any episode before it's made." },
  { icon: Clapperboard, title: "Videos are made for you", text: "Scenes, voiceover, captions and thumbnail for every episode, ahead of its date." },
  { icon: Send, title: "Posted on schedule", text: "Each episode publishes at its time, in order. Pause, skip or reorder any time." },
];

function SeriesComingSoon() {
  const track = useServerFn(trackFunnelEvent);
  const [saved, setSaved] = useState(false);

  async function notify() {
    try {
      await track({ data: { event: "series_interest", meta: { page: "series" } } });
      setSaved(true);
      toast.success("Thanks — we'll let you know when Series Autopilot launches.");
    } catch {
      toast.error("Couldn't save that — please try again.");
    }
  }

  return (
    <div className="max-w-5xl space-y-8">
      <div className="space-y-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-semibold rounded-full px-2.5 py-1 bg-violet-500/15 text-violet-200 border border-violet-400/20">
          <Repeat className="w-3.5 h-3.5" /> Coming soon
        </span>
        <h1 className="text-3xl md:text-4xl font-bold">Series <span className="gradient-text">Autopilot</span></h1>
        <p className="text-muted-foreground max-w-2xl">
          Set up a video series once — niche, language, schedule and channel — and CreatorFlow plans the episodes,
          writes the scripts, makes the videos and posts them in order. For paid plans.
        </p>
      </div>

      <ol className="grid md:grid-cols-5 gap-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="glass rounded-2xl p-4 border border-white/10 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center font-semibold text-foreground">{i + 1}</span>
              <s.icon className="w-4 h-4" />
            </div>
            <div className="font-semibold text-sm">{s.title}</div>
            <p className="text-xs text-muted-foreground">{s.text}</p>
          </li>
        ))}
      </ol>

      <div className="glass rounded-2xl p-5 border border-white/10 flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground max-w-xl">
          Until then, you can make each episode in <Link to="/videos" className="underline text-foreground">Video Studio</Link> and
          schedule it from the project's Publish button.
        </div>
        <button onClick={notify} disabled={saved}
          className="rounded-lg gradient-primary text-white px-4 py-2 text-sm inline-flex items-center gap-2 disabled:opacity-70">
          {saved ? <Check className="w-4 h-4" /> : <Bell className="w-4 h-4" />} {saved ? "You're on the list" : "Notify me when it launches"}
        </button>
      </div>
    </div>
  );
}
