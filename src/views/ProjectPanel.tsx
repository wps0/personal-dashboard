import {memo, useMemo, useState} from 'react';
import {withUndo} from '../toast';
import {BufferedTextarea} from '../components/Buffered';
import {DateField} from '../components/DateField';
import {StatusSelect} from '../components/StatusSelect';
import {Select, type Option} from '../components/ui/Select';
import {Pencil, Trash2, X} from 'lucide-react';
import {HoursInput} from '../components/HoursInput';
import {InlineText} from '../components/InlineText';
import {CoursePattern} from '../components/CoursePattern';
import {UsosBanner} from '../components/UsosReview';
import {Markdown} from '../components/Markdown';
import {ProgressRing} from '../components/ProgressRing';
import {fmtNum, KIND_BADGE, KINDS, URGENCY_CLASS} from '../format';
import {countdown, shortDate, todayISO} from '../model/dates';
import {
  actualHours,
  compareItems,
  isItemDone,
  plannedHours,
  urgency,
} from '../model/selectors';
import type {
  Allocation,
  Item,
  ItemKind,
  ProgressMode,
  Project,
} from '../model/types';
import {href, navigate} from '../router';
import {useStore} from '../store';
import {useUi} from '../ui';
import {deleteItem as deleteItemAction} from '../actions';
import {blockKeys} from '../keyboard';

type Tab = 'items' | 'overview' | 'log';

/** Project details shown beside the project cards. */
export function ProjectPanel({
  project,
  percent,
}: {
  project: Project;
  percent: number;
}) {
  const [tab, setTab] = useState<Tab>('items');
  const color = useStore(
    s => s.data.areas.find(a => a.id === project.areaId)?.color ?? '#94a3b8',
  );
  return (
    <div className="flex h-full flex-col">
      <Header project={project} percent={percent} color={color} />
      <div className="flex shrink-0 gap-1 border-b border-line px-3 py-1">
        {(['items', 'overview', 'log'] as const).map(t => (
          <button
            key={t}
            className={`label rounded px-1.5 py-0.5 transition-colors duration-150 ${tab === t ? 'bg-raised !text-fg' : 'hover:!text-fg'}`}
            onClick={() => setTab(t)}
          >
            {t === 'log' ? `log (${project.log.length})` : t}
          </button>
        ))}
      </div>
      <div key={tab} className="min-h-0 flex-1 animate-fade-in">
        {tab === 'items' && <ItemsTab project={project} />}
        {tab === 'overview' && <Overview project={project} />}
        {tab === 'log' && <Log project={project} />}
      </div>
    </div>
  );
}

function Header({
  project,
  percent,
  color,
}: {
  project: Project;
  percent: number;
  color: string;
}) {
  const areas = useStore(s => s.data.areas);
  const {updateProject, deleteProject} = useStore.getState();
  const set = (patch: Partial<Project>) => updateProject(project.id, patch);

  return (
    <div className="shrink-0 space-y-2 border-b border-line px-3 py-2">
      <div className="flex items-center gap-3">
        <ProgressRing percent={percent} color={color} size={44} stroke={4} />
        <InlineText
          value={project.name}
          onChange={name => set({name})}
          className="min-w-0 flex-1 text-base font-semibold text-strong"
        />
        <a
          href={href({name: 'projects'})}
          className="btn-ghost text-base"
          title="Close (Esc)"
          aria-label="Close"
        >
          ×
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={project.areaId}
          onChange={areaId => set({areaId})}
          options={areas.map(a => ({
            value: a.id,
            label: a.name,
            color: a.color,
          }))}
          className="w-36"
          ariaLabel="Area"
        />
        <Select
          value={project.progressMode}
          onChange={(progressMode: ProgressMode) => set({progressMode})}
          options={PROGRESS_OPTIONS}
          className="w-52"
          ariaLabel="How progress is computed"
        />
        {project.progressMode === 'manual' && (
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={project.manualProgress}
            onChange={e => set({manualProgress: Number(e.target.value)})}
            className="w-28 accent-accent"
          />
        )}
        <DateField
          optional
          value={project.dueDate}
          onChange={dueDate => set({dueDate})}
          placeholder="Project due date"
        />
        <div className="ml-auto flex gap-1">
          <button
            className="btn-ghost"
            onClick={() => set({archived: !project.archived})}
          >
            {project.archived ? 'unarchive' : 'archive'}
          </button>
          <button
            className="btn-ghost hover:text-danger"
            onClick={() => {
              if (
                confirm(
                  `Delete "${project.name}" with all its items and planned time?`,
                )
              ) {
                navigate({name: 'projects'});
                withUndo(`Deleted “${project.name}”`, () =>
                  deleteProject(project.id),
                );
              }
            }}
          >
            delete
          </button>
        </div>
      </div>
      <CoursePattern project={project} />
      <UsosBanner projectId={project.id} />
    </div>
  );
}

const NO_ALLOCS: Allocation[] = [];

const PROGRESS_OPTIONS = [
  {value: 'checklist', label: 'Progress: items done'},
  {value: 'hours', label: 'Progress: hours spent / estimate'},
  {value: 'manual', label: 'Progress: manual'},
] as const;

const KIND_OPTIONS = KINDS.map((k): Option<ItemKind> => ({
  value: k,
  label: k[0].toUpperCase() + k.slice(1),
}));

function ItemsTab({project}: {project: Project}) {
  const allItems = useStore(s => s.data.items);
  const allocations = useStore(s => s.data.allocations);
  const [hideDone, setHideDone] = useState(false);
  const [bulk, setBulk] = useState(false);
  const today = todayISO();

  const items = useMemo(
    () => allItems.filter(i => i.projectId === project.id).sort(compareItems),
    [allItems, project.id],
  );
  const allocs = useMemo(() => {
    const ids = new Set(items.map(i => i.id));
    const m = new Map<string, Allocation[]>();
    for (const a of allocations)
      if (ids.has(a.itemId)) m.set(a.itemId, [...(m.get(a.itemId) ?? []), a]);
    return m;
  }, [items, allocations]);
  const visible = hideDone ? items.filter(i => !isItemDone(i)) : items;

  return (
    <div className="scroll-thin h-full overflow-y-auto p-3">
      <div className="mb-2 flex items-center gap-3">
        <span className="tabular-nums text-[11px] text-dim">
          {items.filter(isItemDone).length}/{items.length} done
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-dim">
          <input
            type="checkbox"
            checked={hideDone}
            onChange={e => setHideDone(e.target.checked)}
          />
          hide done
        </label>
        <button className="btn-ghost" onClick={() => setBulk(b => !b)}>
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
            <th className="w-12 text-right" title="Estimated hours">
              est
            </th>
            <th className="w-16 text-right" title="Hours spent / planned">
              spent/plan
            </th>
            <th className="w-5" />
          </tr>
        </thead>
        <tbody>
          {visible.map(item => (
            <ItemRow
              key={item.id}
              item={item}
              allocs={allocs.get(item.id) ?? NO_ALLOCS}
              today={today}
            />
          ))}
        </tbody>
      </table>
      <AddItem projectId={project.id} />
    </div>
  );
}

const ItemRow = memo(function ItemRow({
  item,
  allocs,
  today,
}: {
  item: Item;
  allocs: Allocation[];
  today: string;
}) {
  const openItem = useUi(s => s.openItem);
  const {updateItem} = useStore.getState();
  const done = isItemDone(item);
  const planned = plannedHours(allocs);

  return (
    <tr
      className={`group border-b border-line/50 transition-colors duration-150 hover:bg-raised/50 ${done ? 'text-dim' : ''}`}
    >
      <td className="px-1 py-0.5">
        <StatusSelect
          value={item.status}
          onChange={status => updateItem(item.id, {status})}
          className="h-6 w-full text-[12px]"
        />
      </td>
      <td className="px-1 py-0.5">
        <button
          data-block
          onKeyDown={blockKeys({remove: () => deleteItemAction(item)})}
          className="flex w-full min-w-0 items-center gap-1.5 rounded px-1 text-left hover:bg-raised"
          onClick={() => openItem(item.id)}
          title="Open task details"
        >
          <span className="tabular-nums text-[10px] text-dim">
            {KIND_BADGE[item.kind]}
          </span>
          <span className="truncate">
            <span className={`strike ${done ? 'is-struck' : ''}`}>
              {item.title}
            </span>
          </span>
          {item.notes && (
            <span className="text-[10px] text-dim" title="Has notes">
              ✎
            </span>
          )}
        </button>
      </td>
      <td className="px-1 py-0.5 tabular-nums text-[11px] whitespace-nowrap">
        {item.dueDate ? (
          <span
            className={done ? '' : URGENCY_CLASS[urgency(item.dueDate, today)]}
            title={`Due ${item.dueDate}`}
          >
            {countdown(item.dueDate, today)}
          </span>
        ) : item.heldOn ? (
          <span className="text-dim" title="Class date">
            {shortDate(item.heldOn)}
          </span>
        ) : null}
      </td>
      <td className="px-1 py-0.5 text-right">
        <HoursInput
          optional
          value={item.estimateHours}
          onChange={estimateHours => updateItem(item.id, {estimateHours})}
        />
      </td>
      <td className="px-1 py-0.5 text-right tabular-nums text-[11px] text-dim">
        {planned > 0
          ? `${fmtNum(actualHours(allocs))}/${fmtNum(planned)}`
          : '–'}
      </td>
      <td className="px-1 py-0.5 text-right">
        <button
          className="invisible text-dim group-hover:visible hover:text-danger"
          title="Delete item"
          onClick={() => deleteItemAction(item)}
        >
          ×
        </button>
      </td>
    </tr>
  );
});

function AddItem({projectId}: {projectId: string}) {
  const [kind, setKind] = useState<ItemKind>('task');
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState<string | undefined>();
  const [estimate, setEstimate] = useState<number | undefined>();

  const submit = () => {
    if (!title.trim()) return;
    useStore
      .getState()
      .addItems(projectId, [
        {kind, title: title.trim(), dueDate, estimateHours: estimate},
      ]);
    setTitle('');
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <Select
        value={kind}
        onChange={setKind}
        options={KIND_OPTIONS}
        className="w-32"
        ariaLabel="Kind"
      />
      <input
        className="field min-w-40 flex-1"
        data-new-item
        placeholder="New item… (Enter)"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
      />
      <DateField
        optional
        value={dueDate}
        onChange={setDueDate}
        placeholder="Due date"
      />
      <span className="flex items-center gap-1">
        <HoursInput
          optional
          value={estimate}
          onChange={setEstimate}
          placeholder="est"
          className="field w-14"
        />
        <span className="text-dim">h</span>
      </span>
      <button className="btn" onClick={submit}>
        add
      </button>
    </div>
  );
}

function BulkAdd({projectId, onDone}: {projectId: string; onDone(): void}) {
  const [kind, setKind] = useState<ItemKind>('lecture');
  const [prefix, setPrefix] = useState('Lecture');
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(13);
  const [estimate, setEstimate] = useState<number | undefined>(1.5);
  const count = Math.max(0, to - from + 1);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-panel p-2">
      <Select
        value={kind}
        onChange={setKind}
        options={KIND_OPTIONS}
        className="w-32"
        ariaLabel="Kind"
      />
      <input
        className="field w-28"
        value={prefix}
        onChange={e => setPrefix(e.target.value)}
      />
      <input
        type="number"
        className="field w-14 tabular-nums"
        value={from}
        onChange={e => setFrom(Number(e.target.value))}
      />
      <span className="text-dim">to</span>
      <input
        type="number"
        className="field w-14 tabular-nums"
        value={to}
        onChange={e => setTo(Number(e.target.value))}
      />
      <HoursInput
        optional
        value={estimate}
        onChange={setEstimate}
        placeholder="est"
        className="field w-14"
      />
      <span className="text-dim">h each</span>
      <button
        className="btn"
        disabled={count === 0 || count > 200}
        onClick={() => {
          useStore.getState().addItems(
            projectId,
            Array.from({length: count}, (_, k) => ({
              kind,
              title: `${prefix} ${from + k}`.trim(),
              estimateHours: estimate,
            })),
          );
          onDone();
        }}
      >
        add {count}
      </button>
    </div>
  );
}

function Overview({project}: {project: Project}) {
  const [editing, setEditing] = useState(project.overviewDoc === '');
  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-1 flex justify-end">
        <button
          className="btn-ghost text-[11px]"
          onClick={() => setEditing(e => !e)}
        >
          {editing ? 'preview' : 'edit'}
        </button>
      </div>
      {editing ? (
        <BufferedTextarea
          autoFocus={project.overviewDoc !== ''}
          className="field scroll-thin min-h-0 flex-1 resize-none tabular-nums text-[12px]"
          placeholder={'## Goals\n- …\n\n## Links\n- …\n\n## Decisions\n- …'}
          value={project.overviewDoc}
          onCommit={overviewDoc =>
            useStore.getState().updateProject(project.id, {overviewDoc})
          }
        />
      ) : (
        <div
          className="scroll-thin min-h-0 flex-1 overflow-y-auto"
          onDoubleClick={() => setEditing(true)}
        >
          <Markdown source={project.overviewDoc} />
        </div>
      )}
    </div>
  );
}

function Log({project}: {project: Project}) {
  const {addLog, deleteLog} = useStore.getState();
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
        onChange={e => setText(e.target.value)}
        onKeyDown={e =>
          e.key === 'Enter' && (e.ctrlKey || e.metaKey) && submit()
        }
      />
      <button className="btn self-end" onClick={submit}>
        add entry
      </button>
      <ul className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto">
        {project.log.map(l => (
          <LogEntryRow
            key={l.id}
            projectId={project.id}
            entry={l}
            onDelete={() =>
              withUndo('Log entry deleted', () => deleteLog(project.id, l.id))
            }
          />
        ))}
      </ul>
    </div>
  );
}

function LogEntryRow({
  projectId,
  entry,
  onDelete,
}: {
  projectId: string;
  entry: Project['log'][number];
  onDelete(): void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(entry.text);
  const save = () => {
    if (text.trim() && text.trim() !== entry.text)
      useStore.getState().updateLog(projectId, entry.id, text.trim());
    setEditing(false);
  };
  const stamp = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  return (
    <li className="group border-l-2 border-line pl-2">
      <div className="flex items-center text-[11px] text-dim tabular-nums">
        <span
          title={entry.editedAt ? `Edited ${stamp(entry.editedAt)}` : undefined}
        >
          {stamp(entry.at)}
          {entry.editedAt && ' · edited'}
        </span>
        {!editing && (
          <span className="ml-auto flex opacity-0 group-hover:opacity-100 focus-within:opacity-100">
            <button
              className="icon-btn h-6 w-6"
              aria-label="Edit entry"
              onClick={() => (setText(entry.text), setEditing(true))}
            >
              <Pencil size={13} />
            </button>
            <button
              className="icon-btn h-6 w-6 hover:!text-danger"
              aria-label="Delete entry"
              onClick={onDelete}
            >
              <Trash2 size={13} />
            </button>
          </span>
        )}
      </div>
      {editing ? (
        <div className="mt-1 space-y-1">
          <textarea
            autoFocus
            className="field h-20 w-full resize-y"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
              if (e.key === 'Escape') {
                e.stopPropagation();
                setEditing(false);
              }
            }}
          />
          <div className="flex justify-end gap-1">
            <button className="btn h-6" onClick={() => setEditing(false)}>
              <X size={12} /> Cancel
            </button>
            <button className="btn h-6 border-accent/60" onClick={save}>
              Save
            </button>
          </div>
        </div>
      ) : (
        <div
          className="cursor-text whitespace-pre-wrap"
          onDoubleClick={() => (setText(entry.text), setEditing(true))}
          title="Double-click to edit"
        >
          {entry.text}
        </div>
      )}
    </li>
  );
}
