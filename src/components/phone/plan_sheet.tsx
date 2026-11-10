import {CalendarPlus, CircleCheck, Trash2} from 'lucide-react';
import {useMemo, useState} from 'react';
import {
  completeItem,
  planSession,
  removeSession,
  updateSession,
} from '../../actions';
import {PLAN_DAYS, PLAN_LENGTHS} from '../../config';
import {fmtDuration} from '../../format';
import {useFreeHours, useToday} from '../../hooks';
import {addDays} from '../../model/dates';
import {backlogItems, defaultAllocationHours} from '../../model/selectors';
import type {Allocation, ISODate, Item} from '../../model/types';
import {useStore} from '../../store';
import {relativeDay, Sheet} from './parts';

function Lengths({value, onPick}: {value: number; onPick(h: number): void}) {
  // The session's own length too, when it isn't one of the usual ones.
  const lengths = PLAN_LENGTHS.includes(value)
    ? PLAN_LENGTHS
    : [...PLAN_LENGTHS, value].sort((a, b) => a - b);
  return (
    <div
      role="radiogroup"
      aria-label="How long"
      className="mb-3 flex gap-2 overflow-x-auto"
    >
      {lengths.map(h => (
        <button
          key={h}
          role="radio"
          aria-checked={h === value}
          onClick={() => onPick(h)}
          className={`h-11 min-w-14 flex-1 rounded-full border px-2 text-[14px] whitespace-nowrap tabular-nums ${h === value ? 'border-accent bg-accent/20 font-semibold text-accent' : 'border-line text-fg'}`}
        >
          {fmtDuration(h)}
        </button>
      ))}
    </div>
  );
}

/** The days from today, each with the room it has for `hours`. */
function Days({
  hours,
  current,
  onPick,
}: {
  hours: number;
  /** The day the session is on now, when moving one. */
  current?: ISODate;
  onPick(d: ISODate): void;
}) {
  const today = useToday();
  const days = useMemo(
    () => Array.from({length: PLAN_DAYS}, (_, i) => addDays(today, i)),
    [today],
  );
  const free = useFreeHours(days);
  return (
    <ul className="-mx-2">
      {days.map(d => {
        const room = free.get(d) ?? 0;
        return (
          <li key={d}>
            <button
              onClick={() => onPick(d)}
              disabled={d === current}
              className="flex h-12 w-full items-center gap-3 rounded-lg px-2 text-left active:bg-raised disabled:opacity-50"
            >
              <CalendarPlus size={18} className="text-dim" aria-hidden />
              <span className="flex-1 text-strong">
                {relativeDay(d, today)}
                {d === current && (
                  <span className="text-dim"> · it’s here now</span>
                )}
              </span>
              <span
                className={`text-[13px] tabular-nums ${room >= hours ? 'text-ok' : room > 0 ? 'text-warn' : 'text-dim'}`}
              >
                {room > 0 ? `${fmtDuration(room)} free` : 'full'}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Planning without dragging: how long, and which day; each day says how much
 * room it has (green when the session fits, amber when it doesn't).
 */
export function PlanSheet({item, onClose}: {item: Item; onClose(): void}) {
  const today = useToday();
  const remaining = useStore(
    s =>
      backlogItems(s.data, today).find(b => b.item.id === item.id)?.remaining,
  );
  const [hours, setHours] = useState(() => defaultAllocationHours(remaining));
  return (
    <Sheet
      title="Plan"
      subtitle={
        <>
          {item.title}
          {remaining !== undefined &&
            ` · ${fmtDuration(remaining)} left to plan`}
        </>
      }
      onClose={onClose}
    >
      <Lengths value={hours} onPick={setHours} />
      <Days
        hours={hours}
        onPick={d => {
          planSession(
            item.id,
            d,
            hours,
            `Planned “${item.title}” for ${relativeDay(d, today).replace(/^T/, 't')}`,
          );
          onClose();
        }}
      />
    </Sheet>
  );
}

/**
 * A planned session's choices: its length, another day, completing its task,
 * or taking it off the plan. What dragging and the hover buttons do on desktop.
 */
export function SessionSheet({
  alloc,
  item,
  onClose,
}: {
  alloc: Allocation;
  item: Item;
  onClose(): void;
}) {
  const today = useToday();
  return (
    <Sheet
      title={item.title}
      subtitle="Change its length, or move it"
      onClose={onClose}
    >
      <Lengths
        value={alloc.plannedHours}
        onPick={h =>
          updateSession(alloc.id, {plannedHours: h}, 'Session length changed')
        }
      />
      <Days
        hours={alloc.plannedHours}
        current={alloc.date}
        onPick={d => {
          updateSession(
            alloc.id,
            {date: d},
            `Moved “${item.title}” to ${relativeDay(d, today).replace(/^T/, 't')}`,
          );
          onClose();
        }}
      />
      <div className="-mx-2 mt-1 border-t border-line pt-1">
        <button
          className="flex h-12 w-full items-center gap-3 rounded-lg px-2 text-left active:bg-raised"
          onClick={() => {
            completeItem(item);
            onClose();
          }}
        >
          <CircleCheck size={18} className="text-ok" aria-hidden />
          Mark the whole task complete
        </button>
        <button
          className="flex h-12 w-full items-center gap-3 rounded-lg px-2 text-left text-danger active:bg-raised"
          onClick={() => {
            removeSession(alloc.id);
            onClose();
          }}
        >
          <Trash2 size={18} aria-hidden />
          Remove from the plan
        </button>
      </div>
    </Sheet>
  );
}
