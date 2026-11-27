import { exportDimensions, exportEncoding, type VideoExportSettings } from "@/lib/video-export";

export function ExportSettings({
  value,
  onChange,
  duration,
}: {
  value: VideoExportSettings;
  onChange: (settings: VideoExportSettings) => void;
  duration: number;
}) {
  const [width, height] = exportDimensions(value.resolution, value.aspectRatio);
  const encoding = exportEncoding(value);
  const estimatedMb = Math.ceil(
    ((encoding.videoBps + encoding.audioKbps * 1000) * duration) / 8_000_000,
  );
  const options = [
    [
      "resolution",
      "Resolution",
      [
        ["720p", "HD 720p"],
        ["1080p", "Full HD 1080p"],
      ],
    ],
    [
      "fps",
      "Frame rate",
      [
        [24, "24 FPS"],
        [30, "30 FPS"],
      ],
    ],
    [
      "quality",
      "Quality",
      [
        ["standard", "Standard"],
        ["high", "High"],
        ["maximum", "Maximum"],
      ],
    ],
    [
      "format",
      "Format",
      [
        ["mp4", "MP4"],
        ["webm", "WebM"],
      ],
    ],
    [
      "fit",
      "Framing",
      [
        ["fit", "Fit"],
        ["crop", "Crop"],
      ],
    ],
  ] as const;

  return (
    <details className="space-y-3 rounded-xl border border-border p-4">
      <summary className="cursor-pointer text-sm font-medium">Export settings</summary>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map(([key, label, choices]) => (
          <label key={key} className="grid gap-1 text-sm">
            {label}
            <select
              value={value[key]}
              className="rounded border border-input bg-background p-2"
              onChange={(event) => {
                const choice = choices.find(([id]) => String(id) === event.target.value);
                if (choice) onChange({ ...value, [key]: choice[0] });
              }}
            >
              {choices.map(([id, text]) => (
                <option key={id} value={id}>
                  {text}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.subtitles}
            onChange={(event) => onChange({ ...value, subtitles: event.target.checked })}
          />
          Burn in scene text
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Browser canvas {width} × {height} · {value.fps} FPS · recording target about {estimatedMb}{" "}
        MB. Smaller source assets are scaled to fit the selected canvas.
      </p>
    </details>
  );
}
