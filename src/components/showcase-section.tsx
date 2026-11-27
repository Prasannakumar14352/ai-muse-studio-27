import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Play } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  getPublishedShowcaseVideo,
  listPublishedLandingMedia,
  type LandingMediaRow,
} from "@/lib/landing-media.functions";
import { selectShowcaseItems } from "@/lib/showcase-template";

export function useShowcaseItems() {
  const { data } = useQuery({
    queryKey: ["landing-media-public"],
    queryFn: () => listPublishedLandingMedia(),
    staleTime: 60_000,
  });
  return (data ?? []).filter(
    (row) =>
      row.kind === "showcase" &&
      row.status === "published" &&
      (row.video_url || row.managed_showcase),
  );
}

function provenance(item: LandingMediaRow) {
  switch (item.showcase_metadata?.provenance) {
    case "creatorflow":
      return "CreatorFlow Studio import";
    case "customer":
      return "Customer-submitted example";
    case "demo":
      return "Product demonstration";
    case "external":
      return "External example";
    default:
      return "Showcase example";
  }
}

function details(item: LandingMediaRow) {
  const meta = item.showcase_metadata;
  const duration = meta?.durationSeconds;
  const dimensions = meta?.width && meta.height ? `${meta.width} × ${meta.height}` : "";
  const ratio = dimensions
    ? meta!.width! / meta!.height! > 1.15
      ? "Landscape"
      : meta!.width! / meta!.height! < 0.87
        ? "Portrait"
        : "Square"
    : "";
  return [
    meta?.language,
    duration ? `${Math.round(duration)}s` : item.duration,
    ratio,
    dimensions,
    meta?.template?.style.replaceAll("_", " "),
    item.tool,
  ]
    .filter(Boolean)
    .join(" · ");
}

function ShowcaseDetails({
  item,
  initialMode,
}: {
  item: LandingMediaRow;
  initialMode: "watch" | "prompt";
}) {
  const [watch, setWatch] = useState(initialMode === "watch");
  const [playbackError, setPlaybackError] = useState(false);
  const [copy, setCopy] = useState("");
  const video = useQuery({
    queryKey: ["showcase-playback", item.id],
    enabled: watch,
    queryFn: () => getPublishedShowcaseVideo({ data: { id: item.id } }),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const meta = item.showcase_metadata;
  return (
    <DialogContent className="max-h-[90dvh] max-w-3xl overflow-auto border-white/15 bg-zinc-950 text-white">
      <DialogTitle>{item.title || "Showcase video"}</DialogTitle>
      <DialogDescription>{meta?.description || provenance(item)}</DialogDescription>
      <p className="text-xs text-zinc-400">{details(item)}</p>
      {watch ? (
        video.isFetching && !video.data ? (
          <p role="status">Loading video…</p>
        ) : playbackError || video.isError || !video.data?.url ? (
          <div role="alert" className="rounded-lg border p-4">
            Video playback is unavailable.
            <button
              className="ml-2 underline"
              onClick={() => {
                setPlaybackError(false);
                void video.refetch();
              }}
            >
              Retry
            </button>
          </div>
        ) : (
          <video
            key={video.data.url}
            aria-label={item.title ?? "Showcase video"}
            src={video.data.url}
            poster={item.poster_url ?? undefined}
            controls
            playsInline
            preload="metadata"
            onError={() => setPlaybackError(true)}
            className="max-h-[56dvh] w-full rounded-lg bg-black object-contain"
          />
        )
      ) : (
        <button className="w-fit text-orange-300 underline" onClick={() => setWatch(true)}>
          Watch video
        </button>
      )}
      {item.prompt && (
        <details open={initialMode === "prompt"}>
          <summary className="cursor-pointer font-medium">
            {meta?.promptKind === "original"
              ? "Original prompt"
              : meta?.promptKind === "example"
                ? "Example prompt"
                : "Published prompt"}
          </summary>
          <p className="my-3 whitespace-pre-wrap text-sm text-zinc-300">{item.prompt}</p>
          <button
            type="button"
            className="text-sm underline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(item.prompt!);
                setCopy("Prompt copied.");
              } catch {
                setCopy("Select the prompt to copy it.");
              }
            }}
          >
            Copy prompt
          </button>
          <span role="status" className="ml-2 text-sm">
            {copy}
          </span>
        </details>
      )}
      {meta?.attribution && <p className="text-sm text-zinc-400">Video by {meta.attribution}</p>}
      {meta?.template && (
        <Link
          to="/videos"
          search={{ showcase: item.id }}
          className="w-fit rounded-lg bg-orange-500 px-4 py-2 font-semibold text-black"
        >
          Create similar video
        </Link>
      )}
    </DialogContent>
  );
}

export function ShowcaseSection() {
  const items = useShowcaseItems();
  const [category, setCategory] = useState("");
  const [language, setLanguage] = useState("");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState<{ item: LandingMediaRow; mode: "watch" | "prompt" }>();
  if (!items.length) return null;

  const categories = [
    ...new Set(items.flatMap((item) => item.showcase_metadata?.categories ?? [])),
  ];
  const languages = [
    ...new Set(
      items.flatMap((item) =>
        item.showcase_metadata?.language ? [item.showcase_metadata.language] : [],
      ),
    ),
  ];
  const visible = selectShowcaseItems(items, category, language, term);
  return (
    <section
      id="made-with"
      className="mx-auto max-w-7xl scroll-mt-24 px-6 py-20"
      aria-labelledby="showcase-title"
    >
      <div className="mb-8 max-w-2xl">
        <h2 id="showcase-title" className="text-3xl font-bold md:text-5xl">
          Video showcase
        </h2>
        <p className="mt-3 text-muted-foreground">
          Watch published examples, browse their prompts, and open an editable Studio template.
        </p>
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">
          Search videos and prompts
          <input
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            className="rounded-lg border border-border bg-background p-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Category
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="rounded-lg border border-border bg-background p-2"
          >
            <option value="">All categories</option>
            {categories.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Language
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            className="rounded-lg border border-border bg-background p-2"
          >
            <option value="">All languages</option>
            {languages.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="sr-only" role="status">
        {visible.length} videos
      </p>
      {!visible.length && (
        <p className="text-sm text-muted-foreground">No videos match those filters.</p>
      )}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {visible.map((item, index) => {
          const meta = item.showcase_metadata;
          const featured = index === 0 && meta?.featured;
          return (
            <article
              key={item.id}
              className={`overflow-hidden rounded-xl border border-border bg-card ${featured ? "lg:col-span-2" : ""}`}
            >
              <button
                type="button"
                onClick={() => setOpen({ item, mode: "watch" })}
                aria-label={`Watch ${item.title ?? "showcase video"}`}
                className="relative grid aspect-video w-full place-items-center overflow-hidden bg-black"
              >
                {item.poster_url && (
                  <img
                    src={item.poster_url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="absolute h-full w-full object-contain"
                  />
                )}
                <span className="z-10 rounded-full bg-black/80 p-3 text-orange-300">
                  <Play aria-hidden className="h-5 w-5" />
                </span>
              </button>
              <div className="space-y-2 p-4">
                <p className="text-xs text-orange-300">{provenance(item)}</p>
                <h3 className="text-lg font-semibold">{item.title || "Showcase video"}</h3>
                <p className="text-xs text-muted-foreground">{details(item)}</p>
                {meta?.categories.length ? (
                  <p className="text-xs text-muted-foreground">{meta.categories.join(" · ")}</p>
                ) : null}
                <div className="flex flex-wrap gap-3 pt-2 text-sm">
                  <button
                    className="underline"
                    type="button"
                    onClick={() => setOpen({ item, mode: "watch" })}
                  >
                    Watch video
                  </button>
                  {item.prompt && (
                    <button
                      className="underline"
                      type="button"
                      onClick={() => setOpen({ item, mode: "prompt" })}
                    >
                      View prompt
                    </button>
                  )}
                  {meta?.template && (
                    <Link
                      className="font-medium text-orange-300"
                      to="/videos"
                      search={{ showcase: item.id }}
                    >
                      Create similar video
                    </Link>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <Dialog
        open={Boolean(open)}
        onOpenChange={(value) => {
          if (!value) setOpen(undefined);
        }}
      >
        {open && <ShowcaseDetails key={open.item.id} item={open.item} initialMode={open.mode} />}
      </Dialog>
    </section>
  );
}
