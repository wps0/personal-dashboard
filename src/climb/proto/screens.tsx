/**
 * The climbing log's prototype screens, for the design document's
 * screenshots. Static: sample data, no storage; links only switch screens.
 */
import {
  CalendarRange,
  ChartNoAxesColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  GripVertical,
  History,
  House,
  Mountain,
  Plus,
  Settings,
  Timer,
  TrendingDown,
  TrendingUp,
  Trophy,
  Undo2,
} from 'lucide-react';
import type {ReactNode} from 'react';
import {
  BOARD_GRADES,
  BOARD_LIVE,
  circuit,
  CIRCUITS,
  GROUPS,
  HISTORY,
  LIVE,
  PYRAMID,
  SCALE,
  SESSION_VS_MONTH,
  TREND,
  WEEKS,
} from './data';

type Tab = 'today' | 'progress' | 'history';

const TABS: {tab: Tab; label: string; icon: typeof House}[] = [
  {tab: 'today', label: 'Today', icon: House},
  {tab: 'progress', label: 'Progress', icon: ChartNoAxesColumn},
  {tab: 'history', label: 'History', icon: History},
];

/** A gym colour, as a swatch (black and white get a ring). */
function Swatch({colour, size = 'h-5 w-5'}: {colour: string; size?: string}) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-md ring-1 ring-white/25 ${size}`}
      style={{background: circuit(colour).hex}}
    />
  );
}

function Header({
  title,
  back,
  right,
}: {
  title: ReactNode;
  back?: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-panel px-2">
      {back ? (
        <a
          href={`#${back}`}
          aria-label="Back"
          className="icon-btn h-11 w-11 text-fg"
        >
          <ChevronLeft size={22} />
        </a>
      ) : (
        <Mountain size={22} className="mx-2 shrink-0 text-accent" aria-hidden />
      )}
      <span className="min-w-0 flex-1 truncate text-[17px] font-semibold text-strong">
        {title}
      </span>
      {right ?? (
        <>
          <a
            href="../"
            className="flex h-10 items-center gap-1.5 rounded-full border border-line px-3 text-[14px] text-fg"
          >
            <CircleGauge size={16} className="text-dim" aria-hidden />
            Dashboard
          </a>
          <a
            href="#places"
            aria-label="Settings"
            className="icon-btn h-11 w-11 text-fg"
          >
            <Settings size={20} />
          </a>
        </>
      )}
    </header>
  );
}

function Tabs({active}: {active: Tab}) {
  return (
    <nav className="grid shrink-0 grid-cols-3 border-t border-line bg-panel">
      {TABS.map(({tab, label, icon: Icon}) => (
        <a
          key={tab}
          href={`#${tab}`}
          className={`flex h-16 flex-col items-center justify-center gap-1 text-[12px] ${tab === active ? 'font-medium text-accent' : 'text-dim'}`}
        >
          <Icon size={22} aria-hidden />
          {label}
        </a>
      ))}
    </nav>
  );
}

function Screen({
  children,
  tab,
  title = 'Climb',
  overlay,
}: {
  children: ReactNode;
  tab: Tab;
  title?: string;
  overlay?: ReactNode;
}) {
  return (
    <div className="relative flex h-full flex-col bg-bg text-[15px]">
      <Header title={title} />
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      <Tabs active={tab} />
      {overlay}
    </div>
  );
}

function Section({
  title,
  more,
  children,
}: {
  title: ReactNode;
  more?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="px-4 pt-5">
      <div className="mb-2 flex items-baseline">
        <h2 className="label flex-1 !text-[12px]">{title}</h2>
        {more}
      </div>
      {children}
    </section>
  );
}

/** A number, and how it compares with the period before (up is better). */
function Tile({
  label,
  value,
  was,
  up,
}: {
  label: string;
  value: ReactNode;
  was?: string;
  up?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel px-3 py-2.5">
      <div className="text-[12px] text-dim">{label}</div>
      <div className="mt-0.5 text-[24px] font-semibold text-strong">
        {value}
      </div>
      {was && (
        <div className="flex items-center gap-1 text-[12px] text-dim">
          {up !== undefined &&
            (up ? (
              <TrendingUp size={13} className="text-ok" aria-label="up" />
            ) : (
              <TrendingDown size={13} className="text-warn" aria-label="down" />
            ))}
          {was}
        </div>
      )}
    </div>
  );
}

/** A legend key: a filled swatch, or the long-dashed outline of the past. */
function Key({dashed, children}: {dashed?: boolean; children: ReactNode}) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="16" height="10" aria-hidden>
        {dashed ? (
          <rect
            x="0.75"
            y="0.75"
            width="14.5"
            height="8.5"
            rx="2"
            fill="none"
            stroke="var(--color-fg)"
            strokeWidth="1.5"
            strokeDasharray="5 3"
          />
        ) : (
          <rect width="16" height="10" rx="2" fill="var(--series-1)" />
        )}
      </svg>
      {children}
    </span>
  );
}

/**
 * Horizontal bars: now (filled) against the past (a long-dashed outline, not
 * filled), on one scale, one row per colour or grade.
 */
function NowVsPast({
  rows,
  nowLabel,
  pastLabel,
}: {
  rows: {key: string; label: ReactNode; now: number; past: number}[];
  nowLabel: string;
  pastLabel: string;
}) {
  const max = Math.max(...rows.flatMap(r => [r.now, r.past]), 1);
  const pct = (n: number) => `${(n / max) * 100}%`;
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-fg">
        <Key>{nowLabel}</Key>
        <Key dashed>{pastLabel}</Key>
      </div>
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.key} className="flex items-center gap-2">
            <span className="flex w-24 shrink-0 items-center gap-1.5 text-[13px] text-fg">
              {r.label}
            </span>
            <svg
              className="h-6 min-w-0 flex-1 overflow-visible"
              role="img"
              aria-label={`${r.key}: ${r.now}, ${pastLabel.toLowerCase()} ${r.past}`}
            >
              {r.now > 0 && (
                <rect
                  x="0"
                  y="3"
                  width={pct(r.now)}
                  height="18"
                  rx="4"
                  fill="var(--series-1)"
                />
              )}
              {r.past > 0 && (
                <rect
                  x="0.75"
                  y="0.75"
                  width={`calc(${pct(r.past)} - 1.5px)`}
                  height="22.5"
                  rx="5"
                  fill="none"
                  stroke="var(--color-fg)"
                  strokeWidth="1.5"
                  strokeDasharray="7 4"
                />
              )}
            </svg>
            <span className="w-16 shrink-0 text-right text-[13px] tabular-nums text-fg">
              {r.now}
              <span className="text-dim">
                {' '}
                / {Number.isInteger(r.past) ? r.past : r.past.toFixed(1)}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Today() {
  return (
    <Screen tab="today">
      <div className="px-4 pt-4">
        <div className="rounded-2xl border border-line bg-panel p-4">
          <button className="flex h-12 w-full items-center justify-between rounded-xl bg-raised px-3 text-left">
            <span>
              <span className="block text-[11px] text-dim">Where</span>
              Blokownia <span className="text-dim">· gym, by colour</span>
            </span>
            <ChevronDown size={18} className="text-dim" />
          </button>
          <a
            href="#log"
            className="mt-3 flex h-14 items-center justify-center gap-2 rounded-xl bg-accent text-[17px] font-semibold text-on-accent"
          >
            <Timer size={20} aria-hidden />
            Start a session
          </a>
        </div>
      </div>

      <Section title="November so far">
        <div className="grid grid-cols-3 gap-2">
          <Tile label="Climbs" value="58" was="Oct: 47" up />
          <Tile label="Sessions" value="5" was="Oct: 6" up={false} />
          <Tile
            label="Hardest"
            value={
              <span className="flex items-center gap-1.5">
                <Swatch colour="Red" size="h-4 w-4" /> 6C
              </span>
            }
            was="Oct: 6B+"
            up
          />
        </div>
      </Section>

      <Section
        title="Last session"
        more={
          <a href="#history" className="text-[14px] text-accent">
            history
          </a>
        }
      >
        <a
          href="#summary"
          className="flex items-center gap-3 rounded-xl border border-line bg-panel p-3"
        >
          <div className="min-w-0 flex-1">
            <div className="text-strong">Tue 18 Nov · Blokownia</div>
            <div className="text-[14px] text-dim">1h 52m · 15 climbs</div>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-raised px-2.5 py-1 text-[13px]">
            <Trophy size={14} className="text-accent" aria-hidden /> first 6C
          </div>
          <ChevronRight size={18} className="text-dim" />
        </a>
      </Section>
      <p className="px-4 pt-4 text-[13px] text-dim">
        A session starts only when you press Start, and ends with Finish.
      </p>
    </Screen>
  );
}

function UndoBar({text}: {text: string}) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-t border-line bg-raised px-4 text-[14px]">
      <span className="flex-1 text-strong">{text}</span>
      <button className="flex h-9 items-center gap-1.5 rounded-full px-3 font-medium text-accent">
        <Undo2 size={16} aria-hidden /> Undo
      </button>
    </div>
  );
}

function SessionHeader({title, time}: {title: string; time: string}) {
  return (
    <Header
      back="today"
      title={
        <span className="flex items-baseline gap-2">
          {title}
          <span className="text-[14px] font-normal tabular-nums text-dim">
            {time}
          </span>
        </span>
      }
      right={
        <a
          href="#summary"
          className="flex h-10 items-center rounded-full border border-line px-4 text-[15px] font-medium text-strong"
        >
          Finish
        </a>
      }
    />
  );
}

/** A live session at a gym: one tap on a colour logs one climb topped. */
export function Log() {
  const counts = new Map<string, number>();
  for (const l of LIVE) counts.set(l.colour, (counts.get(l.colour) ?? 0) + 1);
  return (
    <div className="flex h-full flex-col bg-bg text-[15px]">
      <SessionHeader title="Blokownia" time="47:12" />
      <div className="flex shrink-0 items-baseline gap-4 px-4 py-2 text-[13px] text-dim">
        <span>
          <b className="text-[17px] font-semibold text-strong">{LIVE.length}</b>{' '}
          climbs
        </span>
        <span className="ml-auto">hardest: Red 6B+</span>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto border-y border-line">
        {LIVE.map(l => (
          <li key={l.time} className="flex min-h-12 items-center gap-3 px-4">
            <Swatch colour={l.colour} />
            <span className="flex-1 text-strong">
              {l.colour}
              {l.grade && <span className="text-fg"> · {l.grade}</span>}
            </span>
            {!l.grade && <span className="text-[13px] text-dim">+ grade</span>}
            <span className="w-12 text-right text-[13px] tabular-nums text-dim">
              {l.time}
            </span>
          </li>
        ))}
      </ul>
      <section
        aria-label="Log a climb"
        className="shrink-0 bg-panel px-4 pt-3 pb-4"
      >
        <h2 className="label mb-2 !text-[12px]">Topped one? Tap its colour</h2>
        <div className="grid grid-cols-3 gap-2">
          {CIRCUITS.map(c => (
            <button
              key={c.name}
              className="relative flex h-[72px] flex-col items-start justify-between rounded-xl border border-line bg-raised p-2.5 text-left"
            >
              <span className="flex w-full items-center gap-2">
                <Swatch colour={c.name} size="h-7 w-7" />
                <span className="font-medium text-strong">{c.name}</span>
              </span>
              <span className="text-[12px] text-dim">{c.range}</span>
              {(counts.get(c.name) ?? 0) > 0 && (
                <span className="absolute right-2 bottom-2 rounded-full bg-accent px-2 text-[13px] font-semibold text-on-accent tabular-nums">
                  {counts.get(c.name)}
                </span>
              )}
            </button>
          ))}
        </div>
      </section>
      <UndoBar text="Red logged" />
    </div>
  );
}

/** A live board session: one tap on a grade logs one climb. */
export function BoardLog() {
  const counts = new Map<string, number>();
  for (const l of BOARD_LIVE)
    counts.set(l.grade, (counts.get(l.grade) ?? 0) + 1);
  return (
    <div className="flex h-full flex-col bg-bg text-[15px]">
      <SessionHeader title="Kilter · 40°" time="32:40" />
      <div className="flex shrink-0 items-baseline gap-4 px-4 py-2 text-[13px] text-dim">
        <span>
          <b className="text-[17px] font-semibold text-strong">
            {BOARD_LIVE.length}
          </b>{' '}
          climbs
        </span>
        <span className="ml-auto">hardest: 6B</span>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto border-y border-line">
        {BOARD_LIVE.map(l => (
          <li key={l.time} className="flex min-h-12 items-center gap-3 px-4">
            <span className="w-12 font-semibold text-strong">{l.grade}</span>
            <span className="flex-1 text-[13px] text-dim">+ name</span>
            <span className="w-12 text-right text-[13px] tabular-nums text-dim">
              {l.time}
            </span>
          </li>
        ))}
      </ul>
      <section
        aria-label="Log a climb"
        className="shrink-0 bg-panel px-4 pt-3 pb-4"
      >
        <div className="mb-2 flex items-center">
          <h2 className="label flex-1 !text-[12px]">
            Topped one? Tap its grade
          </h2>
          <span className="text-[13px] text-dim">Font · 40° ▾</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {BOARD_GRADES.map(g => (
            <button
              key={g}
              className="relative flex h-14 items-center justify-center rounded-xl border border-line bg-raised text-[17px] font-semibold text-strong"
            >
              {g}
              {(counts.get(g) ?? 0) > 0 && (
                <span className="absolute top-1 right-1 rounded-full bg-accent px-1.5 text-[12px] font-semibold text-on-accent tabular-nums">
                  {counts.get(g)}
                </span>
              )}
            </button>
          ))}
        </div>
      </section>
      <UndoBar text="6B logged" />
    </div>
  );
}

export function Summary() {
  return (
    <div className="flex h-full flex-col bg-bg text-[15px]">
      <Header back="today" title="Session" right={<span />} />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 pt-4">
          <div className="text-[13px] text-dim">
            Tuesday 18 Nov · Blokownia · 19:05–20:57
          </div>
          <div className="text-[22px] font-semibold text-strong">
            13 climbs in 1h 52m
          </div>
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 p-3">
            <Trophy size={22} className="shrink-0 text-accent" aria-hidden />
            <div>
              <div className="font-medium text-strong">
                Your first 6C (a red)
              </div>
              <div className="text-[13px] text-dim">
                and more blues than in any session before
              </div>
            </div>
          </div>
        </div>
        <Section title="Tonight against your average session (last 30 days)">
          <div className="rounded-xl border border-line bg-panel p-3">
            <NowVsPast
              nowLabel="Tonight"
              pastLabel="Average session, last 30 days"
              rows={SESSION_VS_MONTH.map(r => ({
                key: r.colour,
                label: (
                  <>
                    <Swatch colour={r.colour} size="h-4 w-4" />
                    {r.colour}
                  </>
                ),
                now: r.today,
                past: r.month,
              }))}
            />
            <p className="mt-2 text-[12px] text-dim">
              Average over your 7 sessions at Blokownia since 19 Oct.
            </p>
          </div>
        </Section>
        <Section title="Numbers">
          <div className="grid grid-cols-3 gap-2">
            <Tile label="Climbs" value="13" was="avg 12.1" up />
            <Tile label="Hardest" value="6C" was="avg 6B+" up />
            <Tile label="Per hour" value="7.0" was="avg 6.4" up />
          </div>
        </Section>
        <Section title="Notes">
          <div className="rounded-xl border border-line bg-panel px-3 py-2.5 text-[15px] text-dim">
            Skin thin on the right index…
          </div>
        </Section>
        <div className="h-4" />
      </main>
      <div className="shrink-0 border-t border-line bg-panel p-3">
        <a
          href="#today"
          className="flex h-12 items-center justify-center rounded-xl bg-accent text-[16px] font-semibold text-on-accent"
        >
          Done
        </a>
      </div>
    </div>
  );
}

/** Climbs per week, stacked by grade group, easiest at the bottom. */
function WeeklyColumns() {
  const w = 360;
  const h = 170;
  const left = 22;
  const top = 8;
  const bottom = 22;
  const max = 15;
  const band = (w - left) / WEEKS.length;
  const bar = Math.min(18, band - 6);
  const y = (n: number) => top + (h - top - bottom) * (1 - n / max);
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-fg">
        {GROUPS.map((g, i) => (
          <span key={g} className="flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{background: `var(--grade-${i + 1})`}}
            />
            {g}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        role="img"
        aria-label="Climbs per week by grade, the last 13 weeks"
      >
        {[0, 5, 10, 15].map(n => (
          <g key={n}>
            <line
              x1={left}
              x2={w}
              y1={y(n)}
              y2={y(n)}
              stroke="var(--color-line)"
            />
            <text
              x={left - 6}
              y={y(n) + 4}
              textAnchor="end"
              className="fill-dim text-[10px] tabular-nums"
            >
              {n}
            </text>
          </g>
        ))}
        {WEEKS.map((wk, i) => {
          const x = left + band * i + (band - bar) / 2;
          let base = 0;
          return (
            <g key={wk.week}>
              {wk.counts.map((n, g) => {
                if (!n) return null;
                const y0 = y(base);
                base += n;
                const y1 = y(base);
                // 2px of surface between segments.
                return (
                  <rect
                    key={g}
                    x={x}
                    y={y1 + 1}
                    width={bar}
                    height={Math.max(0, y0 - y1 - 2)}
                    rx={base === wk.counts.reduce((a, c) => a + c, 0) ? 3 : 0}
                    fill={`var(--grade-${g + 1})`}
                  />
                );
              })}
              {(i % 4 === 0 || i === WEEKS.length - 1) && (
                <text
                  x={x + bar / 2}
                  y={h - 6}
                  textAnchor="middle"
                  className="fill-dim text-[10px]"
                >
                  {wk.week}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** The typical (median) grade and the top-5 average, week by week. */
function GradeTrend() {
  const w = 360;
  const h = 170;
  const left = 30;
  const right = 34;
  const top = 10;
  const bottom = 22;
  const x = (i: number) => left + (i * (w - left - right)) / (TREND.length - 1);
  const y = (v: number) =>
    top + ((SCALE.length - 1 - v) * (h - top - bottom)) / (SCALE.length - 1);
  const path = (key: 'median' | 'top5') => {
    let d = '';
    let pen = false;
    TREND.forEach((t, i) => {
      const v = t[key];
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i)},${y(v)}`;
      pen = true;
    });
    return d;
  };
  const last = TREND[TREND.length - 1];
  const name = (v: number) => SCALE[Math.round(v)];
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-fg">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-[var(--series-1)]" />
          Average of your 5 hardest
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-[var(--series-2)]" />
          Typical climb (median)
        </span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        role="img"
        aria-label="Grades week by week: the top-5 average rose from 6A to 6B+, the typical climb from 5+ to 6A"
      >
        {SCALE.map((g, i) => (
          <g key={g}>
            <line
              x1={left}
              x2={w - right}
              y1={y(i)}
              y2={y(i)}
              stroke="var(--color-line)"
            />
            <text
              x={left - 6}
              y={y(i) + 4}
              textAnchor="end"
              className="fill-dim text-[10px] tabular-nums"
            >
              {g}
            </text>
          </g>
        ))}
        {[0, 6, 12].map(i => (
          <text
            key={i}
            x={x(i)}
            y={h - 6}
            textAnchor="middle"
            className="fill-dim text-[10px]"
          >
            {TREND[i].week}
          </text>
        ))}
        {(['top5', 'median'] as const).map(k => (
          <path
            key={k}
            d={path(k)}
            fill="none"
            stroke={k === 'top5' ? 'var(--series-1)' : 'var(--series-2)'}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {(['top5', 'median'] as const).map(k => (
          <g key={k}>
            <circle
              cx={x(TREND.length - 1)}
              cy={y(last[k]!)}
              r={4}
              fill={k === 'top5' ? 'var(--series-1)' : 'var(--series-2)'}
              stroke="var(--color-panel)"
              strokeWidth={2}
            />
            <text
              x={x(TREND.length - 1) + 8}
              y={y(last[k]!) + 4}
              className="fill-strong text-[11px] font-semibold"
            >
              {name(last[k]!)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function RangeBar() {
  return (
    <div className="px-4 pt-3">
      <a
        href="#range"
        className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2"
      >
        <CalendarRange size={20} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-strong">
            23 Aug – 21 Nov 2026
          </span>
          <span className="block text-[12px] text-dim">
            last 3 months · against 25 May – 22 Aug
          </span>
        </span>
        <ChevronDown size={18} className="text-dim" />
      </a>
      <div className="mt-2 flex gap-2 text-[14px]">
        <button className="h-9 rounded-full border border-accent bg-accent/10 px-3 font-medium text-strong">
          Gym
        </button>
        <button className="h-9 rounded-full border border-line px-3 text-fg">
          Board
        </button>
        <button className="ml-auto flex h-9 items-center gap-1 rounded-full border border-line px-3 text-fg">
          All gyms <ChevronDown size={14} className="text-dim" />
        </button>
      </div>
    </div>
  );
}

function ProgressBody() {
  return (
    <>
      <RangeBar />
      <Section title="Numbers, against the 3 months before">
        <div className="grid grid-cols-3 gap-2">
          <Tile label="Climbs" value="168" was="was 131" up />
          <Tile label="Sessions" value="22" was="was 19" up />
          <Tile label="Per session" value="7.6" was="was 6.9" up />
          <Tile label="Typical" value="6A" was="was 5+" up />
          <Tile label="Top 5 avg" value="6B+" was="was 6B" up />
          <Tile label="Hardest" value="6C" was="was 6B+" up />
        </div>
      </Section>
      <Section
        title="Climbs by grade"
        more={<span className="text-[14px] text-accent">table</span>}
      >
        <div className="rounded-xl border border-line bg-panel p-3">
          <NowVsPast
            nowLabel="These 3 months"
            pastLabel="The 3 months before"
            rows={PYRAMID.map(r => ({
              key: r.grade,
              label: r.grade,
              now: r.now,
              past: r.before,
            }))}
          />
          <p className="mt-2 text-[12px] text-dim">
            A climb logged by colour only counts at its colour&apos;s easiest
            grade.
          </p>
        </div>
      </Section>
      <Section title="Climbs per week, by grade">
        <div className="rounded-xl border border-line bg-panel p-3">
          <WeeklyColumns />
        </div>
      </Section>
      <Section title="Grades, week by week">
        <div className="rounded-xl border border-line bg-panel p-3">
          <GradeTrend />
        </div>
      </Section>
      <div className="h-6" />
    </>
  );
}

export function Progress() {
  return (
    <Screen tab="progress" title="Progress">
      <ProgressBody />
    </Screen>
  );
}

/** The period picker, as a sheet over Progress. */
export function Range() {
  const presets = [
    'Last 30 days',
    'Last 3 months',
    'This year',
    'All time',
    'Pick dates',
  ];
  return (
    <Screen
      tab="progress"
      title="Progress"
      overlay={
        <div className="absolute inset-0 flex flex-col justify-end bg-black/50">
          <div className="rounded-t-2xl bg-panel px-4 pt-3 pb-5 shadow-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            <h2 className="mb-2 text-[17px] font-semibold text-strong">
              Period
            </h2>
            <div className="flex flex-wrap gap-2">
              {presets.map(p => (
                <button
                  key={p}
                  aria-pressed={p === 'Pick dates'}
                  className={`h-10 rounded-full border px-3.5 text-[14px] ${p === 'Pick dates' ? 'border-accent bg-accent/10 font-medium text-strong' : 'border-line text-fg'}`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                ['From', 'Mon 1 Sep 2026'],
                ['To', 'Fri 21 Nov 2026'],
              ].map(([k, v]) => (
                <label key={k} className="block">
                  <span className="text-[12px] text-dim">{k}</span>
                  <span className="mt-1 flex h-12 items-center gap-2 rounded-xl border border-line bg-raised px-3 text-strong">
                    <CalendarRange size={16} className="text-dim" />
                    {v}
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-4 mb-1 text-[12px] text-dim">Compare with</div>
            <div className="divide-y divide-line rounded-xl border border-line">
              {[
                ['The same length before', '11 Jun – 31 Aug', true],
                ['The same dates last year', '1 Sep – 21 Nov 2025', false],
                ['Nothing', '', false],
              ].map(([label, dates, on]) => (
                <div
                  key={label as string}
                  className="flex min-h-12 items-center gap-3 px-3"
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${on ? 'border-accent' : 'border-dim'}`}
                  >
                    {on && (
                      <span className="h-2.5 w-2.5 rounded-full bg-accent" />
                    )}
                  </span>
                  <span className="flex-1 text-strong">{label}</span>
                  <span className="text-[13px] text-dim">{dates}</span>
                </div>
              ))}
            </div>
            <button className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-[16px] font-semibold text-on-accent">
              <Check size={18} aria-hidden /> Show 1 Sep – 21 Nov
            </button>
          </div>
        </div>
      }
    >
      <ProgressBody />
    </Screen>
  );
}

export function HistoryScreen() {
  return (
    <Screen tab="history" title="History">
      <div className="px-4 pt-4">
        <div className="mb-1 text-[13px] text-dim">Sessions a week</div>
        <div className="flex h-12 items-end gap-1.5">
          {[2, 3, 2, 0, 1, 2, 3, 2, 2, 3, 2, 2].map((n, i) => (
            <span
              key={i}
              className={`flex-1 rounded-t-[4px] ${i === 11 ? 'bg-accent' : 'bg-dim/50'}`}
              style={{height: `${n ? (n / 3) * 100 : 4}%`}}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-dim">
          <span>Sep</span>
          <span>Oct</span>
          <span>Nov</span>
        </div>
      </div>
      <Section title="November">
        <ul className="-mx-4 divide-y divide-line border-y border-line">
          {HISTORY.map(s => (
            <li key={s.date}>
              <a
                href="#summary"
                className="flex min-h-16 items-center gap-3 px-4 py-2"
              >
                <div className="w-12 text-center leading-tight">
                  <div className="text-[12px] text-dim">
                    {s.date.split(' ')[0]}
                  </div>
                  <div className="text-[20px] font-semibold text-strong">
                    {s.date.split(' ')[1]}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-strong">
                    {s.place}
                    {s.board && (
                      <span className="font-normal text-dim">
                        {' '}
                        · board, {s.board}
                      </span>
                    )}
                  </div>
                  <div className="text-[14px] text-dim">
                    {s.length} · {s.climbs} climbs
                  </div>
                </div>
                <span className="flex items-center gap-1.5 text-strong">
                  {s.colour && <Swatch colour={s.colour} size="h-4 w-4" />}
                  {s.hardest}
                </span>
                <ChevronRight size={18} className="text-dim" />
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </Screen>
  );
}

/** Settings: the places you climb, each gym with its own colours. */
export function Places() {
  return (
    <div className="flex h-full flex-col bg-bg text-[15px]">
      <Header back="today" title="Settings" right={<span />} />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Section
          title="Gyms"
          more={<span className="text-[14px] text-accent">+ gym</span>}
        >
          <div className="divide-y divide-line rounded-xl border border-line bg-panel">
            {[
              ['Blokownia', CIRCUITS],
              ['West Bouldering', CIRCUITS.slice(0, 5)],
            ].map(([name, cs]) => (
              <a
                key={name as string}
                href="#gym"
                className="flex min-h-14 items-center gap-3 px-3"
              >
                <span className="flex-1 text-strong">{name as string}</span>
                <span className="flex gap-1">
                  {(cs as typeof CIRCUITS).map(c => (
                    <Swatch key={c.name} colour={c.name} size="h-4 w-4" />
                  ))}
                </span>
                <ChevronRight size={18} className="text-dim" />
              </a>
            ))}
          </div>
        </Section>
        <Section
          title="Boards"
          more={<span className="text-[14px] text-accent">+ board</span>}
        >
          <div className="divide-y divide-line rounded-xl border border-line bg-panel">
            <div className="flex min-h-14 items-center gap-3 px-3">
              <span className="flex-1 text-strong">Kilter</span>
              <span className="text-dim">Font · usually 40°</span>
              <ChevronRight size={18} className="text-dim" />
            </div>
            <div className="flex min-h-14 items-center gap-3 px-3">
              <span className="flex-1 text-strong">MoonBoard 2019</span>
              <span className="text-dim">Font · 40°</span>
              <ChevronRight size={18} className="text-dim" />
            </div>
          </div>
          <p className="mt-2 text-[13px] text-dim">
            Board climbs are logged by grade and charted on their own, not mixed
            with the gyms&apos; colours.
          </p>
        </Section>
        <Section title="Data">
          <div className="divide-y divide-line rounded-xl border border-line bg-panel">
            <div className="flex min-h-12 items-center px-3">
              <span className="flex-1">Drive sync</span>
              <span className="text-dim">climb.binpb · on</span>
            </div>
            <div className="flex min-h-12 items-center px-3">
              <span className="flex-1">Export or import</span>
              <span className="text-dim">JSON, binary</span>
            </div>
          </div>
          <p className="mt-2 text-[13px] text-dim">
            Kept apart from the dashboard&apos;s data: its own file on this
            device and on Drive.
          </p>
        </Section>
        <div className="h-6" />
      </main>
    </div>
  );
}

export function Gym() {
  return (
    <div className="flex h-full flex-col bg-bg text-[15px]">
      <Header back="places" title="Blokownia" right={<span />} />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Section
          title="Colours, easiest first"
          more={<span className="text-[14px] text-accent">+ colour</span>}
        >
          <ul className="divide-y divide-line rounded-xl border border-line bg-panel">
            {CIRCUITS.map(c => (
              <li
                key={c.name}
                className="flex min-h-14 items-center gap-3 px-3"
              >
                <GripVertical size={16} className="text-dim" aria-hidden />
                <Swatch colour={c.name} size="h-7 w-7" />
                <span className="flex-1 text-strong">{c.name}</span>
                <span className="rounded-lg bg-raised px-2.5 py-1 tabular-nums">
                  {c.range}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] text-dim">
            Each gym has its own colours and the Font grades each one covers.
            You log by colour; the exact grade is optional.
          </p>
        </Section>
        <div className="px-4 pt-5">
          <button className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-line text-[15px] text-fg">
            <Plus size={16} aria-hidden /> Copy colours from another gym
          </button>
        </div>
      </main>
    </div>
  );
}

export const SCREENS: Record<string, () => ReactNode> = {
  today: Today,
  log: Log,
  board: BoardLog,
  summary: Summary,
  progress: Progress,
  range: Range,
  history: HistoryScreen,
  places: Places,
  gym: Gym,
};
