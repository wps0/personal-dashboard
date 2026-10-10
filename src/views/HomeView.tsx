import { memo, useMemo } from 'react';
import { ProgressRing } from '../components/ProgressRing';
import { TimeGrid } from '../components/TimeGrid';
import { fmtH, URGENCY_CLASS } from '../format';
import { useLookups, type Lookups } from '../hooks';
import { addDays, countdown, dayName, shortDate, todayISO } from '../model/dates';
import { allocationsByItem, isItemDone, missedAllocations, projectStats, urgency } from '../model/selectors';
import type { Allocation, ISODate } from '../model/types';
import { href } from '../router';
import { useStore } from '../store';
import { useUi } from '../ui';

/** Landing page: the next three days, what's planned, and how projects stand. */
export function HomeView() {
  const today = todayISO();
  const days = useMemo(() => [today, addDays(today, 1), addDays(today, 2)], [today]);
  return (
    <div className="grid h-full grid-cols-1 gap-2 overflow-y-auto p-2 lg:grid-cols-[minmax(0,1fr)_380px] lg:overflow-hidden">
      <div className="h-[70vh] min-h-0 lg:h-full">
        <TimeGrid days={days} hourHeight={40} scrollToHour={Math.max(0, new Date().getHours() - 2)} />
      </div>
      <div className="flex min-h-0 flex-col gap-2">
        <Planned days={days} />
        <Projects />
      </div>
    </div>
  );
}

function Planned({ days }: { days: ISODate[] }) {
  const allocations = useStore((s) => s.data.allocations);
  const items = useStore((s) => s.data.items);
  const projects = useStore((s) => s.data.projects);
  const lookups = useLookups();
  const missed = useMemo(() => missedAllocations({ items, allocations, projects }, days[0]).length, [items, allocations, projects, days]);
  const byDay = useMemo(
    () =>
      days.map((d) => ({
        date: d,
        allocs: allocations.filter((a) => a.date === d).sort((a, b) => (a.start ?? '99').localeCompare(b.start ?? '99')),
      })),
    [allocations, days],
  );

  return (
    <section className="flex max-h-[55%] min-h-0 flex-col rounded border border-line bg-panel">
      <header className="flex items-center border-b border-line px-2 py-1">
        <span className="label">planned</span>
        {missed > 0 && (
          <a href={href({ name: 'week' })} className="ml-2 text-[11px] text-danger hover:underline">
            {missed} missed →
          </a>
        )}
        <a href={href({ name: 'week' })} className="btn-ghost ml-auto text-[11px]">
          week view ↗
        </a>
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-1">
        {byDay.map(({ date, allocs }, i) => (
          <div key={date} className="mb-1.5">
            <div className="flex items-baseline gap-1.5 px-1">
              <span className={`text-[12px] font-semibold ${i === 0 ? 'text-accent' : 'text-strong'}`}>
                {i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dayName(date)}
              </span>
              <span className="font-mono text-[11px] text-dim">{shortDate(date)}</span>
              <span className="ml-auto font-mono text-[11px] text-dim">{fmtH(allocs.reduce((s, a) => s + a.plannedHours, 0))}</span>
            </div>
            {allocs.length === 0 ? (
              <p className="px-1 text-[12px] text-dim/60">nothing planned</p>
            ) : (
              <ul className="space-y-px">
                {allocs.map((a) => (
                  <PlannedRow key={a.id} alloc={a} lookups={lookups} />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

const PlannedRow = memo(function PlannedRow({ alloc, lookups }: { alloc: Allocation; lookups: Lookups }) {
  const openItem = useUi((s) => s.openItem);
  const item = lookups.item(alloc.itemId);
  if (!item) return null;
  return (
    <li className="flex items-center gap-1.5 rounded border-l-2 bg-raised py-0.5 pr-1.5 pl-1.5" style={{ borderLeftColor: lookups.color(item) }}>
      <input type="checkbox" className="accent-ok" checked={alloc.done} onChange={() => useStore.getState().toggleAllocation(alloc.id)} />
      <button className="min-w-0 flex-1 text-left leading-tight" onClick={() => openItem(item.id)}>
        <div className={`truncate ${alloc.done ? 'text-dim line-through' : ''}`}>
          {isItemDone(item) && <span className="text-ok">✓ </span>}
          {item.title}
        </div>
        <div className="truncate text-[10px] text-dim">{lookups.project(item.projectId)?.name}</div>
      </button>
      {alloc.start && <span className="font-mono text-[11px] text-dim">{alloc.start}</span>}
      <span className="w-8 text-right font-mono text-[11px]">{fmtH(alloc.plannedHours)}</span>
    </li>
  );
});

function Projects() {
  const projects = useStore((s) => s.data.projects);
  const items = useStore((s) => s.data.items);
  const allocations = useStore((s) => s.data.allocations);
  const lookups = useLookups();
  const today = todayISO();

  // Active projects, nearest deadline first.
  const rows = useMemo(() => {
    const allocs = allocationsByItem({ allocations });
    return projects
      .filter((p) => !p.archived)
      .map((p) => ({ p, s: projectStats(p, items, allocs) }))
      .sort((a, b) => (a.s.next?.date ?? '9999').localeCompare(b.s.next?.date ?? '9999') || a.p.name.localeCompare(b.p.name));
  }, [projects, items, allocations]);

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded border border-line bg-panel">
      <header className="flex items-center border-b border-line px-2 py-1">
        <span className="label">projects</span>
        <a href={href({ name: 'projects' })} className="btn-ghost ml-auto text-[11px]">
          all ↗
        </a>
      </header>
      <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto p-1">
        {rows.map(({ p, s }) => (
          <li key={p.id}>
            <a href={href({ name: 'projects', id: p.id })} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-raised">
              <ProgressRing percent={s.percent} color={lookups.area(p.areaId)?.color ?? '#94a3b8'} size={30} stroke={3} />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-strong">{p.name}</div>
                <div className="truncate text-[11px] text-dim">
                  <span className="font-mono">{s.total > 0 ? `${s.done}/${s.total}` : `${s.percent}%`}</span>
                  {s.next && (
                    <span className={URGENCY_CLASS[urgency(s.next.date, today)]}>
                      {' '}
                      · {countdown(s.next.date, today)} · {s.next.title}
                    </span>
                  )}
                </div>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
