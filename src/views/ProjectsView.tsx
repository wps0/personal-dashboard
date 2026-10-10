import { memo, useMemo, useState } from 'react';
import { ProgressRing } from '../components/ProgressRing';
import { URGENCY_CLASS } from '../format';
import { countdown, todayISO } from '../model/dates';
import { allocationsByItem, projectStats, urgency, type ProjectStats } from '../model/selectors';
import type { Area, Project } from '../model/types';
import { href, navigate } from '../router';
import { useStore } from '../store';
import { ProjectPanel } from './ProjectPanel';

/** Project cards grouped by area; the selected project opens in a panel on the right. */
export function ProjectsView({ selectedId }: { selectedId?: string }) {
  const areas = useStore((s) => s.data.areas);
  const projects = useStore((s) => s.data.projects);
  const items = useStore((s) => s.data.items);
  const allocations = useStore((s) => s.data.allocations);
  const [showArchived, setShowArchived] = useState(false);
  const today = todayISO();

  const stats = useMemo(() => {
    const allocs = allocationsByItem({ allocations });
    return new Map(projects.map((p) => [p.id, projectStats(p, items, allocs)]));
  }, [projects, items, allocations]);

  const selected = selectedId ? projects.find((p) => p.id === selectedId) : undefined;

  return (
    <div className="flex h-full">
      <div className={`scroll-thin h-full overflow-y-auto p-3 ${selected ? 'hidden w-[min(44%,640px)] shrink-0 border-r border-line md:block' : 'flex-1'}`}>
        <div className="mb-2 flex items-center justify-end gap-2 text-dim">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            show archived
          </label>
        </div>
        <div className="space-y-5">
          {areas.map((area) => (
            <AreaSection
              key={area.id}
              area={area}
              projects={projects.filter((p) => p.areaId === area.id && (showArchived || !p.archived || p.id === selectedId))}
              stats={stats}
              selectedId={selectedId}
              today={today}
            />
          ))}
        </div>
      </div>
      {selected ? (
        <div className="min-w-0 flex-1">
          <ProjectPanel key={selected.id} project={selected} percent={stats.get(selected.id)?.percent ?? 0} />
        </div>
      ) : (
        selectedId && <div className="flex-1 p-4 text-dim">Project not found.</div>
      )}
    </div>
  );
}

function AreaSection(props: { area: Area; projects: Project[]; stats: Map<string, ProjectStats>; selectedId?: string; today: string }) {
  const { area, projects, stats, selectedId, today } = props;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const submit = () => {
    if (name.trim()) navigate({ name: 'projects', id: useStore.getState().addProject(area.id, name.trim()) });
    setAdding(false);
    setName('');
  };

  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: area.color }} />
        <span className="label">{area.name}</span>
        <span className="font-mono text-[11px] text-dim/60">{projects.length}</span>
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} color={area.color} stats={stats.get(p.id)!} today={today} selected={p.id === selectedId} />
        ))}
        {adding ? (
          <div className="flex items-center rounded border border-dashed border-line p-3">
            <input
              autoFocus
              className="field w-full"
              placeholder="Project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') setAdding(false);
              }}
              onBlur={submit}
            />
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="min-h-[82px] rounded border border-dashed border-line text-dim hover:border-accent/50 hover:text-fg"
          >
            + project
          </button>
        )}
      </div>
    </section>
  );
}

const ProjectCard = memo(function ProjectCard(props: { project: Project; color: string; stats: ProjectStats; today: string; selected: boolean }) {
  const { project, color, stats, today, selected } = props;
  return (
    <a
      href={href({ name: 'projects', id: selected ? undefined : project.id })}
      className={`flex items-center gap-3 rounded border p-3 hover:bg-raised ${
        selected ? 'border-accent bg-raised' : 'border-line bg-panel hover:border-accent/50'
      } ${project.archived ? 'opacity-50' : ''}`}
    >
      <ProgressRing percent={stats.percent} color={color} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-strong">{project.name}</div>
        <div className="font-mono text-[11px] text-dim">
          {stats.total > 0 ? `${stats.done}/${stats.total} done` : 'no items'}
          {project.progressMode !== 'checklist' && <span className="text-dim/60"> · {project.progressMode}</span>}
        </div>
        {stats.next && (
          <div className={`truncate text-[12px] ${URGENCY_CLASS[urgency(stats.next.date, today)]}`}>
            <span className="font-mono">{countdown(stats.next.date, today)}</span> · {stats.next.title}
          </div>
        )}
      </div>
    </a>
  );
});
