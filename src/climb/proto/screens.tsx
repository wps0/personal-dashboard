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
  Minus,
  Mountain,
  Plus,
  Settings,
  Timer,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
  Undo2,
  Zap,
} from 'lucide-react';
import type {ReactNode} from 'react';
import {
  BOARD_GRADES,
  BOARD_LIVE,
  colourHex,
  COLOURS,
  GRADES,
  GROUPS,
  HISTORY,
  LIVE,
  type LoggedClimb,
  PYRAMID,
  SCALE,
  SESSION_BY_GRADE,
  TREND,
  TRIES,
  TRIES_BY_GRADE,
  WEEKS,
} from './data';
import {box, listBox, listRow, LOOK, pick} from './look';

/** Small headings inside a block (Tries, Grade…). */
const small = pick({
  panes: 'label !text-[12px]',
  open: 'text-[14px] text-dim',
  soft: 'text-[13px] font-medium text-dim',
});

/** The corners of the big buttons. */
const bigButton = pick({
  panes: 'rounded-xl',
  open: 'rounded-full',
  soft: 'rounded-2xl',
});

/** The gaps between number tiles. */
const tileGap = pick({panes: 'gap-2', open: 'gap-x-3 gap-y-5', soft: 'gap-2'});

/** A small button or chip that isn't chosen. */
const chip = pick({
  panes: 'border border-line text-fg',
  open: 'text-fg',
  soft: 'bg-raised text-fg',
});

/** A chip that is chosen. */
const chipOn = pick({
  panes: 'border border-accent bg-accent/10 font-medium text-strong',
  open: 'font-semibold text-accent underline decoration-2 underline-offset-[10px]',
  soft: 'bg-accent font-semibold text-on-accent',
});

type Tab = 'today' | 'progress' | 'history';

const TABS: {tab: Tab; label: string; icon: typeof House}[] = [
  {tab: 'today', label: 'Today', icon: House},
  {tab: 'progress', label: 'Progress', icon: ChartNoAxesColumn},
  {tab: 'history', label: 'History', icon: History},
];

/** A colour label, as a swatch (black and white get a ring). */
function Swatch({colour, size = 'h-5 w-5'}: {colour: string; size?: string}) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-md ring-1 ring-white/25 ${size}`}
      style={{background: colourHex(colour)}}
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
    <header
      className={`flex h-14 shrink-0 items-center gap-2 px-2 ${pick({panes: 'border-b border-line bg-panel', open: 'bg-bg', soft: 'bg-bg'})}`}
    >
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
            className={`flex h-10 items-center gap-1.5 rounded-full px-3 text-[14px] ${chip}`}
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
    <nav
      className={`grid shrink-0 grid-cols-3 ${pick({panes: 'border-t border-line bg-panel', open: 'border-t border-line bg-bg', soft: 'bg-bg'})}`}
    >
      {TABS.map(({tab, label, icon: Icon}) => (
        <a
          key={tab}
          href={`#${tab}`}
          className={`flex h-16 flex-col items-center justify-center gap-1 text-[12px] ${tab === active ? (LOOK === 'soft' ? 'font-medium text-strong' : 'font-medium text-accent') : 'text-dim'}`}
        >
          <span
            className={
              LOOK === 'soft'
                ? `flex h-8 w-16 items-center justify-center rounded-full ${tab === active ? 'bg-accent/20 text-accent' : ''}`
                : ''
            }
          >
            <Icon size={22} aria-hidden />
          </span>
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
    <section
      className={pick({
        panes: 'px-4 pt-5',
        open: 'px-4 pt-8',
        soft: 'px-4 pt-6',
      })}
    >
      <div
        className={`flex items-baseline ${LOOK === 'open' ? 'mb-3' : 'mb-2'}`}
      >
        <h2
          className={`flex-1 ${pick({panes: 'label !text-[12px]', open: 'text-[18px] font-semibold text-strong', soft: 'text-[15px] font-semibold text-strong'})}`}
        >
          {title}
        </h2>
        {more}
      </div>
      {children}
    </section>
  );
}

/** A choice of a few options: tries, or which sessions to compare with. */
function Segmented({
  label,
  options,
  selected,
}: {
  label: string;
  options: string[];
  selected: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`flex min-w-0 flex-1 ${pick({panes: 'gap-1.5', open: 'border-b border-line', soft: 'rounded-full bg-raised p-1'})}`}
    >
      {options.map(o => (
        <button
          key={o}
          role="radio"
          aria-checked={o === selected}
          className={`h-10 flex-1 text-[14px] ${
            o === selected
              ? pick({
                  panes:
                    'rounded-lg border border-accent bg-accent/15 font-semibold text-strong',
                  open: 'font-semibold text-accent shadow-[inset_0_-2px_0_var(--color-accent)]',
                  soft: 'rounded-full bg-accent font-semibold text-on-accent',
                })
              : pick({
                  panes: 'rounded-lg border border-line text-fg',
                  open: 'text-fg',
                  soft: 'rounded-full text-fg',
                })
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/**
 * A number, and how it compares: which way it went, and whether that's good
 * (fewer tries per climb is).
 */
function Tile({
  label,
  value,
  was,
  trend,
  good = true,
}: {
  label: string;
  value: ReactNode;
  was?: string;
  trend?: 'up' | 'down';
  good?: boolean;
}) {
  const Icon = trend === 'up' ? TrendingUp : TrendingDown;
  return (
    <div
      className={pick({
        panes: 'rounded-xl border border-line bg-panel px-3 py-2.5',
        open: 'border-l-2 border-line py-0.5 pl-3',
        soft: 'rounded-2xl bg-raised px-4 py-3',
      })}
    >
      <div className="text-[12px] text-dim">{label}</div>
      <div
        className={`mt-0.5 font-semibold text-strong ${LOOK === 'open' ? 'text-[28px] leading-tight' : 'text-[24px]'}`}
      >
        {value}
      </div>
      {was && (
        <div className="flex items-center gap-1 text-[12px] text-dim">
          {trend && (
            <Icon
              size={13}
              className={good ? 'text-ok' : 'text-warn'}
              aria-label={`${trend}, ${good ? 'better' : 'worse'}`}
            />
          )}
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

/** A count as is, an average to one decimal. */
function num(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
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
  rows: {key: string; label: ReactNode; now: number; past: number | null}[];
  nowLabel: string;
  pastLabel: string;
}) {
  const max = Math.max(...rows.flatMap(r => [r.now, r.past ?? 0]), 1);
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
              aria-label={`${r.key}: ${r.now}, ${pastLabel.toLowerCase()} ${r.past ?? 'none'}`}
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
              {!!r.past && (
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
              {num(r.now)}
              <span className="text-dim">
                {' '}
                / {r.past === null ? '–' : num(r.past)}
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
        <div
          className={pick({
            panes: 'rounded-2xl border border-line bg-panel p-4',
            open: '',
            soft: 'rounded-3xl bg-raised p-4',
          })}
        >
          <button
            className={`flex w-full items-center justify-between text-left ${pick({panes: 'h-12 rounded-xl bg-raised px-3', open: 'h-16 border-b border-line', soft: 'h-14 rounded-2xl bg-bg px-4'})}`}
          >
            <span>
              <span className="block text-[11px] text-dim">Where</span>
              <span
                className={
                  LOOK === 'open'
                    ? 'text-[22px] font-semibold text-strong'
                    : undefined
                }
              >
                Blokownia
              </span>{' '}
              <span className="text-dim">· gym</span>
            </span>
            <ChevronDown size={18} className="text-dim" />
          </button>
          <a
            href="#log"
            className={`flex h-14 items-center justify-center gap-2 bg-accent text-[17px] font-semibold text-on-accent ${bigButton} ${LOOK === 'open' ? 'mt-5' : 'mt-3'}`}
          >
            <Timer size={20} aria-hidden />
            Start a session
          </a>
        </div>
      </div>

      <Section title="November so far">
        <div className={`grid grid-cols-3 ${tileGap}`}>
          <Tile label="Climbs" value="67" was="Oct: 62" trend="up" />
          <Tile label="Flashed" value="42%" was="Oct: 36%" trend="up" />
          <Tile label="Hardest" value="6B+" was="Oct: 6B" trend="up" />
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
          className={`flex items-center gap-3 ${pick({panes: 'rounded-xl border border-line bg-panel p-3', open: '-mx-4 border-y border-line px-4 py-3', soft: 'rounded-3xl bg-raised p-4'})}`}
        >
          <div className="min-w-0 flex-1">
            <div className="text-strong">Tue 18 Nov · Blokownia</div>
            <div className="text-[14px] text-dim">
              1h 52m · 15 climbs · 7 flashed
            </div>
          </div>
          <span className="font-semibold text-strong">6B+</span>
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
    <div
      className={`flex h-12 shrink-0 items-center gap-3 px-4 text-[14px] ${pick({panes: 'border-t border-line bg-raised', open: 'border-t border-line bg-bg', soft: 'mx-3 mb-3 rounded-2xl bg-raised'})}`}
    >
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
          className={`flex h-10 items-center rounded-full px-4 text-[15px] font-semibold ${pick({panes: 'border border-line text-strong', open: 'text-accent', soft: 'bg-raised text-strong'})}`}
        >
          Finish
        </a>
      }
    />
  );
}

function triesText(tries: number): ReactNode {
  return tries === 1 ? (
    <span className="flex items-center gap-1 text-accent">
      <Zap size={13} aria-hidden /> flash
    </span>
  ) : (
    `${tries} tries`
  );
}

/** One logged climb; a tap opens it to fix the grade or tries, or add a colour or name. */
function ClimbRow({climb}: {climb: LoggedClimb}) {
  return (
    <li>
      <a href="#climb" className="flex min-h-12 items-center gap-3 px-4">
        <span className="w-12 text-[17px] font-semibold text-strong">
          {climb.grade}
        </span>
        <span className="text-[14px] text-fg">{triesText(climb.tries)}</span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[14px] text-dim">
          {climb.colour && <Swatch colour={climb.colour} size="h-3.5 w-3.5" />}
          <span className="truncate">{climb.name}</span>
        </span>
        <span className="w-12 text-right text-[13px] tabular-nums text-dim">
          {climb.time}
        </span>
      </a>
    </li>
  );
}

/**
 * A live session: pick the tries if it wasn't a flash, then tap the grade;
 * one tap logs one climb topped, and the tries go back to Flash.
 */
function LiveSession({
  title,
  time,
  climbs,
  grades,
  extra,
  undo,
  overlay,
}: {
  title: string;
  time: string;
  climbs: LoggedClimb[];
  grades: string[];
  extra?: ReactNode;
  undo: string;
  overlay?: ReactNode;
}) {
  const counts = new Map<string, number>();
  for (const c of climbs) counts.set(c.grade, (counts.get(c.grade) ?? 0) + 1);
  const flashed = climbs.filter(c => c.tries === 1).length;
  const hardest = [...grades].reverse().find(g => counts.has(g));
  return (
    <div className="relative flex h-full flex-col bg-bg text-[15px]">
      <SessionHeader title={title} time={time} />
      <div className="flex shrink-0 items-baseline gap-3 px-4 py-2 text-[13px] text-dim">
        <span>
          <b className="text-[17px] font-semibold text-strong">
            {climbs.length}
          </b>{' '}
          climbs
        </span>
        <span>
          <b className="text-[17px] font-semibold text-strong">{flashed}</b>{' '}
          flashed
        </span>
        <span className="ml-auto">hardest {hardest}</span>
        {extra}
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto border-y border-line">
        {climbs.map(c => (
          <ClimbRow key={c.time} climb={c} />
        ))}
      </ul>
      <section
        aria-label="Log a climb"
        className={`shrink-0 px-4 pt-3 ${pick({panes: 'bg-panel pb-4', open: 'bg-bg', soft: 'bg-bg pb-3'})}`}
      >
        <div className="mb-3 flex items-center gap-2">
          <span className={small}>Tries</span>
          <Segmented label="Tries" options={TRIES} selected="Flash" />
        </div>
        <h2 className={`mb-2 ${small}`}>Topped one? Tap its grade</h2>
        <div
          className={`grid grid-cols-4 ${pick({panes: 'gap-2', open: '-mx-4 gap-px border-t border-line bg-line', soft: 'gap-2'})}`}
        >
          {grades.map(g => (
            <button
              key={g}
              className={`relative flex items-center justify-center font-semibold text-strong ${pick({panes: 'h-14 rounded-xl border border-line bg-raised text-[18px]', open: 'h-16 bg-bg text-[21px]', soft: 'h-14 rounded-2xl bg-raised text-[18px]'})}`}
            >
              {g}
              {(counts.get(g) ?? 0) > 0 && (
                <span
                  className={`absolute font-semibold tabular-nums ${pick({panes: 'top-1 right-1 rounded-full bg-accent px-1.5 text-[12px] text-on-accent', open: 'top-1.5 right-2.5 text-[13px] text-accent', soft: 'top-1 right-1 rounded-full bg-accent px-1.5 text-[12px] text-on-accent'})}`}
                >
                  {counts.get(g)}
                </span>
              )}
            </button>
          ))}
        </div>
      </section>
      <UndoBar text={undo} />
      {overlay}
    </div>
  );
}

/** A live session at a gym. */
export function Log() {
  return (
    <LiveSession
      title="Blokownia"
      time="58:40"
      climbs={LIVE}
      grades={GRADES}
      undo="6B+ in 3 tries logged"
    />
  );
}

/** A live board session: the same, with the board's angle. */
export function BoardLog() {
  return (
    <LiveSession
      title="Kilter"
      time="38:20"
      climbs={BOARD_LIVE}
      grades={BOARD_GRADES}
      extra={
        <button
          className={`flex h-7 items-center gap-1 rounded-full px-2.5 text-[13px] ${chip}`}
        >
          40° <ChevronDown size={13} className="text-dim" />
        </button>
      }
      undo="6B in 4 tries logged"
    />
  );
}

/** A logged climb, opened from the list: everything but the grade is optional. */
export function EditClimb() {
  return (
    <LiveSession
      title="Blokownia"
      time="58:40"
      climbs={LIVE}
      grades={GRADES}
      undo="6B+ in 3 tries logged"
      overlay={
        <div className="absolute inset-0 flex flex-col justify-end bg-black/50">
          <div className="rounded-t-2xl bg-panel px-4 pt-3 pb-5 shadow-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            <div className="mb-3 flex items-center">
              <h2 className="flex-1 text-[17px] font-semibold text-strong">
                Climb at 19:38
              </h2>
              <button className="flex h-10 items-center gap-1.5 rounded-full px-3 text-[14px] text-warn">
                <Trash2 size={16} aria-hidden /> Delete
              </button>
            </div>
            <div className="mb-1 text-[12px] text-dim">Grade</div>
            <div className="grid grid-cols-6 gap-1.5">
              {GRADES.map(g => (
                <button
                  key={g}
                  aria-pressed={g === '6B'}
                  className={`h-10 rounded-lg border text-[15px] font-semibold ${g === '6B' ? 'border-accent bg-accent/15 text-strong' : 'border-line text-fg'}`}
                >
                  {g}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <span className="flex-1 text-[12px] text-dim">Tries</span>
              <button
                aria-label="One try fewer"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-fg"
              >
                <Minus size={18} />
              </button>
              <span className="w-8 text-center text-[20px] font-semibold tabular-nums text-strong">
                2
              </span>
              <button
                aria-label="One try more"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-fg"
              >
                <Plus size={18} />
              </button>
            </div>
            <div className="mt-4 mb-1 text-[12px] text-dim">
              Colour <span className="text-dim">(optional)</span>
            </div>
            <div className="flex gap-2">
              <button className="h-10 rounded-full border border-line px-3 text-[14px] text-fg">
                None
              </button>
              {COLOURS.map(c => (
                <button
                  key={c.name}
                  aria-label={c.name}
                  aria-pressed={c.name === 'Blue'}
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${c.name === 'Blue' ? 'ring-2 ring-accent' : ''}`}
                >
                  <Swatch colour={c.name} size="h-7 w-7" />
                </button>
              ))}
            </div>
            <div className="mt-4 mb-1 text-[12px] text-dim">
              Name <span className="text-dim">(optional)</span>
            </div>
            <div className="flex h-12 items-center rounded-xl border border-line bg-raised px-3 text-dim">
              the overhang by the window
            </div>
            <button className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-[16px] font-semibold text-on-accent">
              <Check size={18} aria-hidden /> Save
            </button>
          </div>
        </div>
      }
    />
  );
}

export function Summary() {
  return (
    <div className="flex h-full flex-col bg-bg text-[15px]">
      <Header back="today" title="Session" right={<span />} />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 pt-4">
          <div className="text-[13px] text-dim">
            Saturday 21 Nov · Blokownia · 18:58–20:31
          </div>
          <div className="text-[22px] font-semibold text-strong">
            13 climbs in 1h 33m
          </div>
          <div
            className={`mt-3 flex items-center gap-3 ${pick({panes: 'rounded-xl border border-accent/40 bg-accent/10 p-3', open: 'border-l-2 border-accent py-1 pl-3', soft: 'rounded-3xl bg-accent/15 p-4'})}`}
          >
            <Trophy size={22} className="shrink-0 text-accent" aria-hidden />
            <div>
              <div className="font-medium text-strong">
                Your first 6C, in 5 tries
              </div>
              <div className="text-[13px] text-dim">
                and 3 climbs at 6B, your most in a session
              </div>
            </div>
          </div>
        </div>
        <Section title="By grade, against an average session">
          <div className="mb-3 flex">
            <Segmented
              label="Compare with"
              options={['All gyms', 'Only Blokownia']}
              selected="All gyms"
            />
          </div>
          <div className={box}>
            <NowVsPast
              nowLabel="Tonight"
              pastLabel="Average session, last 30 days"
              rows={SESSION_BY_GRADE.map(r => ({
                key: r.grade,
                label: r.grade,
                now: r.tonight,
                past: r.all,
              }))}
            />
            <p className="mt-2 text-[12px] text-dim">
              The average of your 8 gym sessions since 22 Oct, at Blokownia and
              West Bouldering. Board sessions are compared with board sessions.
            </p>
          </div>
        </Section>
        <Section title="Numbers, against the same average">
          <div className={`grid grid-cols-2 ${tileGap}`}>
            <Tile label="Climbs" value="13" was="avg 11.4" trend="up" />
            <Tile label="Hardest" value="6C" was="avg 6B+" trend="up" />
            <Tile label="Flashed" value="6" was="avg 4.8" trend="up" />
            <Tile
              label="Tries per climb"
              value="2.1"
              was="avg 2.3"
              trend="down"
            />
          </div>
        </Section>
        <Section title="Notes">
          <div
            className={`text-[15px] text-dim ${pick({panes: 'rounded-xl border border-line bg-panel px-3 py-2.5', open: 'border-b border-line py-2.5', soft: 'rounded-2xl bg-raised px-4 py-3'})}`}
          >
            Skin thin on the right index…
          </div>
        </Section>
        <div className="h-4" />
      </main>
      <div
        className={`shrink-0 p-3 ${pick({panes: 'border-t border-line bg-panel', open: 'bg-bg', soft: 'bg-bg'})}`}
      >
        <a
          href="#today"
          className={`flex h-12 items-center justify-center bg-accent text-[16px] font-semibold text-on-accent ${bigButton}`}
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
        className={`flex min-h-12 items-center gap-3 ${pick({panes: 'rounded-xl border border-line bg-panel px-3 py-2', open: 'py-1', soft: 'rounded-3xl bg-raised px-4 py-3'})}`}
      >
        <CalendarRange size={20} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span
            className={`block text-strong ${LOOK === 'open' ? 'text-[20px] font-semibold' : 'font-medium'}`}
          >
            23 Aug – 21 Nov 2026
          </span>
          <span className="block text-[12px] text-dim">
            last 3 months · against 25 May – 22 Aug
          </span>
        </span>
        <ChevronDown size={18} className="text-dim" />
      </a>
      <div
        className={`flex text-[14px] ${LOOK === 'open' ? 'mt-1 gap-4' : 'mt-2 gap-2'}`}
      >
        <button
          className={`h-9 rounded-full ${LOOK === 'open' ? '' : 'px-3'} ${chipOn}`}
        >
          Gym
        </button>
        <button
          className={`h-9 rounded-full ${LOOK === 'open' ? '' : 'px-3'} ${chip}`}
        >
          Board
        </button>
        <button
          className={`ml-auto flex h-9 items-center gap-1 rounded-full ${LOOK === 'open' ? '' : 'px-3'} ${chip}`}
        >
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
        <div className={`grid grid-cols-3 ${tileGap}`}>
          <Tile label="Climbs" value="168" was="was 131" trend="up" />
          <Tile label="Sessions" value="22" was="was 19" trend="up" />
          <Tile label="Per session" value="7.6" was="was 6.9" trend="up" />
          <Tile label="Typical" value="6A" was="was 5+" trend="up" />
          <Tile label="Top 5 avg" value="6B+" was="was 6B" trend="up" />
          <Tile label="Hardest" value="6C" was="was 6B+" trend="up" />
        </div>
      </Section>
      <Section
        title="Climbs by grade"
        more={<span className="text-[14px] text-accent">table</span>}
      >
        <div className={box}>
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
        </div>
      </Section>
      <Section title="Tries">
        <div className={`grid grid-cols-2 ${tileGap}`}>
          <Tile label="Flashed" value="41%" was="was 34%" trend="up" />
          <Tile
            label="Tries per climb"
            value="2.1"
            was="was 2.5"
            trend="down"
          />
        </div>
        <div className={`mt-2 ${box}`}>
          <div className="mb-2 text-[13px] text-strong">
            Tries to top, by grade (fewer is better)
          </div>
          <NowVsPast
            nowLabel="These 3 months"
            pastLabel="The 3 months before"
            rows={TRIES_BY_GRADE.map(r => ({
              key: r.grade,
              label: r.grade,
              now: r.now,
              past: r.before,
            }))}
          />
        </div>
      </Section>
      <Section title="Climbs per week, by grade">
        <div className={box}>
          <WeeklyColumns />
        </div>
      </Section>
      <Section title="Grades, week by week">
        <div className={box}>
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
                    {s.length} · {s.climbs} climbs · {s.flashed} flashed
                  </div>
                </div>
                <span className="font-semibold text-strong">{s.hardest}</span>
                <ChevronRight size={18} className="text-dim" />
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </Screen>
  );
}

/** Settings: the grade buttons, and the places you climb. */
export function Places() {
  return (
    <div className="flex h-full flex-col bg-bg text-[15px]">
      <Header back="today" title="Settings" right={<span />} />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Grades">
          <div className={listBox}>
            <div className={`flex min-h-12 items-center ${listRow}`}>
              <span className="flex-1">Scale</span>
              <span className="text-dim">Font (6A, 6B+…)</span>
            </div>
            <div className={`flex min-h-12 items-center gap-2 ${listRow}`}>
              <span className="flex-1">Buttons at gyms</span>
              <span className="rounded-lg bg-raised px-2.5 py-1">4</span>
              <span className="text-dim">to</span>
              <span className="rounded-lg bg-raised px-2.5 py-1">7A+</span>
            </div>
            <div className={`flex min-h-12 items-center gap-2 ${listRow}`}>
              <span className="flex-1">Buttons on boards</span>
              <span className="rounded-lg bg-raised px-2.5 py-1">5</span>
              <span className="text-dim">to</span>
              <span className="rounded-lg bg-raised px-2.5 py-1">7B+</span>
            </div>
          </div>
        </Section>
        <Section
          title="Gyms"
          more={<span className="text-[14px] text-accent">+ gym</span>}
        >
          <div className={listBox}>
            {[
              ['Blokownia', '6 colour labels'],
              ['West Bouldering', 'no colour labels'],
            ].map(([name, meta]) => (
              <a
                key={name}
                href="#gym"
                className={`flex min-h-14 items-center gap-3 ${listRow}`}
              >
                <span className="flex-1 text-strong">{name}</span>
                <span className="text-[14px] text-dim">{meta}</span>
                <ChevronRight size={18} className="text-dim" />
              </a>
            ))}
          </div>
        </Section>
        <Section
          title="Boards"
          more={<span className="text-[14px] text-accent">+ board</span>}
        >
          <div className={listBox}>
            <div className={`flex min-h-14 items-center gap-3 ${listRow}`}>
              <span className="flex-1 text-strong">Kilter</span>
              <span className="text-dim">usually 40°</span>
              <ChevronRight size={18} className="text-dim" />
            </div>
            <div className={`flex min-h-14 items-center gap-3 ${listRow}`}>
              <span className="flex-1 text-strong">MoonBoard 2019</span>
              <span className="text-dim">40°</span>
              <ChevronRight size={18} className="text-dim" />
            </div>
          </div>
          <p className="mt-2 text-[13px] text-dim">
            Board grades run harder than a gym&apos;s, so boards are charted and
            compared on their own.
          </p>
        </Section>
        <Section title="Data">
          <div className={listBox}>
            <div className={`flex min-h-12 items-center ${listRow}`}>
              <span className="flex-1">Drive sync</span>
              <span className="text-dim">climb.binpb · on</span>
            </div>
            <div className={`flex min-h-12 items-center ${listRow}`}>
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

/** A gym: its name and its optional colour labels. */
export function Gym() {
  return (
    <div className="flex h-full flex-col bg-bg text-[15px]">
      <Header back="places" title="Blokownia" right={<span />} />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Section
          title="Colour labels (optional)"
          more={<span className="text-[14px] text-accent">+ colour</span>}
        >
          <ul className={listBox}>
            {COLOURS.map(c => (
              <li
                key={c.name}
                className={`flex min-h-14 items-center gap-3 ${listRow}`}
              >
                <GripVertical size={16} className="text-dim" aria-hidden />
                <Swatch colour={c.name} size="h-7 w-7" />
                <span className="flex-1 text-strong">{c.name}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] text-dim">
            Only to tell problems apart: tap a logged climb to add its colour.
            You never need one to log, and the charts don&apos;t use them.
          </p>
        </Section>
      </main>
    </div>
  );
}

export const SCREENS: Record<string, () => ReactNode> = {
  today: Today,
  log: Log,
  climb: EditClimb,
  board: BoardLog,
  summary: Summary,
  progress: Progress,
  range: Range,
  history: HistoryScreen,
  places: Places,
  gym: Gym,
};
