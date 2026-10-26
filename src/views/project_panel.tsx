import {memo, useMemo, useState} from 'react';
import {withUndo} from '../toast';
import {BufferedTextarea} from '../components/buffered';
import {DateField} from '../components/date_field';
import {GroupSelect} from '../components/group_select';
import {StatusSelect} from '../components/status_select';
import {Select} from '../components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../components/ui/popover';
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  FolderInput,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import {HoursInput} from '../components/hours_input';
import {InlineText} from '../components/inline_text';
import {CoursePattern} from '../components/course_pattern';
import {UsosBanner} from '../components/usos_review';
import {Markdown} from '../components/markdown';
import {ProgressRing} from '../components/progress_ring';
import {
  fmtNum,
  groupOptions,
  kindBadge,
  KIND_OPTIONS,
  URGENCY_CLASS,
} from '../format';
import {countdown, shortDate} from '../model/dates';
import {useToday} from '../hooks';
import {
  actualHours,
  compareOpenFirst,
  groupIdOf,
  isItemDone,
  plannedHours,
  urgency,
} from '../model/selectors';
import {
  ItemKind,
  ProgressMode,
  type Allocation,
  type Item,
  type ItemGroup,
  type Project,
} from '../model/types';
import {href, navigate} from '../router';
import {useStore} from '../store';
import {useUi} from '../ui';
import {
  addGroup,
  deleteGroup,
  deleteItem as deleteItemAction,
  moveGroup,
  moveToGroup,
  renameGroup,
} from '../actions';
import {blockKeys} from '../keyboard';

type Tab = 'items' | 'description' | 'log';

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
        {(['items', 'description', 'log'] as const).map(t => (
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
        {tab === 'description' && <Description project={project} />}
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
        {project.progressMode === ProgressMode.MANUAL && (
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
  {value: ProgressMode.CHECKLIST, label: 'Progress: items done'},
  {value: ProgressMode.HOURS, label: 'Progress: hours spent / estimate'},
  {value: ProgressMode.MANUAL, label: 'Progress: manual'},
];

function ItemsTab({project}: {project: Project}) {
  const allItems = useStore(s => s.data.items);
  const allocations = useStore(s => s.data.allocations);
  const collapsed = useUi(s => s.collapsedGroups);
  const [hideDone, setHideDone] = useState(false);
  const [form, setForm] = useState<'bulk' | 'group' | null>(null);
  const today = useToday();
  const {groups} = project;

  const items = useMemo(
    // Done items sink to the bottom of each list, out of the way.
    () =>
      allItems.filter(i => i.projectId === project.id).sort(compareOpenFirst),
    [allItems, project.id],
  );
  const allocs = useMemo(() => {
    const ids = new Set(items.map(i => i.id));
    const m = new Map<string, Allocation[]>();
    for (const a of allocations)
      if (ids.has(a.itemId)) m.set(a.itemId, [...(m.get(a.itemId) ?? []), a]);
    return m;
  }, [items, allocations]);
  // Items by group id; '' for no group, which includes a group that's gone.
  const byGroup = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of items) {
      const key = groupIdOf(i, groups);
      m.set(key, [...(m.get(key) ?? []), i]);
    }
    return m;
  }, [items, groups]);
  const rows = (list: Item[]) =>
    (hideDone ? list.filter(i => !isItemDone(i)) : list).map(item => (
      <ItemRow
        key={item.id}
        item={item}
        groups={groups}
        allocs={allocs.get(item.id) ?? NO_ALLOCS}
        today={today}
      />
    ));
  const toggle = (key: string) => useUi.getState().toggleGroup(key);
  const ungrouped = byGroup.get('') ?? [];
  const noneKey = `${project.id}:none`;
  const noneOpen = !groups.length || !collapsed.includes(noneKey);
  const [editingDescription, setEditingDescription] = useState(false);
  const description = {
    project,
    editing: editingDescription,
    setEditing: setEditingDescription,
  };
  const hasDescription =
    project.overviewDoc.trim() !== '' || editingDescription;

  return (
    <div className="@container/panel flex h-full">
      <div className="scroll-thin @container h-full min-w-0 flex-1 overflow-y-auto p-3">
        {hasDescription ? (
          <DescriptionBlock {...description} />
        ) : (
          <button
            className="btn-ghost mb-1 -ml-1.5 text-[12px]"
            onClick={() => {
              useUi.getState().setDescriptionCollapsed(false);
              setEditingDescription(true);
            }}
          >
            + Add a description
          </button>
        )}
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
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
          <button
            className="btn-ghost"
            onClick={() => useUi.getState().importCurriculum(project.id)}
            title="Turn a course description into class items, with Gemini"
          >
            import curriculum…
          </button>
          <button
            className="btn-ghost"
            onClick={() => setForm(f => (f === 'group' ? null : 'group'))}
            title="A folder for items, e.g. all classes"
          >
            {form === 'group' ? 'cancel group' : '+ group'}
          </button>
          <button
            className="btn-ghost"
            onClick={() => setForm(f => (f === 'bulk' ? null : 'bulk'))}
          >
            {form === 'bulk' ? 'cancel bulk' : '+ bulk'}
          </button>
        </div>
        {form === 'group' && (
          <AddGroup projectId={project.id} onDone={() => setForm(null)} />
        )}
        {form === 'bulk' && (
          <BulkAdd
            projectId={project.id}
            groups={groups}
            onDone={() => setForm(null)}
          />
        )}
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-28 @md:w-32" />
            <col />
            <col className="w-20" />
            {/* Estimate and spent/plan: none on narrow panels (phones). */}
            <col className="w-12 @max-md:w-0" />
            <col className="w-16 @max-md:w-0" />
            <col className="w-5" />
          </colgroup>
          <thead>
            <tr className="label border-b border-line text-left [&>th]:px-1 [&>th]:py-1 [&>th]:font-normal">
              <th>status</th>
              <th>title</th>
              <th>date</th>
              <th
                className="text-right @max-md:invisible @max-md:overflow-hidden @max-md:!px-0"
                title="Estimated hours"
              >
                est
              </th>
              <th
                className="text-right @max-md:invisible @max-md:overflow-hidden @max-md:!px-0"
                title="Hours spent / planned"
              >
                spent/plan
              </th>
              <th />
            </tr>
          </thead>
          {groups.map((g, k) => {
            const list = byGroup.get(g.id) ?? [];
            const open = !collapsed.includes(g.id);
            return (
              <tbody key={g.id}>
                <GroupHeader
                  projectId={project.id}
                  group={g}
                  index={k}
                  last={k === groups.length - 1}
                  items={list}
                  ungrouped={ungrouped}
                  open={open}
                  onToggle={() => toggle(g.id)}
                />
                {open && rows(list)}
                {open && !list.length && (
                  <EmptyGroup group={g} ungrouped={ungrouped} />
                )}
                {open && (
                  <tr>
                    <td colSpan={6}>
                      <AddItem
                        projectId={project.id}
                        group={g}
                        defaultKind={list.at(-1)?.kind}
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
          <tbody>
            {groups.length > 0 && ungrouped.length > 0 && (
              <GroupHeader
                projectId={project.id}
                items={ungrouped}
                ungrouped={ungrouped}
                open={noneOpen}
                onToggle={() => toggle(noneKey)}
              />
            )}
            {noneOpen && rows(ungrouped)}
          </tbody>
        </table>
        <AddItem projectId={project.id} />
      </div>
      {hasDescription && <DescriptionColumn {...description} />}
    </div>
  );
}

/**
 * The ungrouped items by kind: what a group's "all … items" moves into it.
 * Items already in another group stay there.
 */
function movable(ungrouped: Item[]) {
  return KIND_OPTIONS.map(o => ({
    kind: o.value,
    name: o.label.toLowerCase(),
    items: ungrouped.filter(i => i.kind === o.value),
  })).filter(k => k.items.length > 0);
}

/** A group's name, item count and done/total, collapsible; "No group" without `group`. */
function GroupHeader({
  projectId,
  group,
  index = 0,
  last = true,
  items,
  ungrouped,
  open,
  onToggle,
}: {
  projectId: string;
  group?: ItemGroup;
  index?: number;
  last?: boolean;
  items: Item[];
  /** The project's items in no group, which the group's menu can move in. */
  ungrouped: Item[];
  open: boolean;
  onToggle(): void;
}) {
  const name = group?.name ?? 'No group';
  const done = items.filter(isItemDone).length;
  return (
    <tr className="border-b border-line">
      <td colSpan={6} className="pt-3 pb-0.5">
        <div className="flex min-w-0 items-center gap-1">
          <button
            className="icon-btn h-6 w-6 shrink-0"
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${name}`}
            onClick={onToggle}
          >
            <ChevronRight
              size={14}
              className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
            />
          </button>
          {group ? (
            <InlineText
              value={group.name}
              onChange={n => renameGroup(projectId, group.id, n)}
              ariaLabel="Group name"
              className="flex-1 font-medium text-strong"
            />
          ) : (
            <button
              className="min-w-0 flex-1 truncate px-1 text-left text-dim"
              onClick={onToggle}
            >
              No group
            </button>
          )}
          <button
            className="shrink-0 px-1 tabular-nums text-[11px] text-dim"
            onClick={onToggle}
          >
            {items.length} {items.length === 1 ? 'item' : 'items'} · {done}/
            {items.length} done
          </button>
          {group && (
            <GroupMenu
              projectId={projectId}
              group={group}
              index={index}
              last={last}
              ungrouped={ungrouped}
            />
          )}
        </div>
      </td>
    </tr>
  );
}

function GroupMenu({
  projectId,
  group,
  index,
  last,
  ungrouped,
}: {
  projectId: string;
  group: ItemGroup;
  index: number;
  last: boolean;
  ungrouped: Item[];
}) {
  const [open, setOpen] = useState(false);
  const run = (f: () => void) => () => {
    setOpen(false);
    f();
  };
  const kinds = movable(ungrouped);
  const entry =
    'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-raised';
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="icon-btn h-6 w-6 shrink-0"
        aria-label={`Actions for ${group.name}`}
        title="Group actions"
      >
        <MoreHorizontal size={14} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-1 text-[12px]">
        {kinds.length > 0 && (
          <div className="label px-2.5 pt-1.5 pb-1">
            Move here from “No group”
          </div>
        )}
        {kinds.map(k => (
          <button
            key={k.kind}
            className={entry}
            onClick={run(() => moveToGroup(k.items, group))}
          >
            <span className="w-7 tabular-nums text-[10px] text-dim">
              {kindBadge(k.kind)}
            </span>
            <span className="flex-1">All {k.name} items</span>
            <span className="tabular-nums text-dim">{k.items.length}</span>
          </button>
        ))}
        {kinds.length > 0 && <div className="my-1 border-t border-line" />}
        {index > 0 && (
          <button
            className={entry}
            onClick={run(() => moveGroup(projectId, group.id, index - 1))}
          >
            <ArrowUp size={13} className="text-dim" /> Move up
          </button>
        )}
        {!last && (
          <button
            className={entry}
            onClick={run(() => moveGroup(projectId, group.id, index + 1))}
          >
            <ArrowDown size={13} className="text-dim" /> Move down
          </button>
        )}
        <button
          className={`${entry} hover:text-danger`}
          onClick={run(() => deleteGroup(projectId, group))}
        >
          <Trash2 size={13} className="text-dim" /> Delete group
          <span className="ml-auto text-[11px] text-dim">keeps items</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}

/** An empty group's hint, with one-click moves of the ungrouped items of a kind. */
function EmptyGroup({group, ungrouped}: {group: ItemGroup; ungrouped: Item[]}) {
  const kinds = movable(ungrouped);
  return (
    <tr>
      <td
        colSpan={6}
        className="py-1 pl-7 text-[12px] text-dim [&_button]:ml-1"
      >
        Empty. Move items here with{' '}
        <FolderInput size={12} className="inline align-[-2px]" /> on a row
        {kinds.length ? ', or move' : '.'}
        {kinds.map(k => (
          <button
            key={k.kind}
            className="btn-ghost"
            onClick={() => moveToGroup(k.items, group)}
          >
            all {kindBadge(k.kind)} ({k.items.length})
          </button>
        ))}
      </td>
    </tr>
  );
}

const ItemRow = memo(function ItemRow({
  item,
  groups,
  allocs,
  today,
}: {
  item: Item;
  groups: ItemGroup[];
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
        <div className="flex min-w-0 items-center">
          <button
            data-block
            onKeyDown={blockKeys({remove: () => deleteItemAction(item)})}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 text-left hover:bg-raised"
            onClick={() => openItem(item.id)}
            title="Open task details"
          >
            <span className="tabular-nums text-[10px] text-dim">
              {kindBadge(item.kind)}
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
          {groups.length > 0 && (
            // Shown on hover or focus, and while open.
            <span className="hidden shrink-0 group-focus-within:inline-flex group-hover:inline-flex has-[[aria-expanded=true]]:inline-flex">
              <GroupSelect
                item={item}
                groups={groups}
                variant="ghost"
                display={<FolderInput size={13} />}
                className="h-6 gap-0.5 px-1 text-dim"
                ariaLabel={`Move “${item.title}” to a group`}
              />
            </span>
          )}
        </div>
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
      <td className="px-1 py-0.5 text-right @max-md:invisible @max-md:overflow-hidden @max-md:px-0">
        <HoursInput
          optional
          value={item.estimateHours}
          onChange={estimateHours => updateItem(item.id, {estimateHours})}
        />
      </td>
      <td className="px-1 py-0.5 text-right tabular-nums text-[11px] text-dim @max-md:invisible @max-md:overflow-hidden @max-md:px-0">
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

function AddGroup({projectId, onDone}: {projectId: string; onDone(): void}) {
  const [name, setName] = useState('');
  const submit = () => {
    if (!name.trim()) return;
    addGroup(projectId, name.trim());
    onDone();
  };
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-panel p-2">
      <input
        autoFocus
        className="field min-w-40 flex-1"
        placeholder="Group name, e.g. Classes (Enter)"
        aria-label="Group name"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') {
            e.stopPropagation();
            onDone();
          }
        }}
      />
      <button className="btn" disabled={!name.trim()} onClick={submit}>
        add group
      </button>
    </div>
  );
}

/** The add field under the list (no group), or a compact one inside a group. */
function AddItem({
  projectId,
  group,
  defaultKind = ItemKind.TASK,
}: {
  projectId: string;
  group?: ItemGroup;
  defaultKind?: ItemKind;
}) {
  // Follows the default (a group's last item's kind) until picked.
  const [picked, setKind] = useState<ItemKind>();
  const kind = picked ?? defaultKind;
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState<string | undefined>();
  const [estimate, setEstimate] = useState<number | undefined>();

  const submit = () => {
    if (!title.trim()) return;
    useStore.getState().addItems(projectId, [
      {
        kind,
        title: title.trim(),
        dueDate,
        estimateHours: estimate,
        groupId: group?.id,
      },
    ]);
    setTitle('');
  };

  if (group)
    return (
      <div className="flex items-center gap-1 py-0.5 pl-6">
        <Select
          variant="ghost"
          value={kind}
          onChange={setKind}
          options={KIND_OPTIONS}
          className="h-6 w-28 shrink-0 text-[12px] text-dim"
          ariaLabel={`Kind of a new item in ${group.name}`}
        />
        <input
          className="h-6 min-w-0 flex-1 rounded px-1 placeholder:text-dim hover:bg-raised focus:bg-raised"
          placeholder={`Add to ${group.name}… (Enter)`}
          aria-label={`New item in ${group.name}`}
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
        />
      </div>
    );
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

function BulkAdd({
  projectId,
  groups,
  onDone,
}: {
  projectId: string;
  groups: ItemGroup[];
  onDone(): void;
}) {
  const [kind, setKind] = useState(ItemKind.CLASS);
  const [groupId, setGroupId] = useState('');
  const [prefix, setPrefix] = useState('Lecture');
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(13);
  const [estimate, setEstimate] = useState<number | undefined>(1.5);
  // Whole numbers from 1 (not "Lecture 1.5" or "Lecture -1"); otherwise nothing to add.
  const whole = Number.isInteger(from) && Number.isInteger(to) && from >= 1;
  const count = whole ? Math.max(0, to - from + 1) : 0;

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
        min={1}
        step={1}
        value={from}
        onChange={e => setFrom(Number(e.target.value))}
      />
      <span className="text-dim">to</span>
      <input
        type="number"
        className="field w-14 tabular-nums"
        min={1}
        step={1}
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
      {groups.length > 0 && (
        <Select
          value={groupId}
          onChange={setGroupId}
          options={groupOptions(groups)}
          className="w-32"
          ariaLabel="Group"
        />
      )}
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
              groupId: groupId || undefined,
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

/** The project's description: its Markdown overview doc, full height. */
function Description({project}: {project: Project}) {
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
        <DescriptionEditor
          project={project}
          autoFocus={project.overviewDoc !== ''}
          className="min-h-0 flex-1"
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

/** A textarea for the description; writes after a pause, like other long text. */
function DescriptionEditor({
  project,
  autoFocus,
  className,
}: {
  project: Project;
  autoFocus?: boolean;
  className: string;
}) {
  return (
    <BufferedTextarea
      autoFocus={autoFocus}
      aria-label="Description"
      className={`field scroll-thin resize-none tabular-nums text-[12px] ${className}`}
      placeholder={'## Goals\n- …\n\n## Links\n- …\n\n## Decisions\n- …'}
      value={project.overviewDoc}
      onCommit={overviewDoc =>
        useStore.getState().updateProject(project.id, {overviewDoc})
      }
    />
  );
}

interface DescriptionProps {
  project: Project;
  editing: boolean;
  setEditing(editing: boolean): void;
}

/** The description beside the items, on wide panels. */
function DescriptionColumn({project, editing, setEditing}: DescriptionProps) {
  return (
    <aside
      aria-label="Description"
      className="hidden w-72 shrink-0 flex-col border-l border-line p-3 @4xl/panel:flex"
    >
      <div className="mb-1 flex items-center">
        <span className="label flex-1">description</span>
        <button
          className="btn-ghost text-[11px]"
          onClick={() => setEditing(!editing)}
        >
          {editing ? 'preview' : 'edit'}
        </button>
      </div>
      {editing ? (
        <DescriptionEditor
          project={project}
          autoFocus
          className="min-h-0 flex-1"
        />
      ) : (
        <div
          className="scroll-thin min-h-0 flex-1 overflow-y-auto"
          onDoubleClick={() => setEditing(true)}
          title="Double-click to edit"
        >
          <Markdown source={project.overviewDoc} />
        </div>
      )}
    </aside>
  );
}

/** The description above the items, collapsible (per device), on narrow panels. */
function DescriptionBlock({project, editing, setEditing}: DescriptionProps) {
  const collapsed = useUi(s => s.descriptionCollapsed);
  const open = !collapsed;
  // The first line, as a preview while collapsed.
  const preview =
    project.overviewDoc
      .split('\n')
      .map(l => l.replace(/^[\s#>*-]+/, '').trim())
      .find(Boolean) ?? '';
  return (
    <section
      aria-label="Description"
      className="mb-3 rounded-md border border-line @4xl/panel:hidden"
    >
      <div className="flex items-center gap-1 px-1 py-0.5">
        <button
          className="flex min-w-0 flex-1 items-center gap-1 rounded py-0.5 text-left"
          aria-expanded={open}
          onClick={() => {
            useUi.getState().setDescriptionCollapsed(open);
            if (open) setEditing(false);
          }}
        >
          <ChevronRight
            size={14}
            className={`shrink-0 text-dim transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          />
          <span className="label">description</span>
          {!open && (
            <span className="min-w-0 flex-1 truncate pl-1 text-[12px] text-dim">
              {preview}
            </span>
          )}
        </button>
        {open && (
          <button
            className="btn-ghost text-[11px]"
            onClick={() => setEditing(!editing)}
          >
            {editing ? 'preview' : 'edit'}
          </button>
        )}
      </div>
      {open &&
        (editing ? (
          <div className="px-2 pb-2">
            <DescriptionEditor
              project={project}
              autoFocus
              className="block h-40 w-full resize-y"
            />
          </div>
        ) : (
          <div
            className="scroll-thin max-h-48 overflow-y-auto px-3 pb-2"
            onDoubleClick={() => setEditing(true)}
            title="Double-click to edit"
          >
            <Markdown source={project.overviewDoc} />
          </div>
        ))}
    </section>
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
