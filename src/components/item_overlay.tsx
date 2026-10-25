import {useMemo, useState, type ReactNode} from 'react';
import {BufferedInput, BufferedTextarea} from './buffered';
import {DateField} from './date_field';
import {StatusSelect} from './status_select';
import {TimeSelect} from './time_select';
import {Select} from './ui/select';
import {Trash2, X} from 'lucide-react';
import {HoursInput} from './hours_input';
import {Markdown} from './markdown';
import {Modal} from './modal';
import {countdown, todayISO} from '../model/dates';
import {
  actualHours,
  groupOf,
  isItemDone,
  plannedHours,
  urgency,
} from '../model/selectors';
import {ItemKind, type Allocation, type Item} from '../model/types';
import {fmtH, groupOptions, KIND_OPTIONS, URGENCY_CLASS} from '../format';
import {navigate} from '../router';
import {useStore} from '../store';
import {useUi} from '../ui';
import {
  completeItem,
  deleteItem as deleteItemAction,
  moveToGroup,
  removeSession,
  toggleSession,
} from '../actions';

/** Task details: fields, planned sessions, notes. Opened by clicking any task. */
export function ItemOverlay() {
  const id = useUi(s => s.openItemId);
  const close = useUi(s => s.openItem);
  const item = useStore(s =>
    id ? s.data.items.find(i => i.id === id) : undefined,
  );
  if (!id || !item) return null;
  return (
    <Modal onClose={() => close(null)} width="max-w-2xl">
      <ItemDetails key={item.id} item={item} onClose={() => close(null)} />
    </Modal>
  );
}

function ItemDetails({item, onClose}: {item: Item; onClose(): void}) {
  const {updateItem, addAllocation} = useStore.getState();
  const projects = useStore(s => s.data.projects);
  const areas = useStore(s => s.data.areas);
  const allAllocs = useStore(s => s.data.allocations);
  const allocs = useMemo(
    () =>
      allAllocs
        .filter(a => a.itemId === item.id)
        .sort((a, b) =>
          (a.date + (a.start ?? '')).localeCompare(b.date + (b.start ?? '')),
        ),
    [allAllocs, item.id],
  );
  const [editingNotes, setEditingNotes] = useState(!item.notes);
  const today = todayISO();
  const set = (patch: Partial<Item>) => updateItem(item.id, patch);
  const project = projects.find(p => p.id === item.projectId);
  const color = areas.find(a => a.id === project?.areaId)?.color;

  const planned = plannedHours(allocs);
  const spent = actualHours(allocs);
  const remaining =
    item.estimateHours != null ? item.estimateHours - spent : undefined;

  return (
    <div className="flex flex-col">
      <header
        className="flex items-start gap-2 border-b border-line p-3"
        style={{borderTop: `3px solid ${color ?? 'transparent'}`}}
      >
        <div className="min-w-0 flex-1">
          <BufferedInput
            value={item.title}
            onCommit={title => title.trim() && set({title: title.trim()})}
            className={`w-full rounded px-1 text-base font-semibold text-strong hover:bg-raised focus:bg-raised ${isItemDone(item) ? 'line-through decoration-dim' : ''}`}
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-2 px-1">
            <Select
              value={item.projectId}
              onChange={projectId => set({projectId, groupId: undefined})}
              options={projects.map(p => ({
                value: p.id,
                label: p.name,
                color: areas.find(a => a.id === p.areaId)?.color,
              }))}
              className="w-48"
              ariaLabel="Project"
            />
            {!!project?.groups.length && (
              <Select
                value={groupOf(item, project.groups)?.id ?? ''}
                onChange={id =>
                  moveToGroup(
                    [item],
                    project.groups.find(g => g.id === id),
                  )
                }
                options={groupOptions(project.groups)}
                className="w-36"
                ariaLabel="Group"
              />
            )}
            <Select
              value={item.kind}
              onChange={kind => set({kind})}
              options={KIND_OPTIONS}
              className="w-32"
              ariaLabel="Kind"
            />
            <StatusSelect
              value={item.status}
              onChange={status => set({status})}
              variant="field"
              className="w-36"
            />
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </header>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-line p-3 sm:grid-cols-[1.3fr_1.3fr_0.8fr_1fr]">
        <Field label="due">
          <DateField
            optional
            value={item.dueDate}
            onChange={dueDate => set({dueDate})}
            placeholder="No due date"
            className="w-full"
          />
          {item.dueDate && !isItemDone(item) && (
            <span
              className={`tabular-nums text-[11px] ${URGENCY_CLASS[urgency(item.dueDate, today)]}`}
            >
              {countdown(item.dueDate, today)}
            </span>
          )}
        </Field>
        {(item.kind === ItemKind.CLASS || item.heldOn) && (
          <Field label="held on">
            <DateField
              optional
              value={item.heldOn}
              onChange={heldOn => set({heldOn})}
              placeholder="Not set"
              className="w-full"
            />
          </Field>
        )}
        <Field label="estimate">
          <span className="flex items-center gap-1">
            <HoursInput
              optional
              value={item.estimateHours}
              onChange={estimateHours => set({estimateHours})}
              className="field w-16"
            />
            <span className="text-dim">h</span>
          </span>
        </Field>
        <Field label="spent / planned">
          <span className="tabular-nums">
            {fmtH(spent)} / {fmtH(planned)}
            {remaining != null && (
              <span className={remaining < 0 ? 'text-warn' : 'text-dim'}>
                {' '}
                · {fmtH(Math.max(0, remaining))} left
              </span>
            )}
          </span>
        </Field>
      </div>

      <section className="border-b border-line p-3">
        <div className="mb-1 flex items-center">
          <span className="label">sessions</span>
          <button
            className="btn-ghost ml-auto text-[11px]"
            onClick={() => addAllocation(item.id, today, 1)}
          >
            + add session today
          </button>
        </div>
        {allocs.length === 0 ? (
          <p className="text-[12px] text-dim">
            Not planned yet. Drag it onto a day in the week view, or add a
            session here.
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="label text-left [&>th]:px-1 [&>th]:font-normal">
                <th className="w-6" />
                <th>date</th>
                <th>start</th>
                <th className="text-right">plan</th>
                <th className="text-right">actual</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {allocs.map(a => (
                <SessionRow key={a.id} alloc={a} today={today} />
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="p-3">
        <div className="mb-1 flex items-center">
          <span className="label">notes</span>
          {item.notes && (
            <button
              className="btn-ghost ml-auto text-[11px]"
              onClick={() => setEditingNotes(e => !e)}
            >
              {editingNotes ? 'preview' : 'edit'}
            </button>
          )}
        </div>
        {editingNotes ? (
          <BufferedTextarea
            className="field scroll-thin h-36 w-full resize-y tabular-nums text-[12px]"
            placeholder="Markdown: details, links, where you stopped…"
            value={item.notes ?? ''}
            onCommit={notes => set({notes})}
          />
        ) : (
          <div
            className="cursor-text rounded p-1 hover:bg-raised"
            onClick={() => setEditingNotes(true)}
          >
            <Markdown source={item.notes ?? ''} />
          </div>
        )}
      </section>

      <footer className="flex items-center gap-2 border-t border-line px-3 py-2">
        {!isItemDone(item) && (
          <button className="btn" onClick={() => completeItem(item)}>
            ✓ mark complete
          </button>
        )}
        {project && (
          <button
            className="btn-ghost"
            onClick={() => {
              onClose();
              navigate({name: 'projects', id: project.id});
            }}
          >
            open project ↗
          </button>
        )}
        <button
          className="btn-ghost ml-auto hover:text-danger"
          onClick={() => {
            {
              onClose();
              deleteItemAction(item);
            }
          }}
        >
          delete
        </button>
      </footer>
    </div>
  );
}

function SessionRow({alloc, today}: {alloc: Allocation; today: string}) {
  const {updateAllocation} = useStore.getState();
  const missed = !alloc.done && alloc.date < today;
  return (
    <tr className="group">
      <td className="px-1">
        <input
          type="checkbox"
          checked={alloc.done}
          onChange={() => toggleSession(alloc.id)}
          className="accent-ok"
        />
      </td>
      <td className="px-1">
        <DateField
          value={alloc.date}
          onChange={date => date && updateAllocation(alloc.id, {date})}
          variant="ghost"
          className={missed ? 'text-danger' : ''}
        />
      </td>
      <td className="px-1">
        <span className="flex items-center">
          <TimeSelect
            value={alloc.start ?? '--:--'}
            onChange={start =>
              start !== '--:--' && updateAllocation(alloc.id, {start})
            }
            variant="ghost"
            className="w-20"
            ariaLabel="Start time"
          />
          {alloc.start && (
            <button
              className="icon-btn h-6 w-6"
              aria-label="Clear start time"
              onClick={() => updateAllocation(alloc.id, {start: undefined})}
            >
              <X size={12} />
            </button>
          )}
        </span>
      </td>
      <td className="px-1 text-right">
        <HoursInput
          value={alloc.plannedHours}
          onChange={h => h && updateAllocation(alloc.id, {plannedHours: h})}
          className="text-[12px]"
        />
      </td>
      <td className="px-1 text-right">
        {alloc.done ? (
          <HoursInput
            value={alloc.actualHours ?? alloc.plannedHours}
            onChange={h => updateAllocation(alloc.id, {actualHours: h})}
            className="text-[12px] text-ok"
          />
        ) : (
          <span className="text-dim">–</span>
        )}
      </td>
      <td className="px-1 text-right">
        <button
          className="icon-btn invisible h-6 w-6 group-hover:visible hover:!text-danger"
          onClick={() => removeSession(alloc.id, 'Session removed')}
          title="Remove session"
        >
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  );
}

function Field({label, children}: {label: string; children: ReactNode}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
