import { AlignLeft, Clock, Trash2, X } from 'lucide-react';
import { withUndo } from '../toast';
import { formatLong } from '../model/dates';
import { fromMinutes, toMinutes } from '../model/time';
import type { CalendarEvent, ISODate } from '../model/types';
import { useStore } from '../store';
import { useUi, type Draft } from '../ui';
import { BufferedInput, BufferedTextarea } from './Buffered';
import { DateField } from './DateField';
import { TimeSelect } from './TimeSelect';

type When = Pick<CalendarEvent, 'date' | 'start' | 'end' | 'allDay'>;

/** Moving the start keeps the duration, like Google Calendar. */
function moveStart(w: When, start: string): Partial<When> {
  const len = Math.max(15, toMinutes(w.end) - toMinutes(w.start));
  return { start, end: fromMinutes(Math.min(toMinutes(start) + len, 24 * 60 - 1)) };
}

function WhenFields({ value, onChange }: { value: When; onChange(p: Partial<When>): void }) {
  return (
    <div className="flex gap-3">
      <Clock size={16} className="mt-1.5 shrink-0 text-dim" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <DateField value={value.date} onChange={(d) => d && onChange({ date: d })} variant="ghost" format={formatLong} />
          {!value.allDay && (
            <>
              <TimeSelect value={value.start} onChange={(s) => onChange(moveStart(value, s))} variant="ghost" className="w-[4.5rem]" ariaLabel="Start time" />
              <span className="text-dim">–</span>
              <TimeSelect value={value.end} after={value.start} onChange={(e) => onChange({ end: e })} variant="ghost" className="w-[4.5rem]" ariaLabel="End time" />
            </>
          )}
        </div>
        <label className="flex w-fit cursor-pointer items-center gap-2 pl-2 text-[12px] text-dim">
          <input type="checkbox" className="accent-accent" checked={!!value.allDay} onChange={(e) => onChange({ allDay: e.target.checked })} />
          All day
        </label>
      </div>
    </div>
  );
}

/** Quick-create card for the draft (ghost) event. */
export function DraftEditor() {
  const draft = useUi((s) => s.draft);
  const { patchDraft, setDraft } = useUi.getState();
  if (!draft) return null;
  const save = () => {
    const { title, notes, ...when } = draft;
    const name = title.trim() || '(No title)';
    withUndo(`Created “${name}”`, () => useStore.getState().addEvent({ ...when, title: name, notes: notes.trim() || undefined }));
    setDraft(null);
  };
  return (
    <div className="w-[448px] max-w-[calc(100vw-24px)] p-3">
      <div className="mb-1 flex justify-end">
        <button className="icon-btn" aria-label="Close" onClick={() => setDraft(null)}>
          <X size={16} />
        </button>
      </div>
      <input
        data-autofocus
        value={draft.title}
        placeholder="Add title"
        aria-label="Title"
        onChange={(e) => patchDraft({ title: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        className="mb-3 ml-7 w-[calc(100%-1.75rem)] border-b-2 border-x-0 border-t-0 border-line pb-1 text-lg text-strong placeholder:text-dim focus:border-accent"
      />
      <div className="space-y-3">
        <WhenFields value={draft} onChange={(p) => patchDraft(p as Partial<Draft>)} />
        <div className="flex gap-3">
          <AlignLeft size={16} className="mt-1.5 shrink-0 text-dim" />
          <textarea
            value={draft.notes}
            placeholder="Add description"
            rows={2}
            onChange={(e) => patchDraft({ notes: e.target.value })}
            className="min-w-0 flex-1 resize-none rounded-md bg-raised px-2 py-1.5 placeholder:text-dim"
          />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button className="btn-primary" onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}

/** Floating editor for an existing event; changes apply immediately. */
export function EventEditor({ eventId }: { eventId: string }) {
  const event = useStore((s) => s.data.events.find((e) => e.id === eventId));
  const close = () => useUi.getState().openEvent(null);
  if (!event) return null;
  const { updateEvent, deleteEvent } = useStore.getState();
  return (
    <div className="w-[448px] max-w-[calc(100vw-24px)] p-3">
      <div className="mb-1 flex justify-end gap-0.5">
        <button
          className="icon-btn hover:!text-danger"
          aria-label="Delete event"
          title="Delete"
          onClick={() => {
            close();
            withUndo(`Deleted “${event.title}”`, () => deleteEvent(event.id));
          }}
        >
          <Trash2 size={16} />
        </button>
        <button className="icon-btn" aria-label="Close" onClick={close}>
          <X size={16} />
        </button>
      </div>
      <div className="mb-3 flex items-start gap-3">
        <span className="mt-2.5 h-3 w-3 shrink-0 rounded" style={{ background: 'var(--color-event)' }} />
        <BufferedInput
          value={event.title}
          aria-label="Title"
          onCommit={(title) => updateEvent(event.id, { title: title.trim() || '(No title)' })}
          className="min-w-0 flex-1 border-b-2 border-transparent pb-1 text-lg text-strong hover:border-line focus:border-accent"
        />
      </div>
      <div className="space-y-3">
        <WhenFields value={event} onChange={(p) => updateEvent(event.id, p)} />
        <div className="flex gap-3">
          <AlignLeft size={16} className="mt-1.5 shrink-0 text-dim" />
          <BufferedTextarea
            value={event.notes ?? ''}
            placeholder="Add description"
            rows={3}
            onCommit={(notes) => updateEvent(event.id, { notes: notes.trim() || undefined })}
            className="min-w-0 flex-1 resize-none rounded-md bg-raised px-2 py-1.5 placeholder:text-dim"
          />
        </div>
      </div>
      <p className="mt-3 pl-7 text-[11px] text-dim">Local event · syncs with Google Calendar in v2</p>
    </div>
  );
}

/** A draft for a click at `start` minutes on `date` (GCal: 1 h block on the half hour). */
export function draftAt(date: ISODate, start: number, end?: number, allDay = false): Draft {
  return { date, start: fromMinutes(start), end: fromMinutes(end ?? start + 60), allDay, title: '', notes: '' };
}
