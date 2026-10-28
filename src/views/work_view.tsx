import {ChevronLeft, ChevronRight, Plus, X} from 'lucide-react';
import {
  deleteWorkSpan,
  logAsPlanned,
  logWork,
  setWeekTarget,
  updateWorkSpan,
} from '../actions';
import {HoursInput} from '../components/hours_input';
import {TimeSelect} from '../components/time_select';
import {fmtH} from '../format';
import {useToday} from '../hooks';
import {useNavTarget} from '../keyboard';
import {
  addDays,
  dayName,
  isISODate,
  MONDAY,
  monthKey,
  monthName,
  shortDate,
  startOfWeek,
  weekNumber,
} from '../model/dates';
import {fromMinutes, toMinutes} from '../model/time';
import type {ISODate, WorkSpan} from '../model/types';
import {
  loggedHours,
  plannedWork,
  spanHours,
  spansOn,
  weekHours,
  weekTarget,
} from '../model/work';
import {navigate} from '../router';
import {useStore} from '../store';

/**
 * The work log (SPEC 3.10), a week at a time, Monday to Sunday: what was
 * worked each day next to what was planned (reserved time labelled as
 * work), and the week's total against its target.
 */
export function WorkView({week}: {week?: ISODate}) {
  const today = useToday();
  const monday = startOfWeek(week && isISODate(week) ? week : today, MONDAY);
  const thisWeek = startOfWeek(today, MONDAY);
  const go = (d: ISODate) => {
    const target = startOfWeek(d, MONDAY);
    navigate({name: 'work', week: target === thisWeek ? undefined : target});
  };
  useNavTarget({
    next: () => go(addDays(monday, 7)),
    prev: () => go(addDays(monday, -7)),
    today: () => go(today),
    goTo: go,
  });
  const log = useStore(s => s.data.workLog);
  const settings = useStore(s => s.data.settings);
  const days = Array.from({length: 7}, (_, i) => addDays(monday, i));

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl p-3 sm:p-5">
        <div className="mb-3 flex items-center gap-1">
          <h1 className="mr-2 text-lg font-medium text-strong">Work</h1>
          <button
            className="btn h-8 rounded-full px-4"
            onClick={() => go(today)}
            title="This week (t)"
          >
            This week
          </button>
          <button
            className="icon-btn"
            aria-label="Previous week"
            title="Previous week (k)"
            onClick={() => go(addDays(monday, -7))}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="icon-btn"
            aria-label="Next week"
            title="Next week (j)"
            onClick={() => go(addDays(monday, 7))}
          >
            <ChevronRight size={18} />
          </button>
          <span className="ml-1 text-dim tabular-nums">
            W{weekNumber(monday)} · {shortDate(monday)} –{' '}
            {shortDate(addDays(monday, 6))}
          </span>
        </div>
        <WeekSummary monday={monday} days={days} />
        <ul className="mt-3">
          {days.map(d => (
            <WorkDay
              key={d}
              date={d}
              isToday={d === today}
              spans={spansOn(log, d)}
              planned={plannedWork(
                settings.capacityRules,
                settings.dayCapacity,
                d,
                settings.workLabel,
              )}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The week's hours against its target, the target itself, and month totals. */
function WeekSummary({monday, days}: {monday: ISODate; days: ISODate[]}) {
  const log = useStore(s => s.data.workLog);
  const settings = useStore(s => s.data.settings);
  const logged = weekHours(log, monday);
  const target = weekTarget(settings, monday);
  const own = settings.weekWorkTargets[monday] !== undefined;
  const balance = logged - target;
  const months = [...new Set(days.map(monthKey))];
  return (
    <section
      aria-label="This week"
      className="rounded-lg border border-line bg-panel p-3"
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xl text-strong tabular-nums">
          {fmtH(logged)}
        </span>
        <span className="text-dim">
          logged{target > 0 && ` of ${fmtH(target)}`}
        </span>
        {target > 0 && (
          <span
            className={`ml-auto tabular-nums ${balance >= 0 ? 'text-accent' : 'text-dim'}`}
          >
            {balance >= 0 ? `${fmtH(balance)} over` : `${fmtH(-balance)} to go`}
          </span>
        )}
      </div>
      {target > 0 && (
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised"
          role="progressbar"
          aria-label="Logged of the weekly target"
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={logged}
        >
          <div
            className="h-full rounded-full bg-accent"
            style={{width: `${Math.min(100, (logged / target) * 100)}%`}}
          />
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-dim">
        <label className="flex items-center gap-1">
          Target this week
          <HoursInput
            value={target}
            onChange={h => setWeekTarget(monday, h ?? 0)}
            className="field w-14"
          />
          h
        </label>
        {own ? (
          <button
            className="text-accent hover:underline"
            onClick={() => setWeekTarget(monday, null)}
          >
            Use the default ({fmtH(settings.workTarget)})
          </button>
        ) : (
          <span>the default, set in Settings</span>
        )}
        <span className="ml-auto">
          {months
            .map(
              m =>
                `${monthName(m)}: ${fmtH(loggedHours(log, `${m}-01`, `${m}-31`))}`,
            )
            .join(' · ')}
        </span>
      </div>
    </section>
  );
}

/** One day: what was planned, the stretches logged, and the day's total. */
function WorkDay({
  date,
  isToday,
  spans,
  planned,
}: {
  date: ISODate;
  isToday: boolean;
  spans: WorkSpan[];
  planned: {start: string; end: string}[];
}) {
  const total = spans.reduce((sum, s) => sum + spanHours(s), 0);
  const label = `${dayName(date)} ${shortDate(date)}`;
  const add = () => {
    // After the last stretch, or the planned work, or a usual day.
    const last = spans.at(-1);
    if (last) {
      const start = toMinutes(last.end);
      if (start >= 24 * 60 - 15) return;
      logWork(date, last.end, fromMinutes(Math.min(start + 60, 24 * 60 - 1)));
    } else if (planned[0]) logWork(date, planned[0].start, planned[0].end);
    else logWork(date, '09:00', '17:00');
  };
  return (
    <li
      aria-label={label}
      className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-line py-2.5"
    >
      <div className="w-28 shrink-0">
        <div className={isToday ? 'font-medium text-accent' : 'text-strong'}>
          {label}
        </div>
        <div className="text-[11px] text-dim">
          {planned.length
            ? `Planned ${planned.map(p => `${p.start}–${p.end}`).join(', ')}`
            : 'Nothing planned'}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        {spans.map(s => (
          <SpanRow key={s.id} span={s} day={label} />
        ))}
        <div className="flex items-center gap-1">
          {!spans.length && planned.length > 0 && (
            <button className="btn h-7" onClick={() => logAsPlanned(date)}>
              Log as planned
            </button>
          )}
          <button
            className="btn-ghost flex items-center gap-1"
            onClick={add}
            aria-label={`Add a stretch, ${label}`}
          >
            <Plus size={13} /> add
          </button>
        </div>
      </div>
      <div className="w-14 shrink-0 pt-0.5 text-right tabular-nums text-strong">
        {total ? fmtH(total) : <span className="text-dim">–</span>}
      </div>
    </li>
  );
}

function SpanRow({span, day}: {span: WorkSpan; day: string}) {
  return (
    <div className="flex items-center gap-1">
      <TimeSelect
        value={span.start}
        onChange={start => {
          // Keep the end after the start.
          const end =
            toMinutes(span.end) > toMinutes(start)
              ? span.end
              : fromMinutes(Math.min(toMinutes(start) + 60, 24 * 60 - 1));
          updateWorkSpan(span.id, {start, end});
        }}
        variant="ghost"
        className="w-fit"
        ariaLabel={`Start, ${day}`}
      />
      <span className="text-dim">–</span>
      <TimeSelect
        value={span.end}
        after={span.start}
        onChange={end => updateWorkSpan(span.id, {end})}
        variant="ghost"
        className="w-fit"
        ariaLabel={`End, ${day}`}
      />
      <span className="text-[11px] text-dim tabular-nums">
        {fmtH(spanHours(span))}
      </span>
      <button
        className="icon-btn h-6 w-6 hover:!text-danger"
        aria-label={`Remove ${span.start} – ${span.end}, ${day}`}
        title="Remove"
        onClick={() => deleteWorkSpan(span)}
      >
        <X size={13} />
      </button>
    </div>
  );
}
