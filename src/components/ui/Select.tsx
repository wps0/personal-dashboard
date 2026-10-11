import {Check, ChevronDown} from 'lucide-react';
import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {Popover, PopoverContent, PopoverTrigger} from './Popover';

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

/**
 * Styled replacement for <select>. Options render only while the list is open
 * (Radix Select renders every option even when closed, which made time pickers
 * with 96 options slow). Keyboard: arrows, Home/End, Enter/Space, Esc, type to jump.
 */
function SelectImpl<T extends string>({
  value,
  onChange,
  options,
  variant = 'field',
  className = '',
  ariaLabel,
  display,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2 text-left transition-colors duration-150 ${
          variant === 'field'
            ? 'border border-line bg-raised hover:border-dim/50'
            : 'hover:bg-raised'
        } ${open ? 'bg-raised' : ''} ${className}`}
      >
        {current?.color && (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{background: current.color}}
          />
        )}
        <span className="min-w-0 flex-1 truncate">
          {display ?? current?.label}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-dim transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </PopoverTrigger>
      {open && (
        <PopoverContent
          align="start"
          sideOffset={4}
          onOpenAutoFocus={e => e.preventDefault()}
          className="min-w-[var(--radix-popover-trigger-width)] rounded-lg p-1"
        >
          <Listbox
            options={options}
            value={value}
            onPick={v => {
              setOpen(false);
              if (v !== value) onChange(v);
            }}
          />
        </PopoverContent>
      )}
    </Popover>
  );
}

/** Memoized: re-renders only when its props change. */
export const Select = memo(SelectImpl) as typeof SelectImpl;

function Listbox<T extends string>({
  options,
  value,
  onPick,
}: {
  options: readonly Option<T>[];
  value: T;
  onPick(v: T): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      options.findIndex(o => o.value === value),
    ),
  );
  const typed = useRef({text: '', at: 0});

  // Focus the list and show the selected option in the middle, like a native select.
  useLayoutEffect(() => {
    ref.current?.focus({preventScroll: true});
    ref.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({block: 'center'});
  }, []);
  useEffect(() => {
    ref.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({block: 'nearest'});
  }, [active]);

  const onKeyDown = (e: KeyboardEvent) => {
    const last = options.length - 1;
    const move: Record<string, number> = {
      ArrowDown: active + 1,
      ArrowUp: active - 1,
      Home: 0,
      End: last,
      PageDown: active + 8,
      PageUp: active - 8,
    };
    if (e.key in move) {
      e.preventDefault();
      setActive(Math.max(0, Math.min(last, move[e.key])));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPick(options[active].value);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      // Type to jump: matches the start of an option's text.
      const now = performance.now();
      typed.current = {
        text:
          (now - typed.current.at < 700 ? typed.current.text : '') +
          e.key.toLowerCase(),
        at: now,
      };
      const i = options.findIndex(o =>
        String(typeof o.label === 'string' ? o.label : o.value)
          .toLowerCase()
          .startsWith(typed.current.text),
      );
      if (i >= 0) setActive(i);
    }
  };

  return (
    <div
      ref={ref}
      role="listbox"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="scroll-thin max-h-[min(320px,var(--radix-popover-content-available-height))] overflow-y-auto outline-none"
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <div
            key={o.value}
            role="option"
            aria-selected={selected}
            data-index={i}
            onMouseEnter={() => setActive(i)}
            onClick={() => onPick(o.value)}
            className={`relative flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-8 pl-2.5 select-none ${i === active ? 'bg-raised' : ''} ${
              selected ? 'font-medium text-strong' : ''
            }`}
          >
            {o.color && (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{background: o.color}}
              />
            )}
            <span className="truncate">{o.label}</span>
            {selected && (
              <Check size={14} className="absolute right-2.5 text-accent" />
            )}
          </div>
        );
      })}
    </div>
  );
}
