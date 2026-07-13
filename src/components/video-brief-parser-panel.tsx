// Brief Parser Panel — paste a full production brief, preview the parsed
// blueprint, then Apply into the structured editor. Never overwrites the
// original AI blueprint; applies via saveBlueprintEdit so version history
// is preserved and Undo/Restore keep working.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ClipboardPaste, FileText, Check, X, Undo2, AlertTriangle, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { parseVideoBrief, type ParsedBriefResult } from "@/lib/video-brief-parser";
import { saveBlueprintEdit } from "@/lib/video-blueprint-store";
import type { VideoBlueprint, VideoBlueprintMetadata } from "@/lib/video-blueprint";

const EXAMPLE = `Title: 7 Screen-Free Activities Your Kids Will Actually Love
Duration: 60s
Format: Vertical / Reel
Audience: Millennial parents of kids 4-10
Visual Style: Warm, cinematic, natural light
CTA: Save this reel for your next screen-free weekend
Music: Uplifting acoustic

Scene 1 (0-4 sec)
Visual: Close-up of a kid staring blankly at a phone
Text: Screen time again?
Voiceover: We all know that look.
Camera: push in
Transition: cut

Scene 2 (4-10 sec)
Visual: Cardboard box fort in the living room
Text: #1 Build a fort
Voiceover: Kids can spend hours in a cardboard fort — no batteries required.
Camera: pan right
`;

export type VideoBriefParserPanelProps = {
  projectId: string;
  onApplied: (meta: VideoBlueprintMetadata) => void;
  onCancel?: () => void;
  defaultText?: string;
};

export function VideoBriefParserPanel({
  projectId, onApplied, onCancel, defaultText,
}: VideoBriefParserPanelProps) {
  const [text, setText] = useState<string>(defaultText ?? "");
  const [preview, setPreview] = useState<ParsedBriefResult | null>(null);
  const [editedBlueprint, setEditedBlueprint] = useState<VideoBlueprint | null>(null);
  const [applying, setApplying] = useState(false);
  const [lastApplied, setLastApplied] = useState<VideoBlueprintMetadata | null>(null);

  const activeBp = editedBlueprint ?? preview?.blueprint ?? null;

  const runParse = () => {
    if (!text.trim()) { toast.error("Paste a brief to parse."); return; }
    const result = parseVideoBrief(text);
    setPreview(result);
    setEditedBlueprint(null);
    const errs = result.issues.filter((i) => i.level === "error").length;
    const warns = result.issues.filter((i) => i.level === "warning").length;
    toast.success(
      `Parsed ${result.parsed.sceneCount} scene${result.parsed.sceneCount === 1 ? "" : "s"} · ${errs} error${errs === 1 ? "" : "s"} · ${warns} warning${warns === 1 ? "" : "s"}`,
    );
  };

  const cancelPreview = () => { setPreview(null); setEditedBlueprint(null); };

  const apply = async () => {
    if (!activeBp) return;
    setApplying(true);
    try {
      const meta = await saveBlueprintEdit(projectId, activeBp, "user_edit", "Applied parsed brief");
      setLastApplied(meta);
      toast.success("Applied parsed brief. All future generation uses this blueprint.");
      onApplied(meta);
      setPreview(null);
      setEditedBlueprint(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to apply");
    } finally {
      setApplying(false);
    }
  };

  const undoApply = async () => {
    if (!lastApplied) return;
    // Simple undo: restore the previous version from history (index 1 is
    // the state before the apply).
    const prev = lastApplied.blueprintVersions[1];
    if (!prev) { toast.error("Nothing to undo."); return; }
    setApplying(true);
    try {
      const meta = await saveBlueprintEdit(projectId, prev.blueprint, "restore", "Undid parsed brief");
      setLastApplied(null);
      onApplied(meta);
      toast.success("Reverted to the previous blueprint.");
    } finally { setApplying(false); }
  };

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { setText((cur) => (cur ? cur + "\n\n" + t : t)); }
    } catch { toast.error("Clipboard unavailable"); }
  };

  const errors = useMemo(
    () => preview?.issues.filter((i) => i.level === "error") ?? [],
    [preview],
  );
  const warnings = useMemo(
    () => preview?.issues.filter((i) => i.level === "warning") ?? [],
    [preview],
  );

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium">
            <FileText className="h-4 w-4" /> Import from written brief
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={paste}>
              <ClipboardPaste className="h-3 w-3 mr-1" /> Paste
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setText(EXAMPLE)}>
              Use example
            </Button>
          </div>
        </div>
        <Textarea
          rows={14}
          placeholder="Paste your full production brief — Title, Duration, Format, Audience, CTA, then Scene 1, Scene 2, etc. with Visual / Text / Voiceover / Camera / Transition per scene."
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="font-mono text-xs"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Supports labels: Title, Duration, Format, Audience, Visual Style, CTA, Music, Voice,
            Character, Product, plus per scene: Visual, Text, Voiceover, Camera, Transition,
            Negative Prompt, Motion, Product Placement.
          </p>
          <div className="flex items-center gap-2">
            {onCancel && <Button size="sm" variant="ghost" onClick={onCancel}>Close</Button>}
            <Button size="sm" onClick={runParse}>
              <Eye className="h-3 w-3 mr-1" /> Parse preview
            </Button>
          </div>
        </div>
      </Card>

      {preview && activeBp && (
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Preview only</Badge>
              <span className="text-xs text-muted-foreground">
                {activeBp.scenes.length} scenes · {activeBp.totalDurationSec}s target · {activeBp.aspectRatio}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={cancelPreview}>
                <X className="h-3 w-3 mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={apply} disabled={applying || errors.length > 0}>
                <Check className="h-3 w-3 mr-1" />
                {applying ? "Applying…" : "Apply to blueprint"}
              </Button>
            </div>
          </div>

          {(errors.length > 0 || warnings.length > 0) && (
            <div className="rounded border border-amber-500/40 bg-amber-500/5 p-3">
              <div className="flex items-center gap-2 text-sm font-medium mb-1">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                {errors.length} error{errors.length === 1 ? "" : "s"} · {warnings.length} warning{warnings.length === 1 ? "" : "s"}
              </div>
              <ul className="text-xs space-y-0.5 max-h-32 overflow-auto">
                {[...errors, ...warnings].map((i, k) => (
                  <li key={k} className={i.level === "error" ? "text-red-400" : "text-amber-400"}>
                    • {i.message}
                  </li>
                ))}
              </ul>
              {errors.length > 0 && (
                <p className="text-[11px] text-red-400 mt-1">Fix errors before applying.</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <PreviewField label="Title" value={activeBp.title}
              onChange={(v) => setEditedBlueprint({ ...activeBp, title: v })} />
            <PreviewField label="CTA" value={activeBp.cta}
              onChange={(v) => setEditedBlueprint({ ...activeBp, cta: v })} />
            <PreviewField label="Audience" value={activeBp.audience}
              onChange={(v) => setEditedBlueprint({ ...activeBp, audience: v })} />
            <PreviewField label="Style" value={activeBp.globalVisualStyle}
              onChange={(v) => setEditedBlueprint({ ...activeBp, globalVisualStyle: v })} />
          </div>

          <div className="rounded border border-border/50 divide-y divide-border/50 max-h-96 overflow-auto">
            {activeBp.scenes.map((s, i) => (
              <div key={s.id} className="p-3 text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline">#{s.n}</Badge>
                  <span className="text-muted-foreground">
                    {s.startSec.toFixed(1)}–{s.endSec.toFixed(1)}s · {s.role}
                  </span>
                </div>
                {s.visual && <div><strong>Visual:</strong> {s.visual}</div>}
                {s.onScreenText && <div><strong>Text:</strong> {s.onScreenText}</div>}
                {s.voiceover && <div className="opacity-80"><strong>VO:</strong> {s.voiceover}</div>}
                {(s.cameraMovement !== "pushIn" || s.transitionIn !== "fade") && (
                  <div className="opacity-60 mt-0.5">
                    Camera: {s.cameraMovement} · Transition: {s.transitionIn}
                  </div>
                )}
                <EditableSceneRow
                  scene={s}
                  onChange={(patch) => setEditedBlueprint({
                    ...activeBp,
                    scenes: activeBp.scenes.map((x, k) => k === i ? { ...x, ...patch } : x),
                  })}
                />
              </div>
            ))}
          </div>

          {preview.unmappedNotes && (
            <div className="rounded border border-border/50 bg-muted/20 p-3">
              <div className="text-xs font-medium mb-1">Unmapped notes (kept for you)</div>
              <pre className="whitespace-pre-wrap text-[11px] text-muted-foreground max-h-40 overflow-auto">
                {preview.unmappedNotes}
              </pre>
            </div>
          )}
        </Card>
      )}

      {lastApplied && (
        <Card className="p-3 flex items-center justify-between text-xs">
          <span className="text-emerald-500 flex items-center gap-1">
            <Check className="h-3 w-3" /> Applied — blueprint version {lastApplied.blueprintVersion}
          </span>
          <Button size="sm" variant="ghost" onClick={undoApply}>
            <Undo2 className="h-3 w-3 mr-1" /> Undo
          </Button>
        </Card>
      )}
    </div>
  );
}

function PreviewField({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <input
        className="rounded border border-border/50 bg-transparent px-2 py-1 text-xs"
        value={value} onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function EditableSceneRow({ scene, onChange }: {
  scene: { voiceover: string; onScreenText: string; visual: string };
  onChange: (p: Partial<{ voiceover: string; onScreenText: string; visual: string }>) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!open) return (
    <button type="button" className="text-[11px] underline opacity-60 mt-1"
      onClick={() => setOpen(true)}>Edit parsed result</button>
  );
  return (
    <div className="mt-2 grid grid-cols-1 gap-1">
      <textarea rows={1} className="rounded border border-border/50 bg-transparent px-2 py-1 text-xs"
        placeholder="Visual" value={scene.visual} onChange={(e) => onChange({ visual: e.target.value })} />
      <textarea rows={1} className="rounded border border-border/50 bg-transparent px-2 py-1 text-xs"
        placeholder="On-screen text" value={scene.onScreenText} onChange={(e) => onChange({ onScreenText: e.target.value })} />
      <textarea rows={2} className="rounded border border-border/50 bg-transparent px-2 py-1 text-xs"
        placeholder="Voiceover" value={scene.voiceover} onChange={(e) => onChange({ voiceover: e.target.value })} />
    </div>
  );
}
