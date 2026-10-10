import { shortDate, dayName, todayISO } from './model/dates';
import { sampleData } from './model/sample';
import { href, useRoute, type Route } from './router';
import { useData, useStore } from './store';
import { ProjectDetail } from './views/ProjectDetail';
import { ProjectsView } from './views/ProjectsView';
import { SettingsView } from './views/SettingsView';
import { WeekView } from './views/WeekView';

const NAV: { route: Route; label: string; key: Route['name'][] }[] = [
  { route: { name: 'week' }, label: 'Week', key: ['week'] },
  { route: { name: 'projects' }, label: 'Projects', key: ['projects', 'project'] },
  { route: { name: 'settings' }, label: 'Settings', key: ['settings'] },
];

export default function App() {
  const route = useRoute();
  const data = useData();
  const today = todayISO();

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-1 border-b border-line bg-panel px-3 py-1.5">
        <span className="mr-3 font-mono text-[12px] font-semibold tracking-tight text-white">
          <span className="text-accent">◔</span> dashboard
        </span>
        {NAV.map((n) => (
          <a
            key={n.label}
            href={href(n.route)}
            className={`rounded px-2 py-0.5 ${n.key.includes(route.name) ? 'bg-raised text-white' : 'text-dim hover:text-fg'}`}
          >
            {n.label}
          </a>
        ))}
        <span className="ml-auto font-mono text-[11px] text-dim">
          {dayName(today)} {shortDate(today)}
        </span>
      </header>
      <main className="min-h-0 flex-1">
        {data.areas.length === 0 && route.name !== 'settings' ? <Welcome /> : <Page route={route} />}
      </main>
    </div>
  );
}

function Page({ route }: { route: Route }) {
  switch (route.name) {
    case 'week':
      return <WeekView week={route.week} />;
    case 'projects':
      return <ProjectsView />;
    case 'project':
      return <ProjectDetail id={route.id} />;
    case 'settings':
      return <SettingsView />;
  }
}

function Welcome() {
  const replaceAll = useStore((s) => s.replaceAll);
  const addArea = useStore((s) => s.addArea);
  return (
    <div className="mx-auto mt-24 max-w-md space-y-4 px-4">
      <h1 className="text-lg font-semibold text-white">Nothing here yet</h1>
      <p className="text-dim">
        Projects live in <b className="text-fg">areas</b> such as University, Work or Personal. Start with a few empty areas,
        or load sample data to try out the week view.
      </p>
      <div className="flex gap-2">
        <button
          className="btn"
          onClick={() => ['University', 'Work', 'Personal'].forEach((n) => addArea(n))}
        >
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
