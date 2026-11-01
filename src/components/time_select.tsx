import {ChevronDown} from 'lucide-react';
import {
  memo,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {fromMinutes, parseTime, toMinutes} from '../model/time';
import {Popover, PopoverAnchor, PopoverContent} from './ui/popover';

interface Props {
  /** `HH:MM`; anything else (e.g. "--:--") shows as an empty field with it as the hint. */
  value: string;
  onChange(v: string): void;
  /** For an end time: only offer times after this, labelled with the duration ("11:00 (1 h)"). */
  after?: string;
  variant?: 'field' | 'ghost';
  className?: string;
  ariaLabel?: string;
}

function duration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const TIME = /^\d\d:\d\d$/;

/**
 * A time of day, like Google Calendar's: type any time ("9:07", "907",
 * "9pm") or pick one from a list in 15-minute steps, which opens as the field
 * is focused, scrolled to the current time. Enter or leaving the field keeps
 * what was typed; Esc goes back.
 */
function TimeSelectImpl({
  value,
  onChange,
  after,
  variant,
  className = 'w-24',
  ariaLabel,
}: Props) {
  const isTime = TIME.test(value);
  const options = useMemo(() => {
    const from = after ? toMinutes(after) + 15 : 0;
    const list: {value: string; label: string}[] = [];
    for (let m = from; m < 24 * 60; m += 15) {
      const t = fromMinutes(m);
      list.push({
        value: t,
        label: after ? `${t} (${duration(m - toMinutes(after))})` : t,
      });
    }
    return list;
  }, [after]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(isTime ? value : '');
  // Show outside changes to the value (set during render, not in an effect).
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setText(TIME.test(value) ? value : '');
  }
  // The highlighted option; -1 while what's typed is what counts.
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  // The option at or just before a time, to show where it is in the list.
  const near = (t: string) => {
    const m = toMinutes(t);
    let i = options.findIndex(o => toMinutes(o.value) > m);
    if (i === -1) i = options.length;
    return Math.max(0, i - 1);
  };
  const fits = (t: string) => !after || toMinutes(t) > toMinutes(after);
  const close = () => {
    setOpen(false);
    setActive(-1);
  };
  /** Keeps a typed time if it's one; otherwise back to the value. */
  const commit = (typed: string) => {
    const t = parseTime(typed);
    if (t && fits(t) && t !== value) onChange(t);
    else setText(isTime ? value : '');
    close();
  };
  const pick = (t: string) => {
    if (t !== value) onChange(t);
    setText(t);
    close();
    // Done with the field, as Enter in any field here: Ctrl+Z undoes the
    // change again rather than the typing.
    input.current?.blur();
  };

  const typedNear = parseTime(text);
  const nearIndex = near(typedNear ?? (isTime ? value : '09:00'));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      const from = active >= 0 ? active : nearIndex;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive(
        Math.max(0, Math.min(options.length - 1, from + (open ? step : 0))),
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0) pick(options[active].value);
      else e.currentTarget.blur();
    }
  };

  return (
    <Popover open={open} onOpenChange={o => !o && close()}>
      <PopoverAnchor asChild>
        <span
          className={`inline-flex h-7 min-w-0 items-center gap-1 rounded-md px-2 transition-colors duration-150 ${
            variant === 'ghost'
              ? 'hover:bg-raised focus-within:bg-raised'
              : 'border border-line bg-raised hover:border-dim/50'
          } ${className}`}
          onClick={() => {
            input.current?.focus();
            setOpen(true);
          }}
        >
          <input
            ref={input}
            role="combobox"
            aria-label={ariaLabel}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && active >= 0 ? `${listId}-${active}` : undefined
            }
            inputMode="numeric"
            size={5}
            value={text}
            placeholder={isTime ? undefined : value}
            onChange={e => {
              setText(e.target.value);
              setActive(-1);
              setOpen(true);
            }}
            onFocus={e => {
              e.currentTarget.select();
              setOpen(true);
            }}
            onBlur={() => commit(text)}
            onKeyDown={onKeyDown}
            onPointerDown={e => e.stopPropagation()}
            className="min-w-0 flex-1 bg-transparent tabular-nums outline-none placeholder:text-dim"
          />
          <ChevronDown
            size={14}
            aria-hidden
            className={`shrink-0 text-dim transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </PopoverAnchor>
      {open && (
        <PopoverContent
          align="start"
          sideOffset={4}
          onOpenAutoFocus={e => e.preventDefault()}
          onCloseAutoFocus={e => e.preventDefault()}
          // Esc closes the list (only: the card it's in stays) and goes back
          // to the value. Radix handles it before the field's own keydown.
          onEscapeKeyDown={() => setText(isTime ? value : '')}
          onInteractOutside={e => {
            // A press on the field itself isn't outside.
            if (input.current?.parentElement?.contains(e.target as Node))
              e.preventDefault();
          }}
          className="min-w-[var(--radix-popover-trigger-width)] rounded-lg p-1"
        >
          <TimeList
            id={listId}
            label={ariaLabel}
            options={options}
            value={value}
            near={nearIndex}
            active={active}
            onHover={setActive}
            onPick={pick}
          />
        </PopoverContent>
      )}
    </Popover>
  );
}

/** The list of times, mounted with the open list (after the popover). */
function TimeList({
  id,
  label,
  options,
  value,
  near,
  active,
  onHover,
  onPick,
}: {
  id: string;
  label?: string;
  options: {value: string; label: string}[];
  value: string;
  /** The option to show in the middle when it opens. */
  near: number;
  active: number;
  onHover(i: number): void;
  onPick(t: string): void;
}) {
  const list = useRef<HTMLDivElement>(null);
  // Show the `near` option in the middle, like a native select. The list's
  // height is only capped once the popover is positioned, after this first
  // layout, so until then there's nothing to scroll: wait for it.
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const center = () => {
      const option = el.querySelector<HTMLElement>('[data-near]');
      if (!option || el.scrollHeight <= el.clientHeight) return false;
      // Offsets, not client rects: the popover's open animation scales it.
      el.scrollTop =
        option.offsetTop - (el.clientHeight - option.offsetHeight) / 2;
      return true;
    };
    if (center()) return;
    const observer = new ResizeObserver(() => {
      if (center()) observer.disconnect();
    });
    observer.observe(el);
    return () => observer.disconnect();
    // Only as it opens: typing then moves the highlight, not the list.
  }, []);
  useLayoutEffect(() => {
    if (active >= 0)
      list.current
        ?.querySelector(`[data-index="${active}"]`)
        ?.scrollIntoView({block: 'nearest'});
  }, [active]);
  return (
    <div
      ref={list}
      id={id}
      role="listbox"
      aria-label={label}
      // Keep the focus in the field (options, scrollbar), so it doesn't
      // commit what's typed first.
      onMouseDown={e => e.preventDefault()}
      className="scroll-thin relative max-h-[min(320px,var(--radix-popover-content-available-height))] overflow-y-auto"
    >
      {options.map((o, i) => (
        <div
          key={o.value}
          id={`${id}-${i}`}
          role="option"
          aria-selected={o.value === value}
          data-index={i}
          data-near={i === near || undefined}
          onMouseEnter={() => onHover(i)}
          onClick={() => onPick(o.value)}
          className={`flex cursor-pointer items-center rounded-md py-1.5 pr-8 pl-2.5 tabular-nums select-none ${
            i === active || (active < 0 && o.value === value) ? 'bg-raised' : ''
          } ${o.value === value ? 'font-medium text-strong' : ''}`}
        >
          {o.label}
        </div>
      ))}
    </div>
  );
}

/** Memoized: re-renders only when its props change. */
export const TimeSelect = memo(TimeSelectImpl);
