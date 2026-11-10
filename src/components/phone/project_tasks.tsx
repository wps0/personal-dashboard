import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Ellipsis,
  FileText,
  Flag,
  FolderPlus,
  GraduationCap,
  PenLine,
  Plus,
  SlidersHorizontal,
  SquareCheck,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import {useMemo, useState} from 'react';
import {
  addGroup,
  advanceStatus,
  deleteGroup,
  foldGroup,
  moveGroup,
  renameGroup,
} from '../../actions';
import {
  fmtDuration,
  groupOptions,
  KIND_OPTIONS,
  kindName,
  URGENCY_CLASS,
} from '../../format';
import {useToday} from '../../hooks';
import {countdown, shortDate} from '../../model/dates';
import {
  compareOpenFirst,
  groupIdOf,
  isItemDone,
  statusLabel,
  urgency,
} from '../../model/selectors';
import {
  ItemKind,
  ItemStatus,
  type ISODate,
  type Item,
  type ItemGroup,
  type Project,
} from '../../model/types';
import {useStore} from '../../store';
import {useUi} from '../../ui';
import {DateField} from '../date_field';
import {HoursInput} from '../hours_input';
import {Select} from '../ui/select';
import {Sheet} from './parts';

const KIND_ICON: Partial<Record<ItemKind, LucideIcon>> = {
  [ItemKind.CLASS]: GraduationCap,
  [ItemKind.ASSIGNMENT]: FileText,
  [ItemKind.EXAM]: PenLine,
  [ItemKind.TASK]: SquareCheck,
};

/** One tap moves a task on: to do → in progress → done. */
function StatusButton({item}: {item: Item}) {
  const doing = item.status === ItemStatus.DOING;
  return (
    <button
      aria-label={`${statusLabel(item.status)}: tap to move “${item.title}” on`}
      className="flex h-14 w-12 shrink-0 items-center justify-center"
      onClick={() => advanceStatus(item)}
    >
      {isItemDone(item) ? (
        <CircleCheck size={26} className="text-ok" aria-hidden />
      ) : (
        <span
          className={`h-6 w-6 rounded-full border-2 ${doing ? 'border-accent' : 'border-dim'}`}
          style={
            doing
              ? {
                  background:
                    'conic-gradient(var(--color-accent) 0 50%, transparent 50%)',
                }
              : undefined
          }
        />
      )}
    </button>
  );
}

function TaskRow({
  item,
  spent,
  today,
}: {
  item: Item;
  /** Hours of its done sessions. */
  spent: number;
  today: ISODate;
}) {
  const Icon = KIND_ICON[item.kind];
  const done = isItemDone(item);
  return (
    <li className="flex min-h-14 items-center pr-3">
      <StatusButton item={item} />
      <button
        className="flex min-h-14 min-w-0 flex-1 items-center gap-2 py-2 text-left"
        onClick={() => useUi.getState().openItem(item.id)}
      >
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate ${done ? 'text-dim line-through' : 'text-strong'}`}
          >
            {item.title}
          </span>
          <span className="flex items-center gap-1 truncate text-[13px] text-dim">
            {Icon && <Icon size={13} aria-hidden />}
            {kindName(item.kind)}
            {item.dueDate && !done && (
              <span className={URGENCY_CLASS[urgency(item.dueDate, today)]}>
                · <Flag size={12} className="inline" aria-hidden /> due{' '}
                {countdown(item.dueDate, today)}
              </span>
            )}
            {!item.dueDate && item.heldOn && (
              <span>· held {shortDate(item.heldOn)}</span>
            )}
            {item.estimateHours != null && (
              <span className="tabular-nums">
                · {fmtDuration(spent)} of {fmtDuration(item.estimateHours)}
              </span>
            )}
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-dim" aria-hidden />
      </button>
    </li>
  );
}

/** A list's tasks: the open ones, then the done ones folded under "Done · N". */
function Tasks({
  items,
  spent,
  today,
}: {
  items: Item[];
  spent(id: string): number;
  today: ISODate;
}) {
  const [showDone, setShowDone] = useState(false);
  const open = items.filter(i => !isItemDone(i));
  const done = items.filter(isItemDone);
  const row = (i: Item) => (
    <TaskRow key={i.id} item={i} spent={spent(i.id)} today={today} />
  );
  return (
    <ul className="divide-y divide-line">
      {open.map(row)}
      {done.length > 0 && (
        <li>
          <button
            className="flex h-11 w-full items-center gap-2 px-4 text-[14px] text-dim"
            aria-expanded={showDone}
            onClick={() => setShowDone(s => !s)}
          >
            <ChevronDown
              size={16}
              className={showDone ? '' : '-rotate-90'}
              aria-hidden
            />
            Done · {done.length}
          </button>
        </li>
      )}
      {showDone && done.map(row)}
    </ul>
  );
}

/** Adding a task: a title is enough; the rest is behind the options button. */
function AddTask({project}: {project: Project}) {
  const [title, setTitle] = useState('');
  const [more, setMore] = useState(false);
  const [kind, setKind] = useState(ItemKind.TASK);
  const [dueDate, setDueDate] = useState<string | undefined>();
  const [estimate, setEstimate] = useState<number | undefined>();
  const [groupId, setGroupId] = useState('');
  const add = () => {
    if (!title.trim()) return;
    useStore.getState().addItems(project.id, [
      {
        kind,
        title: title.trim(),
        dueDate,
        estimateHours: estimate,
        groupId: groupId || undefined,
      },
    ]);
    setTitle('');
  };
  return (
    <div className="sticky top-0 z-10 border-b border-line bg-bg px-3 py-2">
      <div className="flex gap-2">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          // Not while a word is being composed (phone keyboards, IMEs).
          onKeyDown={e =>
            e.key === 'Enter' && !e.nativeEvent.isComposing && add()
          }
          placeholder="Add a task…"
          aria-label="New task"
          enterKeyHint="done"
          className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-raised px-4 text-[16px] placeholder:text-dim"
        />
        <button
          aria-label="Kind, due date, estimate"
          aria-expanded={more}
          onClick={() => setMore(m => !m)}
          className={`flex h-12 w-11 shrink-0 items-center justify-center rounded-xl border border-line ${more ? 'bg-raised text-accent' : 'text-dim'}`}
        >
          <SlidersHorizontal size={18} aria-hidden />
        </button>
        <button
          aria-label="Add the task"
          onClick={add}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent"
        >
          <Plus size={22} aria-hidden />
        </button>
      </div>
      {more && (
        <div className="mt-2 flex flex-wrap items-center gap-2 [&>*]:h-10">
          <Select
            value={kind}
            onChange={setKind}
            options={KIND_OPTIONS}
            className="w-32"
            ariaLabel="Kind"
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
              className="field h-10 w-14"
            />
            <span className="text-dim">h</span>
          </span>
          {project.groups.length > 0 && (
            <Select
              value={groupId}
              onChange={setGroupId}
              options={groupOptions(project.groups)}
              className="w-36"
              ariaLabel="Group"
            />
          )}
        </div>
      )}
    </div>
  );
}

/** A group's choices: its name, its place, deleting it (its tasks stay). */
function GroupSheet({
  project,
  group,
  onClose,
}: {
  project: Project;
  group: ItemGroup;
  onClose(): void;
}) {
  const index = project.groups.findIndex(g => g.id === group.id);
  const [name, setName] = useState(group.name);
  const rename = () => {
    if (name.trim() && name.trim() !== group.name)
      renameGroup(project.id, group.id, name.trim());
  };
  const action =
    'flex h-12 w-full items-center gap-3 rounded-lg px-2 text-left active:bg-raised disabled:opacity-40';
  return (
    <Sheet title="Group" onClose={onClose}>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        onBlur={rename}
        onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
        aria-label="Group name"
        className="mb-2 h-12 w-full rounded-xl border border-line bg-raised px-4 text-[16px]"
      />
      <div className="-mx-2">
        <button
          className={action}
          disabled={index <= 0}
          onClick={() => moveGroup(project.id, group.id, index - 1)}
        >
          <ArrowUp size={18} className="text-dim" aria-hidden /> Move up
        </button>
        <button
          className={action}
          disabled={index >= project.groups.length - 1}
          onClick={() => moveGroup(project.id, group.id, index + 1)}
        >
          <ArrowDown size={18} className="text-dim" aria-hidden /> Move down
        </button>
        <button
          className={`${action} text-danger`}
          onClick={() => {
            deleteGroup(project.id, group);
            onClose();
          }}
        >
          <Trash2 size={18} aria-hidden /> Delete the group (its tasks stay)
        </button>
      </div>
    </Sheet>
  );
}

function GroupSection({
  project,
  group,
  items,
  spent,
  today,
}: {
  project: Project;
  /** None: the tasks in no group. */
  group?: ItemGroup;
  items: Item[];
  spent(id: string): number;
  today: ISODate;
}) {
  const [sheet, setSheet] = useState(false);
  const collapsed = group ? group.collapsed : project.ungroupedCollapsed;
  const open = items.filter(i => !isItemDone(i)).length;
  return (
    <section aria-label={group?.name ?? 'No group'}>
      <div className="flex h-11 items-center border-y border-line bg-panel">
        <button
          className="flex h-11 min-w-0 flex-1 items-center gap-2 px-4 text-left"
          aria-expanded={!collapsed}
          onClick={() => foldGroup(project.id, group?.id ?? null, !collapsed)}
        >
          <ChevronDown
            size={16}
            className={`shrink-0 text-dim ${collapsed ? '-rotate-90' : ''}`}
            aria-hidden
          />
          <span className="truncate font-semibold text-strong">
            {group?.name ?? 'No group'}
          </span>
          <span className="text-[13px] text-dim tabular-nums">{open} open</span>
        </button>
        {group && (
          <button
            className="flex h-11 w-11 shrink-0 items-center justify-center text-dim"
            aria-label={`Rename, move or delete “${group.name}”`}
            onClick={() => setSheet(true)}
          >
            <Ellipsis size={20} aria-hidden />
          </button>
        )}
      </div>
      {!collapsed && <Tasks items={items} spent={spent} today={today} />}
      {sheet && group && (
        <GroupSheet
          project={project}
          group={group}
          onClose={() => setSheet(false)}
        />
      )}
    </section>
  );
}

/**
 * A project's tasks on a phone. One tap opens a task; its status is a button
 * that moves it on; its kind is a word, its date says "due" or "held", its
 * hours have units; done tasks fold away; adding one needs only a title.
 * Groups fold as on desktop; a task changes group in its card.
 */
export function ProjectTasks({project}: {project: Project}) {
  const today = useToday();
  const allItems = useStore(s => s.data.items);
  const allocations = useStore(s => s.data.allocations);
  const [addingGroup, setAddingGroup] = useState(false);
  const {groups} = project;
  const items = useMemo(
    () =>
      allItems.filter(i => i.projectId === project.id).sort(compareOpenFirst),
    [allItems, project.id],
  );
  const spentById = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of allocations)
      if (a.done)
        m.set(
          a.itemId,
          (m.get(a.itemId) ?? 0) + (a.actualHours ?? a.plannedHours),
        );
    return m;
  }, [allocations]);
  const spent = (id: string) => spentById.get(id) ?? 0;
  const byGroup = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of items) {
      const key = groupIdOf(i, groups);
      m.set(key, [...(m.get(key) ?? []), i]);
    }
    return m;
  }, [items, groups]);
  const ungrouped = byGroup.get('') ?? [];
  const done = items.filter(isItemDone).length;

  return (
    <div className="h-full overflow-y-auto pb-28 text-[15px]">
      <AddTask project={project} />
      <div className="flex h-11 items-center px-4 text-[13px] text-dim">
        <span className="flex-1 tabular-nums">
          {done} of {items.length} done
        </span>
        <button
          className="flex h-11 items-center gap-1.5 text-accent"
          onClick={() => setAddingGroup(a => !a)}
        >
          <FolderPlus size={15} aria-hidden /> group
        </button>
      </div>
      {addingGroup && (
        <NewGroup projectId={project.id} onDone={() => setAddingGroup(false)} />
      )}
      {groups.length === 0 ? (
        <Tasks items={ungrouped} spent={spent} today={today} />
      ) : (
        <>
          {ungrouped.length > 0 && (
            <GroupSection
              project={project}
              items={ungrouped}
              spent={spent}
              today={today}
            />
          )}
          {groups.map(g => (
            <GroupSection
              key={g.id}
              project={project}
              group={g}
              items={byGroup.get(g.id) ?? []}
              spent={spent}
              today={today}
            />
          ))}
        </>
      )}
      {items.length === 0 && (
        <p className="px-4 py-3 text-dim">No tasks yet. Add the first above.</p>
      )}
    </div>
  );
}

function NewGroup({projectId, onDone}: {projectId: string; onDone(): void}) {
  const [name, setName] = useState('');
  const submit = () => {
    if (name.trim()) addGroup(projectId, name.trim());
    onDone();
  };
  return (
    <div className="flex gap-2 px-3 pb-2">
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        placeholder="Group name, e.g. Classes"
        aria-label="New group"
        className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-raised px-4 text-[16px] placeholder:text-dim"
      />
      <button
        className="h-12 rounded-xl border border-line px-4 font-medium text-strong"
        onClick={submit}
      >
        Add
      </button>
    </div>
  );
}
