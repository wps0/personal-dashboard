import { useMemo, useState } from 'react';
import { HoursInput } from '../components/HoursInput';
import { InlineText } from '../components/InlineText';
import { Markdown } from '../components/Markdown';
import { ProgressRing } from '../components/ProgressRing';
import { countdown, shortDate, todayISO } from '../model/dates';
import {
  actualHours,
  allocationsByItem,
  compareItems,
  isItemDone,
  normalizeStatus,
  plannedHours,
  projectStats,
  STATUS_LABEL,
  statusesFor,
  urgency,
} from '../model/selectors';
import type { Allocation, Item, ItemKind, ProgressMode, Project } from '../model/types';
import { href, navigate } from '../router';
import { useData, useStore } from '../store';
import { URGENCY_CLASS } from './ProjectsView';

const KINDS: ItemKind[] = ['lecture', 'assignment', 'exam', 'task'];
const KIND_BADGE: Record<ItemKind, string> = { lecture: 'LEC', assignment: 'ASG', exam: 'EXM', task: 'TSK' };

export function ProjectDetail({ id }: { id: string }) {
  const data = useData();
  const project = data.projects.find((p) => p.id === id);
  const allocs = useMemo(() => allocationsByItem(data), [data]);
  if (!project) {
    return (
      <div className="p-4 text-dim">
        Project not found. <a className="text-accent" href={href({ name: 'projects' })}>Back to projects</a>
      </div>
    );
  }
  const items = data.items.filter((i) => i.projectId === id).sort(compareItems);
  const area = data.areas.find((a) => a.id === project.areaId);
  const stats = projectStats(project, data.items, allocs);

  return (
    <div className="flex h-full flex-col">
      <Header project={project} percent={stats.percent} color={area?.color ?? '#94a3b8'} />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]">
        <ItemsPane project={project} items={items} allocs={allocs} />
        <NotesPane project={project} />
      </div>
    </div>
  );
}

function Header({ project, percent, color }: { project: Project; percent: number; color: string }) {
  const areas = useData().areas;
  const { updateProject, deleteProject } = useStore.getState();
  const set = (patch: Partial<Project>) => updateProject(project.id, patch);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line px-3 py-2">
      <a href={href({ name: 'projects' })} className="btn-ghost" title="Back to projects">
        ←
      </a>
      <ProgressRing percent={percent} color={color} size={44} stroke={4} />
      <InlineText value={project.name} onChange={(name) => set({ name })} className="w-64 text-base font-semibold text-white" />
      <select className="field" value={project.areaId} onChange={(e) => set({ areaId: e.target.value })}>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5">
        <span className="label">progress</span>
        <select
          className="field"
          value={project.progressMode}
          onChange={(e) => set({ progressMode: e.target.value as ProgressMode })}
        >
          <option value="checklist">checklist (items done)</option>
          <option value="hours">hours (spent / estimate)</option>
          <option value="manual">manual</option>
        </select>
      </label>
      {project.progressMode === 'manual' && (
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={project.manualProgress}
          onChange={(e) => set({ manualProgress: Number(e.target.value) })}
          className="w-32 accent-accent"
        />
      )}
      <label className="flex items-center gap-1.5">
        <span className="label">due</span>
        <input
          type="date"
          className="field font-mono"
          value={project.dueDate ?? ''}
          onChange={(e) => set({ dueDate: e.target.value || undefined })}
        />
      </label>
      <div className="ml-auto flex gap-1">
        <button className="btn-ghost" onClick={() => set({ archived: !project.archived })}>
          {project.archived ? 'unarchive' : 'archive'}
        </button>
        <button
          className="btn-ghost hover:text-danger"
          onClick={() => {
            if (confirm(`Delete "${project.name}" with all its items and planned time?`)) {
              deleteProject(project.id);
              navigate({ name: 'projects' });
            }
          }}
        >
          delete
        </button>
      </div>
    </div>
  );
}

function ItemsPane({ project, items, allocs }: { project: Project; items: Item[]; allocs: Map<string, Allocation[]> }) {
  const [hideDone, setHideDone] = useState(false);
  const [bulk, setBulk] = useState(false);
  const today = todayISO();
  const visible = hideDone ? items.filter((i) => !isItemDone(i)) : items;
  const doneCount = items.filter(isItemDone).length;

  return (
    <div className="scroll-thin flex min-h-0 flex-col overflow-y-auto border-line p-3 lg:border-r">
      <div className="mb-2 flex items-center gap-3">
        <span className="label">Items</span>
        <span className="font-mono text-[11px] text-dim">
          {doneCount}/{items.length} done
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-dim">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
          hide done
        </label>
        <button className="btn-ghost" onClick={() => setBulk((b) => !b)}>
          {bulk ? 'cancel bulk' : '+ bulk'}
        </button>
      </div>
      {bulk && <BulkAdd projectId={project.id} onDone={() => setBulk(false)} />}
      <table className="w-full border-collapse">
        <thead>
          <tr className="label border-b border-line text-left [&>th]:px-1 [&>th]:py-1 [&>th]:font-normal">
            <th className="w-24">status</th>
            <th>title</th>
            <th className="w-24">date</th>
            <th className="w-14 text-right" title="Estimated hours">est</th>
            <th className="w-20 text-right" title="Hours spent / planned in the week view">spent/plan</th>
            <th className="w-6" />
          </tr>
        </thead>
        <tbody>
          {visible.map((item) => (
            <ItemRow key={item.id} item={item} allocs={allocs.get(item.id) ?? []} today={today} />
          ))}
        </tbody>
      </table>
      <AddItem projectId={project.id} />
    </div>
  );
}

function ItemRow({ item, allocs, today }: { item: Item; allocs: Allocation[]; today: string }) {
  const { updateItem, deleteItem } = useStore.getState();
  const done = isItemDone(item);
  const spent = actualHours(allocs);
  const planned = plannedHours(allocs);

  return (
    <tr className={`group border-b border-line/50 hover:bg-panel ${done ? 'text-dim' : ''}`}>
      <td className="px-1 py-0.5">
        <select
          className={`w-full rounded px-0.5 font-mono text-[11px] hover:bg-raised ${done ? 'text-ok' : ''}`}
          value={item.status}
          onChange={(e) => updateItem(item.id, { status: e.target.value as Item['status'] })}
        >
          {statusesFor(item.kind).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-1 py-0.5">
        <div className="flex items-center gap-1">
          <select
            className="rounded font-mono text-[10px] text-dim hover:bg-raised"
            value={item.kind}
            title="Kind"
            onChange={(e) => {
              const kind = e.target.value as ItemKind;
              updateItem(item.id, { kind, status: normalizeStatus(kind, item.status) });
            }}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_BADGE[k]}
              </option>
            ))}
          </select>
          <InlineText value={item.title} onChange={(title) => updateItem(item.id, { title })} className={`flex-1 ${done ? 'line-through' : ''}`} />
        </div>
      </td>
      <td className="px-1 py-0.5 font-mono text-[11px]">
        <DueCell item={item} done={done} today={today} />
      </td>
      <td className="px-1 py-0.5 text-right">
        <HoursInput optional value={item.estimateHours} onChange={(estimateHours) => updateItem(item.id, { estimateHours })} />
      </td>
      <td className="px-1 py-0.5 text-right font-mono text-[11px] text-dim">
        {planned > 0 ? `${fmt(spent)}/${fmt(planned)}` : '–'}
      </td>
      <td className="px-1 py-0.5 text-right">
        <button
          className="invisible text-dim group-hover:visible hover:text-danger"
          title="Delete item"
          onClick={() => (allocs.length === 0 || confirm(`Delete "${item.title}" and its planned time?`)) && deleteItem(item.id)}
        >
          ×
        </button>
      </td>
    </tr>
  );
}

function DueCell({ item, done, today }: { item: Item; done: boolean; today: string }) {
  const updateItem = useStore((s) => s.updateItem);
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        aria-label="Due date"
        className="w-full text-[11px]"
        value={item.dueDate ?? ''}
        onChange={(e) => updateItem(item.id, { dueDate: e.target.value || undefined })}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && setEditing(false)}
      />
    );
  }
  let label = <span className="text-dim/40">set due</span>;
  if (item.dueDate) {
    label = <span className={done ? '' : URGENCY_CLASS[urgency(item.dueDate, today)]}>{countdown(item.dueDate, today)}</span>;
  } else if (item.heldOn) {
    label = <span className="text-dim">held {shortDate(item.heldOn)}</span>;
  }
  return (
    <button className="w-full rounded px-1 text-left hover:bg-raised" title={item.dueDate ? `Due ${item.dueDate}` : 'Set due date'} onClick={() => setEditing(true)}>
      {label}
    </button>
  );
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));

function AddItem({ projectId }: { projectId: string }) {
  const addItems = useStore((s) => s.addItems);
  const [kind, setKind] = useState<ItemKind>('task');
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [estimate, setEstimate] = useState<number | undefined>();

  const submit = () => {
    if (!title.trim()) return;
    addItems(projectId, [{ kind, title: title.trim(), dueDate: dueDate || undefined, estimateHours: estimate }]);
    setTitle('');
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <select className="field" value={kind} onChange={(e) => setKind(e.target.value as ItemKind)}>
        {KINDS.map((k) => (
          <option key={k}>{k}</option>
        ))}
      </select>
      <input
        className="field min-w-40 flex-1"
        placeholder="New item… (Enter)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <input type="date" className="field font-mono" title="Due date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      <span className="flex items-center gap-1">
        <HoursInput optional value={estimate} onChange={setEstimate} placeholder="est" className="field w-14" />
        <span className="text-dim">h</span>
      </span>
      <button className="btn" onClick={submit}>
        add
      </button>
    </div>
  );
}

function BulkAdd({ projectId, onDone }: { projectId: string; onDone(): void }) {
  const addItems = useStore((s) => s.addItems);
  const [kind, setKind] = useState<ItemKind>('lecture');
  const [prefix, setPrefix] = useState('Lecture');
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(13);
  const [estimate, setEstimate] = useState<number | undefined>(1.5);
  const count = Math.max(0, to - from + 1);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded border border-line bg-panel p-2">
      <select className="field" value={kind} onChange={(e) => setKind(e.target.value as ItemKind)}>
        {KINDS.map((k) => (
          <option key={k}>{k}</option>
        ))}
      </select>
      <input className="field w-28" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
      <input type="number" className="field w-14 font-mono" value={from} onChange={(e) => setFrom(Number(e.target.value))} />
      <span className="text-dim">to</span>
      <input type="number" className="field w-14 font-mono" value={to} onChange={(e) => setTo(Number(e.target.value))} />
      <HoursInput optional value={estimate} onChange={setEstimate} placeholder="est" className="field w-14" />
      <span className="text-dim">h each</span>
      <button
        className="btn"
        disabled={count === 0 || count > 200}
        onClick={() => {
          addItems(
            projectId,
            Array.from({ length: count }, (_, k) => ({ kind, title: `${prefix} ${from + k}`.trim(), estimateHours: estimate })),
          );
          onDone();
        }}
      >
        add {count}
      </button>
    </div>
  );
}

function NotesPane({ project }: { project: Project }) {
  const [tab, setTab] = useState<'overview' | 'log'>('overview');
  return (
    <div className="flex min-h-[400px] flex-col p-3 lg:min-h-0">
      <div className="mb-2 flex gap-1">
        {(['overview', 'log'] as const).map((t) => (
          <button key={t} className={`btn-ghost label ${tab === t ? 'bg-raised !text-fg' : ''}`} onClick={() => setTab(t)}>
            {t === 'log' ? `log (${project.log.length})` : t}
          </button>
        ))}
      </div>
      {tab === 'overview' ? <Overview project={project} /> : <Log project={project} />}
    </div>
  );
}

function Overview({ project }: { project: Project }) {
  const updateProject = useStore((s) => s.updateProject);
  const [editing, setEditing] = useState(project.overviewDoc === '');
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-1 flex justify-end">
        <button className="btn-ghost text-[11px]" onClick={() => setEditing((e) => !e)}>
          {editing ? 'preview' : 'edit'}
        </button>
      </div>
      {editing ? (
        <textarea
          autoFocus={project.overviewDoc !== ''}
          className="field scroll-thin min-h-0 flex-1 resize-none font-mono text-[12px]"
          placeholder={'## Goals\n- …\n\n## Links\n- …\n\n## Decisions\n- …'}
          value={project.overviewDoc}
          onChange={(e) => updateProject(project.id, { overviewDoc: e.target.value })}
        />
      ) : (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto" onDoubleClick={() => setEditing(true)}>
          <Markdown source={project.overviewDoc} />
        </div>
      )}
    </div>
  );
}

function Log({ project }: { project: Project }) {
  const { addLog, deleteLog } = useStore.getState();
  const [text, setText] = useState('');
  const submit = () => {
    if (!text.trim()) return;
    addLog(project.id, text.trim());
    setText('');
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <textarea
        className="field h-20 shrink-0 resize-none"
        placeholder="What did you get done? (Ctrl+Enter)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && submit()}
      />
      <button className="btn self-end" onClick={submit}>
        add entry
      </button>
      <ul className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto">
        {project.log.map((l) => (
          <li key={l.id} className="group border-l-2 border-line pl-2">
            <div className="flex font-mono text-[11px] text-dim">
              {new Date(l.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              <button
                className="invisible ml-auto group-hover:visible hover:text-danger"
                onClick={() => confirm('Delete this entry?') && deleteLog(project.id, l.id)}
              >
                ×
              </button>
            </div>
            <div className="whitespace-pre-wrap">{l.text}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
