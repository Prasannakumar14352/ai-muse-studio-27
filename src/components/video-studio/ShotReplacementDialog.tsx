// Shot replacement dialog — upload reference or pick an alt shot label; stores on scene.shotReference.
import { useRef, useState } from "react";
import { Camera, Upload, Wand2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BlueprintScene, ShotReference } from "@/lib/video-blueprint";

export type ShotReplacementDialogProps = {
  open: boolean;
  scene: BlueprintScene | null;
  onClose: () => void;
  onSave: (sceneId: string, ref: ShotReference | null) => void;
  onRegenerate: (sceneId: string) => void;
};

export function ShotReplacementDialog({
  open, scene, onClose, onSave, onRegenerate,
}: ShotReplacementDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState("Uploaded");
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  }

  function save() {
    if (!scene) return;
    if (dataUrl) {
      onSave(scene.id, { url: dataUrl, label, addedAt: new Date().toISOString() });
    }
    onClose();
    setDataUrl(null);
  }

  function clear() {
    if (!scene) return;
    onSave(scene.id, null);
    onClose();
    setDataUrl(null);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4" /> Replace shot {scene ? `— #${scene.n}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Upload a reference image the renderer should match, pin an alt shot, or ask the AI to regenerate this shot only.
          </p>

          {scene?.shotReference?.url && !dataUrl && (
            <div className="rounded-md border border-border/50 p-3 flex gap-3">
              <img src={scene.shotReference.url} alt="Current" className="h-20 w-20 rounded object-cover" />
              <div className="text-xs">
                <div className="font-medium">Currently pinned</div>
                <div className="text-muted-foreground">{scene.shotReference.label}</div>
                <div className="text-muted-foreground">
                  {new Date(scene.shotReference.addedAt).toLocaleString()}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-md border border-dashed border-border/60 p-4 flex flex-col items-center gap-3">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
            {dataUrl ? (
              <img src={dataUrl} alt="preview" className="h-28 rounded object-cover" />
            ) : (
              <Camera className="h-8 w-8 text-muted-foreground" />
            )}
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="h-3 w-3 mr-1" /> Choose image
            </Button>
            <div className="w-full">
              <Label className="text-xs text-muted-foreground">Label</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Uploaded / Alt 1 / …" />
            </div>
          </div>

          <Button
            variant="secondary" className="w-full"
            onClick={() => { if (scene) { onRegenerate(scene.id); onClose(); } }}
          >
            <Wand2 className="h-3 w-3 mr-1" /> Regenerate this shot with AI
          </Button>
        </div>

        <DialogFooter className="flex justify-between">
          <Button variant="ghost" size="sm" onClick={clear} disabled={!scene?.shotReference}>
            Remove pinned shot
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={!dataUrl}>Save reference</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
