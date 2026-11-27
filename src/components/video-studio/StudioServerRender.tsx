import { useEffect, useRef, useState } from "react";
import { renderControl, submitStudioRender } from "@/lib/studio-server-render";
import type { AssetGenerationBundle } from "@/lib/video-agents";
import type { VideoExportSettings } from "@/lib/video-export";

const pending = ["queued", "preparing_assets", "rendering", "encoding", "validating", "uploading"];

export function StudioServerRender({
  jobId,
  bundle,
  settings,
  blocked,
  beforeSubmit,
}: {
  jobId?: string;
  bundle?: AssetGenerationBundle;
  settings?: VideoExportSettings;
  blocked?: boolean;
  beforeSubmit?: () => Promise<void>;
}) {
  const [available, setAvailable] = useState(false);
  const [fourK, setFourK] = useState(false);
  const [resolution, setResolution] = useState<"720p" | "1080p" | "4k">();
  const [ack, setAck] = useState(false);
  const [id, setId] = useState("");
  useEffect(() => {
    setId(localStorage.getItem("creatorflow:last-professional-render") ?? "");
  }, []);
  const [state, setState] = useState<Awaited<ReturnType<typeof renderControl>>>();
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const submission = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch("/api/professional-render", { signal: controller.signal });
        const status = await response.json();
        setAvailable(response.ok && status.available === true);
        setFourK(response.ok && status.fourK === true);
      } catch {
        if (!controller.signal.aborted) setAvailable(false);
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
      submission.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const status = await renderControl({ id, operation: "status" }, controller.signal);
        if (!controller.signal.aborted) {
          setState(status);
          setError("");
          timer = setTimeout(() => void poll(), pending.includes(status.status) ? 2500 : 60000);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Could not read render status");
          timer = setTimeout(() => void poll(), 10000);
        }
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id]);

  async function start() {
    if (!bundle || !jobId || !settings || !ack || blocked || !available) return;
    const controller = new AbortController();
    submission.current = controller;
    setUploading(true);
    setError("");
    try {
      await beforeSubmit?.();
      const job = await submitStudioRender(
        jobId,
        bundle,
        {
          ...settings,
          resolution: resolution ?? settings.resolution,
        },
        controller.signal,
      );
      localStorage.setItem("creatorflow:last-professional-render", job.id);
      setId(job.id);
      setState(job);
    } catch (err) {
      if (!controller.signal.aborted)
        setError(err instanceof Error ? err.message : "Could not queue render");
    } finally {
      submission.current = null;
      setUploading(false);
    }
  }

  async function control(operation: "cancel" | "retry") {
    try {
      setState(await renderControl({ id, operation }));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update render");
    }
  }

  if (!bundle && !id) return null;
  return (
    <section className="space-y-2 rounded-xl border border-border p-4 text-sm">
      <h3 className="font-semibold">Server render</h3>
      <p>{available ? "Worker online" : "Worker unavailable"}</p>
      {bundle && settings && (
        <>
          <label className="flex gap-2">
            Server MP4 resolution
            <select
              value={resolution ?? settings.resolution}
              className="rounded border bg-background"
              onChange={(event) => setResolution(event.target.value as typeof resolution)}
            >
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
              {fourK && <option value="4k">4K</option>}
            </select>
          </label>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={ack}
              onChange={(event) => setAck(event.target.checked)}
            />
            Use cuts and supported flash transitions, still-image movements and scene text. Other
            transitions, camera effects and timed subtitles use browser render.
          </label>
          <button
            type="button"
            className="underline disabled:opacity-50"
            disabled={
              !available ||
              blocked ||
              !ack ||
              uploading ||
              pending.includes(state?.status ?? "") ||
              (resolution === "4k" && !fourK)
            }
            onClick={() => void start()}
          >
            {uploading ? "Uploading original assets…" : "Queue server MP4"}
          </button>
          {uploading && (
            <button
              type="button"
              className="ml-3 underline"
              onClick={() => submission.current?.abort()}
            >
              Cancel preparation
            </button>
          )}
        </>
      )}
      {id && (
        <div className="space-y-1">
          <p>Job {id}</p>
          <p role="status">
            {(state?.status ?? "Connecting").replaceAll("_", " ")}
            {state?.progress !== undefined && ` · ${Math.round(state.progress * 100)}%`}
          </p>
          {state?.error && <p role="alert">{state.error}</p>}
          {state?.output_metadata && (
            <p>
              {state.output_metadata.width} × {state.output_metadata.height} ·{" "}
              {state.output_metadata.fps} FPS · {state.output_metadata.duration.toFixed(2)}s
            </p>
          )}
          {state?.output_metadata?.quality && (
            <p>
              Sampled peak {state.output_metadata.quality.peakDbfs ?? "unavailable"} dBFS ·{" "}
              {state.output_metadata.quality.blackIntervals} dark intervals ·{" "}
              {state.output_metadata.quality.freezeCandidates} static candidates. Review intentional
              stills and fades.
            </p>
          )}
          {state?.url && (
            <a className="underline" href={state.url}>
              Download MP4
            </a>
          )}
          {pending.includes(state?.status ?? "") && (
            <button type="button" className="underline" onClick={() => void control("cancel")}>
              Cancel server job
            </button>
          )}
          {["failed", "cancelled"].includes(state?.status ?? "") && (
            <button
              type="button"
              className="underline disabled:opacity-50"
              disabled={!available}
              onClick={() => void control("retry")}
            >
              Retry with the same assets
            </button>
          )}
          {!pending.includes(state?.status ?? "queued") && (
            <button
              type="button"
              className="ml-3 underline"
              onClick={() => {
                localStorage.removeItem("creatorflow:last-professional-render");
                setId("");
                setState(undefined);
              }}
            >
              Clear job from Studio
            </button>
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
