import {useState} from 'react';
import {useGoogle} from '../google/auth';
import {useGoogleCalendars} from '../google/calendars';
import type {UsosSource} from '../model/types';
import {useStore} from '../store';
import {coursesIn, fetchMeetings, isValidICalUrl} from '../usos/fetch';
import {BufferedInput} from './Buffered';
import {Select} from './ui/Select';

type Kind = 'off' | NonNullable<UsosSource['case']>;

const KINDS = [
  {value: 'off', label: 'Off'},
  {value: 'googleCalendarId', label: 'One of my Google calendars'},
  {value: 'icalUrl', label: 'iCal link'},
] as const;

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

type Check =
  | {state: 'loading'}
  | {state: 'error'; message: string}
  | {
      state: 'done';
      classes: number;
      courses: ReturnType<typeof coursesIn>;
      warnings: string[];
    };

/** Settings → USOS timetable: where class meetings come from, with a check that lists the courses found. */
export function UsosSettings() {
  useGoogleCalendars();
  const source = useStore(s => s.data.settings.usos.source);
  const setSource = useStore.getState().setUsosSource;
  const calendars = useGoogle(s => s.calendars);
  const signedIn = useGoogle(s => s.status === 'signed-in');
  const [check, setCheck] = useState<Check | null>(null);
  const kind: Kind = source.case ?? 'off';

  const pickKind = (k: Kind) => {
    setCheck(null);
    if (k === 'off') setSource({case: undefined});
    else if (k === 'googleCalendarId')
      setSource({case: k, value: calendars[0]?.id ?? ''});
    else setSource({case: k, value: ''});
  };

  const runCheck = async () => {
    if (!source.case) return;
    setCheck({state: 'loading'});
    try {
      const {meetings, warnings} = await fetchMeetings(source);
      setCheck({
        state: 'done',
        classes: meetings.length,
        courses: coursesIn(meetings),
        warnings,
      });
    } catch (e) {
      setCheck({state: 'error', message: (e as Error).message});
    }
  };

  const ready =
    source.case === 'googleCalendarId'
      ? signedIn && !!source.value
      : source.case === 'icalUrl' && isValidICalUrl(source.value);

  return (
    <div className="space-y-3">
      <label className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-full sm:w-48">Timetable source</span>
        <Select
          value={kind}
          onChange={pickKind}
          options={KINDS}
          className="w-64"
          ariaLabel="Timetable source"
        />
      </label>

      {source.case === 'googleCalendarId' &&
        (signedIn ? (
          <label className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="w-full sm:w-48">Calendar</span>
            <Select
              value={source.value}
              onChange={calendarId => {
                setCheck(null);
                setSource({case: 'googleCalendarId', value: calendarId});
              }}
              options={calendars.map(c => ({
                value: c.id,
                label: c.summaryOverride ?? c.summary,
              }))}
              className="w-64"
              ariaLabel="Timetable calendar"
            />
            <span className="text-[12px] text-dim">
              The calendar you subscribed to your USOSweb timetable in.
            </span>
          </label>
        ) : (
          <p className="text-[12px] text-dim">
            Sign in under Google Calendar above to choose a calendar.
          </p>
        ))}

      {source.case === 'icalUrl' && (
        <label className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="w-full sm:w-48">iCal link</span>
          <BufferedInput
            value={source.value}
            placeholder="https://usosweb…/plan.ics"
            onCommit={url => {
              setCheck(null);
              setSource({case: 'icalUrl', value: url.trim()});
            }}
            className="field h-8 min-w-0 flex-1"
            spellCheck={false}
            aria-label="iCal link"
          />
          <span className="w-full text-[12px] text-dim sm:pl-51">
            USOSweb → timetable → export (iCalendar). The link is personal: it
            stays in this browser.
          </span>
        </label>
      )}

      {source.case && (
        <div className="space-y-2">
          <button
            className="btn"
            disabled={!ready || check?.state === 'loading'}
            onClick={() => void runCheck()}
          >
            {check?.state === 'loading' ? 'Checking…' : 'Check'}
          </button>
          {source.case === 'icalUrl' &&
            source.value &&
            !isValidICalUrl(source.value) && (
              <p className="text-[12px] text-danger">
                The link must start with https://.
              </p>
            )}
          {check?.state === 'error' && (
            <p role="alert" className="text-[12px] text-danger">
              {check.message}
            </p>
          )}
          {check?.state === 'done' && (
            <div className="rounded-md border border-line px-3 py-2 text-[12px]">
              <p className="mb-1 text-fg">
                Found {plural(check.classes, 'class', 'classes')} in{' '}
                {plural(check.courses.length, 'course', 'courses')}. Use these
                titles for the course pattern in each course’s project:
              </p>
              <ul className="space-y-0.5 text-dim">
                {check.courses.map(c => (
                  <li key={c.course}>
                    <span className="text-fg">{c.course}</span> ·{' '}
                    {c.types.join(', ')} · {c.count}
                  </li>
                ))}
              </ul>
              {check.warnings.map(w => (
                <p key={w} className="mt-1 text-warn">
                  {w}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
