import {ChevronLeft, ChevronRight, Flag, Plus} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {DraftEditor, EventEditor} from '../components/event_editor';
import {WithCard} from '../components/google_event';
import {
  CapacityLine,
  LIST,
  relativeDay,
  SectionTitle,
} from '../components/phone/parts';
import {SessionRow, ToPlanRow} from '../components/phone/rows';
import {SignInPrompt} from '../components/signin_prompt';
import {Popover, PopoverAnchor, PopoverContent} from '../components/ui/popover';
import {UsosBanner} from '../components/usos_review';
import {WorkCard} from '../components/work_card';
import {TODAY_TO_PLAN_ROWS} from '../config';
import {eventStyle} from '../event_colors';
import {useGoogleEvents} from '../google/use_google_events';
import {useCapacities, useLookups, useToday, useWeekStart} from '../hooks';
import {useNavTarget} from '../keyboard';
import {dayAgenda, nowPosition, type AgendaEntry} from '../model/agenda';
import {plannedInWindow} from '../model/capacity';
import {
  addDays,
  dayName,
  formatLong,
  isISODate,
  startOfWeek,
} from '../model/dates';
import {isReserved} from '../model/reserved';
import {
  backlogItems,
  dueByDay,
  isItemDone,
  missedAllocations,
} from '../model/selectors';
import {fromMinutes} from '../model/time';
import type {ISODate} from '../model/types';
import {usePhoneNav} from '../nav';
import {href, navigate} from '../router';
import {useStore} from '../store';
import {useLastStep} from '../toast';
import {nextHourDraft, useUi} from '../ui';

function go(d: ISODate, today: ISODate) {
  navigate({name: 'home', date: d === today ? undefined : d});
}

/** Minutes after midnight, now; kept up to date each minute. */
function useNowMinutes(): number {
  const read = () => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  };
  const [now, setNow] = useState(read);
  useEffect(() => {
    const t = window.setInterval(() => setNow(read()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

/**
 * Home on a phone: the day as an agenda. What's on at a set time, in order,
 * with a line for now; what's planned for any time; what's due; and the
 * tasks that still need time, each with Plan. The grid of hours stays on the
 * Calendar tab: three narrow columns told little and were hard to tap.
 */
export function TodayView({date}: {date?: ISODate}) {
  const today = useToday();
  const day = date && isISODate(date) ? date : today;
  const isToday = day === today;
  const weekStart = useWeekStart();
  const lookups = useLookups();
  const hidden = useUi(s => s.hidden);
  const allEvents = useStore(s => s.data.events);
  const allAllocations = useStore(s => s.data.allocations);
  const items = useStore(s => s.data.items);
  const projects = useStore(s => s.data.projects);
  const days = useMemo(() => [day], [day]);
  const google = useGoogleEvents(days).get(day);
  const capacity = useCapacities(days).get(day)!;
  const now = useNowMinutes();

  // As on the calendar: without the layers hidden in its sidebar.
  const allocations = useMemo(
    () =>
      allAllocations.filter(a => {
        const item = lookups.item(a.itemId);
        const area = item && lookups.project(item.projectId)?.areaId;
        return !area || !hidden.includes(area);
      }),
    [allAllocations, hidden, lookups],
  );
  const agenda = useMemo(
    () =>
      dayAgenda(day, {
        events: hidden.includes('events')
          ? allEvents.filter(isReserved)
          : allEvents,
        allocations,
        google,
      }),
    [day, allEvents, allocations, google, hidden],
  );
  const due = useMemo(
    () => dueByDay(days, {items, projects}, hidden).get(day)!,
    [days, day, items, projects, hidden],
  );
  const plan = useMemo(
    () => ({items, allocations: allAllocations, projects}),
    [items, allAllocations, projects],
  );
  const missed = useMemo(
    () => missedAllocations(plan, today).length,
    [plan, today],
  );
  const backlog = useMemo(() => backlogItems(plan, today), [plan, today]);
  const planned = plannedInWindow(
    allAllocations.filter(a => a.date === day),
    capacity,
  );

  const strip = useMemo(() => {
    const first = startOfWeek(day, weekStart);
    return Array.from({length: 7}, (_, i) => addDays(first, i));
  }, [day, weekStart]);
  const busy = useMemo(
    () => new Set(allAllocations.map(a => a.date)),
    [allAllocations],
  );
  useNavTarget({
    next: () => go(addDays(day, 1), today),
    prev: () => go(addDays(day, -1), today),
    today: () => go(today, today),
    goTo: d => go(d, today),
    create: () => useUi.getState().setDraft(nextHourDraft(day)),
  });

  const nowAt = isToday ? nowPosition(agenda.timed, now) : -1;
  const nothingTimed =
    !agenda.timed.length &&
    !agenda.allDay.length &&
    !agenda.googleAllDay.length &&
    !due.length;

  return (
    <div className="h-full overflow-y-auto pb-32 text-[15px]">
      <div className="sticky top-0 z-10 border-b border-line bg-bg/95 px-2 pt-2 pb-1 backdrop-blur">
        <div className="flex items-center pl-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-[20px] leading-tight font-semibold text-strong">
              {relativeDay(day, today)}
            </h1>
            <CapacityLine planned={planned} total={capacity.total} />
          </div>
          {!isToday && (
            <button
              className="mr-1 h-10 rounded-full border border-line px-4 text-[14px]"
              onClick={() => go(today, today)}
            >
              Today
            </button>
          )}
          <button
            aria-label="Previous week"
            className="flex h-11 w-11 items-center justify-center text-dim"
            onClick={() => go(addDays(day, -7), today)}
          >
            <ChevronLeft size={20} aria-hidden />
          </button>
          <button
            aria-label="Next week"
            className="flex h-11 w-11 items-center justify-center text-dim"
            onClick={() => go(addDays(day, 7), today)}
          >
            <ChevronRight size={20} aria-hidden />
          </button>
        </div>
        <nav aria-label="Days" className="mt-1 grid grid-cols-7">
          {strip.map(d => (
            <a
              key={d}
              href={href({name: 'home', date: d === today ? undefined : d})}
              aria-current={d === day ? 'date' : undefined}
              aria-label={formatLong(d)}
              className="flex h-14 flex-col items-center justify-center gap-0.5 text-[12px] text-dim"
            >
              {dayName(d).slice(0, 1)}
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-[15px] tabular-nums ${d === day ? 'bg-accent font-semibold text-on-accent' : d === today ? 'text-accent' : 'text-strong'}`}
              >
                {Number(d.slice(8))}
              </span>
              <span
                className={`h-1 w-1 rounded-full ${busy.has(d) ? 'bg-accent' : ''}`}
              />
            </a>
          ))}
        </nav>
      </div>

      <div className="mx-3 mt-3 space-y-2 empty:hidden">
        <SignInPrompt />
        <UsosBanner />
        {missed > 0 && isToday && (
          <a
            href={href({name: 'week'})}
            className="flex min-h-12 items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 text-[14px]"
          >
            <span className="flex-1 text-strong">
              {missed} missed {missed === 1 ? 'session' : 'sessions'}
            </span>
            <span className="font-medium text-danger">Reschedule</span>
            <ChevronRight size={16} className="text-danger" aria-hidden />
          </a>
        )}
      </div>

      <SectionTitle>Schedule</SectionTitle>
      <ul className={LIST}>
        {nothingTimed && (
          <li className="px-4 py-4 text-dim">
            Nothing at a set time. Add an event with +.
          </li>
        )}
        {agenda.allDay.map(e => (
          <Row
            key={e.id}
            time="All day"
            color={eventStyle(e.color).background}
            onOpen={() => useUi.getState().openEvent(e.id)}
          >
            {e.title || '(No title)'}
          </Row>
        ))}
        {agenda.googleAllDay.map(e => (
          <WithCard key={e.key} ev={e}>
            <Row
              time="All day"
              color={e.color}
              onOpen={() => useUi.getState().openGoogle(e.key)}
            >
              {e.title}
            </Row>
          </WithCard>
        ))}
        {due.map(i => (
          <li
            key={i.id}
            className="flex min-h-14 items-center border-l-4"
            style={{borderLeftColor: lookups.color(i)}}
          >
            <button
              className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 text-left"
              onClick={() => useUi.getState().openItem(i.id)}
            >
              <span className="flex w-[5.5rem] shrink-0 items-center gap-1 text-[13px] text-warn">
                <Flag size={13} aria-hidden /> Due
              </span>
              <span
                className={`min-w-0 flex-1 truncate ${isItemDone(i) ? 'text-dim line-through' : 'text-strong'}`}
              >
                {i.title}
              </span>
            </button>
          </li>
        ))}
        {agenda.timed.map((e, i) => (
          <TimedEntry
            key={entryKey(e)}
            entry={e}
            nowBefore={i === nowAt ? now : undefined}
            past={isToday && e.end <= now}
            lookups={lookups}
          />
        ))}
        {nowAt === agenda.timed.length && agenda.timed.length > 0 && (
          <NowLine at={now} />
        )}
      </ul>

      {agenda.untimed.length > 0 && (
        <>
          <SectionTitle>Any time {isToday ? 'today' : 'that day'}</SectionTitle>
          <ul className={LIST}>
            {agenda.untimed.map(a => (
              <SessionRow key={a.id} alloc={a} lookups={lookups} />
            ))}
          </ul>
        </>
      )}

      {backlog.length > 0 && (
        <>
          <SectionTitle
            action={
              <a
                href={href({name: 'week'})}
                className="-mr-2 flex h-11 items-center px-2 text-[13px] text-accent"
              >
                all {backlog.length}
              </a>
            }
          >
            To plan
          </SectionTitle>
          <ul className={LIST}>
            {backlog.slice(0, TODAY_TO_PLAN_ROWS).map(b => (
              <ToPlanRow
                key={b.item.id}
                item={b.item}
                remaining={b.remaining}
                lookups={lookups}
                today={today}
              />
            ))}
          </ul>
        </>
      )}

      <div className="mx-3 mt-5">
        <WorkCard />
      </div>
      <AddButton day={day} />
      <Cards />
    </div>
  );
}

function entryKey(e: AgendaEntry): string {
  switch (e.kind) {
    case 'event':
      return `e:${e.event.id}`;
    case 'google':
      return `g:${e.event.key}`;
    case 'reserved':
      return `r:${e.span.key}`;
    case 'session':
      return `s:${e.alloc.id}`;
    default:
      return '';
  }
}

function TimedEntry({
  entry,
  nowBefore,
  past,
  lookups,
}: {
  entry: AgendaEntry;
  /** The time now, when the line for it goes before this entry. */
  nowBefore?: number;
  /** Over already: shown faded. */
  past: boolean;
  lookups: ReturnType<typeof useLookups>;
}) {
  const time = `${fromMinutes(entry.start)}–${fromMinutes(entry.end)}`;
  let row: ReactNode;
  switch (entry.kind) {
    case 'session':
      row = <SessionRow alloc={entry.alloc} lookups={lookups} />;
      break;
    case 'event': {
      const {event} = entry;
      row = (
        <Row
          time={time}
          color={eventStyle(event.color).background}
          faded={past}
          onOpen={() => useUi.getState().openEvent(event.id)}
        >
          {event.title || '(No title)'}
        </Row>
      );
      break;
    }
    case 'google': {
      const {event} = entry;
      row = (
        <WithCard ev={event}>
          <Row
            time={time}
            color={event.color}
            faded={past}
            struck={event.declined}
            onOpen={() => useUi.getState().openGoogle(event.key)}
          >
            {event.title}
          </Row>
        </WithCard>
      );
      break;
    }
    default: {
      const {span} = entry;
      row = (
        <Row
          time={time}
          faded={past}
          reserved
          onOpen={() => useUi.getState().openEvent(span.key)}
        >
          {span.event.title || 'Reserved'}
        </Row>
      );
    }
  }
  return (
    <>
      {nowBefore !== undefined && <NowLine at={nowBefore} />}
      {row}
    </>
  );
}

/** An event's row: its time, a strip in its colour, its title; a tap opens its card. */
function Row({
  time,
  color,
  faded,
  struck,
  reserved,
  onOpen,
  children,
  ...rest
}: {
  time: string;
  color?: CSSProperties['borderLeftColor'];
  faded?: boolean;
  struck?: boolean;
  /** Reserved time: quieter than an event. */
  reserved?: boolean;
  onOpen(): void;
  children: ReactNode;
}) {
  return (
    // `rest`: the props a popover anchor passes on (the Google card's).
    <li
      {...rest}
      className={`border-l-4 ${faded ? 'opacity-55' : ''}`}
      style={{borderLeftColor: color ?? 'var(--color-line)'}}
    >
      <button
        className="flex min-h-14 w-full items-center gap-3 px-3 text-left"
        onClick={onOpen}
      >
        <span className="w-[5.5rem] shrink-0 text-[13px] text-fg tabular-nums">
          {time}
        </span>
        <span
          className={`min-w-0 flex-1 truncate ${reserved ? 'text-dim italic' : 'text-strong'} ${struck ? 'line-through' : ''}`}
        >
          {children}
        </span>
      </button>
    </li>
  );
}

function NowLine({at}: {at: number}) {
  return (
    <li
      aria-label={`Now, ${fromMinutes(at)}`}
      className="flex h-6 items-center gap-2 bg-danger/10 px-3 text-[12px] font-semibold text-danger"
    >
      <span className="h-2 w-2 rounded-full bg-danger" />
      Now · {fromMinutes(at)}
      <span className="h-px flex-1 bg-danger/50" />
    </li>
  );
}

/** "+": a new event, time block, task or reserved time, on the day shown. */
function AddButton({day}: {day: ISODate}) {
  const aboveTabs = usePhoneNav(s => s.nav === 'tabs');
  // Above the undo bar while it shows.
  const bar = useLastStep(s => s.step !== null);
  const bottom = `calc(${(aboveTabs ? 4.25 : 0.75) + (bar ? 3.5 : 0)}rem + env(safe-area-inset-bottom))`;
  return (
    <button
      aria-label="New event, time block or task"
      className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-on-accent shadow-xl transition-[bottom] duration-200 active:scale-95"
      style={{bottom}}
      onClick={() => useUi.getState().setDraft(nextHourDraft(day))}
    >
      <Plus size={26} aria-hidden />
    </button>
  );
}

/** The create card and an event's card, at the top of the screen: there's no grid here to put them beside. */
function Cards() {
  const draft = useUi(s => s.draft !== null);
  const eventId = useUi(s => s.openEventId);
  if (!draft && !eventId) return null;
  const close = () =>
    draft ? useUi.getState().setDraft(null) : useUi.getState().openEvent(null);
  return (
    <Popover open onOpenChange={o => !o && close()}>
      <PopoverAnchor className="fixed top-2 left-1/2 h-0 w-0" />
      <PopoverContent side="bottom">
        {draft ? <DraftEditor /> : <EventEditor eventId={eventId!} />}
      </PopoverContent>
    </Popover>
  );
}
