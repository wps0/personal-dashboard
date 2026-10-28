import {Clock, Trash2, X} from 'lucide-react';
import {deleteReserved, resetReserved, updateReserved} from '../actions';
import {reservedRanges} from '../model/capacity';
import {formatLong} from '../model/dates';
import {fromMinutes, toMinutes} from '../model/time';
import type {ISODate} from '../model/types';
import {href} from '../router';
import {useStore} from '../store';
import {BufferedInput} from './buffered';
import {TimeSelect} from './time_select';

/**
 * Card for one of a day's reserved ranges (e.g. Work): its label and times,
 * for this day only. The weekly reserved time is set in Settings.
 */
export function ReservedEditor({
  date,
  index,
  onClose,
}: {
  date: ISODate;
  index: number;
  onClose(): void;
}) {
  const rules = useStore(s => s.data.settings.capacityRules);
  const days = useStore(s => s.data.settings.dayCapacity);
  const range = reservedRanges(rules, days, date)[index];
  if (!range) return null;
  const own = !!days[date]?.reserved;
  const start = toMinutes(range.start);
  const end = toMinutes(range.end);
  // Sleep-like ranges run past midnight: their end is before their start.
  const wraps = end <= start;
  return (
    <div className="w-[400px] max-w-[calc(100vw-24px)] p-3">
      <div className="mb-1 flex justify-end gap-0.5">
        <button
          className="icon-btn hover:!text-danger"
          aria-label="Delete reserved time"
          title="Delete (this day only)"
          onClick={() => {
            onClose();
            deleteReserved(date, index);
          }}
        >
          <Trash2 size={16} />
        </button>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="mb-3 flex items-center gap-3">
        <span className="reserved h-4 w-4 shrink-0 rounded border border-line" />
        <BufferedInput
          value={range.label ?? ''}
          placeholder="Label, e.g. Work"
          aria-label="Label"
          onCommit={label =>
            updateReserved(date, index, {label: label.trim() || undefined})
          }
          className="min-w-0 flex-1 border-b-2 border-transparent pb-1 text-lg text-strong hover:border-line focus:border-accent"
        />
      </div>
      <div className="flex items-center gap-3">
        <Clock size={16} className="shrink-0 text-dim" />
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <span className="mr-1">{formatLong(date)}</span>
          <TimeSelect
            value={range.start}
            onChange={s => {
              // Moving the start keeps the length, as for events.
              const len = wraps ? 0 : end - start;
              const from = toMinutes(s);
              updateReserved(date, index, {
                start: s,
                ...(wraps
                  ? {}
                  : {end: fromMinutes(Math.min(from + len, 24 * 60 - 1))}),
              });
            }}
            variant="ghost"
            className="w-fit"
            ariaLabel="Start time"
          />
          <span className="text-dim">–</span>
          <TimeSelect
            value={range.end}
            after={wraps ? undefined : range.start}
            onChange={e => updateReserved(date, index, {end: e})}
            variant="ghost"
            className="w-fit"
            ariaLabel="End time"
          />
        </div>
      </div>
      <p className="mt-3 pl-7 text-[11px] text-dim">
        {own ? (
          <>
            This day’s own reserved time.{' '}
            <button
              className="text-accent hover:underline"
              onClick={() => {
                onClose();
                resetReserved(date);
              }}
            >
              Use the weekly one
            </button>
          </>
        ) : (
          <>
            From the weekly reserved time (
            <a
              className="text-accent hover:underline"
              href={href({name: 'settings'})}
            >
              Settings
            </a>
            ); changes here are for this day only.
          </>
        )}
      </p>
    </div>
  );
}
