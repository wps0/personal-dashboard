import {ChevronDown} from 'lucide-react';
import {useMemo, useState} from 'react';
import {planSession} from '../actions';
import {PLAN_DAYS, PLAN_LENGTHS} from '../config';
import {fmtDuration, URGENCY_CLASS} from '../format';
import {useFreeHours, useLookups, useToday} from '../hooks';
import {addDays, countdown} from '../model/dates';
import {
  backlogItems,
  defaultAllocationHours,
  urgency,
} from '../model/selectors';
import type {ISODate, Item} from '../model/types';
import {href} from '../router';
import {useStore} from '../store';
import {useUi} from '../ui';
import {relativeDay} from './phone/parts';
import {Popover, PopoverContent, PopoverTrigger} from './ui/popover';

/** How long, and which day; each day says how much room it has. */
function PlanMenu({
  item,
  remaining,
  onDone,
}: {
  item: Item;
  remaining?: number;
  onDone(): void;
}) {
  const today = useToday();
  const [hours, setHours] = useState(() => defaultAllocationHours(remaining));
  const days = useMemo(
    () => Array.from({length: PLAN_DAYS}, (_, i) => addDays(today, i)),
    [today],
  );
  const free = useFreeHours(days);
  // The task's own default too, when it isn't one of the usual lengths.
  const lengths = PLAN_LENGTHS.includes(hours)
    ? PLAN_LENGTHS
    : [...PLAN_LENGTHS, hours].sort((a, b) => a - b);
  const plan = (d: ISODate) => {
    planSession(
      item.id,
      d,
      hours,
      `Planned “${item.title}” for ${relativeDay(d, today).replace(/^T/, 't')}`,
      // The day may not be among the ones Home shows, so say where it went.
      {quiet: false},
    );
    onDone();
  };
  return (
    <div className="w-72 p-2">
      <div
        role="radiogroup"
        aria-label="How long"
        className="mb-1.5 flex gap-1"
      >
        {lengths.map(h => (
          <button
            key={h}
            role="radio"
            aria-checked={h === hours}
            onClick={() => setHours(h)}
            className={`h-6 flex-1 rounded-full border text-[12px] whitespace-nowrap tabular-nums ${h === hours ? 'border-accent bg-accent/20 font-semibold text-accent' : 'border-line text-fg hover:border-dim/50'}`}
          >
            {fmtDuration(h)}
          </button>
        ))}
      </div>
      <ul>
        {days.map((d, i) => {
          const room = free.get(d) ?? 0;
          return (
            <li key={d}>
              <button
                data-autofocus={i === 0 ? '' : undefined}
                onClick={() => plan(d)}
                className="flex h-7 w-full items-center gap-2 rounded px-2 text-left hover:bg-raised focus-visible:bg-raised"
              >
                <span className="flex-1 text-strong">
                  {relativeDay(d, today)}
                </span>
                <span
                  className={`text-[12px] tabular-nums ${room >= hours ? 'text-ok' : room > 0 ? 'text-warn' : 'text-dim'}`}
                >
                  {room > 0 ? `${fmtDuration(room)} free` : 'full'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Home's tasks that still need time, each with Plan: a menu of lengths and
 * the next days with the room each has, so planning needs no drag and no
 * trip to the Week page. Not shown when there is nothing to plan.
 */
export function ToPlanCard() {
  const today = useToday();
  const lookups = useLookups();
  const items = useStore(s => s.data.items);
  const allocations = useStore(s => s.data.allocations);
  const projects = useStore(s => s.data.projects);
  const backlog = useMemo(
    () => backlogItems({items, allocations, projects}, today),
    [items, allocations, projects, today],
  );
  const [open, setOpen] = useState<string | null>(null);
  if (backlog.length === 0) return null;
  return (
    <section
      aria-label="To plan"
      className="flex max-h-80 flex-col rounded border border-line bg-panel lg:max-h-[25%] lg:min-h-24"
    >
      <header className="flex items-center border-b border-line px-2 py-1">
        <span className="label">to plan</span>
        <span className="ml-1.5 text-[11px] tabular-nums text-dim">
          {backlog.length}
        </span>
        <a
          href={href({name: 'week'})}
          className="btn-ghost ml-auto text-[11px]"
        >
          week view ↗
        </a>
      </header>
      <ul className="scroll-thin min-h-0 flex-1 space-y-px overflow-y-auto p-1">
        {backlog.map(({item, remaining}) => (
          <li
            key={item.id}
            className="flex items-center gap-2 rounded border-l-2 bg-raised/60 py-0.5 pr-1 pl-2"
            style={{borderLeftColor: lookups.color(item)}}
          >
            <button
              className="min-w-0 flex-1 text-left leading-tight"
              onClick={() => useUi.getState().openItem(item.id)}
            >
              <div className="truncate text-strong">{item.title}</div>
              <div className="truncate text-[11px] text-dim">
                {item.dueDate && (
                  <span className={URGENCY_CLASS[urgency(item.dueDate, today)]}>
                    due {countdown(item.dueDate, today)} ·{' '}
                  </span>
                )}
                {remaining !== undefined &&
                  `${fmtDuration(remaining)} to plan · `}
                {lookups.project(item.projectId)?.name}
              </div>
            </button>
            <Popover
              open={open === item.id}
              onOpenChange={o => setOpen(o ? item.id : null)}
            >
              <PopoverTrigger asChild>
                <button
                  className="btn h-6 px-2 text-[12px]"
                  aria-label={`Plan “${item.title}”`}
                >
                  Plan <ChevronDown size={12} aria-hidden />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end">
                <PlanMenu
                  item={item}
                  remaining={remaining}
                  onDone={() => setOpen(null)}
                />
              </PopoverContent>
            </Popover>
          </li>
        ))}
      </ul>
    </section>
  );
}
