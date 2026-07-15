import { X } from "lucide-react";
import type { ResearchPrefill } from "@/lib/research-prefill";

export function PreviewHandoffDialog({
  open, onClose, onConfirm, payload, moduleLabel,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  payload: Partial<ResearchPrefill> | null;
  moduleLabel: string;
}) {
  if (!open || !payload) return null;
  const entries = Object.entries(payload).filter(([k, v]) =>
    !["handoffId", "source", "sourceLabel", "at", "module"].includes(k) &&
    v !== undefined && v !== null && (Array.isArray(v) ? v.length > 0 : String(v).trim() !== "")
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="glass border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Preview handoff</div>
            <div className="text-lg font-semibold">Send to {moduleLabel}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">These fields will be prefilled in {moduleLabel}. You can still edit anything before generating.</p>
          {entries.length === 0 && <div className="text-muted-foreground text-xs">No prefill data.</div>}
          {entries.map(([k, v]) => (
            <div key={k} className="glass rounded-lg border border-white/10 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{k}</div>
              {Array.isArray(v) ? (
                <ul className="list-disc pl-4 space-y-0.5">{v.map((x, i) => <li key={i} className="text-xs">{String(x)}</li>)}</ul>
              ) : (
                <div className="text-xs whitespace-pre-wrap break-words">{String(v)}</div>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/10">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-white/10 hover:bg-white/5">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-sm bg-gradient-to-r from-orange-500 to-pink-500 text-white font-semibold">
            Confirm &amp; open {moduleLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
