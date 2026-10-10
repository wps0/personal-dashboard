import { useState } from 'react';
import { BufferedInput, BufferedTextarea } from './Buffered';
import { Modal } from './Modal';
import { fromMinutes, toMinutes } from '../model/time';
import type { CalendarEvent } from '../model/types';
import { useStore } from '../store';
import { useUi } from '../ui';

/** Create or edit a calendar event. Drafts are only saved on "create". */
export function EventOverlay() {
  const open = useUi((s) => s.openEvent);
  const setOpen = useUi((s) => s.setOpenEvent);
  const existing = useStore((s) => (open && 'id' in open ? s.data.events.find((e) => e.id === open.id) : undefined));
  if (!open) return null;
  const close = () => setOpen(null);
  return (
    <Modal onClose={close} width="max-w-md">
      {'draft' in open ? <DraftForm draft={open.draft} onClose={close} /> : existing ? <EditForm event={existing} onClose={close} /> : null}
    </Modal>
  );
}

function DraftForm({ draft, onClose }: { draft: Omit<CalendarEvent, 'id'>; onClose(): void }) {
  const addEvent = useStore((s) => s.addEvent);
  const [e, setE] = useState(draft);
  const valid = e.title.trim() !== '' && toMinutes(e.end) > toMinutes(e.start);
  const submit = () => {
    if (!valid) return;
    addEvent({ ...e, title: e.title.trim(), notes: e.notes || undefined });
    onClose();
  };
  return (
    <form
      className="space-y-3 p-3"
      onSubmit={(ev) => {
        ev.preventDefault();
        submit();
      }}
    >
      <input
        autoFocus
        className="field w-full text-base"
        placeholder="Event title"
        value={e.title}
        onChange={(ev) => setE({ ...e, title: ev.target.value })}
      />
      <When value={e} onChange={(patch) => setE({ ...e, ...patch })} />
      <textarea
        className="field h-20 w-full resize-y"
        placeholder="Notes"
        value={e.notes ?? ''}
        onChange={(ev) => setE({ ...e, notes: ev.target.value })}
      />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose}>
          cancel
        </button>
        <button className="btn" disabled={!valid}>
          create
        </button>
      </div>
    </form>
  );
}

function EditForm({ event, onClose }: { event: CalendarEvent; onClose(): void }) {
  const { updateEvent, deleteEvent } = useStore.getState();
  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center gap-2">
        <BufferedInput
          className="field flex-1 text-base"
          value={event.title}
          onCommit={(title) => title.trim() && updateEvent(event.id, { title: title.trim() })}
        />
        <button className="btn-ghost text-base" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <When value={event} onChange={(patch) => updateEvent(event.id, patch)} />
      <BufferedTextarea
        className="field h-24 w-full resize-y"
        placeholder="Notes"
        value={event.notes ?? ''}
        onCommit={(notes) => updateEvent(event.id, { notes: notes || undefined })}
      />
      <div className="flex">
        <span className="text-[11px] text-dim">Local event · syncs with Google Calendar in v2</span>
        <button
          className="btn-ghost ml-auto hover:text-danger"
          onClick={() => {
            deleteEvent(event.id);
            onClose();
          }}
        >
          delete
        </button>
      </div>
    </div>
  );
}

/** Date + start/end; moving the start keeps the duration. */
function When({ value, onChange }: { value: Pick<CalendarEvent, 'date' | 'start' | 'end'>; onChange(p: Partial<CalendarEvent>): void }) {
  const duration = toMinutes(value.end) - toMinutes(value.start);
  return (
    <div className="flex flex-wrap items-center gap-2 font-mono">
      <input type="date" className="field" value={value.date} onChange={(e) => e.target.value && onChange({ date: e.target.value })} />
      <input
        type="time"
        step={900}
        className="field"
        value={value.start}
        onChange={(e) => e.target.value && onChange({ start: e.target.value, end: fromMinutes(toMinutes(e.target.value) + Math.max(duration, 15)) })}
      />
      <span className="text-dim">–</span>
      <input type="time" step={900} className="field" value={value.end} onChange={(e) => e.target.value && onChange({ end: e.target.value })} />
      {duration <= 0 && <span className="text-[11px] text-danger">end must be after start</span>}
    </div>
  );
}
