import {logAsPlanned} from '../actions';
import {fmtHours} from '../format';
import {useToday, useWeekStart} from '../hooks';
import {startOfWeek} from '../model/dates';
import {
  isHoursOnly,
  plannedWork,
  spanHours,
  spansOn,
  weekHours,
  weekPlannedHours,
  weekTarget,
} from '../model/work';
import {href} from '../router';
import {useStore} from '../store';
import {WorkBar} from './work_bar';
import {showEnd} from '../model/time';

/** Home's small work card: today's work, logged or planned, and the week against its target. */
export function WorkCard() {
  const today = useToday();
  const log = useStore(s => s.data.workLog);
  const settings = useStore(s => s.data.settings);
  const events = useStore(s => s.data.events);
  const spans = spansOn(log, today);
  // Hours logged alone have no times to list.
  const timed = spans.filter(s => !isHoursOnly(s));
  const planned = plannedWork(events, today, settings.workLabel);
  // The week as on the Work page: from the day set in Settings → Calendar.
  const start = startOfWeek(today, useWeekStart());
  const logged = weekHours(log, start);
  const plannedWeek = weekPlannedHours(log, events, start, settings.workLabel);
  const target = weekTarget(settings, start);
  const times = (xs: {start: string; end: string}[]) =>
    xs.map(x => `${x.start}–${showEnd(x.end)}`).join(', ');
  return (
    <section
      aria-label="Work"
      className="shrink-0 rounded border border-line bg-panel"
    >
      <header className="flex items-center border-b border-line px-2 py-1">
        <span className="label">work</span>
        <a
          href={href({name: 'work'})}
          className="btn-ghost ml-auto text-[11px]"
        >
          edit ↗
        </a>
      </header>
      <div className="space-y-1.5 px-2 py-1.5 text-[12px]">
        <div className="flex items-center gap-2">
          <span className="text-dim">Today</span>
          {spans.length ? (
            <span className="min-w-0 flex-1 truncate tabular-nums">
              {timed.length > 0 && `${times(timed)} · `}
              {fmtHours(spans.reduce((sum, s) => sum + spanHours(s), 0))} logged
            </span>
          ) : planned.length ? (
            <>
              <span className="min-w-0 flex-1 truncate text-dim tabular-nums">
                planned {times(planned)}
              </span>
              <button
                className="btn h-6 shrink-0 px-2 text-[11px]"
                onClick={() => logAsPlanned(today)}
              >
                Log as planned
              </button>
            </>
          ) : (
            <span className="text-dim">nothing planned</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-dim">Week</span>
          <span className="tabular-nums">
            {fmtHours(logged)}
            {target > 0 && ` of ${fmtHours(target)}`}
          </span>
          {target > 0 && (
            <WorkBar
              logged={logged}
              planned={plannedWeek}
              target={target}
              className="h-1.5 min-w-0 flex-1"
            />
          )}
        </div>
      </div>
    </section>
  );
}
