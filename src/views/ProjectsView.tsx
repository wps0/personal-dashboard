import { useMemo, useState } from 'react';
import { ProgressRing } from '../components/ProgressRing';
import { countdown, todayISO } from '../model/dates';
import { allocationsByItem, projectStats, urgency, type ProjectStats, type Urgency } from '../model/selectors';
import type { Area, Project } from '../model/types';
import { href, navigate } from '../router';
import { useData, useStore } from '../store';

export const URGENCY_CLASS: Record<Urgency, string> = {
  overdue: 'text-danger',
  soon: 'text-danger',
  near: 'text-warn',
  far: 'text-dim',
};

export function ProjectsView() {
  const data = useData();
  const [showArchived, setShowArchived] = useState(false);
  const today = todayISO();
  const allocs = useMemo(() => allocationsByItem(data), [data]);

  return (
    <div className="scroll-thin h-full overflow-y-auto p-3">
      <div className="mb-2 flex items-center justify-end gap-2 text-dim">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          show archived
        </label>
      </div>
      <div className="space-y-5">
        {data.areas.map((area) => (
          <AreaSection
            key={area.id}
            area={area}
            projects={data.projects.filter((p) => p.areaId === area.id && (showArchived || !p.archived))}
            stats={(p) => projectStats(p, data.items, allocs)}
            today={today}
          />
        ))}
      </div>
    </div>
  );
}

function AreaSection({
  area,
  projects,
  stats,
  today,
}: {
  area: Area;
  projects: Project[];
  stats: (p: Project) => ProjectStats;
  today: string;
}) {
  const addProject = useStore((s) => s.addProject);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const submit = () => {
    if (name.trim()) navigate({ name: 'project', id: addProject(area.id, name.trim()) });
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
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} area={area} stats={stats(p)} today={today} />
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

function ProjectCard({ project, area, stats, today }: { project: Project; area: Area; stats: ProjectStats; today: string }) {
  return (
    <a
      href={href({ name: 'project', id: project.id })}
      className={`flex items-center gap-3 rounded border border-line bg-panel p-3 hover:border-accent/50 hover:bg-raised ${project.archived ? 'opacity-50' : ''}`}
    >
      <ProgressRing percent={stats.percent} color={area.color} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-white">{project.name}</div>
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
}
