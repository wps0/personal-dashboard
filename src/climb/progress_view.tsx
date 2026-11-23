import {
  CalendarRange,
  ChartNoAxesColumn,
  Check,
  ChevronDown,
} from 'lucide-react';
import {useState, type ReactNode} from 'react';
import {create} from 'zustand';
import {CLIMB_TOP_N} from '../config';
import {
  Columns,
  GradeLines,
  NowVsPast,
  num,
  Table,
  Tile,
  trendOf,
} from './charts';
import {settingsOf, type ClimbData} from './model/data';
import {shortDate, today} from './model/dates';
import {scale, systemOf} from './model/grades';
import {
  byGrade,
  columnsOf,
  comparisonOf,
  numbersOf,
  periodText,
  presetPeriod,
  trendOf as gradeTrend,
  triesByGrade,
  type CompareWith,
  type Filter,
  type Period,
  type Preset,
} from './model/progress';
import {useClimb} from './store';
import {BLOCK, Empty, Section, TabScreen} from './ui';

const PRESETS: {value: Preset; label: string}[] = [
  {value: '30d', label: 'Last 30 days'},
  {value: '3m', label: 'Last 3 months'},
  {value: 'year', label: 'This year'},
  {value: 'all', label: 'All time'},
  {value: 'dates', label: 'Pick dates'},
];

const COMPARE: {value: CompareWith; label: string}[] = [
  {value: 'before', label: 'The same length before'},
  {value: 'year', label: 'The same dates last year'},
  {value: 'none', label: 'Nothing'},
];

interface View {
  preset: Preset;
  /** The period chosen with Pick dates. */
  dates: Period;
  compare: CompareWith;
  /** The gym shown; '' for all gyms. */
  placeId: string;
}

/** What Progress shows, kept while the log is open. */
const useView = create<View>()(() => ({
  preset: '3m',
  dates: {from: today(), to: today()},
  compare: 'before',
  placeId: '',
}));

function periodOf(v: View, data: ClimbData): Period {
  return v.preset === 'dates' ? v.dates : presetPeriod(v.preset, today(), data);
}

export function ProgressView() {
  const data = useClimb(s => s.data);
  const view = useView();
  const [choosing, setChoosing] = useState(false);
  const system = systemOf(settingsOf(data));
  const grades = scale(system);
  const period = periodOf(view, data);
  const compared = comparisonOf(period, view.compare);
  const filter: Filter = {placeId: view.placeId || undefined};
  const now = numbersOf(data, period, filter, system);
  const was = compared ? numbersOf(data, compared, filter, system) : null;
  const places = data.places;
  const presetLabel = PRESETS.find(p => p.value === view.preset)!.label;
  const sinceText = compared
    ? `against ${periodText(compared)}`
    : 'not compared';
  const grade = (r: number | null) => (r === null ? '–' : grades[r]);
  const wasText = (v: string) => (was ? `was ${v}` : undefined);

  const bar = (
    <div className="px-4 pt-3">
      <button
        type="button"
        onClick={() => setChoosing(true)}
        className={`flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left ${BLOCK}`}
      >
        <CalendarRange size={20} className="shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-strong">
            {periodText(period)}
          </span>
          <span className="block text-[12px] text-dim">
            {view.preset === 'dates' ? 'your dates' : presetLabel.toLowerCase()}{' '}
            · {sinceText}
          </span>
        </span>
        <ChevronDown size={18} className="text-dim" aria-hidden />
      </button>
      <div className="mt-2 flex gap-2 text-[14px]">
        <label className="relative flex h-9 items-center gap-1 rounded-full bg-raised px-4 text-fg">
          {places.find(p => p.id === view.placeId)?.name ?? 'All gyms'}
          <ChevronDown size={14} className="text-dim" aria-hidden />
          <select
            aria-label="Which gym"
            value={view.placeId}
            onChange={e => useView.setState({placeId: e.target.value})}
            className="absolute inset-0 opacity-0"
          >
            <option value="">All gyms</option>
            {places.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.archived ? ' (archived)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );

  if (!now.climbs)
    return (
      <TabScreen tab="progress" title="Progress">
        {bar}
        <Empty icon={ChartNoAxesColumn} title="No climbs in this period">
          Pick a longer period above.
        </Empty>
        {choosing && (
          <PeriodSheet data={data} onClose={() => setChoosing(false)} />
        )}
      </TabScreen>
    );

  const pyramid = byGrade(data, period, compared, filter, system);
  const tries = triesByGrade(data, period, compared, filter, system);
  const cols = columnsOf(data, period, filter, system);
  const trend = gradeTrend(data, period, filter, system);
  const byMonth = cols.columns.length > 0 && !/^\d/.test(cols.columns[0].label);
  const per = byMonth ? 'month' : 'week';
  const nowLabel =
    view.preset === 'dates'
      ? 'Your dates'
      : presetLabel.replace(/^Last/, 'These');
  const pastLabel =
    view.compare === 'year' ? 'A year before' : 'The period before';
  const rank = (r: number | null) => r ?? -1;

  return (
    <TabScreen tab="progress" title="Progress">
      {bar}
      <Section
        title={compared ? 'Numbers, against the period before' : 'Numbers'}
      >
        <div className="grid grid-cols-3 gap-2">
          <Tile
            label="Climbs"
            value={now.climbs}
            was={wasText(String(was?.climbs))}
            trend={was ? trendOf(now.climbs, was.climbs) : undefined}
          />
          <Tile
            label="Sessions"
            value={now.sessions}
            was={wasText(String(was?.sessions))}
            trend={was ? trendOf(now.sessions, was.sessions) : undefined}
          />
          <Tile
            label="Per session"
            value={
              now.perSession === null
                ? '–'
                : num(Math.round(now.perSession * 10) / 10)
            }
            was={wasText(
              was?.perSession == null
                ? '–'
                : num(Math.round(was.perSession * 10) / 10),
            )}
            trend={
              was?.perSession != null && now.perSession !== null
                ? trendOf(
                    Math.round(now.perSession * 10),
                    Math.round(was.perSession * 10),
                  )
                : undefined
            }
          />
          <Tile
            label="Typical"
            value={grade(now.typical)}
            was={wasText(grade(was?.typical ?? null))}
            trend={
              was?.typical != null
                ? trendOf(rank(now.typical), rank(was.typical))
                : undefined
            }
          />
          <Tile
            label={`Top ${CLIMB_TOP_N} avg`}
            value={grade(now.top)}
            was={wasText(grade(was?.top ?? null))}
            trend={
              was?.top != null
                ? trendOf(rank(now.top), rank(was.top))
                : undefined
            }
          />
          <Tile
            label="Hardest"
            value={grade(now.hardest)}
            was={wasText(grade(was?.hardest ?? null))}
            trend={
              was?.hardest != null
                ? trendOf(rank(now.hardest), rank(was.hardest))
                : undefined
            }
          />
        </div>
      </Section>
      <ChartSection
        title="Climbs by grade"
        table={
          <Table
            head={
              compared ? ['Grade', nowLabel, pastLabel] : ['Grade', nowLabel]
            }
            rows={pyramid.map(r =>
              compared ? [r.label, r.now, r.past ?? 0] : [r.label, r.now],
            )}
          />
        }
      >
        <NowVsPast rows={pyramid} nowLabel={nowLabel} pastLabel={pastLabel} />
      </ChartSection>
      <Section title="Tries">
        <div className="grid grid-cols-2 gap-2">
          <Tile
            label="Flashed"
            value={
              now.flashedShare === null
                ? '–'
                : `${Math.round(now.flashedShare * 100)}%`
            }
            was={wasText(
              was?.flashedShare == null
                ? '–'
                : `${Math.round(was.flashedShare * 100)}%`,
            )}
            trend={
              was?.flashedShare != null && now.flashedShare !== null
                ? trendOf(
                    Math.round(now.flashedShare * 100),
                    Math.round(was.flashedShare * 100),
                  )
                : undefined
            }
          />
          <Tile
            label="Tries per climb"
            value={
              now.triesPerClimb === null
                ? '–'
                : num(Math.round(now.triesPerClimb * 10) / 10)
            }
            was={wasText(
              was?.triesPerClimb == null
                ? '–'
                : num(Math.round(was.triesPerClimb * 10) / 10),
            )}
            trend={
              was?.triesPerClimb != null && now.triesPerClimb !== null
                ? trendOf(
                    Math.round(now.triesPerClimb * 10),
                    Math.round(was.triesPerClimb * 10),
                  )
                : undefined
            }
            better="down"
          />
        </div>
      </Section>
      <ChartSection
        title="Tries to top, by grade (fewer is better)"
        table={
          <Table
            head={
              compared ? ['Grade', nowLabel, pastLabel] : ['Grade', nowLabel]
            }
            rows={tries.map(r =>
              compared
                ? [r.label, num(r.now), r.past === null ? '–' : num(r.past)]
                : [r.label, num(r.now)],
            )}
          />
        }
      >
        <NowVsPast rows={tries} nowLabel={nowLabel} pastLabel={pastLabel} />
      </ChartSection>
      <ChartSection
        title={`Climbs per ${per}, by grade`}
        table={
          <Table
            head={[byMonth ? 'Month' : 'Week of', ...cols.groups]}
            rows={cols.columns.map(c => [c.label, ...c.counts])}
          />
        }
      >
        <Columns
          label={`Climbs per ${per}, by grade`}
          groups={cols.groups}
          columns={cols.columns}
        />
      </ChartSection>
      <ChartSection
        title={`Grades, ${per} by ${per}`}
        table={
          <Table
            head={[
              byMonth ? 'Month' : 'Week of',
              `Top ${CLIMB_TOP_N}`,
              'Typical',
            ]}
            rows={trend.map(t => [
              t.label,
              t.top === null ? '–' : grades[Math.round(t.top)],
              grade(t.typical),
            ])}
          />
        }
      >
        <GradeLines
          points={trend}
          grades={grades}
          topLabel={`Average of your ${CLIMB_TOP_N} hardest`}
        />
      </ChartSection>
      {choosing && (
        <PeriodSheet data={data} onClose={() => setChoosing(false)} />
      )}
    </TabScreen>
  );
}

/** A chart in a block, with its numbers as a table a tap away. */
function ChartSection({
  title,
  table,
  children,
}: {
  title: string;
  table: ReactNode;
  children: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Section
      title={title}
      more={
        <button
          type="button"
          onClick={() => setAsTable(!asTable)}
          className="text-[14px] text-accent"
        >
          {asTable ? 'chart' : 'table'}
        </button>
      }
    >
      <div className={`p-4 ${BLOCK}`}>{asTable ? table : children}</div>
    </Section>
  );
}

/** The period and what it's compared with, as a sheet over Progress. */
function PeriodSheet({data, onClose}: {data: ClimbData; onClose(): void}) {
  const view = useView.getState();
  const [preset, setPreset] = useState(view.preset);
  const [compare, setCompare] = useState(view.compare);
  const [dates, setDates] = useState(periodOf(view, data));
  const period =
    preset === 'dates' ? dates : presetPeriod(preset, today(), data);
  const shown = comparisonOf(period, 'before');
  const lastYear = comparisonOf(period, 'year');
  const valid = period.from <= period.to;
  return (
    <div
      className="absolute inset-0 z-10 flex flex-col justify-end bg-black/50"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label="Period"
        className="rounded-t-[28px] bg-panel px-4 pt-3 pb-5 shadow-2xl"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <h2 className="mb-2 text-[17px] font-semibold text-strong">Period</h2>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button
              key={p.value}
              type="button"
              aria-pressed={p.value === preset}
              onClick={() => {
                if (p.value !== 'dates')
                  setDates(presetPeriod(p.value, today(), data));
                setPreset(p.value);
              }}
              className={`h-10 rounded-full px-3.5 text-[14px] ${p.value === preset ? 'bg-accent font-semibold text-on-accent' : 'bg-raised text-fg'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(['from', 'to'] as const).map(k => (
            <label key={k} className="block">
              <span className="text-[12px] text-dim">
                {k === 'from' ? 'From' : 'To'}
              </span>
              {/* The date in the log's own words, over the native picker. */}
              <span className="relative mt-1 flex h-12 items-center gap-2 rounded-2xl bg-raised px-3 text-strong">
                <CalendarRange size={16} className="text-dim" aria-hidden />
                {shortDate(period[k])} {period[k].slice(0, 4)}
                <input
                  type="date"
                  aria-label={k === 'from' ? 'From' : 'To'}
                  value={period[k]}
                  max={today()}
                  onClick={e => e.currentTarget.showPicker?.()}
                  onChange={e => {
                    if (!e.target.value) return;
                    setDates({...period, [k]: e.target.value});
                    setPreset('dates');
                  }}
                  className="absolute inset-0 opacity-0"
                />
              </span>
            </label>
          ))}
        </div>
        <div className="mt-4 mb-1 text-[12px] text-dim">Compare with</div>
        <div
          role="radiogroup"
          aria-label="Compare with"
          className="divide-y divide-line/70 rounded-2xl bg-raised"
        >
          {COMPARE.map(c => {
            const on = c.value === compare;
            const range =
              c.value === 'before'
                ? shown
                : c.value === 'year'
                  ? lastYear
                  : null;
            return (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setCompare(c.value)}
                className="flex min-h-12 w-full items-center gap-3 px-3 text-left"
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${on ? 'border-accent' : 'border-dim'}`}
                >
                  {on && (
                    <span className="h-2.5 w-2.5 rounded-full bg-accent" />
                  )}
                </span>
                <span className="flex-1 text-strong">{c.label}</span>
                <span className="text-[13px] text-dim">
                  {range ? periodText(range) : ''}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={!valid}
          onClick={() => {
            useView.setState({preset, compare, dates: period});
            onClose();
          }}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[16px] font-semibold text-on-accent disabled:opacity-50"
        >
          <Check size={18} aria-hidden />{' '}
          {valid ? `Show ${periodText(period)}` : 'From is after To'}
        </button>
      </div>
    </div>
  );
}
