import * as RS from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

export interface Option<T extends string> {
  value: T;
  label: ReactNode;
  /** Optional color dot (areas, statuses). */
  color?: string;
}

interface Props<T extends string> {
  value: T;
  onChange(v: NoInfer<T>): void;
  options: readonly Option<NoInfer<T>>[];
  /** 'field' has a border (forms); 'ghost' is borderless for dense tables and toolbars. */
  variant?: 'field' | 'ghost';
  className?: string;
  ariaLabel?: string;
  /** Render something other than the selected option's label in the trigger. */
  display?: ReactNode;
}

/** Styled replacement for <select>: keyboard navigation, typeahead, collision-aware popup. */
export function Select<T extends string>({ value, onChange, options, variant = 'field', className = '', ariaLabel, display }: Props<T>) {
  const current = options.find((o) => o.value === value);
  return (
    <RS.Root value={value} onValueChange={(v) => onChange(v as T)}>
      <RS.Trigger
        aria-label={ariaLabel}
        className={`inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2 text-left outline-none focus-visible:ring-1 focus-visible:ring-accent ${
          variant === 'field' ? 'border border-line bg-raised hover:border-dim/50' : 'hover:bg-raised'
        } ${className}`}
      >
        {current?.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: current.color }} />}
        <span className="min-w-0 flex-1 truncate">{display ?? <RS.Value />}</span>
        <RS.Icon>
          <ChevronDown size={14} className="shrink-0 text-dim" />
        </RS.Icon>
      </RS.Trigger>
      <RS.Portal>
        <RS.Content
          position="popper"
          sideOffset={4}
          className="z-[70] max-h-[min(320px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-line bg-panel py-1 shadow-xl shadow-black/30"
        >
          <RS.Viewport className="scroll-thin">
            {options.map((o) => (
              <RS.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer items-center gap-2 py-1.5 pr-8 pl-3 outline-none select-none data-[highlighted]:bg-raised data-[state=checked]:font-medium"
              >
                {o.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: o.color }} />}
                <RS.ItemText>{o.label}</RS.ItemText>
                <RS.ItemIndicator className="absolute right-2.5">
                  <Check size={14} className="text-accent" />
                </RS.ItemIndicator>
              </RS.Item>
            ))}
          </RS.Viewport>
        </RS.Content>
      </RS.Portal>
    </RS.Root>
  );
}
