import {useMemo, useState, type ReactNode} from 'react';
import {planSessions} from '../actions';
import {SUGGEST_SESSION_MAX_HOURS} from '../config';
import {fmtDuration} from '../format';
import {useCapacities, useToday} from '../hooks';
import {dayName, shortDate} from '../model/dates';
import {committedHours} from '../model/selectors';
import {freeMinutes, spreadBackward, spreadDays} from '../model/suggest';
import type {Allocation, ISODate, Item} from '../model/types';
import {useStore} from '../store';
import {DurationInput} from './duration_input';

const day = (d: ISODate) => `${dayName(d)}, ${shortDate(d)}`;

/**
 * Suggested sessions (SPEC 3.5): the hours the task has left to plan, spread
 * backward from its due date over the free time before it. You review them
 * (change the hours, untick a day to move its share to others) and add them
 * in one step. `now` is the time it was opened, in minutes after midnight.
 */
export function SuggestSessions({
  item,
  now,
  onClose,
}: {
  item: Item;
  now: number;
  onClose(): void;
}) {
  const today = useToday();
  const due = item.dueDate;
  const days = useMemo(() => (due ? spreadDays(due, today) : []), [due, today]);
  if (!due || !days.length)
    return (
      <Panel>
        <p className="text-[12px] text-dim">
          {due
            ? 'It’s due today or earlier: no days are left before it.'
            : 'Give it a due date first: the sessions are spread backward from it.'}
        </p>
        <div className="mt-2 flex justify-end">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </Panel>
    );
  return (
    <Proposal
      item={item}
      due={due}
      days={days}
      today={today}
      now={now}
      onClose={onClose}
    />
  );
}

function Proposal({
  item,
  due,
  days,
  today,
  now,
  onClose,
}: {
  item: Item;
  due: ISODate;
  days: ISODate[];
  today: ISODate;
  now: number;
  onClose(): void;
}) {
  const allocations = useStore(s => s.data.allocations);
  const capacities = useCapacities(days);
  const [hours, setHours] = useState(() =>
    item.estimateHours == null
      ? 0
      : Math.max(
          0,
          item.estimateHours -
            committedHours(allocations.filter(a => a.itemId === item.id)),
        ),
  );
  const [skipped, setSkipped] = useState<ReadonlySet<ISODate>>(new Set());
  // Each day's free time, before this suggestion.
  const room = useMemo(() => {
    const byDay = new Map<ISODate, Allocation[]>();
    for (const a of allocations) {
      const list = byDay.get(a.date);
      if (list) list.push(a);
      else byDay.set(a.date, [a]);
    }
    return new Map(
      days.map(d => [
        d,
        freeMinutes(
          capacities.get(d)!,
          byDay.get(d) ?? [],
          d === today ? now : undefined,
        ),
      ]),
    );
  }, [allocations, capacities, days, today, now]);
  const spread = useMemo(
    () =>
      spreadBackward(
        hours,
        new Map([...room].map(([d, m]) => [d, skipped.has(d) ? 0 : m])),
      ),
    [hours, room, skipped],
  );
  const rows = [
    ...spread.sessions,
    ...[...skipped].map(date => ({date, hours: 0})),
  ].sort((a, b) => (a.date < b.date ? -1 : 1));
  const toggle = (d: ISODate) =>
    setSkipped(s => {
      const next = new Set(s);
      if (!next.delete(d)) next.add(d);
      return next;
    });
  const n = spread.sessions.length;

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px]">
        <span>Plan</span>
        <DurationInput
          value={hours}
          onChange={setHours}
          ariaLabel="Hours to plan"
          className="field w-16"
        />
        <span>before it’s due on {day(due)}</span>
        <span className="basis-full text-[11px] text-dim">
          The latest days first, up to {SUGGEST_SESSION_MAX_HOURS}h a day while
          other days have room. Untick a day to move its hours.
        </span>
      </div>
      {rows.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[12px]">
          {rows.map(r => {
            const off = skipped.has(r.date);
            return (
              <li key={r.date} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={!off}
                  onChange={() => toggle(r.date)}
                  aria-label={`Plan on ${day(r.date)}`}
                />
                <span className={`w-24 ${off ? 'text-dim line-through' : ''}`}>
                  {day(r.date)}
                </span>
                <span className="w-14 text-right tabular-nums">
                  {off ? '' : fmtDuration(r.hours)}
                </span>
                <span className="text-dim">
                  {off
                    ? 'skipped'
                    : `of ${fmtDuration(room.get(r.date)! / 60)} free`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {hours <= 0 ? (
        <p className="mt-2 text-[12px] text-dim">
          {item.estimateHours == null
            ? 'It has no estimate: say how many hours to plan.'
            : 'Its estimate is planned already: say how many more hours to plan.'}
        </p>
      ) : (
        spread.short > 0 && (
          <p className="mt-2 text-[12px] text-warn">
            {fmtDuration(spread.short)} don’t fit in the free time before then.
          </p>
        )
      )}
      <div className="mt-2 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn-primary"
          disabled={!n}
          onClick={() => {
            planSessions(item.id, spread.sessions);
            onClose();
          }}
        >
          Add {n} {n === 1 ? 'session' : 'sessions'}
        </button>
      </div>
    </Panel>
  );
}

function Panel({children}: {children: ReactNode}) {
  return (
    <div
      role="group"
      aria-label="Suggested sessions"
      className="mt-2 rounded-md border border-line p-2"
    >
      <div className="label mb-1">suggested sessions</div>
      {children}
    </div>
  );
}
