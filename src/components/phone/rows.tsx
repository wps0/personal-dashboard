import {ChevronDown, Ellipsis, Flag} from 'lucide-react';
import {useState} from 'react';
import {toggleSession} from '../../actions';
import {fmtDuration, URGENCY_CLASS} from '../../format';
import type {Lookups} from '../../hooks';
import {countdown} from '../../model/dates';
import {urgency} from '../../model/selectors';
import {fromMinutes, toMinutes} from '../../model/time';
import type {Allocation, ISODate, Item} from '../../model/types';
import {useUi} from '../../ui';
import {Tick} from './parts';
import {PlanSheet, SessionSheet} from './plan_sheet';

/**
 * A planned session: a tick, its task and project (a tap opens the task),
 * its time if it has one, its length with the unit, and ⋯ for the rest.
 */
export function SessionRow({
  alloc,
  lookups,
}: {
  alloc: Allocation;
  lookups: Lookups;
}) {
  const item = lookups.item(alloc.itemId);
  const [sheet, setSheet] = useState(false);
  if (!item) return null;
  const end =
    alloc.start &&
    fromMinutes(toMinutes(alloc.start) + Math.round(alloc.plannedHours * 60));
  return (
    <li
      className="flex min-h-14 items-center border-l-4 pr-1"
      style={{borderLeftColor: lookups.color(item)}}
    >
      <Tick
        checked={alloc.done}
        label={`${item.title}: done`}
        onChange={() => toggleSession(alloc.id)}
      />
      <button
        className="min-w-0 flex-1 py-1.5 text-left"
        onClick={() => useUi.getState().openItem(item.id)}
      >
        <div
          className={`truncate ${alloc.done ? 'text-dim line-through' : 'text-strong'}`}
        >
          {item.title}
        </div>
        <div className="truncate text-[13px] text-dim">
          {alloc.start && (
            <span className="text-fg tabular-nums">
              {alloc.start}–{end} ·{' '}
            </span>
          )}
          {lookups.project(item.projectId)?.name}
        </div>
      </button>
      <span className="px-1 text-[14px] text-dim tabular-nums">
        {fmtDuration(alloc.plannedHours)}
      </span>
      <button
        className="flex h-11 w-11 shrink-0 items-center justify-center text-dim"
        aria-label={`Move or change “${item.title}”`}
        onClick={() => setSheet(true)}
      >
        <Ellipsis size={20} aria-hidden />
      </button>
      {sheet && (
        <SessionSheet
          alloc={alloc}
          item={item}
          onClose={() => setSheet(false)}
        />
      )}
    </li>
  );
}

/** A task that still needs time on the plan, with Plan. */
export function ToPlanRow({
  item,
  remaining,
  lookups,
  today,
}: {
  item: Item;
  /** Hours of its estimate not planned yet; none without an estimate. */
  remaining?: number;
  lookups: Lookups;
  today: ISODate;
}) {
  const [planning, setPlanning] = useState(false);
  return (
    <li
      className="flex min-h-14 items-center gap-2 border-l-4 pr-3 pl-3"
      style={{borderLeftColor: lookups.color(item)}}
    >
      <button
        className="min-w-0 flex-1 py-1.5 text-left"
        onClick={() => useUi.getState().openItem(item.id)}
      >
        <div className="truncate text-strong">{item.title}</div>
        <div className="truncate text-[13px] text-dim">
          {item.dueDate && (
            <span className={URGENCY_CLASS[urgency(item.dueDate, today)]}>
              <Flag size={12} className="mr-1 inline" aria-hidden />
              due {countdown(item.dueDate, today)} ·{' '}
            </span>
          )}
          {remaining !== undefined && `${fmtDuration(remaining)} to plan · `}
          {lookups.project(item.projectId)?.name}
        </div>
      </button>
      <button
        className="flex h-10 shrink-0 items-center gap-1 rounded-full border border-line bg-raised px-3.5 text-[14px] font-medium text-strong"
        aria-label={`Plan “${item.title}”`}
        onClick={() => setPlanning(true)}
      >
        Plan <ChevronDown size={14} aria-hidden />
      </button>
      {planning && <PlanSheet item={item} onClose={() => setPlanning(false)} />}
    </li>
  );
}
