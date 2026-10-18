import {Minus, Plus, RotateCcw} from 'lucide-react';
import {memo, useState} from 'react';
import {fmtH} from '../format';
import type {CapacityInfo} from '../model/capacity';
import {formatLong} from '../model/dates';
import type {ISODate} from '../model/types';
import {href} from '../router';
import {useStore} from '../store';
import {HoursInput} from './HoursInput';
import {Popover, PopoverContent, PopoverTrigger} from './ui/Popover';

function signed(n: number) {
  return n > 0 ? `+${fmtH(n)}` : n < 0 ? `−${fmtH(-n)}` : '±0h';
}

/** "planned/capacity" for a day; click for the breakdown and per-day adjustments. */
function CapacityBadgeImpl({
  date,
  planned,
  info,
  isPast,
}: {
  date: ISODate;
  planned: number;
  info: CapacityInfo;
  isPast: boolean;
}) {
  const [open, setOpen] = useState(false);
  const over = planned > info.total;
  const tweaked = info.delta !== 0 || info.override != null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onPointerDown={e => e.stopPropagation()}
        className={`rounded px-1 text-[11px] tabular-nums hover:bg-raised ${over ? 'text-danger' : planned > 0 ? 'text-fg' : 'text-dim'}`}
        title="Planned / capacity: click for details"
      >
        {fmtH(planned)}/{fmtH(info.total)}
        {tweaked && <span className="text-accent">*</span>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3 text-[12px]">
        <div className="mb-2 font-medium text-strong">
          Capacity · {formatLong(date)}
        </div>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 tabular-nums">
          <dt className="text-dim">
            Planning window {info.window.start}–{info.window.end}
          </dt>
          <dd>{fmtH(info.windowHours)}</dd>
          <dt className="text-dim">Events in window</dt>
          <dd>{info.busyHours ? `−${fmtH(info.busyHours)}` : '0h'}</dd>
          <dt className="text-dim">Global adjustment</dt>
          <dd>{signed(info.adjustment)}</dd>
          <dt className="text-dim">This day</dt>
          <dd>
            {isPast ? (
              signed(info.delta)
            ) : (
              <span className="flex items-center gap-0.5">
                <button
                  className="icon-btn h-5 w-5"
                  aria-label="Less"
                  onClick={() =>
                    useStore
                      .getState()
                      .setDayCapacity(date, {delta: info.delta - 0.5})
                  }
                >
                  <Minus size={12} />
                </button>
                <span className="w-9 text-center">{signed(info.delta)}</span>
                <button
                  className="icon-btn h-5 w-5"
                  aria-label="More"
                  onClick={() =>
                    useStore
                      .getState()
                      .setDayCapacity(date, {delta: info.delta + 0.5})
                  }
                >
                  <Plus size={12} />
                </button>
              </span>
            )}
          </dd>
          <dt className="border-t border-line pt-1 font-medium text-strong">
            Capacity
          </dt>
          <dd className="border-t border-line pt-1 font-medium text-strong">
            {fmtH(info.total)}
          </dd>
          <dt className="text-dim">Planned</dt>
          <dd className={over ? 'text-danger' : ''}>{fmtH(planned)}</dd>
        </dl>
        {isPast ? (
          <p className="mt-2 text-dim">Past days are locked.</p>
        ) : (
          <div className="mt-3 space-y-2 border-t border-line pt-2">
            <label className="flex items-center justify-between gap-2">
              <span className="text-dim">Fixed capacity (overrides)</span>
              <span className="flex items-center">
                <HoursInput
                  optional
                  value={info.override}
                  onChange={override =>
                    useStore.getState().setDayCapacity(date, {override})
                  }
                  className="field w-12"
                />
                <span className="ml-0.5 text-dim">h</span>
              </span>
            </label>
            <div className="flex items-center justify-between">
              <a
                href={href({name: 'settings'})}
                className="text-accent hover:underline"
                onClick={() => setOpen(false)}
              >
                Planning windows…
              </a>
              {(info.delta !== 0 || info.override != null) && (
                <button
                  className="btn h-6"
                  onClick={() => useStore.getState().setDayCapacity(date, null)}
                >
                  <RotateCcw size={12} /> reset day
                </button>
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Memoized: re-renders only when its props change. */
export const CapacityBadge = memo(CapacityBadgeImpl);
