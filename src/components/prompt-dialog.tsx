// In-app text input dialog that replaces window.prompt() — same pattern as
// confirm-dialog.tsx.
//
// Usage:
//   import { promptDialog } from "@/components/prompt-dialog";
//   const text = await promptDialog({ title: "New overlay text", placeholder: "…" });
//   if (text) { … }           // null when cancelled
//
// Requires <PromptDialogHost /> to be mounted once (it is, in the app shell).

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type PromptOptions = {
  title: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  /** Multi-line input for longer descriptions. */
  multiline?: boolean;
  /** Quick-pick chips shown under the input; clicking one fills it in. */
  suggestions?: string[];
  /** Only allow one of these values (renders as buttons, no free text). */
  choices?: string[];
  /** Small helper text under the input. */
  hint?: string;
};

type Pending = PromptOptions & { resolve: (v: string | null) => void };

let listener: ((p: Pending | null) => void) | null = null;

export function promptDialog(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    if (!listener) {
      // eslint-disable-next-line no-console
      console.warn("[promptDialog] PromptDialogHost is not mounted");
      resolve(null);
      return;
    }
    listener({ ...options, resolve });
  });
}

export function PromptDialogHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    listener = (p) => {
      setValue(p?.defaultValue ?? p?.choices?.[0] ?? "");
      setPending(p);
    };
    return () => {
      listener = null;
    };
  }, []);

  useEffect(() => {
    if (pending && !pending.choices) setTimeout(() => inputRef.current?.focus(), 50);
  }, [pending]);

  function close(result: string | null) {
    pending?.resolve(result);
    setPending(null);
  }

  const trimmed = value.trim();
  const inputClass = "input-base w-full";

  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && close(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{pending?.title}</DialogTitle>
          {pending?.description && <DialogDescription>{pending.description}</DialogDescription>}
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed) close(trimmed);
          }}
          className="space-y-3"
        >
          {pending?.choices ? (
            <div className="flex flex-wrap gap-2">
              {pending.choices.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setValue(c)}
                  className={`px-3 py-1.5 rounded-full text-xs border capitalize ${value === c ? "gradient-primary text-white border-transparent" : "glass border-border"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          ) : pending?.multiline ? (
            <textarea
              ref={inputRef}
              rows={3}
              value={value}
              placeholder={pending?.placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && trimmed) close(trimmed);
              }}
              className={`${inputClass} resize-y`}
            />
          ) : (
            <input
              ref={inputRef}
              value={value}
              placeholder={pending?.placeholder}
              onChange={(e) => setValue(e.target.value)}
              className={inputClass}
            />
          )}

          {pending?.suggestions && pending.suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pending.suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setValue(s)}
                  className="px-2.5 py-1 rounded-full text-[11px] glass border border-border hover:border-primary/50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {pending?.hint && <p className="text-xs text-muted-foreground">{pending.hint}</p>}

          <DialogFooter className="gap-2 sm:gap-2">
            <button type="button" onClick={() => close(null)} className="rounded-lg glass border border-border px-4 py-2 text-sm">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!trimmed}
              className="rounded-lg gradient-primary text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {pending?.confirmText ?? "Apply"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
