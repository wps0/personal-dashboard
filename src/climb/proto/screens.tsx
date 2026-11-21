/**
 * The climbing app's prototype screens, for the design document's
 * screenshots. Static: sample data, no storage; links only switch screens.
 */
import {
  Check,
  ChartNoAxesColumn,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  GripVertical,
  History,
  House,
  Minus,
  Mountain,
  Pencil,
  Plus,
  Settings,
  Target,
  Timer,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import type {ReactNode} from 'react';
import {
  circuit,
  CIRCUITS,
  HISTORY,
  LIVE,
  PROBLEM_HISTORY,
  PROJECTS,
  PYRAMID,
  SCALE,
  SENT_PROJECTS,
  WEEKLY,
  type Logged,
  type Result,
} from './data';

type Tab = 'today' | 'projects' | 'progress' | 'history';

const TABS: {tab: Tab; label: string; icon: typeof House}[] = [
  {tab: 'today', label: 'Today', icon: House},
  {tab: 'projects', label: 'Projects', icon: Target},
  {tab: 'progress', label: 'Progress', icon: ChartNoAxesColumn},
  {tab: 'history', label: 'History', icon: History},
];

/** A problem's colour, as a swatch (black and white get a ring). */
function Swatch({colour, size = 'h-5 w-5'}: {colour: string; size?: string}) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-md ring-1 ring-white/25 ${size}`}
      style={{background: circuit(colour).hex}}
    />
  );
}

function ResultBadge({result, tries}: {result: Result; tries: number}) {
  switch (result) {
    case 'flash':
      return (
        <span className="flex items-center gap-1 rounded-full bg-[var(--series-flash)]/15 px-2.5 py-1 text-[13px] font-medium text-strong">
          <Zap size={14} className="text-[var(--series-flash)]" aria-hidden />
          Flash
        </span>
      );
    case 'sent':
      return (
        <span className="flex items-center gap-1 rounded-full bg-[var(--series-sent)]/15 px-2.5 py-1 text-[13px] font-medium text-strong">
          <Check size={14} className="text-[var(--series-sent)]" aria-hidden />
          Sent · {tries} tries
        </span>
      );
    case 'repeat':
      return (
        <span className="rounded-full bg-raised px-2.5 py-1 text-[13px] text-dim">
          Repeat
        </span>
      );
    default:
      return (
        <span className="rounded-full border border-line px-2.5 py-1 text-[13px] text-dim">
          {tries} tries
        </span>
      );
  }
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
            href="#gym"
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
    <nav className="grid shrink-0 grid-cols-4 border-t border-line bg-panel">
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

/** Shown above the tabs while a session runs elsewhere in the app. */
function LiveBar() {
  return (
    <a
      href="#log"
      className="flex h-12 shrink-0 items-center gap-2 border-t border-accent/40 bg-accent/10 px-4 text-[14px]"
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
      <span className="flex-1 text-strong">Session at Blokownia</span>
      <span className="tabular-nums text-fg">47:12 · 6 climbs</span>
      <ChevronRight size={18} className="text-dim" />
    </a>
  );
}

function Screen({
  children,
  tab,
  title = 'Climb',
  live,
}: {
  children: ReactNode;
  tab: Tab;
  title?: string;
  live?: boolean;
}) {
  return (
    <div className="flex h-full flex-col bg-bg text-[15px]">
      <Header title={title} />
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      {live && <LiveBar />}
      <Tabs active={tab} />
    </div>
  );
}

function Section({
  title,
  more,
  children,
}: {
  title: string;
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

function Tile({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel px-3 py-2.5">
      <div className="text-[12px] text-dim">{label}</div>
      <div className="mt-0.5 text-[24px] font-semibold text-strong">
        {value}
      </div>
      {note && <div className="text-[12px] text-dim">{note}</div>}
    </div>
  );
}

export function Today() {
  return (
    <Screen tab="today">
      <div className="px-4 pt-4">
        <div className="rounded-2xl border border-line bg-panel p-4">
          <div className="flex gap-2">
            <button className="flex h-11 flex-1 items-center justify-between rounded-xl bg-raised px-3 text-left">
              <span>
                <span className="block text-[11px] text-dim">Where</span>
                Blokownia
              </span>
              <ChevronDown size={18} className="text-dim" />
            </button>
            <button className="flex h-11 flex-1 items-center justify-between rounded-xl bg-raised px-3 text-left">
              <span>
                <span className="block text-[11px] text-dim">What</span>
                Bouldering
              </span>
              <ChevronDown size={18} className="text-dim" />
            </button>
          </div>
          <a
            href="#log"
            className="mt-3 flex h-14 items-center justify-center gap-2 rounded-xl bg-accent text-[17px] font-semibold text-on-accent"
          >
            <Timer size={20} aria-hidden />
            Start a session
          </a>
        </div>
      </div>

      <Section title="This week">
        <div className="grid grid-cols-3 gap-2">
          <Tile label="Sessions" value="1" note="goal: 3" />
          <Tile label="Sends" value="12" note="5 flashes" />
          <Tile
            label="Hardest"
            value={
              <span className="flex items-center gap-1.5">
                <Swatch colour="Red" size="h-4 w-4" /> 6C
              </span>
            }
            note="flash 6B"
          />
        </div>
      </Section>

      <Section
        title="Projects"
        more={
          <a href="#projects" className="text-[14px] text-accent">
            all 4
          </a>
        }
      >
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {PROJECTS.slice(0, 3).map(p => (
            <a
              key={p.colour + p.grade + p.wall}
              href="#problem"
              className="w-40 shrink-0 rounded-xl border border-line bg-panel p-3"
            >
              <div className="flex items-center gap-2">
                <Swatch colour={p.colour} />
                <span className="text-[17px] font-semibold text-strong">
                  {p.grade}
                </span>
              </div>
              <div className="mt-1 truncate text-[14px] text-fg">
                {p.name ?? `${p.colour} · ${p.wall}`}
              </div>
              <div className="text-[13px] text-dim">
                {p.tries} tries · {p.sessions}{' '}
                {p.sessions === 1 ? 'session' : 'sessions'}
              </div>
            </a>
          ))}
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
            <div className="text-[14px] text-dim">
              1h 52m · 17 climbs · 12 sends
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-raised px-2.5 py-1 text-[13px]">
            <Trophy size={14} className="text-accent" aria-hidden /> first 6C
          </div>
          <ChevronRight size={18} className="text-dim" />
        </a>
      </Section>
      <div className="h-6" />
    </Screen>
  );
}

function LoggedRow({l}: {l: Logged}) {
  return (
    <li className="flex min-h-14 items-center gap-3 px-4">
      <Swatch colour={l.colour} />
      <div className="min-w-0 flex-1">
        <div className="text-strong">
          {l.colour} {l.grade && <span className="text-fg">· {l.grade}</span>}
        </div>
        <div className="text-[13px] text-dim">
          {l.wall} · {l.time}
        </div>
      </div>
      <ResultBadge result={l.result} tries={l.tries} />
    </li>
  );
}

/** The live session: what's been climbed, and the panel to log the next one. */
export function Log() {
  const picked = circuit('Red');
  return (
    <div className="flex h-full flex-col bg-bg text-[15px]">
      <Header
        back="today"
        title={
          <span className="flex items-baseline gap-2">
            Blokownia
            <span className="text-[14px] font-normal tabular-nums text-dim">
              47:12
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
      <div className="flex shrink-0 gap-4 px-4 py-2 text-[13px] text-dim">
        <span>
          <b className="font-semibold text-strong">6</b> climbs
        </span>
        <span>
          <b className="font-semibold text-strong">4</b> sends
        </span>
        <span>
          <b className="font-semibold text-strong">12</b> tries
        </span>
        <span className="ml-auto">hardest 6B+</span>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto border-y border-line">
        {LIVE.map(l => (
          <LoggedRow key={l.time} l={l} />
        ))}
      </ul>

      <section
        aria-label="Log a climb"
        className="shrink-0 rounded-t-2xl border-t border-line bg-panel px-4 pt-3 pb-4 shadow-[0_-8px_24px_rgba(0,0,0,0.35)]"
      >
        <div className="mb-2 flex items-center">
          <h2 className="label flex-1 !text-[12px]">Log a climb</h2>
          <span className="text-[13px] text-dim">Cave ▾</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {CIRCUITS.map(c => {
            const on = c.name === picked.name;
            return (
              <button
                key={c.name}
                aria-pressed={on}
                className={`flex h-14 items-center gap-2 rounded-xl border px-2.5 text-left ${on ? 'border-accent bg-accent/10' : 'border-line bg-raised'}`}
              >
                <Swatch colour={c.name} size="h-7 w-7" />
                <span className="min-w-0 leading-tight">
                  <span className="block font-medium text-strong">
                    {c.name}
                  </span>
                  <span className="block truncate text-[12px] text-dim">
                    {c.range}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="w-20 text-[13px] text-dim">Grade</span>
          {picked.grades.map(g => (
            <button
              key={g}
              aria-pressed={g === '6B+'}
              className={`h-10 min-w-14 rounded-full border px-3 text-[15px] ${g === '6B+' ? 'border-accent bg-accent/10 font-semibold text-strong' : 'border-line text-fg'}`}
            >
              {g}
            </button>
          ))}
          <span className="text-[12px] text-dim">optional</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="w-20 text-[13px] text-dim">Tries</span>
          <button
            aria-label="One try less"
            className="flex h-10 w-12 items-center justify-center rounded-full border border-line"
          >
            <Minus size={18} />
          </button>
          <span className="w-8 text-center text-[20px] font-semibold tabular-nums text-strong">
            2
          </span>
          <button
            aria-label="One more try"
            className="flex h-10 w-12 items-center justify-center rounded-full border border-line"
          >
            <Plus size={18} />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            disabled
            className="flex h-14 items-center justify-center gap-1.5 rounded-xl border border-line text-[16px] font-medium text-dim opacity-40"
          >
            <Zap size={18} aria-hidden /> Flash
          </button>
          <button className="flex h-14 items-center justify-center gap-1.5 rounded-xl bg-accent text-[16px] font-semibold text-on-accent">
            <Check size={20} aria-hidden /> Sent
          </button>
          <button className="flex h-14 items-center justify-center gap-1.5 rounded-xl border border-line bg-raised text-[16px] font-medium text-strong">
            <X size={18} aria-hidden /> Not yet
          </button>
        </div>
      </section>
    </div>
  );
}

/** Stacked bars, one per grade: flashes, then the other sends. */
function Pyramid({rows, compact}: {rows: typeof PYRAMID; compact?: boolean}) {
  const max = Math.max(...rows.map(r => r.flash + r.sent));
  return (
    <div className="viz">
      <div className="mb-2 flex gap-4 text-[13px] text-fg">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--series-flash)]" />
          Flash
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--series-sent)]" />
          Sent after tries
        </span>
      </div>
      <div className="space-y-1.5">
        {rows.map(r => {
          const total = r.flash + r.sent;
          return (
            <div key={r.grade} className="flex items-center gap-2">
              <span className="w-9 text-right text-[13px] tabular-nums text-dim">
                {r.grade}
              </span>
              <div className="flex h-5 flex-1 items-center gap-[2px]">
                {r.flash > 0 && (
                  <span
                    className="h-full bg-[var(--series-flash)]"
                    style={{
                      width: `${(r.flash / max) * (compact ? 80 : 86)}%`,
                      borderRadius: r.sent ? '0' : '0 4px 4px 0',
                    }}
                  />
                )}
                {r.sent > 0 && (
                  <span
                    className="h-full rounded-r-[4px] bg-[var(--series-sent)]"
                    style={{width: `${(r.sent / max) * (compact ? 80 : 86)}%`}}
                  />
                )}
                <span className="pl-1.5 text-[13px] tabular-nums text-fg">
                  {total}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Hardest send per week, on the grade scale; gaps where there was no session. */
function WeeklyLine() {
  const w = 360;
  const h = 170;
  const left = 34;
  const right = 30;
  const top = 10;
  const bottom = 24;
  const x = (i: number) =>
    left + (i * (w - left - right)) / (WEEKLY.length - 1);
  const y = (g: string) =>
    top +
    ((SCALE.length - 1 - SCALE.indexOf(g)) * (h - top - bottom)) /
      (SCALE.length - 1);
  const pts = WEEKLY.map((d, i) => (d.hardest ? {i, g: d.hardest} : null));
  // Segments between consecutive weeks that both had a session.
  const segs: string[] = [];
  let cur = '';
  for (const p of pts) {
    if (!p) {
      if (cur) segs.push(cur);
      cur = '';
      continue;
    }
    cur += `${cur ? 'L' : 'M'}${x(p.i)},${y(p.g)}`;
  }
  if (cur) segs.push(cur);
  const last = pts[pts.length - 1]!;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="viz w-full"
      role="img"
      aria-label="Hardest send per week, last 12 weeks: from 6A+ to 6C"
    >
      {SCALE.map(g => (
        <g key={g}>
          <line
            x1={left}
            x2={w - right}
            y1={y(g)}
            y2={y(g)}
            stroke="var(--color-line)"
            strokeWidth={1}
          />
          <text
            x={left - 8}
            y={y(g) + 4}
            textAnchor="end"
            className="fill-dim text-[11px] tabular-nums"
          >
            {g}
          </text>
        </g>
      ))}
      {[0, 5, 9].map(i => (
        <text
          key={i}
          x={x(i)}
          y={h - 6}
          textAnchor="middle"
          className="fill-dim text-[11px]"
        >
          {WEEKLY[i].week}
        </text>
      ))}
      {segs.map(d => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke="var(--series-sent)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {pts.map(
        p =>
          p && (
            <circle
              key={p.i}
              cx={x(p.i)}
              cy={y(p.g)}
              r={4}
              fill="var(--series-sent)"
              stroke="var(--color-panel)"
              strokeWidth={2}
            />
          ),
      )}
      <text
        x={x(last.i) + 9}
        y={y(last.g) + 4}
        className="fill-strong text-[12px] font-semibold"
      >
        {last.g}
      </text>
    </svg>
  );
}

export function Summary() {
  return (
    <div className="flex h-full flex-col bg-bg text-[15px]">
      <Header back="today" title="Session" right={<span />} />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 pt-4">
          <div className="text-[13px] text-dim">Tuesday 18 Nov · Blokownia</div>
          <div className="text-[22px] font-semibold text-strong">
            1h 52m, 17 climbs
          </div>
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 p-3">
            <Trophy size={22} className="shrink-0 text-accent" aria-hidden />
            <div>
              <div className="font-medium text-strong">
                Your first 6C: Red on the Cave
              </div>
              <div className="text-[13px] text-dim">
                after 11 tries over 4 sessions
              </div>
            </div>
          </div>
        </div>
        <Section title="Numbers">
          <div className="grid grid-cols-4 gap-2">
            <Tile label="Sends" value="12" />
            <Tile label="Flashes" value="5" />
            <Tile label="Tries" value="31" />
            <Tile label="Hardest" value="6C" />
          </div>
        </Section>
        <Section title="Sends by grade">
          <div className="rounded-xl border border-line bg-panel p-3">
            <Pyramid
              compact
              rows={[
                {grade: '6C', flash: 0, sent: 1},
                {grade: '6B+', flash: 0, sent: 2},
                {grade: '6B', flash: 1, sent: 2},
                {grade: '6A+', flash: 2, sent: 1},
                {grade: '6A', flash: 2, sent: 1},
              ]}
            />
            <div className="mt-2 text-[13px] text-dim">
              Not sent: Purple 6C+ (4 tries), Black 7A+ (2 tries)
            </div>
          </div>
        </Section>
        <Section title="How did it feel?">
          <div className="grid grid-cols-5 gap-2">
            {['Easy', 'Good', 'Hard', 'Max', 'Wrecked'].map((f, i) => (
              <button
                key={f}
                aria-pressed={i === 2}
                className={`h-11 rounded-xl border text-[14px] ${i === 2 ? 'border-accent bg-accent/10 font-medium text-strong' : 'border-line text-fg'}`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="mt-2 rounded-xl border border-line bg-panel px-3 py-2.5 text-[15px] text-dim">
            Notes: skin thin on the right index…
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

export function Progress() {
  return (
    <Screen tab="progress" title="Progress">
      <div className="flex gap-2 px-4 pt-3">
        <div className="flex flex-1 rounded-full bg-raised p-1 text-[14px]">
          {['4 weeks', '3 months', 'Year', 'All'].map((r, i) => (
            <button
              key={r}
              aria-pressed={i === 1}
              className={`h-9 flex-1 rounded-full ${i === 1 ? 'bg-panel font-medium text-strong shadow-sm' : 'text-dim'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 px-4 pt-2 text-[14px]">
        <button className="h-9 rounded-full border border-accent bg-accent/10 px-3 font-medium text-strong">
          Bouldering
        </button>
        <button className="h-9 rounded-full border border-line px-3 text-fg">
          Ropes
        </button>
        <span className="ml-auto self-center text-[13px] text-dim">
          Font grades
        </span>
      </div>
      <Section title="Last 3 months">
        <div className="grid grid-cols-4 gap-2">
          <Tile label="Hardest" value="6C" note="was 6B+" />
          <Tile label="Flash" value="6B+" note="same" />
          <Tile label="Sessions" value="22" note="1.8/week" />
          <Tile label="Sends" value="56" note="30% flash" />
        </div>
      </Section>
      <Section
        title="Sends by grade"
        more={<span className="text-[14px] text-accent">table</span>}
      >
        <div className="rounded-xl border border-line bg-panel p-3">
          <Pyramid rows={PYRAMID} />
        </div>
      </Section>
      <Section title="Hardest send, week by week">
        <div className="rounded-xl border border-line bg-panel p-3">
          <WeeklyLine />
        </div>
      </Section>
      <div className="h-6" />
    </Screen>
  );
}

function ProjectRow({p}: {p: (typeof PROJECTS)[number]}) {
  return (
    <li>
      <a href="#problem" className="flex min-h-16 items-center gap-3 px-4 py-2">
        <Swatch colour={p.colour} size="h-9 w-9" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-strong">
            {p.colour} {p.grade}{' '}
            <span className="font-normal text-dim">
              · {p.wall}
              {p.name && ` · “${p.name}”`}
            </span>
          </div>
          <div className="truncate text-[14px] text-dim">
            {p.sent
              ? `Sent ${p.sent} after ${p.tries} tries`
              : `${p.tries} tries over ${p.sessions} ${p.sessions === 1 ? 'session' : 'sessions'} · last ${p.last}`}
          </div>
        </div>
        <ChevronRight size={18} className="shrink-0 text-dim" />
      </a>
    </li>
  );
}

export function Projects() {
  return (
    <Screen tab="projects" title="Projects" live>
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pt-3 text-[14px] whitespace-nowrap">
        <button className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-line px-3 text-fg">
          Blokownia <ChevronDown size={16} className="text-dim" />
        </button>
        <button className="h-9 shrink-0 rounded-full border border-accent bg-accent/10 px-3 font-medium text-strong">
          Open · 4
        </button>
        <button className="h-9 shrink-0 rounded-full border border-line px-3 text-fg">
          Sent · 9
        </button>
        <button className="h-9 shrink-0 rounded-full border border-line px-3 text-fg">
          Taken down
        </button>
      </div>
      <ul className="mt-2 divide-y divide-line border-y border-line">
        {PROJECTS.map(p => (
          <ProjectRow key={p.colour + p.grade + p.wall} p={p} />
        ))}
      </ul>
      <Section title="Sent lately">
        <ul className="-mx-4 divide-y divide-line border-y border-line">
          {SENT_PROJECTS.map(p => (
            <ProjectRow key={p.colour + p.grade + p.wall} p={p} />
          ))}
        </ul>
      </Section>
      <p className="px-4 pt-4 text-[13px] text-dim">
        A climb becomes a project when you try it and don’t send it. When the
        gym resets a wall, mark its problems taken down.
      </p>
    </Screen>
  );
}

export function Problem() {
  return (
    <div className="flex h-full flex-col bg-bg text-[15px]">
      <Header
        back="projects"
        title="Project"
        right={
          <button aria-label="Edit" className="icon-btn h-11 w-11 text-fg">
            <Pencil size={18} />
          </button>
        }
      />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-center gap-4 px-4 pt-4">
          <Swatch colour="Purple" size="h-16 w-16 rounded-2xl" />
          <div>
            <div className="text-[24px] font-semibold text-strong">
              Purple 6C+
            </div>
            <div className="text-dim">Cave · “The crimpy one”</div>
            <div className="text-[13px] text-dim">Set 3 Nov · Blokownia</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 px-4 pt-4">
          <Tile label="Tries" value="9" />
          <Tile label="Sessions" value="3" />
          <Tile label="First tried" value="12 Nov" />
        </div>
        <div className="grid grid-cols-2 gap-2 px-4 pt-3">
          <button className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-line bg-raised font-medium text-strong">
            <Plus size={18} aria-hidden /> Log tries
          </button>
          <button className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-accent font-semibold text-on-accent">
            <Check size={18} aria-hidden /> Sent it
          </button>
        </div>
        <Section title="Beta">
          <div className="rounded-xl border border-line bg-panel p-3 text-fg">
            Left heel hook on the start hold, then match on the sloper. Don’t
            cut feet before the crimp.
          </div>
        </Section>
        <Section title="Tries">
          <ol className="relative ml-2 border-l border-line">
            {PROBLEM_HISTORY.map(h => (
              <li key={h.date} className="relative pb-4 pl-5">
                <span className="absolute top-1.5 -left-[5px] h-2.5 w-2.5 rounded-full bg-dim" />
                <div className="text-strong">
                  {h.date}{' '}
                  <span className="font-normal text-dim">
                    · {h.tries} tries · {h.result}
                  </span>
                </div>
                {h.note && <div className="text-[14px] text-dim">{h.note}</div>}
              </li>
            ))}
          </ol>
        </Section>
        <div className="px-4 pb-6">
          <button className="h-11 w-full rounded-xl border border-line text-[15px] text-dim">
            Taken down (the gym reset it)
          </button>
        </div>
      </main>
    </div>
  );
}

export function Gym() {
  return (
    <div className="flex h-full flex-col bg-bg text-[15px]">
      <Header back="today" title="Blokownia" right={<span />} />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Grades">
          <div className="divide-y divide-line rounded-xl border border-line bg-panel">
            <div className="flex min-h-12 items-center px-3">
              <span className="flex-1">Boulders</span>
              <span className="text-dim">Colours + Font ▾</span>
            </div>
            <div className="flex min-h-12 items-center px-3">
              <span className="flex-1">Ropes</span>
              <span className="text-dim">None here ▾</span>
            </div>
          </div>
        </Section>
        <Section
          title="Colour circuits"
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
            The colour of a problem’s tag says how hard it is. Logging asks for
            the colour; the exact grade is optional.
          </p>
        </Section>
        <Section title="Walls">
          <div className="flex flex-wrap gap-2">
            {['Cave', 'Slab', 'Roof', 'Comp wall', 'Kids'].map(w => (
              <span
                key={w}
                className="flex h-9 items-center rounded-full border border-line px-3"
              >
                {w}
              </span>
            ))}
            <span className="flex h-9 items-center rounded-full border border-dashed border-line px-3 text-dim">
              + wall
            </span>
          </div>
        </Section>
        <Section title="Other places">
          <div className="divide-y divide-line rounded-xl border border-line bg-panel">
            <div className="flex min-h-12 items-center px-3">
              <span className="flex-1">Ściana Centrum</span>
              <span className="text-dim">Ropes · French</span>
            </div>
            <div className="flex min-h-12 items-center px-3 text-accent">
              + place (gym or crag)
            </div>
          </div>
        </Section>
        <div className="h-6" />
      </main>
    </div>
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
                  <div className="text-strong">{s.gym}</div>
                  <div className="text-[14px] text-dim">
                    {s.length} · {s.climbs} climbs · {s.sends} sends
                  </div>
                </div>
                <span className="flex items-center gap-1.5 text-strong">
                  <Swatch colour={s.colour} size="h-4 w-4" />
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

export const SCREENS: Record<string, () => ReactNode> = {
  today: Today,
  log: Log,
  summary: Summary,
  progress: Progress,
  projects: Projects,
  problem: Problem,
  gym: Gym,
  history: HistoryScreen,
};
