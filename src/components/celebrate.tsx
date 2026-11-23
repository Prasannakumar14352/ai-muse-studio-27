// "It's ready 🎉" moment shown when a long job (a video render, a promo) finishes.
//
// Usage:
//   import { celebrate } from "@/components/celebrate";
//   celebrate({ title: "Your video is ready!", subtitle: "74s · saved to Projects", videoUrl });
//
// Requires <CelebrateHost /> mounted once (the app shell does this).

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarPlus, Download, PartyPopper } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type CelebrateOptions = {
  title: string;
  subtitle?: string;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  /** Suggested file name for the Download button (only shown when videoUrl is set). */
  downloadName?: string;
  /** Label for the main button; it just closes the pop-up so the user sees the result page. */
  primaryLabel?: string;
};

const EVENT = "cf:celebrate";

export function celebrate(options: CelebrateOptions) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CelebrateOptions>(EVENT, { detail: options }));
}

export function CelebrateHost() {
  const [opts, setOpts] = useState<CelebrateOptions | null>(null);

  useEffect(() => {
    const on = (e: Event) => setOpts((e as CustomEvent<CelebrateOptions>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  const close = () => setOpts(null);

  return (
    <Dialog open={!!opts} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-md text-center p-7">
        {opts && (
          <div className="flex flex-col items-center gap-4">
            {opts.videoUrl ? (
              <video
                src={opts.videoUrl}
                poster={opts.thumbnailUrl ?? undefined}
                className="max-h-[300px] w-auto rounded-2xl border border-border bg-black"
                controls
                autoPlay
                muted
                playsInline
              />
            ) : opts.thumbnailUrl ? (
              <img src={opts.thumbnailUrl} alt="" className="max-h-[260px] w-auto rounded-2xl border border-border" />
            ) : (
              <div className="grid h-20 w-20 place-items-center rounded-full bg-primary/15">
                <PartyPopper className="h-9 w-9 text-primary" />
              </div>
            )}
            <div className="space-y-1.5">
              <DialogTitle className="text-2xl">🎉 {opts.title}</DialogTitle>
              {opts.subtitle && <DialogDescription>{opts.subtitle}</DialogDescription>}
            </div>
            <div className="flex w-full flex-col sm:flex-row gap-2">
              {opts.videoUrl && (
                <Button asChild variant="secondary" className="flex-1">
                  <a href={opts.videoUrl} download={opts.downloadName ?? true} target="_blank" rel="noreferrer">
                    <Download /> Download
                  </a>
                </Button>
              )}
              <Button asChild variant="secondary" className="flex-1" onClick={close}>
                <Link to="/calendar"><CalendarPlus /> Schedule</Link>
              </Button>
              <Button className="flex-1" onClick={close}>{opts.primaryLabel ?? "View it"}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
