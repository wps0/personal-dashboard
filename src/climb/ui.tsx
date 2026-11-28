/**
 * @fileoverview The climbing log's building blocks, in its look ("Soft",
 * docs/climbing.md): filled blocks with no outlines and round corners, pill
 * choices with the chosen one in orange.
 */

import {
  ChartNoAxesColumn,
  ChevronLeft,
  CircleGauge,
  History,
  House,
  Mountain,
  Settings,
} from 'lucide-react';
import {Undo2, X} from 'lucide-react';
import {useEffect, type ReactNode} from 'react';
import {CLIMB_UNDO_BAR_MS} from '../config';
import {href, type Route} from './router';
import {dismissBar, setNotice, undo, useClimb} from './store';

type Tab = 'today' | 'progress' | 'history';

const TABS: {tab: Tab; label: string; icon: typeof House}[] = [
  {tab: 'today', label: 'Today', icon: House},
  {tab: 'progress', label: 'Progress', icon: ChartNoAxesColumn},
  {tab: 'history', label: 'History', icon: History},
];

/** A filled block: a list, a chart, a group of settings. */
export const BLOCK = 'rounded-3xl bg-raised';

/** A list in a block, its rows split by faint lines. */
export const LIST = `${BLOCK} divide-y divide-line/70`;

/** A value or control inside a block's row. */
export const IN_BLOCK = 'rounded-lg bg-bg';

/** A small button that isn't the main action: "+ gym", "Export". */
export const SMALL_BUTTON =
  'flex h-10 items-center gap-1.5 rounded-full bg-raised px-4 text-[14px] text-fg';

/** The link back to the dashboard, at the top of every screen. */
export function DashboardLink() {
  return (
    <a
      href="../"
      className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-raised px-3 text-[14px] text-fg"
    >
      <CircleGauge size={16} className="text-dim" aria-hidden />
      Dashboard
    </a>
  );
}

export function Header({
  title,
  back,
  right,
  tab,
}: {
  title: ReactNode;
  /** Where the back arrow goes; without it, the log's mark. */
  back?: Route;
  right?: ReactNode;
  /** On a computer, the tabs in the bar, this one current (null: none). */
  tab?: Tab | null;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 bg-bg px-2">
      {back ? (
        <a href={href(back)} aria-label="Back" className="icon-btn h-11 w-11">
          <ChevronLeft size={22} />
        </a>
      ) : (
        <Mountain size={22} className="mx-2 shrink-0 text-accent" aria-hidden />
      )}
      <h1
        className={`min-w-0 flex-1 truncate text-[17px] font-semibold text-strong ${tab === undefined ? '' : 'md:flex-none'}`}
      >
        {title}
      </h1>
      {tab !== undefined && <TopTabs active={tab} />}
      {right ?? (
        <>
          <DashboardLink />
          <a
            href={href({name: 'settings'})}
            aria-label="Settings"
            className="icon-btn h-11 w-11"
          >
            <Settings size={20} />
          </a>
        </>
      )}
    </header>
  );
}

/** The tabs in the top bar, on a computer; phones have them at the bottom. */
function TopTabs({active}: {active: Tab | null}) {
  return (
    <nav className="ml-4 hidden flex-1 items-center gap-1 md:flex">
      {TABS.map(({tab, label, icon: Icon}) => {
        const on = tab === active;
        return (
          <a
            key={tab}
            href={href({name: tab})}
            aria-current={on ? 'page' : undefined}
            className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-[14px] ${on ? 'bg-accent/15 font-medium text-accent' : 'text-dim hover:text-fg'}`}
          >
            <Icon size={16} aria-hidden />
            {label}
          </a>
        );
      })}
    </nav>
  );
}

/** The tabs at the bottom, on a phone. */
function Tabs({active}: {active: Tab}) {
  return (
    <nav className="grid shrink-0 grid-cols-3 bg-bg pb-[env(safe-area-inset-bottom)] md:hidden">
      {TABS.map(({tab, label, icon: Icon}) => {
        const on = tab === active;
        return (
          <a
            key={tab}
            href={href({name: tab})}
            aria-current={on ? 'page' : undefined}
            className={`flex h-16 flex-col items-center justify-center gap-1 text-[12px] ${on ? 'font-medium text-strong' : 'text-dim'}`}
          >
            <span
              className={`flex h-8 w-16 items-center justify-center rounded-full ${on ? 'bg-accent/20 text-accent' : ''}`}
            >
              <Icon size={22} aria-hidden />
            </span>
            {label}
          </a>
        );
      })}
    </nav>
  );
}

/**
 * The last change, with Undo, floating above the bottom edge for a few
 * seconds; and a problem (saving failed) until it's dismissed.
 */
export function UndoBar() {
  const bar = useClimb(s => s.bar);
  const notice = useClimb(s => s.notice);
  useEffect(() => {
    if (!bar) return;
    const t = window.setTimeout(dismissBar, CLIMB_UNDO_BAR_MS);
    return () => window.clearTimeout(t);
  }, [bar]);
  if (notice)
    return (
      <div
        role="alert"
        className="mx-3 mb-3 flex shrink-0 items-start gap-3 rounded-2xl bg-raised px-4 py-3 text-[14px] text-danger"
      >
        <span className="flex-1">{notice}</span>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setNotice(null)}
          className="icon-btn h-8 w-8"
        >
          <X size={16} />
        </button>
      </div>
    );
  if (!bar) return null;
  return (
    <div
      role="status"
      className="mx-3 mb-3 flex h-12 shrink-0 items-center gap-3 rounded-2xl bg-raised px-4 text-[14px]"
    >
      <span className="min-w-0 flex-1 truncate text-strong">{bar.message}</span>
      <button
        type="button"
        onClick={undo}
        className="flex h-9 items-center gap-1.5 rounded-full px-3 font-medium text-accent"
      >
        <Undo2 size={16} aria-hidden /> Undo
      </button>
    </div>
  );
}

/** A screen with the tabs: Today, Progress, History. */
export function TabScreen({
  tab,
  title,
  children,
}: {
  tab: Tab;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex h-full flex-col bg-bg text-[15px]">
      <Header title={title} tab={tab} />
      <main className="min-h-0 flex-1 overflow-y-auto pb-6">
        <div className="mx-auto w-full max-w-3xl">{children}</div>
      </main>
      <UndoBar />
      <Tabs active={tab} />
    </div>
  );
}

/** A screen of its own, with a back arrow and no tabs. */
export function SubScreen({
  title,
  back,
  children,
}: {
  title: ReactNode;
  back: Route;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col bg-bg text-[15px]">
      <Header title={title} back={back} right={<span />} tab={null} />
      <main className="min-h-0 flex-1 overflow-y-auto pb-6">
        <div className="mx-auto w-full max-w-3xl">{children}</div>
      </main>
      <UndoBar />
    </div>
  );
}

export function Section({
  title,
  more,
  children,
}: {
  title: ReactNode;
  more?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="px-4 pt-6">
      <div className="mb-2 flex items-baseline">
        <h2 className="flex-1 text-[15px] font-semibold text-strong">
          {title}
        </h2>
        {more}
      </div>
      {children}
    </section>
  );
}

/** What a screen shows before there's anything on it. */
export function Empty({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof House;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={`mx-4 mt-4 p-6 text-center ${BLOCK}`}>
      <Icon size={28} className="mx-auto text-accent" aria-hidden />
      <h2 className="mt-3 text-[17px] font-semibold text-strong">{title}</h2>
      <div className="mt-1 text-[14px] text-dim">{children}</div>
    </div>
  );
}

/** A gym's colour label, as a swatch (black and white get a ring). */
export function Swatch({hex, size = 'h-7 w-7'}: {hex: string; size?: string}) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-md ring-1 ring-white/25 ${size}`}
      style={{background: hex}}
    />
  );
}

/** A choice of a few options, as pills; the chosen one is filled. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly {value: T; label: string}[];
  value: T;
  onChange(value: T): void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex min-w-0 flex-1 rounded-full bg-raised p-1"
    >
      {options.map(o => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`h-10 flex-1 rounded-full text-[14px] ${on ? 'bg-accent font-semibold text-on-accent' : 'text-fg'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
