// Shared themed Select wrapper used across CreatorFlow AI.
// Wraps shadcn/Radix Select so no native <select> renders anywhere.
import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type CFSelectOption = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};

export type CreatorFlowSelectProps = {
  value: string;
  onValueChange: (v: string) => void;
  options: ReadonlyArray<CFSelectOption | string>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  ariaLabel?: string;
  id?: string;
  name?: string;
};

function normalize(opts: ReadonlyArray<CFSelectOption | string>): CFSelectOption[] {
  return opts.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
}

export function CreatorFlowSelect({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
  contentClassName,
  ariaLabel,
  id,
  name,
}: CreatorFlowSelectProps) {
  const items = normalize(options);
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled} name={name}>
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          // Dark themed trigger matching input-base
          "w-full h-10 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm text-foreground",
          "hover:border-white/20 focus:ring-2 focus:ring-primary/50 focus:border-primary/60",
          "data-[placeholder]:text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed",
          "transition-colors",
          className,
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        className={cn(
          // Dark themed popup, high z-index, scrollable
          "z-[100] max-h-72 min-w-[var(--radix-select-trigger-width)]",
          "rounded-xl border border-white/10 bg-[oklch(0.16_0.02_270)] text-foreground shadow-2xl backdrop-blur-xl",
          contentClassName,
        )}
      >
        {items.map((o) => (
          <SelectItem
            key={o.value}
            value={o.value}
            disabled={o.disabled}
            className={cn(
              "cursor-pointer rounded-lg text-sm text-foreground/90 pl-2 pr-8 py-2",
              "focus:bg-gradient-to-r focus:from-primary/25 focus:to-pink-500/20 focus:text-foreground",
              "data-[state=checked]:text-foreground data-[state=checked]:font-medium",
              "data-[disabled]:opacity-40",
            )}
          >
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
