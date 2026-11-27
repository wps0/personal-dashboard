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
import type {ReactNode} from 'react';
import {href, type Route} from './router';

type Tab = 'today' | 'progress' | 'history';

const TABS: {tab: Tab; label: string; icon: typeof House}[] = [
  {tab: 'today', label: 'Today', icon: House},
  {tab: 'progress', label: 'Progress', icon: ChartNoAxesColumn},
  {tab: 'history', label: 'History', icon: History},
];

/** A filled block: a list, a chart, a group of settings. */
export const BLOCK = 'rounded-3xl bg-raised';

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
}: {
  title: ReactNode;
  /** Where the back arrow goes; without it, the log's mark. */
  back?: Route;
  right?: ReactNode;
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
      <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold text-strong">
        {title}
      </h1>
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

function Tabs({active}: {active: Tab}) {
  return (
    <nav className="grid shrink-0 grid-cols-3 bg-bg pb-[env(safe-area-inset-bottom)]">
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
    <div className="flex h-full flex-col bg-bg text-[15px]">
      <Header title={title} />
      <main className="min-h-0 flex-1 overflow-y-auto pb-6">{children}</main>
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
  title: string;
  back: Route;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col bg-bg text-[15px]">
      <Header title={title} back={back} right={<span />} />
      <main className="min-h-0 flex-1 overflow-y-auto pb-6">{children}</main>
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
