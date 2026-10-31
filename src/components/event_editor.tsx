import {memo, useCallback, useMemo, useState, type CSSProperties} from 'react';
import {AlignLeft, Clock, Repeat, Trash2, X} from 'lucide-react';
import {eventStyle} from '../event_colors';
import {withUndo} from '../toast';
import {formatLong} from '../model/dates';
import {moveStart, moveStartOvernight, toMinutes} from '../model/time';
import type {CalendarEvent} from '../model/types';
import {useLookups} from '../hooks';
import {EventColor} from '../model/types';
import {useStore} from '../store';
import {useUi, type Draft} from '../ui';
import {BufferedInput, BufferedTextarea} from './buffered';
import {DateField} from './date_field';
import {EventColorRow} from './event_color_picker';
import {addReserved, backToSeries, deleteEvent, editEvent} from '../actions';
import {
  parseKey,
  shownEvent,
  type EventPatch,
  type Scope,
} from '../model/recurrence';
import {isReserved} from '../model/reserved';
import {RepeatSelect} from './repeat_select';
import {Popover, PopoverContent, PopoverTrigger} from './ui/popover';
import {TaskPicker} from './task_picker';
import {TimeSelect} from './time_select';
import {MoveBar} from './ui/move_bar';

type When = Pick<CalendarEvent, 'date' | 'start' | 'end' | 'allDay'>;

function WhenFieldsImpl({
  value,
  onChange,
  allDayOption = true,
  overnight = false,
}: {
  value: When;
  onChange(p: Partial<When>): void;
  /** Off for time blocks, which always have a time. */
  allDayOption?: boolean;
  /** Reserved time may end after midnight: an end before the start. */
  overnight?: boolean;
}) {
  const nextDay = overnight && toMinutes(value.end) <= toMinutes(value.start);
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
                onChange={s =>
                  onChange(
                    (overnight ? moveStartOvernight : moveStart)(value, s),
                  )
                }
                variant="ghost"
                className="w-fit"
                ariaLabel="Start time"
              />
              <span className="text-dim">–</span>
              <TimeSelect
                value={value.end}
                after={overnight ? undefined : value.start}
                onChange={e => onChange({end: e})}
                variant="ghost"
                className="w-fit"
                ariaLabel="End time"
              />
              {nextDay && (
                <span className="text-[12px] text-dim">the next day</span>
              )}
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
    a.overnight === b.overnight &&
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
  if (draft?.mode === 'reserved')
    return {
      title: draft.title || 'Reserved',
      style: {},
      className: 'reserved border border-line text-dim',
    };
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
  const isReserved = draft.mode === 'reserved';
  const save = () => {
    const {date, start, end, allDay, color, itemId} = draft;
    if (isReserved) {
      const {recurrence} = draft;
      addReserved({date, start, end, title: draft.title.trim(), recurrence});
    } else if (isTask) {
      const item = useStore.getState().data.items.find(i => i.id === itemId);
      if (!item) return;
      const hours = (toMinutes(end) - toMinutes(start)) / 60;
      withUndo(`Planned “${item.title}”`, () =>
        useStore.getState().addAllocation(item.id, date, hours, start),
      );
    } else {
      const name = draft.title.trim() || '(No title)';
      const notes = draft.notes.trim() || undefined;
      const {recurrence} = draft;
      withUndo(`Created “${name}”`, () =>
        useStore.getState().addEvent({
          date,
          start,
          end,
          allDay,
          color,
          title: name,
          notes,
          recurrence,
        }),
      );
    }
    setDraft(null);
  };
  const tabs = (
    <div role="tablist" aria-label="What to create" className="mb-3 flex gap-1">
      {(
        [
          ['event', 'Event'],
          ['task', 'Time block'],
          ['reserved', 'Reserved'],
        ] as const
      ).map(([mode, label]) => (
        <button
          key={mode}
          role="tab"
          aria-selected={draft.mode === mode}
          onClick={() =>
            // Time blocks and reserved time always have a time.
            patchDraft(mode === 'event' ? {mode} : {mode, allDay: false})
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
  );
  return (
    <div className="w-[448px] max-w-[calc(100vw-24px)] p-3">
      <MoveBar onClose={() => setDraft(null)} />
      {isTask ? (
        <TaskPicker
          itemId={draft.itemId}
          onPick={itemId => patchDraft({itemId})}
          onSave={save}
        >
          {tabs}
        </TaskPicker>
      ) : (
        <>
          <input
            data-autofocus
            value={draft.title}
            placeholder={isReserved ? 'Label, e.g. Work' : 'Add title'}
            aria-label={isReserved ? 'Label' : 'Title'}
            onChange={e => patchDraft({title: e.target.value})}
            onKeyDown={e => e.key === 'Enter' && save()}
            className="mb-3 ml-7 w-[calc(100%-1.75rem)] border-b-2 border-x-0 border-t-0 border-line pb-1 text-lg text-strong placeholder:text-dim focus:border-accent"
          />
          <div className="ml-7">{tabs}</div>
        </>
      )}
      <div className="space-y-3">
        <WhenFields
          value={draft}
          onChange={patchWhen}
          allDayOption={draft.mode === 'event'}
          overnight={isReserved}
        />
        {!isTask && (
          <div className="flex gap-3">
            <Repeat size={16} className="mt-1.5 shrink-0 text-dim" />
            <RepeatSelect
              value={draft.recurrence}
              date={draft.date}
              onChange={recurrence => patchDraft({recurrence})}
            />
          </div>
        )}
        {isReserved && (
          <p className="pl-7 text-[12px] text-dim">
            Hatched on the calendar; it doesn’t change capacity. An end before
            the start ends the next day (e.g. sleep 23:00–07:00).
          </p>
        )}
        {draft.mode === 'event' && (
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

const SCOPES: [Scope, string][] = [
  ['this', 'This event'],
  ['following', 'This and following'],
  ['all', 'All events'],
];

/**
 * Floating editor for an existing event (`eventId` is the key it's shown
 * as); changes apply immediately. For a repeating event's occurrence, a
 * choice at the top says which occurrences they apply to.
 */
export function EventEditor({eventId}: {eventId: string}) {
  // An occurrence is a new copy each time: selected as the event list.
  const events = useStore(s => s.data.events);
  const event = useMemo(() => shownEvent(events, eventId), [events, eventId]);
  const occurrence = parseKey(eventId).date !== undefined;
  const reserved = !!event && isReserved(event);
  // Changed on its own, and its repeating event is still there.
  const inSeries =
    !!event?.seriesId &&
    event.seriesDate !== undefined &&
    events.some(e => e.id === event.seriesId && e.recurrence);
  const [scope, setScope] = useState<Scope>('this');
  const edit = useCallback(
    (patch: EventPatch, to: Scope = scope) => {
      const key = editEvent(eventId, to, patch);
      if (key !== eventId) useUi.getState().openEvent(key);
    },
    [eventId, scope],
  );
  const onWhen = useCallback((p: Partial<When>) => edit(p), [edit]);
  const close = () => useUi.getState().openEvent(null);
  if (!event) return null;
  const remove = (to: Scope) => {
    close();
    deleteEvent(event, to);
  };
  return (
    <div className="w-[448px] max-w-[calc(100vw-24px)] p-3">
      <div className="mb-1 flex justify-end gap-0.5">
        {occurrence ? (
          <Popover>
            <PopoverTrigger
              className="icon-btn hover:!text-danger"
              aria-label="Delete event"
              title="Delete"
            >
              <Trash2 size={16} />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52 p-1 text-[13px]">
              <div className="label px-2.5 pt-1.5 pb-1">Delete</div>
              {SCOPES.map(([s, label]) => (
                <button
                  key={s}
                  className="flex w-full rounded-md px-2.5 py-1.5 text-left hover:bg-raised hover:text-danger"
                  onClick={() => remove(s)}
                >
                  {label === 'This and following'
                    ? 'This and following events'
                    : label}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        ) : (
          <button
            className="icon-btn hover:!text-danger"
            aria-label="Delete event"
            title="Delete"
            onClick={() => remove('all')}
          >
            <Trash2 size={16} />
          </button>
        )}
        <button className="icon-btn" aria-label="Close" onClick={close}>
          <X size={16} />
        </button>
      </div>
      <div className="mb-3 flex items-start gap-3">
        {reserved ? (
          <span className="reserved mt-2.5 h-3 w-3 shrink-0 rounded border border-line" />
        ) : (
          <span
            className="mt-2.5 h-3 w-3 shrink-0 rounded"
            style={{background: eventStyle(event.color).background}}
          />
        )}
        <BufferedInput
          value={event.title}
          aria-label={reserved ? 'Label' : 'Title'}
          placeholder={reserved ? 'Label, e.g. Work' : undefined}
          onCommit={title =>
            edit({title: title.trim() || (reserved ? '' : '(No title)')})
          }
          className="min-w-0 flex-1 border-b-2 border-transparent pb-1 text-lg text-strong hover:border-line focus:border-accent"
        />
      </div>
      {occurrence && (
        <div
          role="radiogroup"
          aria-label="Changes apply to"
          className="mb-3 ml-7 flex flex-wrap items-center gap-1 text-[12px]"
        >
          <span className="mr-1 text-dim">Changes apply to</span>
          {SCOPES.map(([s, label]) => (
            <button
              key={s}
              role="radio"
              aria-checked={scope === s}
              onClick={() => setScope(s)}
              className={`rounded-md px-2 py-0.5 ${
                scope === s
                  ? 'bg-accent/20 text-accent'
                  : 'text-fg hover:bg-raised'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-3">
        <WhenFields
          value={event}
          onChange={onWhen}
          allDayOption={!reserved}
          overnight={reserved}
        />
        <div className="flex gap-3">
          <Repeat size={16} className="mt-1.5 shrink-0 text-dim" />
          <RepeatSelect
            value={event.recurrence}
            date={event.date}
            // A new rule applies from this occurrence on, or to all of them.
            onChange={recurrence =>
              edit({recurrence}, scope === 'all' ? 'all' : 'following')
            }
          />
        </div>
        <div className="flex gap-3">
          <AlignLeft size={16} className="mt-1.5 shrink-0 text-dim" />
          <BufferedTextarea
            value={event.notes ?? ''}
            placeholder="Add description"
            rows={3}
            onCommit={notes => edit({notes: notes.trim() || undefined})}
            className="min-w-0 flex-1 resize-none rounded-md bg-raised px-2 py-1.5 placeholder:text-dim"
          />
        </div>
        {!reserved && (
          <EventColorRow
            value={event.color}
            onChange={color => edit({color})}
          />
        )}
      </div>
      {inSeries && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 pl-7 text-[12px] text-dim">
          Changed on its own from a repeating event.
          <button
            className="text-accent hover:underline"
            onClick={() => useUi.getState().openEvent(backToSeries(event))}
          >
            Back to the repeating event
          </button>
        </p>
      )}
      <p className="mt-3 pl-7 text-[11px] text-dim">
        {reserved
          ? 'Reserved time: drawn hatched; it doesn’t take capacity.'
          : 'Local event · syncs with Google Calendar in v2'}
      </p>
    </div>
  );
}
