import { CircleGauge, Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { ItemOverlay } from './components/ItemOverlay';
import { dayName, shortDate, todayISO } from './model/dates';
import { sampleData } from './model/sample';
import { href, navigate, useRoute, type Route } from './router';
import { useStore } from './store';
import { useTheme, type ThemeChoice } from './theme';
import { useUi } from './ui';
import { CalendarView } from './views/CalendarView';
import { HomeView } from './views/HomeView';
import { ProjectsView } from './views/ProjectsView';
import { SettingsView } from './views/SettingsView';
import { WeekView } from './views/WeekView';

const NAV: { route: Route; label: string }[] = [
  { route: { name: 'home' }, label: 'Home' },
  { route: { name: 'week' }, label: 'Week' },
  { route: { name: 'calendar' }, label: 'Calendar' },
  { route: { name: 'projects' }, label: 'Projects' },
  { route: { name: 'settings' }, label: 'Settings' },
];

const THEME_NEXT: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_ICON: Record<ThemeChoice, ReactNode> = { system: <Monitor size={15} />, light: <Sun size={15} />, dark: <Moon size={15} /> };

export default function App() {
  const route = useRoute();
  const hasAreas = useStore((s) => s.data.areas.length > 0);
  const [theme, setTheme] = useTheme();
  const today = todayISO();
  useEscapeClosesProject(route);

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-1 border-b border-line bg-panel px-3 py-1.5">
        <span className="mr-3 flex items-center gap-1.5 text-[14px] font-semibold tracking-tight text-strong">
          <CircleGauge size={18} className="text-accent" /> Dashboard
        </span>
        {NAV.map((n) => (
          <a
            key={n.label}
            href={href(n.route)}
            className={`rounded px-2 py-0.5 ${n.route.name === route.name ? 'bg-raised text-strong' : 'text-dim hover:text-fg'}`}
          >
            {n.label}
          </a>
        ))}
        <span className="ml-auto text-[12px] text-dim tabular-nums">
          {dayName(today)} {shortDate(today)}
        </span>
        <button className="icon-btn ml-1" onClick={() => setTheme(THEME_NEXT[theme])} title={`Theme: ${theme === 'system' ? 'auto (follows system)' : theme} — click to change`}>
          {THEME_ICON[theme]}
        </button>
      </header>
      <main className="min-h-0 flex-1">{!hasAreas && route.name !== 'settings' ? <Welcome /> : <Page route={route} />}</main>
      <ItemOverlay />
    </div>
  );
}

function Page({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <HomeView date={route.date} />;
    case 'week':
      return <WeekView week={route.week} />;
    case 'calendar':
      return <CalendarView view={route.view} date={route.date} />;
    case 'projects':
      return <ProjectsView selectedId={route.id} />;
    case 'settings':
      return <SettingsView />;
  }
}

/** Esc closes the project side panel (overlays handle Esc themselves first). */
function useEscapeClosesProject(route: Route) {
  const overlayOpen = useUi((s) => s.openItemId !== null || s.openEventId !== null || s.draft !== null);
  const panelOpen = route.name === 'projects' && route.id !== undefined;
  useEffect(() => {
    if (!panelOpen || overlayOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      // defaultPrevented: a dropdown or popover already handled this Esc.
      if (e.key === 'Escape' && !e.defaultPrevented && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) navigate({ name: 'projects' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelOpen, overlayOpen]);
}

function Welcome() {
  const { replaceAll, addArea } = useStore.getState();
  return (
    <div className="mx-auto mt-24 max-w-md space-y-4 px-4">
      <h1 className="text-lg font-semibold text-strong">Nothing here yet</h1>
      <p className="text-dim">
        Projects live in <b className="text-fg">areas</b> such as University, Work or Personal. Start with a few empty areas,
        or load sample data to try things out.
      </p>
      <div className="flex gap-2">
        <button className="btn" onClick={() => ['University', 'Work', 'Personal'].forEach((n) => addArea(n))}>
          Create University / Work / Personal
        </button>
        <button className="btn" onClick={() => replaceAll(sampleData())}>
          Load sample data
        </button>
      </div>
      <p className="text-[12px] text-dim">Data is stored in this browser only. Use Settings → Export to back it up.</p>
    </div>
  );
}
