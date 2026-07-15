// Generic editable plan editor: renders each section as a card with
// Edit / Regenerate / Delete / Add actions. Fully controlled.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RefreshCw, Trash2, Plus } from "lucide-react";
import type { ContentPlan, PlanSection } from "@/lib/content-plan.functions";
import { regeneratePlanSectionFn } from "@/lib/content-plan.functions";

export function PlanEditor({
  plan,
  onChange,
}: {
  plan: ContentPlan;
  onChange: (next: ContentPlan) => void;
}) {
  const regen = useServerFn(regeneratePlanSectionFn);

  function updateSection(key: string, next: Partial<PlanSection>) {
    onChange({
      ...plan,
      sections: plan.sections.map((s) => (s.key === key ? { ...s, ...next } : s)),
    });
  }

  return (
    <div className="space-y-3">
      {plan.sections.map((section) => (
        <SectionCard
          key={section.key}
          section={section}
          onChange={(next) => updateSection(section.key, next)}
          onRegenerate={async (instruction) => {
            try {
              const r = await regen({ data: { module: plan.module, topic: plan.topic, sectionKey: section.key, currentValue: section.value, instruction } });
              updateSection(section.key, { value: r.value });
              toast.success(`Regenerated ${section.label}`);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Regenerate failed");
            }
          }}
        />
      ))}
    </div>
  );
}

function SectionCard({
  section,
  onChange,
  onRegenerate,
}: {
  section: PlanSection;
  onChange: (next: Partial<PlanSection>) => void;
  onRegenerate: (instruction?: string) => Promise<void>;
}) {
  const [instruction, setInstruction] = useState("");
  const m = useMutation({ mutationFn: async (ins: string) => onRegenerate(ins || undefined) });

  return (
    <div className="rounded-xl border border-white/10 bg-card/40 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{section.label}</div>
        <div className="flex items-center gap-1.5">
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. shorter, funnier"
            className="input-base text-xs py-1 px-2 w-40 hidden sm:block"
          />
          <button
            onClick={() => m.mutate(instruction)}
            disabled={m.isPending}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-white/15 hover:border-primary/50 disabled:opacity-50"
          >
            {m.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Regenerate
          </button>
        </div>
      </div>

      {section.kind === "list" ? (
        <ListEditor
          items={Array.isArray(section.value) ? section.value : []}
          onChange={(items) => onChange({ value: items })}
        />
      ) : section.kind === "longtext" ? (
        <textarea
          rows={5}
          value={Array.isArray(section.value) ? section.value.join("\n") : section.value}
          onChange={(e) => onChange({ value: e.target.value })}
          className="input-base w-full text-sm"
        />
      ) : (
        <input
          value={Array.isArray(section.value) ? section.value.join(", ") : section.value}
          onChange={(e) => onChange({ value: e.target.value })}
          className="input-base w-full text-sm"
        />
      )}
    </div>
  );
}

function ListEditor({ items, onChange }: { items: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="space-y-1.5">
      {items.map((v, i) => (
        <div key={i} className="flex gap-1.5">
          <input
            value={v}
            onChange={(e) => onChange(items.map((x, j) => (i === j ? e.target.value : x)))}
            className="input-base flex-1 text-sm"
          />
          <button
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="px-2 rounded-lg border border-white/10 text-muted-foreground hover:text-red-300"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...items, ""])}
        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-white/10 hover:border-primary/50"
      >
        <Plus className="w-3 h-3" /> Add item
      </button>
    </div>
  );
}
