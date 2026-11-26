// One generated creative: renders its slides off-screen at full size, exports + uploads them,
// then shows the PNGs with Download / Copy caption.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Download, Copy, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PromoCreativeView } from "@/lib/promo-studio.functions";
import { PromoSlide, slideCount } from "./templates";
import type { Brand } from "./templates/parts";
import { promoFontCss } from "./fonts";
import { downloadCreative, exportSlide, toBlobUrl, uploadRender } from "./render";

type Phase = "loading" | "rendering" | "done" | "overflow" | "error";

export function CreativeCard({
  creative,
  brand: brandProp,
  onRendered,
}: {
  creative: PromoCreativeView;
  brand: Brand;
  onRendered?: (outputUrls: string[]) => void;
}) {
  const alreadyRendered = creative.outputUrls.length > 0;
  // Snapshot brand once: the studio query refetches with new signed URLs, which must not re-render cards.
  const [brand] = useState(brandProp);
  const [local, setLocal] = useState<{ c: PromoCreativeView; brand: Brand } | null>(null);
  const [phase, setPhase] = useState<Phase>(alreadyRendered ? "done" : "loading");
  const [error, setError] = useState("");
  const [urls, setUrls] = useState<string[]>(creative.outputUrls);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [renderAttempt, setRenderAttempt] = useState(0);
  const overflow = useRef<boolean[]>([]);
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const blobUrls = useRef<string[]>([]);
  const n = slideCount(creative);

  // Revoke blob URLs only when the card unmounts (never mid-export).
  useEffect(() => () => blobUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // 1) Pull every image into blob: URLs (same-origin for html-to-image).
  useEffect(() => {
    if (alreadyRendered && loadAttempt === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const [logo, bg, before, ...shots] = await Promise.all([
          toBlobUrl(brand.logoUrl),
          toBlobUrl(creative.backgroundUrl),
          toBlobUrl(creative.beforeUrl),
          ...creative.assetUrls.map((u) => toBlobUrl(u)),
        ]);
        blobUrls.current.push(...([logo, bg, before, ...shots].filter(Boolean) as string[]));
        if (cancelled) return;
        setLocal({
          c: {
            ...creative,
            backgroundUrl: bg,
            beforeUrl: before,
            assetUrls: shots.filter(Boolean) as string[],
          },
          brand: { ...brand, logoUrl: logo },
        });
        setPhase("rendering");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creative.id, loadAttempt]);

  // 2) Once mounted with fonts, export + upload.
  useEffect(() => {
    if (phase !== "rendering" || !local) return;
    let cancelled = false;
    (async () => {
      try {
        const css = await promoFontCss(creative.language);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        if (overflow.current.some(Boolean)) {
          setPhase("overflow");
          return;
        }
        const slides = [];
        for (let i = 0; i < n; i++) {
          const node = nodes.current[i]?.querySelector<HTMLElement>("[data-render-root]");
          if (!node) throw new Error("Slide not ready");
          slides.push(await exportSlide(node, creative.size, css, brand.colors.primary));
        }
        const { outputUrls } = await uploadRender(creative.id, creative.textVersion, slides);
        if (!cancelled) {
          setUrls(outputUrls);
          setPhase("done");
          onRendered?.(outputUrls);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, local, renderAttempt]);

  const retry = () => {
    if (!local) {
      setPhase("loading");
      setLoadAttempt((a) => a + 1);
    } else {
      setPhase("rendering");
      setRenderAttempt((a) => a + 1);
    }
  };

  const caption = `${creative.caption}\n\n${creative.hashtags.join(" ")}`;

  return (
    <div className="rounded-xl border bg-card p-3 space-y-3">
      <div className="flex gap-2 overflow-x-auto">
        {phase === "done" ? (
          urls.map((u, i) => (
            <img
              key={u}
              src={u}
              alt={`Slide ${i + 1}`}
              className="h-56 rounded-md border object-contain"
            />
          ))
        ) : (
          <div className="flex h-56 w-full items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">
            {phase === "loading" || phase === "rendering" ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Rendering…
              </span>
            ) : phase === "overflow" ? (
              <span className="flex items-center gap-2 px-4 text-amber-600">
                <AlertTriangle className="h-4 w-4" /> Headline too long, shorten it (editing comes
                with the Library).
              </span>
            ) : (
              <span className="px-4 text-destructive">{error}</span>
            )}
          </div>
        )}
      </div>

      <div className="text-sm">
        <div className="font-semibold">{creative.headline}</div>
        <div className="text-muted-foreground line-clamp-3 whitespace-pre-line">
          {creative.caption}
        </div>
      </div>

      {creative.copyWarnings.length > 0 && (
        <ul className="text-xs text-amber-600 list-disc pl-4">
          {creative.copyWarnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={phase !== "done"}
          onClick={() => downloadCreative(creative, urls).catch((e) => toast.error(String(e)))}
        >
          <Download className="mr-1 h-4 w-4" /> Download
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            navigator.clipboard.writeText(caption).then(() => toast.success("Caption copied"))
          }
        >
          <Copy className="mr-1 h-4 w-4" /> Copy caption
        </Button>
        {phase === "error" && (
          <Button size="sm" variant="outline" onClick={retry}>
            <RefreshCw className="mr-1 h-4 w-4" /> Retry render
          </Button>
        )}
      </div>

      {/* Full-size slides, off-screen, used only for export. */}
      {local && (
        <div aria-hidden style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }}>
          {Array.from({ length: n }, (_, i) => (
            <div
              key={i}
              ref={(el) => {
                nodes.current[i] = el;
              }}
            >
              <PromoSlide
                c={local.c}
                index={i}
                brand={local.brand}
                onOverflow={(o) => {
                  overflow.current[i] = o;
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
