import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  AlignLeft,
  Clock,
  FolderKanban,
  Pencil,
  Repeat,
  Trash2,
  X,
} from 'lucide-react';
import {ALL_DAY_TASK_SESSION_HOURS} from '../config';
import {eventStyle} from '../event_colors';
import {withUndo} from '../toast';
import {formatLong, shortDate} from '../model/dates';
import {
  endMinutes,
  moveStart,
  moveStartOvernight,
  showEnd,
  toMinutes,
} from '../model/time';
import type {CalendarEvent} from '../model/types';
import {useLookups} from '../hooks';
import {EventColor, ItemKind} from '../model/types';
import {useStore} from '../store';
import {DRAFT_MODES, useUi, type Draft, type DraftMode} from '../ui';
import {BufferedInput, BufferedTextarea} from './buffered';
import {DateField} from './date_field';
import {EventColorRow} from './event_color_picker';
import {
  addReserved,
  addSessionFor,
  backToSeries,
  canBeSession,
  deleteEvent,
  editEvent,
  eventToSession,
  eventToTask,
  setEventKind,
} from '../actions';
import * as pb from '../gen/dashboard/data_pb';
import {
  describeRecurrence,
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
import {Select} from './ui/select';
import {fmtH, KIND_OPTIONS} from '../format';
import {unreachable} from '../unreachable';

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
 * How the draft looks on the calendar: an event in its colour, reserved time
 * hatched, or a task's time in its area's colour, like a planned block.
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
  if (draft?.mode !== 'block' && draft?.mode !== 'task')
    return {
      title: draft?.title || '(No title)',
      style: eventStyle(draft?.color ?? EventColor.UNSPECIFIED),
      className: '',
    };
  const item = draft.itemId ? lookups.item(draft.itemId) : undefined;
  const color = lookups.color(
    draft.mode === 'task' && draft.projectId
      ? {projectId: draft.projectId}
      : item,
  );
  return {
    title:
      draft.mode === 'task'
        ? draft.title || '(No title)'
        : (item?.title ?? '(Choose a task)'),
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

/** The project a new task went in last, offered for the next one. */
let lastTaskProject: string | undefined;

/** Starts a draft in `mode`, with what that mode needs. */
function switchMode(draft: Draft, mode: DraftMode): Partial<Draft> {
  const p: Partial<Draft> = {mode};
  // Time blocks and reserved time always have a time.
  if (!DRAFT_MODES[mode].allDay) p.allDay = false;
  if (mode === 'task' && !draft.projectId) {
    const open = useStore.getState().data.projects.filter(x => !x.archived);
    p.projectId = open.some(x => x.id === lastTaskProject)
      ? lastTaskProject
      : open[0]?.id;
  }
  return p;
}

/** Creates what the draft describes; false if something is missing. */
function saveDraft(draft: Draft): boolean {
  const {date, start, end, allDay} = draft;
  const store = useStore.getState();
  const hours = (toMinutes(end) - toMinutes(start)) / 60;
  switch (draft.mode) {
    case 'reserved': {
      const {recurrence} = draft;
      addReserved({date, start, end, title: draft.title.trim(), recurrence});
      return true;
    }
    case 'block': {
      const item = store.data.items.find(i => i.id === draft.itemId);
      if (!item) return false;
      withUndo(`Planned “${item.title}”`, () =>
        addSessionFor(item, date, hours, start),
      );
      return true;
    }
    case 'task': {
      const {projectId} = draft;
      if (!projectId) return false;
      const title = draft.title.trim() || 'Untitled';
      lastTaskProject = projectId;
      withUndo(`Created “${title}”`, () => {
        // No due date: the day is when it's planned, not when it's due.
        const [id] = store.addItems(projectId, [
          {
            kind: draft.itemKind ?? ItemKind.TASK,
            title,
            estimateHours: allDay ? undefined : hours,
            notes: draft.notes.trim() || undefined,
          },
        ]);
        if (allDay) store.addAllocation(id, date, ALL_DAY_TASK_SESSION_HOURS);
        else store.addAllocation(id, date, hours, start);
      });
      return true;
    }
    case 'event': {
      const name = draft.title.trim() || '(No title)';
      const notes = draft.notes.trim() || undefined;
      const {color, recurrence} = draft;
      withUndo(`Created “${name}”`, () =>
        store.addEvent({
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
      return true;
    }
    default:
      return unreachable(draft.mode);
  }
}

export function DraftEditor() {
  const draft = useUi(s => s.draft);
  const projects = useStore(s => s.data.projects);
  const areas = useStore(s => s.data.areas);
  const {patchDraft, setDraft} = useUi.getState();
  if (!draft) return null;
  const mode = DRAFT_MODES[draft.mode];
  const isBlock = draft.mode === 'block';
  const isReserved = draft.mode === 'reserved';
  const isTask = draft.mode === 'task';
  const save = () => {
    if (saveDraft(draft)) setDraft(null);
  };
  const tabs = (
    <div role="tablist" aria-label="What to create" className="mb-3 flex gap-1">
      {(Object.keys(DRAFT_MODES) as DraftMode[]).map(m => (
        <button
          key={m}
          role="tab"
          aria-selected={draft.mode === m}
          onClick={() => patchDraft(switchMode(draft, m))}
          className={`rounded-md px-3 py-1 text-[13px] font-medium transition-colors ${
            draft.mode === m
              ? 'bg-accent/20 text-accent'
              : 'text-fg hover:bg-raised'
          }`}
        >
          {DRAFT_MODES[m].label}
        </button>
      ))}
    </div>
  );
  const openProjects = projects.filter(p => !p.archived);
  return (
    <div className="w-[448px] max-w-[calc(100vw-24px)] p-3">
      <MoveBar onClose={() => setDraft(null)} />
      {isBlock ? (
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
          allDayOption={mode.allDay}
          overnight={isReserved}
        />
        {isTask && (
          <>
            <p className="pl-7 text-[12px] text-dim">
              {draft.allDay
                ? `Planned for ${shortDate(draft.date)}, without a time (${fmtH(ALL_DAY_TASK_SESSION_HOURS)}).`
                : `${draft.start}–${showEnd(draft.end)} on ${shortDate(draft.date)} planned for it (${fmtH(
                    (endMinutes(draft.end) - toMinutes(draft.start)) / 60,
                  )}).`}{' '}
              No due date.
            </p>
            <div className="flex items-center gap-3">
              <FolderKanban size={16} className="shrink-0 text-dim" />
              {openProjects.length ? (
                <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                  <Select
                    value={draft.projectId ?? ''}
                    onChange={projectId => patchDraft({projectId})}
                    options={openProjects.map(p => ({
                      value: p.id,
                      label: p.name,
                      color: areas.find(a => a.id === p.areaId)?.color,
                    }))}
                    className="w-52"
                    ariaLabel="Project"
                  />
                  <Select
                    value={draft.itemKind ?? ItemKind.TASK}
                    onChange={itemKind => patchDraft({itemKind})}
                    options={KIND_OPTIONS}
                    className="w-32"
                    ariaLabel="Kind"
                  />
                </div>
              ) : (
                <span className="text-[12px] text-dim">
                  Add a project first (Projects page).
                </span>
              )}
            </div>
          </>
        )}
        {mode.repeats && (
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
        {(draft.mode === 'event' || isTask) && (
          <div className="flex gap-3">
            <AlignLeft size={16} className="mt-1.5 shrink-0 text-dim" />
            <textarea
              value={draft.notes}
              placeholder={isTask ? 'Add notes' : 'Add description'}
              rows={2}
              onChange={e => patchDraft({notes: e.target.value})}
              className="min-w-0 flex-1 resize-none rounded-md bg-raised px-2 py-1.5 placeholder:text-dim"
            />
          </div>
        )}
        {draft.mode === 'event' && (
          <EventColorRow
            value={draft.color}
            onChange={color => patchDraft({color})}
          />
        )}
      </div>
      <div className="mt-3 flex justify-end">
        <button
          className="btn-primary"
          onClick={save}
          disabled={(isBlock && !draft.itemId) || (isTask && !draft.projectId)}
        >
          Save
        </button>
      </div>
    </div>
  );
}

/** What a calendar entry can be: an existing event's card offers the same as the create card. */
type EntryType = 'event' | 'block' | 'task' | 'reserved';
const ENTRY_TYPES: EntryType[] = ['event', 'block', 'task', 'reserved'];

/** Why the event shown as `e` can't become `t`; undefined if it can. */
function cantBecome(e: CalendarEvent, t: EntryType): string | undefined {
  if ((t === 'reserved' || t === 'block') && e.allDay)
    return `${t === 'reserved' ? 'Reserved time' : 'A time block'} needs a time: set one first.`;
  if ((t === 'block' || t === 'task') && !canBeSession(e))
    return 'It runs past midnight, so it can’t be planned time.';
  return undefined;
}

/** The project to offer for a new task: the last one used, else the first open one. */
function defaultProject(): string | undefined {
  const open = useStore.getState().data.projects.filter(x => !x.archived);
  return open.some(x => x.id === lastTaskProject)
    ? lastTaskProject
    : open[0]?.id;
}

/**
 * Turning an event into a task (a new one, in a project) or into time for an
 * existing task. Only that day's occurrence of a repeating event changes.
 */
function ConvertPanel({
  event,
  to,
  occurrence,
  onCancel,
  onDone,
}: {
  event: CalendarEvent;
  to: 'task' | 'block';
  occurrence: boolean;
  onCancel(): void;
  onDone(): void;
}) {
  const projects = useStore(s => s.data.projects);
  const areas = useStore(s => s.data.areas);
  const [projectId, setProjectId] = useState(defaultProject);
  const [kind, setKind] = useState(ItemKind.TASK);
  const [itemId, setItemId] = useState<string>();
  const open = projects.filter(p => !p.archived);
  const when = event.allDay
    ? `on ${shortDate(event.date)}, without a time`
    : `${event.start}–${showEnd(event.end)} on ${shortDate(event.date)}`;
  const rest = occurrence
    ? ' Only this day’s event changes; the others keep repeating.'
    : '';
  const convert = () => {
    if (to === 'task') {
      if (!projectId) return;
      lastTaskProject = projectId;
      eventToTask(event, projectId, kind);
    } else {
      if (!itemId) return;
      eventToSession(event, itemId);
    }
    onDone();
  };
  const buttons = (
    <div className="mt-2 flex justify-end gap-2">
      <button className="btn" onClick={onCancel}>
        Cancel
      </button>
      <button
        className="btn-primary"
        disabled={to === 'task' ? !projectId : !itemId}
        onClick={convert}
      >
        {to === 'task' ? 'Make it a task' : 'Plan it for this task'}
      </button>
    </div>
  );
  if (to === 'block')
    return (
      <div className="ml-7 rounded-lg border border-accent/40 bg-accent/5 p-2.5">
        <TaskPicker itemId={itemId} onPick={setItemId} onSave={convert}>
          <p className="mb-2 text-[12px] text-dim">
            Time for the task you pick, {when}; the event goes.{rest}
          </p>
        </TaskPicker>
        {buttons}
      </div>
    );
  return (
    <div className="ml-7 rounded-lg border border-accent/40 bg-accent/5 p-2.5">
      {open.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <FolderKanban size={16} className="shrink-0 text-dim" />
          <Select
            value={projectId ?? ''}
            onChange={setProjectId}
            options={open.map(p => ({
              value: p.id,
              label: p.name,
              color: areas.find(a => a.id === p.areaId)?.color,
            }))}
            className="w-52 max-w-full"
            ariaLabel="Project"
          />
          <Select
            value={kind}
            onChange={setKind}
            options={KIND_OPTIONS}
            className="w-32"
            ariaLabel="Kind"
          />
        </div>
      ) : (
        <p className="text-[12px] text-dim">
          Add a project first (Projects page).
        </p>
      )}
      <p className="mt-2 text-[12px] text-dim">
        A new task with its title and description, planned {when}; the event
        goes.{rest}
      </p>
      {buttons}
    </div>
  );
}

/** An event's colour, or reserved time's hatching, beside its title. */
function Swatch({event, reserved}: {event: CalendarEvent; reserved: boolean}) {
  return reserved ? (
    <span className="reserved mt-2.5 h-3 w-3 shrink-0 rounded border border-line" />
  ) : (
    <span
      className="mt-2.5 h-3 w-3 shrink-0 rounded"
      style={{background: eventStyle(event.color).background}}
    />
  );
}

/**
 * The card as it opens, read-only like Google Calendar's: the title, when,
 * how it repeats and the description. ✎ makes it editable.
 */
function EventView({
  event,
  reserved,
}: {
  event: CalendarEvent;
  reserved: boolean;
}) {
  const overnight =
    !event.allDay && endMinutes(event.end) <= toMinutes(event.start);
  const when = event.allDay
    ? formatLong(event.date)
    : `${formatLong(event.date)} · ${event.start} – ${showEnd(event.end)}${overnight ? ' (the next day)' : ''}`;
  return (
    <>
      <div className="mb-3 flex items-start gap-3">
        <Swatch event={event} reserved={reserved} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg leading-snug break-words text-strong">
            {event.title || (reserved ? 'Reserved' : '(No title)')}
          </h2>
          <p className="mt-0.5 text-[13px] text-fg">{when}</p>
          {event.recurrence && (
            <p className="text-[12px] text-dim">
              {describeRecurrence(event.recurrence, event.date)}
            </p>
          )}
        </div>
      </div>
      {event.notes && (
        <div className="mb-1 flex gap-3">
          <AlignLeft size={16} className="mt-0.5 shrink-0 text-dim" />
          <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">
            {event.notes}
          </p>
        </div>
      )}
    </>
  );
}

const SCOPES: [Scope, string][] = [
  ['this', 'This event'],
  ['following', 'This and following'],
  ['all', 'All events'],
];

/**
 * The card of an existing event (`eventId` is the key it's shown as). It
 * opens read-only; ✎ (or e) makes it editable, and changes then apply
 * immediately. For a repeating event's occurrence, a choice at the top says
 * which occurrences they apply to.
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
  // Turning it into a task or a time block, once confirmed in the panel.
  const [converting, setConverting] = useState<'task' | 'block' | null>(null);
  const [typeNote, setTypeNote] = useState('');
  const editing = useUi(s => s.editingEvent);
  const setEditing = (on: boolean) => {
    started.current = true;
    useUi.getState().openEvent(eventId, on);
  };
  // Set by ✎ and Done, which move the focus; a card reopened in editing (an
  // occurrence's new key) leaves the focus alone.
  const started = useRef(false);
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!started.current) return;
    started.current = false;
    // Into the title on ✎; back on ✎ after Done, so e edits again.
    card.current
      ?.querySelector<HTMLElement>(
        editing
          ? 'input[aria-label="Title"], input[aria-label="Label"]'
          : 'button[aria-label="Edit event"]',
      )
      ?.focus();
  }, [editing]);
  const edit = useCallback(
    (patch: EventPatch, to: Scope = scope) => {
      const key = editEvent(eventId, to, patch);
      if (key !== eventId) useUi.getState().openEvent(key, true);
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
  const current: EntryType = converting ?? (reserved ? 'reserved' : 'event');
  const pickType = (t: EntryType) => {
    const why = cantBecome(event, t);
    setTypeNote(why ?? '');
    if (why || t === current) return;
    if (t === 'task' || t === 'block') {
      setConverting(t);
      return;
    }
    setConverting(null);
    const key = setEventKind(
      eventId,
      scope,
      t === 'reserved' ? pb.EventKind.RESERVED : pb.EventKind.UNSPECIFIED,
    );
    if (key !== eventId) useUi.getState().openEvent(key, true);
  };
  return (
    <div
      ref={card}
      className="w-[448px] max-w-[calc(100vw-24px)] p-3"
      onKeyDown={e => {
        // e edits, as in Google Calendar; not while typing somewhere.
        if (
          !editing &&
          e.key === 'e' &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey &&
          !(e.target instanceof HTMLInputElement) &&
          !(e.target instanceof HTMLTextAreaElement)
        ) {
          e.preventDefault();
          setEditing(true);
        }
      }}
    >
      <div className="mb-1 flex items-center justify-end gap-0.5">
        {editing ? (
          <button
            className="btn mr-1 h-7 px-3"
            onClick={() => setEditing(false)}
          >
            Done
          </button>
        ) : (
          <button
            className="icon-btn pointer-coarse:h-11 pointer-coarse:w-11"
            aria-label="Edit event"
            title="Edit (e)"
            onClick={() => setEditing(true)}
          >
            <Pencil size={16} />
          </button>
        )}
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
      {!editing ? (
        <EventView event={event} reserved={reserved} />
      ) : (
        <>
          <div className="mb-3 flex items-start gap-3">
            <Swatch event={event} reserved={reserved} />
            <BufferedInput
              value={event.title}
              aria-label={reserved ? 'Label' : 'Title'}
              placeholder={reserved ? 'Label, e.g. Work' : undefined}
              onCommit={title =>
                edit({title: title.trim() || (reserved ? '' : '(No title)')})
              }
              className="min-w-0 flex-1 border-b-2 border-transparent pb-1 text-lg text-strong hover:border-line focus:border-accent pointer-coarse:border-line"
            />
          </div>
          <div
            role="tablist"
            aria-label="Type"
            className="mb-3 ml-7 flex flex-wrap gap-1"
          >
            {ENTRY_TYPES.map(t => (
              <button
                key={t}
                role="tab"
                aria-selected={current === t}
                onClick={() => pickType(t)}
                className={`rounded-md px-3 py-1 text-[13px] font-medium transition-colors pointer-coarse:h-11 ${
                  current === t
                    ? 'bg-accent/20 text-accent'
                    : cantBecome(event, t)
                      ? 'text-dim'
                      : 'text-fg hover:bg-raised'
                }`}
              >
                {DRAFT_MODES[t].label}
              </button>
            ))}
          </div>
          {typeNote && (
            <p role="status" className="-mt-2 mb-3 ml-7 text-[12px] text-warn">
              {typeNote}
            </p>
          )}
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
            {converting ? (
              <ConvertPanel
                // A new panel for each kind of change, with fresh choices.
                key={converting}
                event={event}
                to={converting}
                occurrence={occurrence}
                onCancel={() => setConverting(null)}
                onDone={close}
              />
            ) : (
              <>
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
              </>
            )}
          </div>
        </>
      )}
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
          ? 'Reserved time: drawn hatched; it takes capacity, like an event.'
          : 'Local event · kept in this app, not in Google Calendar'}
      </p>
    </div>
  );
}
