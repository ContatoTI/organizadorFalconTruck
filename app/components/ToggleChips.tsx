'use client';

import { Check } from 'lucide-react';
import { cn } from '@/app/lib/utils';

export interface ToggleChipOption {
  key: string;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  title?: string;
}

interface ToggleChipsProps {
  options: ToggleChipOption[];
  className?: string;
}

export function ToggleChips({ options, className }: ToggleChipsProps) {
  return (
    <div className={cn("flex items-center gap-2 overflow-x-auto", className)}>
      {options.map(opt => {
        const active = opt.checked;
        return (
          <button
            key={opt.key}
            type="button"
            title={opt.title}
            onClick={() => opt.onChange(!active)}
            className={cn(
              "group flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full border transition-colors flex-shrink-0",
              active
                ? "bg-primary/10 border-primary/40 text-primary"
                : "bg-transparent border-border/70 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            )}
          >
            <span
              className={cn(
                "w-3.5 h-3.5 rounded-[5px] border flex items-center justify-center transition-colors flex-shrink-0",
                active ? "bg-primary border-primary" : "border-slate-300 bg-white group-hover:border-slate-400"
              )}
            >
              {active && <Check className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />}
            </span>
            <span className="text-[12px] leading-none whitespace-nowrap">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}