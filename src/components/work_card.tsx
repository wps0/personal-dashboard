import {logAsPlanned} from '../actions';
import {fmtH} from '../format';
import {useToday} from '../hooks';
import {MONDAY, startOfWeek} from '../model/dates';
import {
  plannedWork,
  spanHours,
  spansOn,
  weekHours,
  weekTarget,
} from '../model/work';
import {href} from '../router';
import {useStore} from '../store';

/** Home's small work card: today's work, logged or planned, and the week against its target. */
export function WorkCard() {
  const today = useToday();
  const log = useStore(s => s.data.workLog);
  const settings = useStore(s => s.data.settings);
  const spans = spansOn(log, today);
  const planned = plannedWork(
    settings.capacityRules,
    settings.dayCapacity,
    today,
    settings.workLabel,
  );
  const monday = startOfWeek(today, MONDAY);
  const logged = weekHours(log, monday);
  const target = weekTarget(settings, monday);
  const times = (xs: {start: string; end: string}[]) =>
    xs.map(x => `${x.start}–${x.end}`).join(', ');
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
              {times(spans)} ·{' '}
              {fmtH(spans.reduce((sum, s) => sum + spanHours(s), 0))} logged
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
            {fmtH(logged)}
            {target > 0 && ` of ${fmtH(target)}`}
          </span>
          {target > 0 && (
            <div
              className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-raised"
              aria-hidden
            >
              <div
                className="h-full rounded-full bg-accent"
                style={{width: `${Math.min(100, (logged / target) * 100)}%`}}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
