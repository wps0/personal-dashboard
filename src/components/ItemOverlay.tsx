import { useMemo, useState, type ReactNode } from 'react';
import { BufferedInput, BufferedTextarea } from './Buffered';
import { HoursInput } from './HoursInput';
import { Markdown } from './Markdown';
import { Modal } from './Modal';
import { countdown, todayISO } from '../model/dates';
import { actualHours, isItemDone, normalizeStatus, plannedHours, STATUS_LABEL, statusesFor, urgency } from '../model/selectors';
import type { Allocation, Item, ItemKind } from '../model/types';
import { fmtH, KINDS, URGENCY_CLASS } from '../format';
import { navigate } from '../router';
import { useStore } from '../store';
import { useUi } from '../ui';

/** Task details: fields, planned sessions, notes. Opened by clicking any task. */
export function ItemOverlay() {
  const id = useUi((s) => s.openItemId);
  const close = useUi((s) => s.openItem);
  const item = useStore((s) => (id ? s.data.items.find((i) => i.id === id) : undefined));
  if (!id || !item) return null;
  return (
    <Modal onClose={() => close(null)} width="max-w-2xl">
      <ItemDetails key={item.id} item={item} onClose={() => close(null)} />
    </Modal>
  );
}

function ItemDetails({ item, onClose }: { item: Item; onClose(): void }) {
  const { updateItem, deleteItem, addAllocation } = useStore.getState();
  const projects = useStore((s) => s.data.projects);
  const areas = useStore((s) => s.data.areas);
  const allAllocs = useStore((s) => s.data.allocations);
  const allocs = useMemo(
    () => allAllocs.filter((a) => a.itemId === item.id).sort((a, b) => (a.date + (a.start ?? '')).localeCompare(b.date + (b.start ?? ''))),
    [allAllocs, item.id],
  );
  const [editingNotes, setEditingNotes] = useState(!item.notes);
  const today = todayISO();
  const set = (patch: Partial<Item>) => updateItem(item.id, patch);
  const project = projects.find((p) => p.id === item.projectId);
  const color = areas.find((a) => a.id === project?.areaId)?.color;

  const planned = plannedHours(allocs);
  const spent = actualHours(allocs);
  const remaining = item.estimateHours != null ? item.estimateHours - spent : undefined;

  return (
    <div className="flex flex-col">
      <header className="flex items-start gap-2 border-b border-line p-3" style={{ borderTop: `3px solid ${color ?? 'transparent'}` }}>
        <div className="min-w-0 flex-1">
          <BufferedInput
            value={item.title}
            onCommit={(title) => title.trim() && set({ title: title.trim() })}
            className={`w-full rounded px-1 text-base font-semibold text-strong hover:bg-raised focus:bg-raised ${isItemDone(item) ? 'line-through decoration-dim' : ''}`}
          />
          <div className="mt-1 flex flex-wrap items-center gap-2 px-1">
            <select
              className="field py-0.5"
              value={item.projectId}
              onChange={(e) => set({ projectId: e.target.value })}
              title="Project"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              className="field py-0.5"
              value={item.kind}
              onChange={(e) => {
                const kind = e.target.value as ItemKind;
                set({ kind, status: normalizeStatus(kind, item.status) });
              }}
            >
              {KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
            <select
              className={`field py-0.5 ${isItemDone(item) ? 'text-ok' : ''}`}
              value={item.status}
              onChange={(e) => set({ status: e.target.value as Item['status'] })}
            >
              {statusesFor(item.kind).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button className="btn-ghost text-base" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-line p-3 sm:grid-cols-4">
        <Field label="due">
          <input type="date" className="field w-full font-mono" value={item.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value || undefined })} />
          {item.dueDate && !isItemDone(item) && (
            <span className={`font-mono text-[11px] ${URGENCY_CLASS[urgency(item.dueDate, today)]}`}>{countdown(item.dueDate, today)}</span>
          )}
        </Field>
        {item.kind === 'lecture' && (
          <Field label="held on">
            <input type="date" className="field w-full font-mono" value={item.heldOn ?? ''} onChange={(e) => set({ heldOn: e.target.value || undefined })} />
          </Field>
        )}
        <Field label="estimate">
          <span className="flex items-center gap-1">
            <HoursInput optional value={item.estimateHours} onChange={(estimateHours) => set({ estimateHours })} className="field w-16" />
            <span className="text-dim">h</span>
          </span>
        </Field>
        <Field label="spent / planned">
          <span className="font-mono">
            {fmtH(spent)} / {fmtH(planned)}
            {remaining != null && <span className={remaining < 0 ? 'text-warn' : 'text-dim'}> · {fmtH(Math.max(0, remaining))} left</span>}
          </span>
        </Field>
      </div>

      <section className="border-b border-line p-3">
        <div className="mb-1 flex items-center">
          <span className="label">sessions</span>
          <button className="btn-ghost ml-auto text-[11px]" onClick={() => addAllocation(item.id, today, 1)}>
            + add session today
          </button>
        </div>
        {allocs.length === 0 ? (
          <p className="text-[12px] text-dim">Not planned yet. Drag it onto a day in the week view, or add a session here.</p>
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
              {allocs.map((a) => (
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
            <button className="btn-ghost ml-auto text-[11px]" onClick={() => setEditingNotes((e) => !e)}>
              {editingNotes ? 'preview' : 'edit'}
            </button>
          )}
        </div>
        {editingNotes ? (
          <BufferedTextarea
            className="field scroll-thin h-36 w-full resize-y font-mono text-[12px]"
            placeholder="Markdown: details, links, where you stopped…"
            value={item.notes ?? ''}
            onCommit={(notes) => set({ notes })}
          />
        ) : (
          <div className="cursor-text rounded p-1 hover:bg-raised" onClick={() => setEditingNotes(true)}>
            <Markdown source={item.notes ?? ''} />
          </div>
        )}
      </section>

      <footer className="flex items-center gap-2 border-t border-line px-3 py-2">
        {!isItemDone(item) && (
          <button className="btn" onClick={() => set({ status: item.kind === 'lecture' ? 'notes' : 'done' })}>
            ✓ mark complete
          </button>
        )}
        {project && (
          <button
            className="btn-ghost"
            onClick={() => {
              onClose();
              navigate({ name: 'projects', id: project.id });
            }}
          >
            open project ↗
          </button>
        )}
        <button
          className="btn-ghost ml-auto hover:text-danger"
          onClick={() => {
            if (confirm(`Delete "${item.title}"${allocs.length ? ' and its planned sessions' : ''}?`)) {
              onClose();
              deleteItem(item.id);
            }
          }}
        >
          delete
        </button>
      </footer>
    </div>
  );
}

function SessionRow({ alloc, today }: { alloc: Allocation; today: string }) {
  const { updateAllocation, toggleAllocation, deleteAllocation } = useStore.getState();
  const missed = !alloc.done && alloc.date < today;
  return (
    <tr className="group">
      <td className="px-1">
        <input type="checkbox" checked={alloc.done} onChange={() => toggleAllocation(alloc.id)} className="accent-ok" />
      </td>
      <td className="px-1">
        <input
          type="date"
          className={`font-mono text-[12px] ${missed ? 'text-danger' : ''}`}
          value={alloc.date}
          onChange={(e) => e.target.value && updateAllocation(alloc.id, { date: e.target.value })}
        />
      </td>
      <td className="px-1">
        <input
          type="time"
          step={900}
          className="font-mono text-[12px]"
          value={alloc.start ?? ''}
          onChange={(e) => updateAllocation(alloc.id, { start: e.target.value || undefined })}
        />
      </td>
      <td className="px-1 text-right">
        <HoursInput value={alloc.plannedHours} onChange={(h) => h && updateAllocation(alloc.id, { plannedHours: h })} className="text-[12px]" />
      </td>
      <td className="px-1 text-right">
        {alloc.done ? (
          <HoursInput value={alloc.actualHours ?? alloc.plannedHours} onChange={(h) => updateAllocation(alloc.id, { actualHours: h })} className="text-[12px] text-ok" />
        ) : (
          <span className="text-dim">–</span>
        )}
      </td>
      <td className="px-1 text-right">
        <button className="invisible text-dim group-hover:visible hover:text-danger" onClick={() => deleteAllocation(alloc.id)} title="Remove session">
          ×
        </button>
      </td>
    </tr>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
