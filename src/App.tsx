import {CircleGauge, Keyboard, Monitor, Moon, Sun} from 'lucide-react';
import {Toaster} from './components/Toaster';
import {ShortcutDialogs} from './components/ShortcutDialogs';
import {useGlobalShortcuts} from './keyboard';
import {lazy, Suspense, useEffect, type ReactNode} from 'react';
import {ItemOverlay} from './components/ItemOverlay';
import {preloadMarkdown} from './components/Markdown';
import {sampleData} from './model/sample';
import {href, navigate, useRoute, type Route} from './router';
import {useStore} from './store';
import {useTheme, type ThemeChoice} from './theme';
import {useUi} from './ui';
import {CalendarView} from './views/CalendarView';
import {HomeView} from './views/HomeView';
import {WeekView} from './views/WeekView';

// Not needed for the first screen: loaded separately to keep the first load
// small, then fetched in the background once the app is idle, so opening them
// later never waits.
const loadProjects = () => import('./views/ProjectsView');
const loadSettings = () => import('./views/SettingsView');
const ProjectsView = lazy(() =>
  loadProjects().then(m => ({default: m.ProjectsView})),
);
const SettingsView = lazy(() =>
  loadSettings().then(m => ({default: m.SettingsView})),
);
const preload = () => {
  void loadProjects();
  void loadSettings();
  void preloadMarkdown();
};

const NAV: {route: Route; label: string}[] = [
  {route: {name: 'home'}, label: 'Home'},
  {route: {name: 'week'}, label: 'Week'},
  {route: {name: 'calendar'}, label: 'Calendar'},
  {route: {name: 'projects'}, label: 'Projects'},
  {route: {name: 'settings'}, label: 'Settings'},
];

const THEME_NEXT: Record<ThemeChoice, ThemeChoice> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};
const THEME_ICON: Record<ThemeChoice, ReactNode> = {
  system: <Monitor size={15} />,
  light: <Sun size={15} />,
  dark: <Moon size={15} />,
};

export default function App() {
  const route = useRoute();
  const hasAreas = useStore(s => s.data.areas.length > 0);
  const [theme, setTheme] = useTheme();
  useGlobalShortcuts(route);
  // After the first screen is up, fetch the rest when the browser is idle.
  useEffect(() => {
    if ('requestIdleCallback' in window) requestIdleCallback(preload);
    else setTimeout(preload, 2000);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-1 border-b border-line bg-panel px-2 py-1.5 sm:px-3">
        <span className="mr-1 flex shrink-0 items-center gap-1.5 text-[14px] font-semibold tracking-tight text-strong sm:mr-3">
          <CircleGauge size={18} className="text-accent" />
          {/* On phones only the icon, so every tab fits. */}
          <span className="sr-only sm:not-sr-only">Dashboard</span>
        </span>
        <nav
          aria-label="Pages"
          className="no-scrollbar flex min-w-0 flex-1 gap-0.5 overflow-x-auto"
        >
          {NAV.map(n => (
            <a
              key={n.label}
              href={href(n.route)}
              aria-current={n.route.name === route.name ? 'page' : undefined}
              title={`${n.label} (${NAV.indexOf(n) + 1})`}
              className={`shrink-0 rounded-md px-2 py-1 transition-colors duration-150 sm:px-2.5 ${n.route.name === route.name ? 'bg-raised text-strong' : 'text-dim hover:bg-raised/60 hover:text-fg'}`}
            >
              {n.label}
            </a>
          ))}
        </nav>
        {/* Keyboard shortcuts don't apply on phones. */}
        <button
          className="icon-btn hidden shrink-0 sm:inline-flex"
          onClick={() => useUi.getState().setDialog('help')}
          title="Keyboard shortcuts (?)"
          aria-label="Keyboard shortcuts"
        >
          <Keyboard size={16} />
        </button>
        <button
          className="icon-btn shrink-0"
          onClick={() => setTheme(THEME_NEXT[theme])}
          title={`Theme: ${theme === 'system' ? 'auto (follows system)' : theme} — click to change`}
          aria-label="Change theme"
        >
          {THEME_ICON[theme]}
        </button>
      </header>
      {/* Keyed by page so switching tabs fades the new page in. */}
      <main key={route.name} className="min-h-0 flex-1 animate-fade-in">
        {!hasAreas && route.name !== 'settings' ? (
          <Welcome />
        ) : (
          <Suspense fallback={null}>
            <Page route={route} />
          </Suspense>
        )}
      </main>
      <ItemOverlay />
      <ShortcutDialogs />
      <Toaster />
      <EscapeClosesProject route={route} />
    </div>
  );
}

function Page({route}: {route: Route}) {
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

/**
 * Esc closes the project side panel (overlays handle Esc themselves first).
 * A component of its own so that its overlay subscription re-renders only
 * itself: in App, opening any popover re-rendered the whole page.
 */
function EscapeClosesProject({route}: {route: Route}) {
  const overlayOpen = useUi(
    s =>
      s.openItemId !== null ||
      s.openEventId !== null ||
      s.openGoogleKey !== null ||
      s.draft !== null ||
      s.dialog !== null,
  );
  const panelOpen = route.name === 'projects' && route.id !== undefined;
  useEffect(() => {
    if (!panelOpen || overlayOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      // defaultPrevented: a dropdown or popover already handled this Esc.
      if (
        e.key === 'Escape' &&
        !e.defaultPrevented &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)
      )
        navigate({name: 'projects'});
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelOpen, overlayOpen]);
  return null;
}

function Welcome() {
  const {replaceAll, addArea} = useStore.getState();
  return (
    <div className="mx-auto mt-24 max-w-md space-y-4 px-4">
      <h1 className="text-lg font-semibold text-strong">Nothing here yet</h1>
      <p className="text-dim">
        Projects live in <b className="text-fg">areas</b> such as University,
        Work or Personal. Start with a few empty areas, or load sample data to
        try things out.
      </p>
      <div className="flex gap-2">
        <button
          className="btn"
          onClick={() =>
            ['University', 'Work', 'Personal'].forEach(n => addArea(n))
          }
        >
          Create University / Work / Personal
        </button>
        <button className="btn" onClick={() => replaceAll(sampleData())}>
          Load sample data
        </button>
      </div>
      <p className="text-[12px] text-dim">
        Data is stored in this browser only. Use Settings → Export to back it
        up.
      </p>
    </div>
  );
}
