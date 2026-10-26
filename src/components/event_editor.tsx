import {memo, useCallback, type CSSProperties} from 'react';
import {AlignLeft, Clock, Trash2, X} from 'lucide-react';
import {eventStyle} from '../event_colors';
import {withUndo} from '../toast';
import {formatLong} from '../model/dates';
import {moveStart, toMinutes} from '../model/time';
import type {CalendarEvent} from '../model/types';
import {useLookups} from '../hooks';
import {EventColor} from '../model/types';
import {useStore} from '../store';
import {useUi, type Draft} from '../ui';
import {BufferedInput, BufferedTextarea} from './buffered';
import {DateField} from './date_field';
import {EventColorRow} from './event_color_picker';
import {TaskPicker} from './task_picker';
import {TimeSelect} from './time_select';
import {MoveBar} from './ui/move_bar';

type When = Pick<CalendarEvent, 'date' | 'start' | 'end' | 'allDay'>;

function WhenFieldsImpl({
  value,
  onChange,
  allDayOption = true,
}: {
  value: When;
  onChange(p: Partial<When>): void;
  /** Off for time blocks, which always have a time. */
  allDayOption?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <Clock size={16} className="mt-1.5 shrink-0 text-dim" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <DateField
            value={value.date}
            onChange={d => d && onChange({date: d})}
            variant="ghost"
            format={formatLong}
          />
          {!value.allDay && (
            <>
              <TimeSelect
                value={value.start}
                onChange={s => onChange(moveStart(value, s))}
                variant="ghost"
                className="w-fit"
                ariaLabel="Start time"
              />
              <span className="text-dim">–</span>
              <TimeSelect
                value={value.end}
                after={value.start}
                onChange={e => onChange({end: e})}
                variant="ghost"
                className="w-fit"
                ariaLabel="End time"
              />
            </>
          )}
        </div>
        {allDayOption && (
          <label className="flex w-fit cursor-pointer items-center gap-2 pl-2 text-[12px] text-dim">
            <input
              type="checkbox"
              className="accent-accent"
              checked={!!value.allDay}
              onChange={e => onChange({allDay: e.target.checked})}
            />
            All day
          </label>
        )}
      </div>
    </div>
  );
}

/** Re-renders only when the date or times change (not on every keystroke in the title). */
const WhenFields = memo(
  WhenFieldsImpl,
  (a, b) =>
    a.onChange === b.onChange &&
    a.allDayOption === b.allDayOption &&
    a.value.date === b.value.date &&
    a.value.start === b.value.start &&
    a.value.end === b.value.end &&
    a.value.allDay === b.value.allDay,
);

/**
 * How the draft looks on the calendar: an event in its colour, or in 'task'
 * mode a session of the chosen task (its area's colour, like a planned block).
 */
export function useDraftLook(): {
  title: string;
  style: CSSProperties;
  className: string;
} {
  const draft = useUi(s => s.draft);
  const lookups = useLookups();
  if (draft?.mode !== 'task')
    return {
      title: draft?.title || '(No title)',
      style: eventStyle(draft?.color ?? EventColor.UNSPECIFIED),
      className: '',
    };
  const item = draft.itemId ? lookups.item(draft.itemId) : undefined;
  const color = lookups.color(item);
  return {
    title: item?.title ?? '(Choose a task)',
    style: {
      background: `color-mix(in srgb, ${color} 55%, var(--color-panel))`,
      borderLeftColor: color,
    },
    className: 'border-l-4 text-strong',
  };
}

/** Quick-create card for the draft (ghost) event. */
function patchWhen(p: Partial<When>) {
  useUi.getState().patchDraft(p as Partial<Draft>);
}

export function DraftEditor() {
  const draft = useUi(s => s.draft);
  const {patchDraft, setDraft} = useUi.getState();
  if (!draft) return null;
  const isTask = draft.mode === 'task';
  const save = () => {
    const {date, start, end, allDay, color, itemId} = draft;
    if (isTask) {
      const item = useStore.getState().data.items.find(i => i.id === itemId);
      if (!item) return;
      const hours = (toMinutes(end) - toMinutes(start)) / 60;
      withUndo(`Planned “${item.title}”`, () =>
        useStore.getState().addAllocation(item.id, date, hours, start),
      );
    } else {
      const name = draft.title.trim() || '(No title)';
      const notes = draft.notes.trim() || undefined;
      withUndo(`Created “${name}”`, () =>
        useStore
          .getState()
          .addEvent({date, start, end, allDay, color, title: name, notes}),
      );
    }
    setDraft(null);
  };
  return (
    <div className="w-[448px] max-w-[calc(100vw-24px)] p-3">
      <MoveBar onClose={() => setDraft(null)} />
      {isTask ? (
        <TaskPicker
          itemId={draft.itemId}
          onPick={itemId => patchDraft({itemId})}
          onSave={save}
        />
      ) : (
        <input
          data-autofocus
          value={draft.title}
          placeholder="Add title"
          aria-label="Title"
          onChange={e => patchDraft({title: e.target.value})}
          onKeyDown={e => e.key === 'Enter' && save()}
          className="mb-3 ml-7 w-[calc(100%-1.75rem)] border-b-2 border-x-0 border-t-0 border-line pb-1 text-lg text-strong placeholder:text-dim focus:border-accent"
        />
      )}
      <div
        role="tablist"
        aria-label="What to create"
        className="mb-3 ml-7 flex gap-1"
      >
        {(
          [
            ['event', 'Event'],
            ['task', 'Task'],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            role="tab"
            aria-selected={draft.mode === mode}
            onClick={() =>
              // A time block always has a time.
              patchDraft(mode === 'task' ? {mode, allDay: false} : {mode})
            }
            className={`rounded-md px-3 py-1 text-[13px] font-medium transition-colors ${
              draft.mode === mode
                ? 'bg-accent/20 text-accent'
                : 'text-fg hover:bg-raised'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        <WhenFields value={draft} onChange={patchWhen} allDayOption={!isTask} />
        {!isTask && (
          <>
            <div className="flex gap-3">
              <AlignLeft size={16} className="mt-1.5 shrink-0 text-dim" />
              <textarea
                value={draft.notes}
                placeholder="Add description"
                rows={2}
                onChange={e => patchDraft({notes: e.target.value})}
                className="min-w-0 flex-1 resize-none rounded-md bg-raised px-2 py-1.5 placeholder:text-dim"
              />
            </div>
            <EventColorRow
              value={draft.color}
              onChange={color => patchDraft({color})}
            />
          </>
        )}
      </div>
      <div className="mt-3 flex justify-end">
        <button
          className="btn-primary"
          onClick={save}
          disabled={isTask && !draft.itemId}
        >
          Save
        </button>
      </div>
    </div>
  );
}

/** Floating editor for an existing event; changes apply immediately. */
export function EventEditor({eventId}: {eventId: string}) {
  const event = useStore(s => s.data.events.find(e => e.id === eventId));
  const onWhen = useCallback(
    (p: Partial<When>) => useStore.getState().updateEvent(eventId, p),
    [eventId],
  );
  const close = () => useUi.getState().openEvent(null);
  if (!event) return null;
  const {updateEvent, deleteEvent} = useStore.getState();
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
        <span
          className="mt-2.5 h-3 w-3 shrink-0 rounded"
          style={{background: eventStyle(event.color).background}}
        />
        <BufferedInput
          value={event.title}
          aria-label="Title"
          onCommit={title =>
            updateEvent(event.id, {title: title.trim() || '(No title)'})
          }
          className="min-w-0 flex-1 border-b-2 border-transparent pb-1 text-lg text-strong hover:border-line focus:border-accent"
        />
      </div>
      <div className="space-y-3">
        <WhenFields value={event} onChange={onWhen} />
        <div className="flex gap-3">
          <AlignLeft size={16} className="mt-1.5 shrink-0 text-dim" />
          <BufferedTextarea
            value={event.notes ?? ''}
            placeholder="Add description"
            rows={3}
            onCommit={notes =>
              updateEvent(event.id, {notes: notes.trim() || undefined})
            }
            className="min-w-0 flex-1 resize-none rounded-md bg-raised px-2 py-1.5 placeholder:text-dim"
          />
        </div>
        <EventColorRow
          value={event.color}
          onChange={color =>
            withUndo('Colour changed', () => updateEvent(event.id, {color}), {
              quiet: true,
            })
          }
        />
      </div>
      <p className="mt-3 pl-7 text-[11px] text-dim">
        Local event · syncs with Google Calendar in v2
      </p>
    </div>
  );
}
