import {
  DndContext,
  DragOverlay,
  pointerWithin,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {createPortal} from 'react-dom';
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
  GripVertical,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import {HoursInput} from '../components/hours_input';
import {InlineText} from '../components/inline_text';
import {UsosBanner} from '../components/usos_review';
import {ProjectDetails} from './project_details';
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
  type Allocation,
  type Item,
  type ItemGroup,
  type Project,
} from '../model/types';
import {href} from '../router';
import {useStore} from '../store';
import {useUi} from '../ui';
import {
  addGroup,
  deleteGroup,
  deleteItem as deleteItemAction,
  foldGroup,
  moveGroup,
  moveToGroup,
  renameGroup,
} from '../actions';
import {
  clicksSuppressed,
  ghostUnderPointer,
  suppressClicks,
  useDragSensors,
} from '../dnd';
import {blockKeys, isTyping} from '../keyboard';

type Tab = 'items' | 'description' | 'log' | 'details';

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
      <Header
        project={project}
        percent={percent}
        color={color}
        onDetails={() => setTab('details')}
      />
      <div className="flex shrink-0 gap-1 border-b border-line px-3 py-1">
        {(['items', 'description', 'log', 'details'] as const).map(t => (
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
        {tab === 'details' && (
          <ProjectDetails project={project} showItems={() => setTab('items')} />
        )}
      </div>
    </div>
  );
}

/**
 * The project's ring and name, with its area and due date as a line of text
 * that opens the details, where they're changed.
 */
function Header({
  project,
  percent,
  color,
  onDetails,
}: {
  project: Project;
  percent: number;
  color: string;
  onDetails(): void;
}) {
  const area = useStore(s => s.data.areas.find(a => a.id === project.areaId));
  const today = useToday();
  const set = (patch: Partial<Project>) =>
    useStore.getState().updateProject(project.id, patch);

  return (
    <div className="shrink-0 space-y-2 border-b border-line px-3 py-2">
      <div className="flex items-center gap-3">
        <ProgressRing percent={percent} color={color} size={44} stroke={4} />
        <div className="min-w-0 flex-1">
          <InlineText
            value={project.name}
            onChange={name => set({name})}
            className="w-full text-base font-semibold text-strong"
          />
          <button
            className="flex max-w-full items-center gap-1.5 truncate px-1 text-[12px] text-dim hover:text-fg"
            onClick={onDetails}
            title="Project details"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{background: color}}
            />
            {area?.name ?? 'No area'}
            {project.dueDate &&
              ` · due ${shortDate(project.dueDate)} (${countdown(project.dueDate, today)})`}
            {project.archived && ' · archived'}
          </button>
        </div>
        <a
          href={href({name: 'projects'})}
          className="btn-ghost text-base"
          title="Close (Esc)"
          aria-label="Close"
        >
          ×
        </a>
      </div>
      <UsosBanner projectId={project.id} />
    </div>
  );
}

const NO_ALLOCS: Allocation[] = [];

/** What a drag in the item list carries: a group's grip, or a task's row. */
type DragData = {kind: 'group'; index: number} | {kind: 'item'; id: string};
/** A group's rows, where a drag can land ('' for "No group"); `index` is its place in the order. */
interface DropData {
  groupId: string;
  index?: number;
}
/** A drag in progress: a group to put elsewhere in the order, or tasks to move into a group. */
type ListDrag =
  | {kind: 'group'; from: number; to?: number}
  | {kind: 'items'; ids: string[]; to?: string};

function dataOf<T>(x: {data: {current?: unknown}} | null) {
  return x?.data.current as T | undefined;
}

function ItemsTab({project}: {project: Project}) {
  const allItems = useStore(s => s.data.items);
  const allocations = useStore(s => s.data.allocations);
  const [hideDone, setHideDone] = useState(false);
  const [addingGroup, setAddingGroup] = useState(false);
  const today = useToday();
  const {groups} = project;
  const sensors = useDragSensors();
  const [drag, setDrag] = useState<ListDrag | null>(null);
  const draggedGroup = drag?.kind === 'group' ? groups[drag.from] : undefined;
  // Selected tasks (a click selects one; Shift and Ctrl/Cmd add more), to
  // drag together. `anchor` is where a Shift-click range starts.
  const [selection, setSelection] = useState({
    projectId: project.id,
    ids: [] as string[],
    anchor: undefined as string | undefined,
  });
  const selected = useMemo(
    () => new Set(selection.projectId === project.id ? selection.ids : []),
    [selection, project.id],
  );
  const clearSelection = () =>
    setSelection({projectId: project.id, ids: [], anchor: undefined});
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    // Esc cancels the drag; marked handled so it doesn't close the panel too.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.preventDefault();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [dragging]);
  const anySelected = selected.size > 0;
  useEffect(() => {
    if (!anySelected) return;
    // Esc clears the selection first; the next one closes the panel. Not
    // when a popover or a drag took it, nor while a task or a dialog is
    // open: Esc closes that.
    const onKey = (e: KeyboardEvent) => {
      const {openItemId, dialog} = useUi.getState();
      if (
        e.key === 'Escape' &&
        !e.defaultPrevented &&
        !isTyping(e.target as Element) &&
        openItemId === null &&
        dialog === null
      ) {
        e.preventDefault();
        setSelection(s => ({...s, ids: []}));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [anySelected]);

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
  const shown = (list: Item[]) =>
    hideDone ? list.filter(i => !isItemDone(i)) : list;
  // The tasks as listed, top to bottom: what a Shift-click range spans.
  const listed = useMemo(() => {
    const lists = [
      ...(!groups.length || !project.ungroupedCollapsed
        ? [byGroup.get('') ?? []]
        : []),
      ...groups.filter(g => !g.collapsed).map(g => byGroup.get(g.id) ?? []),
    ];
    return lists.flatMap(l =>
      (hideDone ? l.filter(i => !isItemDone(i)) : l).map(i => i.id),
    );
  }, [byGroup, groups, project.ungroupedCollapsed, hideDone]);
  const select = useCallback(
    (id: string, how: Selecting) =>
      setSelection(s => {
        const cur: {ids: string[]; anchor?: string} =
          s.projectId === project.id ? s : {ids: []};
        const base = {projectId: project.id};
        if (how === 'toggle')
          return {
            ...base,
            ids: cur.ids.includes(id)
              ? cur.ids.filter(x => x !== id)
              : [...cur.ids, id],
            anchor: id,
          };
        const from = cur.anchor ? listed.indexOf(cur.anchor) : -1;
        const to = listed.indexOf(id);
        if (how === 'only' || from < 0 || to < 0)
          return {...base, ids: [id], anchor: id};
        // From the anchor to this one, both included; the anchor stays.
        const [lo, hi] = from < to ? [from, to] : [to, from];
        return {...base, ids: listed.slice(lo, hi + 1), anchor: cur.anchor};
      }),
    [project.id, listed],
  );
  const rows = (list: Item[]) =>
    shown(list).map(item => (
      <ItemRow
        key={item.id}
        item={item}
        groups={groups}
        allocs={allocs.get(item.id) ?? NO_ALLOCS}
        today={today}
        selected={selected.has(item.id)}
        lifted={drag?.kind === 'items' && drag.ids.includes(item.id)}
        onSelect={select}
      />
    ));
  /** Dragged tasks would land in group `key` ('' for none): some aren't in it yet. */
  const into = (key: string) =>
    drag?.kind === 'items' &&
    drag.to === key &&
    items.some(i => drag.ids.includes(i.id) && groupIdOf(i, groups) !== key);
  const startDrag = (d: DragData) =>
    setDrag(
      d.kind === 'group'
        ? {kind: 'group', from: d.index}
        : {
            kind: 'items',
            // A selected task brings the whole selection along.
            ids: selected.has(d.id)
              ? items.filter(i => selected.has(i.id)).map(i => i.id)
              : [d.id],
          },
    );
  const endDrag = (over: DropData | undefined) => {
    setDrag(null);
    // The pointer-up may also click the row it ends on.
    suppressClicks();
    if (!drag || !over) return;
    if (drag.kind === 'group') {
      if (over.index !== undefined && over.index !== drag.from)
        moveGroup(project.id, groups[drag.from].id, over.index);
      return;
    }
    const moving = items.filter(
      i => drag.ids.includes(i.id) && groupIdOf(i, groups) !== over.groupId,
    );
    if (moving.length)
      moveToGroup(
        moving,
        groups.find(g => g.id === over.groupId),
      );
    if (drag.ids.some(id => selected.has(id))) clearSelection();
  };
  const selectedItems = items.filter(i => selected.has(i.id));
  const ungrouped = byGroup.get('') ?? [];
  const noneOpen = !groups.length || !project.ungroupedCollapsed;
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
            onClick={() => setAddingGroup(a => !a)}
            title="A folder for items, e.g. all classes"
          >
            {addingGroup ? 'cancel group' : '+ group'}
          </button>
        </div>
        {addingGroup && (
          <AddGroup
            projectId={project.id}
            onDone={() => setAddingGroup(false)}
          />
        )}
        <AddItem projectId={project.id} />
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={e => {
            const d = dataOf<DragData>(e.active);
            if (d) startDrag(d);
          }}
          onDragOver={e => {
            const over = dataOf<DropData>(e.over);
            setDrag(
              d =>
                d &&
                (d.kind === 'group'
                  ? {...d, to: over?.index}
                  : {...d, to: over?.groupId}),
            );
          }}
          onDragEnd={e => endDrag(dataOf<DropData>(e.over))}
          onDragCancel={() => setDrag(null)}
        >
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
            {/* Tasks in no group come first, then the groups. */}
            <GroupBody
              id={`${project.id}:none`}
              drop={{groupId: ''}}
              target={into('')}
            >
              {groups.length > 0 && ungrouped.length > 0 && (
                <GroupHeader
                  projectId={project.id}
                  items={ungrouped}
                  ungrouped={ungrouped}
                  open={noneOpen}
                  onToggle={() => foldGroup(project.id, null, noneOpen)}
                />
              )}
              {noneOpen && rows(ungrouped)}
            </GroupBody>
            {groups.map((g, k) => {
              const list = byGroup.get(g.id) ?? [];
              const open = !g.collapsed;
              const lands =
                drag?.kind === 'group' && drag.to === k && k !== drag.from
                  ? k < drag.from
                    ? 'before'
                    : 'after'
                  : null;
              return (
                <GroupBody
                  key={g.id}
                  id={g.id}
                  drop={{groupId: g.id, index: k}}
                  lands={lands}
                  lifted={draggedGroup === g}
                  target={into(g.id)}
                >
                  <GroupHeader
                    projectId={project.id}
                    group={g}
                    index={k}
                    last={k === groups.length - 1}
                    items={list}
                    ungrouped={ungrouped}
                    open={open}
                    onToggle={() => foldGroup(project.id, g.id, open)}
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
                </GroupBody>
              );
            })}
          </table>
          {/* Below the list, floating: showing it never moves the rows. */}
          {selectedItems.length > 1 && (
            <SelectionBar
              items={selectedItems}
              groups={groups}
              onClear={clearSelection}
            />
          )}
          {/* In the body: the panel's transform would offset a fixed ghost. */}
          {createPortal(
            <DragOverlay dropAnimation={null} modifiers={[ghostUnderPointer]}>
              {draggedGroup && (
                <div className="flex w-max items-center gap-1 rounded-md border border-line bg-panel px-2 py-1 text-[12px] font-medium text-strong shadow-lg">
                  <GripVertical size={13} className="text-dim" />
                  {draggedGroup.name}
                </div>
              )}
              {drag?.kind === 'items' && (
                <div className="w-max max-w-80 truncate rounded-md border border-line bg-panel px-2 py-1 text-[12px] font-medium text-strong shadow-lg">
                  {drag.ids.length === 1
                    ? items.find(i => i.id === drag.ids[0])?.title
                    : `${drag.ids.length} tasks`}
                </div>
              )}
            </DragOverlay>,
            document.body,
          )}
        </DndContext>
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

/**
 * A group's rows, or "No group"'s, where a drag can land. For a dragged group,
 * a line shows where it lands: above this group or below it. Dragged tasks
 * that would move into it (`target`) tint it.
 */
function GroupBody({
  id,
  drop,
  lands = null,
  lifted = false,
  target,
  children,
}: {
  id: string;
  drop: DropData;
  lands?: 'before' | 'after' | null;
  lifted?: boolean;
  target: boolean;
  children: ReactNode;
}) {
  const {setNodeRef} = useDroppable({id, data: drop});
  const line =
    lands === 'before'
      ? '[&>tr:first-child>td]:shadow-[inset_0_2px_0_var(--color-accent)]'
      : lands === 'after'
        ? '[&>tr:last-child>td]:shadow-[inset_0_-2px_0_var(--color-accent)]'
        : '';
  return (
    <tbody
      ref={setNodeRef}
      className={`${line} ${lifted ? 'opacity-50' : ''} ${target ? 'bg-accent/10' : ''}`}
    >
      {children}
    </tbody>
  );
}

/**
 * Drags a group to another place in the order, with the mouse or a finger.
 * Hidden from the keyboard and screen readers: the group's menu moves it up
 * or down.
 */
function GroupGrip({group, index}: {group: ItemGroup; index: number}) {
  const {setNodeRef, listeners} = useDraggable({
    id: group.id,
    data: {kind: 'group', index} satisfies DragData,
  });
  return (
    <span
      ref={setNodeRef}
      {...listeners}
      aria-hidden
      title="Drag to reorder"
      className="flex h-6 w-4 shrink-0 cursor-grab touch-none items-center justify-center text-dim opacity-0 group-hover/head:opacity-100 pointer-coarse:opacity-100 active:cursor-grabbing"
    >
      <GripVertical size={13} />
    </span>
  );
}

/** The tasks picked with Shift- or Ctrl/Cmd-click: how many, and where they can go. */
function SelectionBar({
  items,
  groups,
  onClear,
}: {
  items: Item[];
  groups: ItemGroup[];
  onClear(): void;
}) {
  const options = useMemo(() => groupOptions(groups), [groups]);
  return (
    <div className="sticky bottom-0 z-10 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-accent/40 bg-panel px-2 py-1 text-[12px] shadow-lg">
      <span className="font-medium text-strong tabular-nums">
        {items.length} selected
      </span>
      <span className="text-dim">
        {groups.length
          ? 'drag them onto a group, or'
          : 'Shift-click to add more'}
      </span>
      {groups.length > 0 && (
        <Select
          // Matches no option: the trigger reads "Move to…".
          value={'\0' as string}
          onChange={id => {
            moveToGroup(
              items,
              groups.find(g => g.id === id),
            );
            onClear();
          }}
          options={options}
          display="Move to…"
          className="h-6 text-[12px]"
          ariaLabel={`Move the ${items.length} selected tasks to a group`}
        />
      )}
      <button className="btn-ghost ml-auto" onClick={onClear} title="Esc">
        Clear
      </button>
    </div>
  );
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
    <tr className="group/head border-b border-line">
      <td colSpan={6} className="pt-3 pb-0.5">
        <div className="flex min-w-0 items-center gap-1">
          {group ? (
            <GroupGrip group={group} index={index} />
          ) : (
            <span className="w-4 shrink-0" />
          )}
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

/** How a click selects: this task only, toggled in, or a range up to it. */
type Selecting = 'only' | 'toggle' | 'range';

interface Modifiers {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/** Shift or Ctrl/Cmd: a click anywhere on the row selects, even on a control. */
function selects(e: Modifiers) {
  return e.shiftKey || e.ctrlKey || e.metaKey;
}

function selecting(e: Modifiers): Selecting {
  return e.shiftKey ? 'range' : e.ctrlKey || e.metaKey ? 'toggle' : 'only';
}

/** A row's own controls (status, group, hours, delete) keep their clicks. */
function onControl(target: EventTarget): boolean {
  return !!(target as Element).closest(
    'input, textarea, select, [role="combobox"], button:not([data-block])',
  );
}

const ItemRow = memo(function ItemRow({
  item,
  groups,
  allocs,
  today,
  selected,
  lifted,
  onSelect,
}: {
  item: Item;
  groups: ItemGroup[];
  allocs: Allocation[];
  today: string;
  /** Selected, to drag along with the others. */
  selected: boolean;
  /** Being dragged. */
  lifted: boolean;
  onSelect(id: string, how: Selecting): void;
}) {
  const openItem = useUi(s => s.openItem);
  const {updateItem} = useStore.getState();
  const done = isItemDone(item);
  const planned = plannedHours(allocs);
  // The whole row drags (onto a group), except from a text field.
  const {setNodeRef, listeners} = useDraggable({
    id: item.id,
    data: {kind: 'item', id: item.id} satisfies DragData,
    disabled: !groups.length,
  });

  return (
    <tr
      ref={setNodeRef}
      onPointerDown={e => {
        // A finger is the touch sensor's (press and hold), so swipes scroll.
        if (e.pointerType !== 'touch' && !isTyping(e.target as Element))
          listeners?.onPointerDown?.(e);
      }}
      onTouchStart={e => {
        if (!isTyping(e.target as Element)) listeners?.onTouchStart?.(e);
      }}
      onPointerDownCapture={e => {
        if (!selects(e)) return;
        // Selecting: no text selection, and no menu or field opens. The row
        // can still be dragged from here (first: dnd-kit skips a handled event).
        listeners?.onPointerDown?.(e);
        e.preventDefault();
        e.stopPropagation();
      }}
      onClickCapture={e => {
        if (!selects(e) && !clicksSuppressed()) return;
        e.preventDefault();
        e.stopPropagation();
        if (selects(e) && !clicksSuppressed()) onSelect(item.id, selecting(e));
      }}
      // A plain click selects this task (its controls aside); a double click
      // opens it.
      onClick={e => !onControl(e.target) && onSelect(item.id, 'only')}
      onDoubleClick={e => !onControl(e.target) && openItem(item.id)}
      className={`group border-b border-line/50 transition-colors duration-150 ${selected ? 'bg-accent/15' : 'hover:bg-raised/50'} ${lifted ? 'opacity-50' : ''} ${done ? 'text-dim' : ''}`}
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
            onKeyDown={blockKeys({
              open: () => openItem(item.id),
              toggle: () => onSelect(item.id, 'toggle'),
              remove: () => deleteItemAction(item),
            })}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 text-left hover:bg-raised"
            title="Click to select, double-click (or Enter) to open"
            aria-pressed={selected}
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

/** The add field above the list (no group), or a compact one inside a group. */
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
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
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
          <span className="ml-auto flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
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
