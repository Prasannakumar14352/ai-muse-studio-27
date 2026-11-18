// Grid of content-type cards shown at the top of the New Project hub.
// Selecting a card routes to the correct guided workflow.

import { Link } from "@tanstack/react-router";
import { CONTENT_TYPES, type ContentTypeId } from "@/lib/content-types";
import { ArrowRight } from "lucide-react";

/** Content types whose module is hidden for now (see hidden-features.ts). */
const HIDDEN_CONTENT_TYPES = new Set<ContentTypeId>(["promo_video"]);

type Props = {
  /** Optional currently-selected id (for edit flows). */
  value?: ContentTypeId | null;
  /** If provided, clicking a card calls this instead of navigating. */
  onSelect?: (id: ContentTypeId) => void;
};

export function ContentTypePicker({ value, onSelect }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {CONTENT_TYPES.filter((c) => !HIDDEN_CONTENT_TYPES.has(c.id)).map((c) => {
        const Icon = c.icon;
        const selected = value === c.id;
        const inner = (
          <div className={`glass rounded-2xl p-4 border transition h-full flex flex-col gap-2 group ${
            selected
              ? "border-[color:var(--neon-pink)]/60 bg-[color:var(--neon-pink)]/5"
              : "border-border hover:border-white/20"
          }`}>
            <div className="flex items-start gap-3">
              <div className="rounded-lg p-2 bg-[color:var(--neon-purple)]/10 text-[color:var(--neon-pink)]">
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-semibold text-sm">{c.label}</div>
                  {c.badge && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[color:var(--neon-pink)]/20 text-[color:var(--neon-pink)]">
                      {c.badge}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{c.description}</div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
            </div>
            {c.aspect && (
              <div className="mt-auto text-[10px] uppercase tracking-wide text-muted-foreground/70">
                {c.aspect} · {c.module}
              </div>
            )}
          </div>
        );
        if (onSelect) {
          return (
            <button key={c.id} type="button" className="text-left" onClick={() => onSelect(c.id)}>
              {inner}
            </button>
          );
        }
        return (
          <Link
            key={c.id}
            to={c.route}
            search={{ type: c.id } as never}
            className="text-left"
          >
            {inner}
          </Link>
        );
      })}
    </div>
  );
}
