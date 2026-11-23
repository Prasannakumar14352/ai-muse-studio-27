// Post-generation action bar shared across modules.
import { Copy, Edit3, RefreshCw, Save, Download, Send, History } from "lucide-react";

export type AssetAction = "duplicate" | "edit" | "regenerate" | "save" | "export" | "publish" | "history";

export function AssetActions({
  onAction,
  disabled = {},
}: {
  onAction: (action: AssetAction) => void;
  disabled?: Partial<Record<AssetAction, boolean>>;
}) {
  const items: Array<{ id: AssetAction; label: string; Icon: typeof Copy }> = [
    { id: "duplicate", label: "Duplicate", Icon: Copy },
    { id: "edit", label: "Edit", Icon: Edit3 },
    { id: "regenerate", label: "Regenerate", Icon: RefreshCw },
    { id: "save", label: "Save", Icon: Save },
    { id: "export", label: "Export", Icon: Download },
    { id: "publish", label: "Publish", Icon: Send },
    { id: "history", label: "History", Icon: History },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onAction(id)}
          disabled={disabled[id]}
          className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-border hover:border-primary/50 disabled:opacity-40"
        >
          <Icon className="w-3.5 h-3.5" /> {label}
        </button>
      ))}
    </div>
  );
}
