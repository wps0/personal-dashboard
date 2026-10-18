import {CalendarDays, X} from 'lucide-react';
import {memo, useState} from 'react';
import {formatMedium} from '../model/dates';
import type {ISODate} from '../model/types';
import {MiniMonth} from './mini_month';
import {Popover, PopoverContent, PopoverTrigger} from './ui/popover';

interface Props {
  value?: ISODate;
  onChange(v: ISODate | undefined): void;
  placeholder?: string;
  /** Show a clear button (for optional dates). */
  optional?: boolean;
  variant?: 'field' | 'ghost';
  className?: string;
  /** Custom trigger label (defaults to "Tue 14 Oct 2026"). */
  format?: (d: ISODate) => string;
}

/** Date picker: a button that opens the mini month. Replaces <input type="date">. */
function DateFieldImpl({
  value,
  onChange,
  placeholder = 'Set date',
  optional,
  variant = 'field',
  className = '',
  format = formatMedium,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <span className={`inline-flex items-center ${className}`}>
        <PopoverTrigger
          className={`inline-flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-left tabular-nums outline-none focus-visible:ring-1 focus-visible:ring-accent ${
            variant === 'field'
              ? 'border border-line bg-raised hover:border-dim/50'
              : 'hover:bg-raised'
          } ${value ? '' : 'text-dim'}`}
        >
          <CalendarDays size={14} className="shrink-0 text-dim" />
          <span className="truncate">
            {value ? format(value) : placeholder}
          </span>
        </PopoverTrigger>
        {optional && value && (
          <button
            className="icon-btn ml-0.5"
            aria-label="Clear date"
            onClick={() => onChange(undefined)}
          >
            <X size={14} />
          </button>
        )}
      </span>
      <PopoverContent align="start" className="p-2">
        <MiniMonth
          selected={value}
          onSelect={d => {
            onChange(d);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Memoized: re-renders only when its props change. */
export const DateField = memo(DateFieldImpl);
