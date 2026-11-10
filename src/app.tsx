import {CircleGauge, Keyboard, Monitor, Moon, Sun} from 'lucide-react';
import {ConflictsBadge} from './components/conflicts_badge';
import {BottomTabs, PhoneHeader} from './components/phone_nav';
import {Toaster} from './components/toaster';
import {ShortcutDialogs} from './components/shortcut_dialogs';
import {isTyping, useGlobalShortcuts} from './keyboard';
import {lazy, Suspense, useEffect, type ReactNode} from 'react';
import {ItemOverlay} from './components/item_overlay';
import {preloadMarkdown} from './components/markdown';
import {sampleData} from './model/sample';
import {PAGES, usePhoneNav} from './nav';
import {href, navigate, useRoute, type Route} from './router';
import {useStore} from './store';
import {useTheme, type ThemeChoice} from './theme';
import {useUi} from './ui';
import {CalendarView} from './views/calendar_view';
import {HomeView} from './views/home_view';
import {WeekView} from './views/week_view';
import {unreachable} from './unreachable';
import {ProtoToday, ProtoWeek, usePhone} from './proto/redesign';

// Not needed for the first screen: loaded separately to keep the first load
// small, then fetched in the background once the app is idle, so opening them
// later never waits.
function loadProjects() {
  return import('./views/projects_view');
}
function loadSettings() {
  return import('./views/settings_view');
}
function loadWork() {
  return import('./views/work_view');
}
const ProjectsView = lazy(() =>
  loadProjects().then(m => ({default: m.ProjectsView})),
);
const SettingsView = lazy(() =>
  loadSettings().then(m => ({default: m.SettingsView})),
);
const WorkView = lazy(() => loadWork().then(m => ({default: m.WorkView})));
function preload() {
  void loadProjects();
  void loadSettings();
  void loadWork();
  void preloadMarkdown();
}

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

export function App() {
  const route = useRoute();
  const hasAreas = useStore(s => s.data.areas.length > 0);
  const [theme, setTheme] = useTheme();
  const phoneTabs = usePhoneNav(s => s.nav === 'tabs');
  useGlobalShortcuts(route);
  // After the first screen is up, fetch the rest when the browser is idle.
  useEffect(() => {
    if ('requestIdleCallback' in window) requestIdleCallback(preload);
    else setTimeout(preload, 2000);
  }, []);

  const themeButton = (
    <button
      className="icon-btn shrink-0"
      onClick={() => setTheme(THEME_NEXT[theme])}
      title={`Theme: ${theme === 'system' ? 'auto (follows system)' : theme} — click to change`}
      aria-label="Change theme"
    >
      {THEME_ICON[theme]}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      {/* Phones get a header of their own, and tabs at the bottom or a menu. */}
      <PhoneHeader
        route={route}
        actions={
          <>
            <ConflictsBadge />
            {themeButton}
          </>
        }
      />
      <header className="hidden shrink-0 items-center gap-1 border-b border-line bg-panel px-3 py-1.5 sm:flex">
        <span className="mr-3 flex shrink-0 items-center gap-1.5 text-[14px] font-semibold tracking-tight text-strong">
          <CircleGauge size={18} className="text-accent" />
          Dashboard
        </span>
        <nav
          aria-label="Pages"
          className="no-scrollbar flex min-w-0 flex-1 gap-0.5 overflow-x-auto"
        >
          {PAGES.map((p, i) => (
            <a
              key={p.label}
              href={href(p.route)}
              aria-current={p.route.name === route.name ? 'page' : undefined}
              title={`${p.label} (${i + 1})`}
              className={`flex shrink-0 items-center rounded-md px-2.5 py-1 transition-colors duration-150 ${p.route.name === route.name ? 'bg-raised text-strong' : 'text-dim hover:bg-raised/60 hover:text-fg'}`}
            >
              {p.label}
            </a>
          ))}
        </nav>
        <ConflictsBadge />
        <button
          className="icon-btn shrink-0"
          onClick={() => useUi.getState().setDialog('help')}
          title="Keyboard shortcuts (?)"
          aria-label="Keyboard shortcuts"
        >
          <Keyboard size={16} />
        </button>
        {themeButton}
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
      {phoneTabs && <BottomTabs route={route} />}
      <ItemOverlay />
      <ShortcutDialogs />
      <Toaster />
      <EscapeClosesProject route={route} />
    </div>
  );
}

function Page({route}: {route: Route}) {
  // PROTOTYPE: phones get the proposed Today and Week.
  const phone = usePhone();
  switch (route.name) {
    case 'home':
      return phone ? (
        <ProtoToday date={route.date} />
      ) : (
        <HomeView date={route.date} />
      );
    case 'week':
      return phone ? (
        <ProtoWeek week={route.week} />
      ) : (
        <WeekView week={route.week} />
      );
    case 'calendar':
      return <CalendarView view={route.view} date={route.date} />;
    case 'projects':
      return <ProjectsView selectedId={route.id} />;
    case 'work':
      return <WorkView week={route.week} />;
    case 'settings':
      return <SettingsView />;
    default:
      return unreachable(route);
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
      // defaultPrevented: a dropdown or popover already handled this Esc.
      if (
        e.key === 'Escape' &&
        !e.defaultPrevented &&
        !isTyping(e.target as Element)
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
        Data is stored in this browser. To keep it on your other devices too, or
        back it up, use Drive sync or Export in Settings.
      </p>
    </div>
  );
}
