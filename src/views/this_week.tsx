/**
 * @fileoverview PROTOTYPE (proto/week-plan, not for merging): the week's
 * staging list. Tasks picked for the week from the backlog wait here, each
 * with a strip of the week's days to put it on one or more of them (a
 * session without a time); the calendar then gives those sessions times.
 * Picks live in memory only, for the screenshots.
 */

import {useDraggable, useDroppable} from '@dnd-kit/core';
import {ArrowRight, Check, Plus} from 'lucide-react';
import {create} from 'zustand';
import {planSession, removeSession} from '../actions';
import {fmtDuration} from '../format';
import type {Lookups} from '../hooks';
import {addDays, dayName} from '../model/dates';
import {defaultAllocationHours, isItemDone} from '../model/selectors';
import type {Allocation, ISODate, Item} from '../model/types';
import {useStore} from '../store';
import {useUi} from '../ui';

/** Tasks picked for each week (its Monday), in the order picked. */
export const useStage = create<{
  picks: Record<string, string[]>;
  /** Picked last week and not finished: carried over (prototype: by hand). */
  carried: Record<string, string[]>;
}>()(() => ({picks: {}, carried: {}}));

export function pick(week: ISODate, itemId: string) {
  useStage.setState(s => {
    const list = s.picks[week] ?? [];
    return list.includes(itemId)
      ? s
      : {picks: {...s.picks, [week]: [...list, itemId]}};
  });
}

export function unpick(week: ISODate, itemId: string) {
  useStage.setState(s => ({
    picks: {
      ...s.picks,
      [week]: (s.picks[week] ?? []).filter(id => id !== itemId),
    },
  }));
}

export function usePicked(week: ISODate): Set<string> {
  const list = useStage(s => s.picks[week]);
  return new Set(list ?? []);
}

/** Hours of a task not on any day yet: its estimate less what's planned. */
function unplanned(item: Item, allocs: readonly Allocation[]): number | null {
  if (item.estimateHours == null) return null;
  const planned = allocs
    .filter(a => a.itemId === item.id)
    .reduce((s, a) => s + a.plannedHours, 0);
  return Math.max(0, item.estimateHours - planned);
}

/** The "+ this week" button on a backlog row. */
export function StageButton({week, item}: {week: ISODate; item: Item}) {
  const picked = useStage(s => (s.picks[week] ?? []).includes(item.id));
  if (picked)
    return (
      <span className="shrink-0 rounded bg-accent/10 px-1 text-[10px] text-accent">
        this week
      </span>
    );
  return (
    <button
      type="button"
      aria-label={`Add ${item.title} to this week`}
      title="Add to this week"
      onPointerDown={e => e.stopPropagation()}
      onClick={e => {
        e.stopPropagation();
        pick(week, item.id);
      }}
      className="icon-btn h-6 w-6 shrink-0 text-dim hover:text-accent"
    >
      <Plus size={14} />
    </button>
  );
}

/** The week's staging list as a box beside the days (desktop). */
export function ThisWeekBox(props: {
  start: ISODate;
  today: ISODate;
  lookups: Lookups;
}) {
  const {setNodeRef, isOver} = useDroppable({id: 'stage'});
  return (
    <section
      ref={setNodeRef}
      className={`drop-target flex min-h-64 flex-col rounded-lg border bg-panel md:min-h-0 ${isOver ? 'is-over border-accent bg-accent/5' : 'border-line'}`}
    >
      <ThisWeekList {...props} />
    </section>
  );
}

export function ThisWeekList({
  start,
  today,
  lookups,
  phone,
}: {
  start: ISODate;
  today: ISODate;
  lookups: Lookups;
  phone?: boolean;
}) {
  const ids = useStage(s => s.picks[start]) ?? [];
  const carried = useStage(s => s.carried[start]) ?? [];
  const items = useStore(s => s.data.items);
  const allocs = useStore(s => s.data.allocations);
  const picked = ids
    .map(id => items.find(i => i.id === id))
    .filter((i): i is Item => !!i);
  const days = Array.from({length: 7}, (_, i) => addDays(start, i));
  const weekAllocs = allocs.filter(a => a.date >= start && a.date <= days[6]);
  const notOnADay = picked.filter(
    i => !isItemDone(i) && !weekAllocs.some(a => a.itemId === i.id),
  ).length;
  const toPlace = picked.reduce(
    (s, i) => s + (isItemDone(i) ? 0 : (unplanned(i, allocs) ?? 0)),
    0,
  );
  return (
    <>
      <header
        className={`flex items-baseline gap-2 border-b border-line ${phone ? 'px-3 py-2' : 'px-2 py-1'}`}
      >
        <span className="label !text-fg">this week</span>
        <span className="text-[11px] text-dim">
          {picked.length} task{picked.length === 1 ? '' : 's'}
          {notOnADay > 0 && ` · ${notOnADay} not on a day`}
        </span>
        {toPlace > 0 && (
          <span className="ml-auto text-[11px] text-dim tabular-nums">
            {fmtDuration(toPlace)} to place
          </span>
        )}
      </header>
      {picked.length === 0 ? (
        <p className="m-auto max-w-56 p-3 text-center text-dim">
          Drag what you want to do this week here from the backlog, or press +
          on a task. Then put each on a day.
        </p>
      ) : (
        <ul className="scroll-thin min-h-0 flex-1 space-y-px overflow-y-auto p-1">
          {picked.map(item => (
            <StagedRow
              key={item.id}
              item={item}
              days={days}
              today={today}
              allocs={weekAllocs.filter(a => a.itemId === item.id)}
              left={unplanned(item, allocs)}
              lookups={lookups}
              carried={carried.includes(item.id)}
              phone={phone}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function StagedRow({
  item,
  days,
  today,
  allocs,
  left,
  lookups,
  carried,
  phone,
}: {
  item: Item;
  days: ISODate[];
  today: ISODate;
  allocs: Allocation[];
  left: number | null;
  lookups: Lookups;
  carried: boolean;
  phone?: boolean;
}) {
  const openItem = useUi(s => s.openItem);
  const done = isItemDone(item);
  const {attributes, listeners, setNodeRef, isDragging} = useDraggable({
    id: `staged:${item.id}`,
    data: {kind: 'item', item, remaining: left ?? undefined},
  });
  const placed = allocs.length > 0;
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`rounded-md border-l-2 hover:bg-raised ${phone ? 'px-2 py-2' : 'px-1.5 py-1'} ${isDragging ? 'opacity-30' : ''} ${done ? 'opacity-60' : ''}`}
      style={{borderLeftColor: lookups.color(item)}}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="w-3 shrink-0 text-center text-[13px] leading-none"
          aria-hidden
        >
          {done ? (
            <Check size={12} className="text-ok" />
          ) : carried ? (
            <ArrowRight size={12} className="text-warn" />
          ) : placed ? (
            <span className="text-dim">·</span>
          ) : (
            <span className="text-accent">•</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => openItem(item.id)}
          className={`min-w-0 flex-1 truncate text-left ${done ? 'line-through' : ''}`}
        >
          {item.title}
          <span className="text-[10px] text-dim">
            {' '}
            · {lookups.project(item.projectId)?.name}
          </span>
        </button>
        {left != null && left > 0 && !done && (
          <span
            className="shrink-0 text-[11px] text-dim tabular-nums"
            title="Hours not on a day yet"
          >
            {fmtDuration(left)}
          </span>
        )}
      </div>
      <div
        className={`mt-1 flex items-center pl-[18px] ${phone ? 'gap-1.5' : 'gap-0.5'}`}
        onPointerDown={e => e.stopPropagation()}
      >
        {days.map(d => {
          const here = allocs.filter(a => a.date === d);
          const timed = here.find(a => a.start);
          const untimed = here.find(a => !a.start && !a.done);
          const on = here.length > 0;
          const label = `${dayName(d)}${on ? ', planned' : ''}${timed ? ` at ${timed.start}` : ''}`;
          return (
            <button
              key={d}
              type="button"
              disabled={done || (on && !untimed) || d < today}
              aria-pressed={on}
              aria-label={label}
              title={
                timed
                  ? `${dayName(d)} ${timed.start}`
                  : on
                    ? `${dayName(d)}: no time yet (tap to take it off)`
                    : `Put it on ${dayName(d)}`
              }
              onClick={() => {
                if (untimed) removeSession(untimed.id, 'Taken off the day');
                else
                  planSession(
                    item.id,
                    d,
                    defaultAllocationHours(left ?? undefined),
                  );
              }}
              className={`flex items-center justify-center rounded-full font-medium tabular-nums transition-colors ${phone ? 'h-9 w-9 text-[13px]' : 'h-5 w-5 text-[10px]'} ${
                timed
                  ? 'bg-accent text-on-accent ring-2 ring-accent/40'
                  : on
                    ? 'bg-accent/80 text-on-accent'
                    : d < today
                      ? 'text-dim/40'
                      : 'bg-raised text-dim hover:text-fg'
              } ${d === today ? 'outline outline-1 outline-accent/60' : ''}`}
            >
              {timed && !phone ? '◷' : dayName(d)[0]}
            </button>
          );
        })}
        {allocs.some(a => a.start) && (
          <span className="ml-1 truncate text-[10px] text-dim">
            {allocs
              .filter(a => a.start)
              .map(a => `${dayName(a.date)} ${a.start}`)
              .join(', ')}
          </span>
        )}
      </div>
    </li>
  );
}
