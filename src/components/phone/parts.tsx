/**
 * @fileoverview Building blocks of the phone screens: sized for a thumb
 * (44px to tap), with words where the desktop has badges and tooltips.
 */
import {Check} from 'lucide-react';
import {useEffect, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {fmtDuration} from '../../format';
import {addDays, dayName, shortDate} from '../../model/dates';
import type {ISODate} from '../../model/types';

/** "Today", "Tomorrow", or "Thu 12 Nov". */
export function relativeDay(d: ISODate, today: ISODate): string {
  if (d === today) return 'Today';
  if (d === addDays(today, 1)) return 'Tomorrow';
  return `${dayName(d)} ${shortDate(d)}`;
}

/** A tick box drawn at 24px inside a 44px place to tap. */
export function Tick({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange(): void;
}) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className="flex h-11 w-11 shrink-0 items-center justify-center"
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-md border-2 transition-colors duration-150 ${checked ? 'border-ok bg-ok text-bg' : 'border-dim'}`}
      >
        {checked && <Check size={16} strokeWidth={3} aria-hidden />}
      </span>
    </button>
  );
}

/** "1h planned of 1h 30m" with a bar: a day's (or week's) plan against its capacity. */
export function CapacityLine({
  planned,
  total,
}: {
  planned: number;
  total: number;
}) {
  const over = planned > total;
  const fill = total
    ? Math.min(100, (planned / total) * 100)
    : planned
      ? 100
      : 0;
  return (
    <div className="flex items-center gap-2 text-[13px] text-dim">
      <span className={`tabular-nums ${over ? 'text-danger' : ''}`}>
        <span className={over ? '' : 'text-fg'}>{fmtDuration(planned)}</span>{' '}
        planned of {fmtDuration(total)}
      </span>
      <span
        aria-hidden
        className="h-1.5 w-16 overflow-hidden rounded-full bg-raised"
      >
        <span
          className={`block h-full rounded-full ${over ? 'bg-danger' : 'bg-accent'}`}
          style={{width: `${fill}%`}}
        />
      </span>
    </div>
  );
}

/** A section's heading, with an optional link or button at its right. */
export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mt-3 flex min-h-11 items-end px-4 pb-1">
      <h2 className="text-[13px] font-semibold tracking-wide text-dim uppercase">
        {children}
      </h2>
      <span className="-mb-2.5 ml-auto">{action}</span>
    </div>
  );
}

/** The frame of a list of rows. */
export const LIST =
  'mx-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel';

/**
 * A sheet from the bottom of the screen, for choices made with a thumb.
 * Closes on a tap outside or Esc.
 */
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose(): void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col justify-end">
      <div
        className="absolute inset-0 animate-fade-in bg-black/55"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="scroll-thin relative max-h-[85dvh] animate-rise-in overflow-y-auto rounded-t-2xl border-t border-line bg-panel px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] text-[15px] shadow-2xl"
      >
        <div
          aria-hidden
          className="mx-auto mb-3 h-1 w-10 rounded-full bg-line"
        />
        <h2 className="text-[17px] font-semibold text-strong">{title}</h2>
        {subtitle && (
          <p className="truncate text-[14px] text-dim">{subtitle}</p>
        )}
        <div className="mt-3">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
