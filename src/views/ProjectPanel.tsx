import { memo, useMemo, useState } from 'react';
import { BufferedTextarea } from '../components/Buffered';
import { HoursInput } from '../components/HoursInput';
import { InlineText } from '../components/InlineText';
import { Markdown } from '../components/Markdown';
import { ProgressRing } from '../components/ProgressRing';
import { fmtNum, KIND_BADGE, KINDS, URGENCY_CLASS } from '../format';
import { countdown, shortDate, todayISO } from '../model/dates';
import { actualHours, compareItems, isItemDone, plannedHours, STATUS_LABEL, statusesFor, urgency } from '../model/selectors';
import type { Allocation, Item, ItemKind, ProgressMode, Project } from '../model/types';
import { href, navigate } from '../router';
import { useStore } from '../store';
import { useUi } from '../ui';

type Tab = 'items' | 'overview' | 'log';

/** Project details shown beside the project cards. */
export function ProjectPanel({ project, percent }: { project: Project; percent: number }) {
  const [tab, setTab] = useState<Tab>('items');
  const color = useStore((s) => s.data.areas.find((a) => a.id === project.areaId)?.color ?? '#94a3b8');
  return (
    <div className="flex h-full flex-col">
      <Header project={project} percent={percent} color={color} />
      <div className="flex shrink-0 gap-1 border-b border-line px-3 py-1">
        {(['items', 'overview', 'log'] as const).map((t) => (
          <button key={t} className={`label rounded px-1.5 py-0.5 ${tab === t ? 'bg-raised !text-fg' : 'hover:!text-fg'}`} onClick={() => setTab(t)}>
            {t === 'log' ? `log (${project.log.length})` : t}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'items' && <ItemsTab project={project} />}
        {tab === 'overview' && <Overview project={project} />}
        {tab === 'log' && <Log project={project} />}
      </div>
    </div>
  );
}

function Header({ project, percent, color }: { project: Project; percent: number; color: string }) {
  const areas = useStore((s) => s.data.areas);
  const { updateProject, deleteProject } = useStore.getState();
  const set = (patch: Partial<Project>) => updateProject(project.id, patch);

  return (
    <div className="shrink-0 space-y-2 border-b border-line px-3 py-2">
      <div className="flex items-center gap-3">
        <ProgressRing percent={percent} color={color} size={44} stroke={4} />
        <InlineText value={project.name} onChange={(name) => set({ name })} className="min-w-0 flex-1 text-base font-semibold text-strong" />
        <a href={href({ name: 'projects' })} className="btn-ghost text-base" title="Close (Esc)" aria-label="Close">
          ×
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className="field py-0.5" value={project.areaId} onChange={(e) => set({ areaId: e.target.value })} title="Area">
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          className="field py-0.5"
          value={project.progressMode}
          title="How progress is computed"
          onChange={(e) => set({ progressMode: e.target.value as ProgressMode })}
        >
          <option value="checklist">progress: items done</option>
          <option value="hours">progress: hours spent / estimate</option>
          <option value="manual">progress: manual</option>
        </select>
        {project.progressMode === 'manual' && (
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={project.manualProgress}
            onChange={(e) => set({ manualProgress: Number(e.target.value) })}
            className="w-28 accent-accent"
          />
        )}
        <label className="flex items-center gap-1">
          <span className="label">due</span>
          <input type="date" className="field py-0.5 font-mono" value={project.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value || undefined })} />
        </label>
        <div className="ml-auto flex gap-1">
          <button className="btn-ghost" onClick={() => set({ archived: !project.archived })}>
            {project.archived ? 'unarchive' : 'archive'}
          </button>
          <button
            className="btn-ghost hover:text-danger"
            onClick={() => {
              if (confirm(`Delete "${project.name}" with all its items and planned time?`)) {
                navigate({ name: 'projects' });
                deleteProject(project.id);
              }
            }}
          >
            delete
          </button>
        </div>
      </div>
    </div>
  );
}

const NO_ALLOCS: Allocation[] = [];

function ItemsTab({ project }: { project: Project }) {
  const allItems = useStore((s) => s.data.items);
  const allocations = useStore((s) => s.data.allocations);
  const [hideDone, setHideDone] = useState(false);
  const [bulk, setBulk] = useState(false);
  const today = todayISO();

  const items = useMemo(() => allItems.filter((i) => i.projectId === project.id).sort(compareItems), [allItems, project.id]);
  const allocs = useMemo(() => {
    const ids = new Set(items.map((i) => i.id));
    const m = new Map<string, Allocation[]>();
    for (const a of allocations) if (ids.has(a.itemId)) m.set(a.itemId, [...(m.get(a.itemId) ?? []), a]);
    return m;
  }, [items, allocations]);
  const visible = hideDone ? items.filter((i) => !isItemDone(i)) : items;

  return (
    <div className="scroll-thin h-full overflow-y-auto p-3">
      <div className="mb-2 flex items-center gap-3">
        <span className="font-mono text-[11px] text-dim">
          {items.filter(isItemDone).length}/{items.length} done
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
            <th className="w-20">date</th>
            <th className="w-12 text-right" title="Estimated hours">est</th>
            <th className="w-16 text-right" title="Hours spent / planned">spent/plan</th>
            <th className="w-5" />
          </tr>
        </thead>
        <tbody>
          {visible.map((item) => (
            <ItemRow key={item.id} item={item} allocs={allocs.get(item.id) ?? NO_ALLOCS} today={today} />
          ))}
        </tbody>
      </table>
      <AddItem projectId={project.id} />
    </div>
  );
}

const ItemRow = memo(function ItemRow({ item, allocs, today }: { item: Item; allocs: Allocation[]; today: string }) {
  const openItem = useUi((s) => s.openItem);
  const { updateItem, deleteItem } = useStore.getState();
  const done = isItemDone(item);
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
        <button className="flex w-full min-w-0 items-center gap-1.5 rounded px-1 text-left hover:bg-raised" onClick={() => openItem(item.id)} title="Open task details">
          <span className="font-mono text-[10px] text-dim">{KIND_BADGE[item.kind]}</span>
          <span className={`truncate ${done ? 'line-through' : ''}`}>{item.title}</span>
          {item.notes && <span className="text-[10px] text-dim" title="Has notes">✎</span>}
        </button>
      </td>
      <td className="px-1 py-0.5 font-mono text-[11px] whitespace-nowrap">
        {item.dueDate ? (
          <span className={done ? '' : URGENCY_CLASS[urgency(item.dueDate, today)]} title={`Due ${item.dueDate}`}>
            {countdown(item.dueDate, today)}
          </span>
        ) : item.heldOn ? (
          <span className="text-dim" title="Class date">
            {shortDate(item.heldOn)}
          </span>
        ) : null}
      </td>
      <td className="px-1 py-0.5 text-right">
        <HoursInput optional value={item.estimateHours} onChange={(estimateHours) => updateItem(item.id, { estimateHours })} />
      </td>
      <td className="px-1 py-0.5 text-right font-mono text-[11px] text-dim">
        {planned > 0 ? `${fmtNum(actualHours(allocs))}/${fmtNum(planned)}` : '–'}
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
});

function AddItem({ projectId }: { projectId: string }) {
  const [kind, setKind] = useState<ItemKind>('task');
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [estimate, setEstimate] = useState<number | undefined>();

  const submit = () => {
    if (!title.trim()) return;
    useStore.getState().addItems(projectId, [{ kind, title: title.trim(), dueDate: dueDate || undefined, estimateHours: estimate }]);
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
          useStore
            .getState()
            .addItems(projectId, Array.from({ length: count }, (_, k) => ({ kind, title: `${prefix} ${from + k}`.trim(), estimateHours: estimate })));
          onDone();
        }}
      >
        add {count}
      </button>
    </div>
  );
}

function Overview({ project }: { project: Project }) {
  const [editing, setEditing] = useState(project.overviewDoc === '');
  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-1 flex justify-end">
        <button className="btn-ghost text-[11px]" onClick={() => setEditing((e) => !e)}>
          {editing ? 'preview' : 'edit'}
        </button>
      </div>
      {editing ? (
        <BufferedTextarea
          autoFocus={project.overviewDoc !== ''}
          className="field scroll-thin min-h-0 flex-1 resize-none font-mono text-[12px]"
          placeholder={'## Goals\n- …\n\n## Links\n- …\n\n## Decisions\n- …'}
          value={project.overviewDoc}
          onCommit={(overviewDoc) => useStore.getState().updateProject(project.id, { overviewDoc })}
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
    <div className="flex h-full flex-col gap-2 p-3">
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
              <button className="invisible ml-auto group-hover:visible hover:text-danger" onClick={() => confirm('Delete this entry?') && deleteLog(project.id, l.id)}>
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
