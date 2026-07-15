// Visual horizontal timeline showing scene clips + subtitles + music + SFX tracks.
// Read/write for scene duration (drag-resize handles + numeric input).
// Purely presentational — mutations bubble up via callbacks.

import { useMemo, useRef, useState } from "react";
import { Film, Music2, Type, Volume2, GripVertical } from "lucide-react";
import type { BlueprintScene, VideoBlueprint } from "@/lib/video-blueprint";

const TRACK_H = 44;
const PX_PER_SEC_MIN = 12;
const PX_PER_SEC_MAX = 80;

export type TimelineEditorProps = {
  blueprint: VideoBlueprint;
  selectedSceneId: string | null;
  onSelectScene: (id: string) => void;
  onResizeScene: (id: string, newDurationSec: number) => void;
  onMoveScene: (id: string, dir: -1 | 1) => void;
};

export function TimelineEditor({
  blueprint, selectedSceneId, onSelectScene, onResizeScene, onMoveScene,
}: TimelineEditorProps) {
  const [pxPerSec, setPxPerSec] = useState(32);
  const total = useMemo(
    () => blueprint.scenes.reduce((a, s) => a + (s.durationSec || 0), 0),
    [blueprint.scenes],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startDur: number } | null>(null);

  function onHandleDown(e: React.PointerEvent, s: BlueprintScene) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { id: s.id, startX: e.clientX, startDur: s.durationSec };
  }
  function onHandleMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const nextDur = Math.max(0.5, dragRef.current.startDur + dx / pxPerSec);
    onResizeScene(dragRef.current.id, Number(nextDur.toFixed(1)));
  }
  function onHandleUp(e: React.PointerEvent) {
    dragRef.current = null;
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  }

  const ticks = useMemo(() => {
    const arr: number[] = [];
    const step = total > 60 ? 10 : total > 20 ? 5 : 1;
    for (let t = 0; t <= Math.ceil(total); t += step) arr.push(t);
    return arr;
  }, [total]);

  const scenesWithOffset = useMemo(() => {
    let cursor = 0;
    return blueprint.scenes.map((s) => {
      const start = cursor;
      cursor += s.durationSec;
      return { s, start };
    });
  }, [blueprint.scenes]);

  return (
    <div className="rounded-lg border border-border/50 bg-card/40">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 border-b border-border/50 p-3">
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{blueprint.scenes.length}</span> scenes ·{" "}
          <span className="font-medium text-foreground">{total.toFixed(1)}s</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Zoom</span>
          <input
            type="range" min={PX_PER_SEC_MIN} max={PX_PER_SEC_MAX} value={pxPerSec}
            onChange={(e) => setPxPerSec(Number(e.target.value))}
            className="w-32 accent-primary"
          />
        </div>
      </div>

      <div ref={scrollRef} className="overflow-x-auto">
        <div style={{ width: Math.max(600, total * pxPerSec + 40) }}>
          {/* Ruler */}
          <div className="relative h-6 border-b border-border/40 text-[10px] text-muted-foreground">
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute top-0 h-full border-l border-border/40 pl-1"
                style={{ left: t * pxPerSec }}
              >
                {t}s
              </div>
            ))}
          </div>

          {/* Scene track */}
          <TrackRow icon={<Film className="h-3 w-3" />} label="Scenes">
            {scenesWithOffset.map(({ s, start }) => (
              <div
                key={s.id}
                onClick={() => onSelectScene(s.id)}
                className={`absolute top-1 bottom-1 rounded-md px-2 py-1 cursor-pointer overflow-hidden text-[11px] leading-tight
                  ${selectedSceneId === s.id ? "ring-2 ring-primary" : "ring-1 ring-border/60"}
                  bg-gradient-to-br from-primary/30 to-primary/10 hover:from-primary/40`}
                style={{ left: start * pxPerSec, width: Math.max(24, s.durationSec * pxPerSec - 2) }}
                title={`${s.role}: ${s.visual}`}
              >
                <div className="flex items-center gap-1 opacity-80">
                  <GripVertical
                    className="h-3 w-3 cursor-grab"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const idx = blueprint.scenes.findIndex((x) => x.id === s.id);
                      if (e.shiftKey && idx > 0) onMoveScene(s.id, -1);
                      else if (e.shiftKey) onMoveScene(s.id, 1);
                    }}
                  />
                  <span className="font-semibold">#{s.n}</span>
                  <span className="truncate">{s.role}</span>
                </div>
                <div className="truncate opacity-70">{s.visual || "—"}</div>
                {/* Resize handle */}
                <div
                  role="presentation"
                  className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize bg-primary/60"
                  onPointerDown={(e) => onHandleDown(e, s)}
                  onPointerMove={onHandleMove}
                  onPointerUp={onHandleUp}
                />
              </div>
            ))}
          </TrackRow>

          {/* Subtitle track */}
          <TrackRow icon={<Type className="h-3 w-3" />} label="Subtitles">
            {scenesWithOffset.map(({ s, start }) => {
              const text = s.subtitle?.text || s.voiceover || s.onScreenText;
              if (!text) return null;
              return (
                <div
                  key={s.id}
                  className="absolute top-2 bottom-2 rounded-sm bg-emerald-500/20 ring-1 ring-emerald-500/40 px-1.5 text-[10px] text-emerald-100 truncate"
                  style={{ left: start * pxPerSec, width: Math.max(24, s.durationSec * pxPerSec - 2) }}
                  title={text}
                >
                  {text}
                </div>
              );
            })}
          </TrackRow>

          {/* SFX track */}
          <TrackRow icon={<Volume2 className="h-3 w-3" />} label="SFX">
            {scenesWithOffset.flatMap(({ s, start }) =>
              (s.sfx ?? []).map((fx) => {
                const left = (start + Math.max(0, Math.min(fx.atSec, s.durationSec))) * pxPerSec;
                return (
                  <div
                    key={fx.id}
                    className="absolute top-2 bottom-2 w-1.5 rounded bg-amber-400"
                    style={{ left }}
                    title={`${fx.label} @ ${fx.atSec.toFixed(1)}s`}
                  />
                );
              }),
            )}
          </TrackRow>

          {/* Music track */}
          <TrackRow icon={<Music2 className="h-3 w-3" />} label="Music">
            {blueprint.music ? (
              <div
                className="absolute top-2 bottom-2 left-0 rounded-md bg-fuchsia-500/20 ring-1 ring-fuchsia-500/40 px-2 text-[10px] text-fuchsia-100"
                style={{ width: Math.max(60, total * pxPerSec - 2) }}
              >
                <span className="font-medium">{blueprint.music.label}</span>
                <span className="opacity-70"> · {blueprint.music.mood} · vol {Math.round(blueprint.music.volume * 100)}%</span>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center pl-2 text-[10px] italic text-muted-foreground">
                No music selected
              </div>
            )}
          </TrackRow>
        </div>
      </div>
    </div>
  );
}

function TrackRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="relative border-b border-border/40 last:border-b-0" style={{ height: TRACK_H }}>
      <div className="absolute left-0 top-0 z-10 flex h-full w-24 items-center gap-1 border-r border-border/40 bg-card/70 px-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </div>
      <div className="relative h-full pl-24">{children}</div>
    </div>
  );
}
