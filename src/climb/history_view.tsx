import {ChevronRight, History, Timer} from 'lucide-react';
import {CLIMB_HISTORY_WEEKS} from '../config';
import {settingsOf, type Session} from './model/data';
import {monthName, shortDate, today} from './model/dates';
import {systemOf} from './model/grades';
import {placeById} from './model/places';
import {
  climbsOf,
  dayOf,
  formatLength,
  hardest,
  lengthOf,
  timeOf,
} from './model/sessions';
import {sessionsByMonth, sessionsPerWeek} from './model/stats';
import {href} from './router';
import {useClimb} from './store';
import {Empty, LIST, Section, TabScreen} from './ui';

export function HistoryView() {
  const data = useClimb(s => s.data);
  const months = sessionsByMonth(data);
  if (!months.length)
    return (
      <TabScreen tab="history" title="History">
        <Empty icon={History} title="No sessions yet">
          Every session you finish is listed here.
        </Empty>
      </TabScreen>
    );
  const weeks = sessionsPerWeek(data, today(), CLIMB_HISTORY_WEEKS);
  const most = Math.max(1, ...weeks.map(w => w.count));
  const year = today().slice(0, 4);
  return (
    <TabScreen tab="history" title="History">
      <div className="px-4 pt-3">
        <div className="mb-1 text-[13px] text-dim">
          Sessions a week, the last {CLIMB_HISTORY_WEEKS} weeks
        </div>
        <div
          className="flex h-12 items-end gap-1.5"
          role="img"
          aria-label={`Sessions a week: ${weeks.map(w => w.count).join(', ')}`}
        >
          {weeks.map((w, i) => (
            <span
              key={w.from}
              className={`flex-1 rounded-t-[4px] ${i === weeks.length - 1 ? 'bg-accent' : 'bg-dim/50'}`}
              style={{height: `${w.count ? (w.count / most) * 100 : 4}%`}}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-dim">
          <span>{shortDate(weeks[0].from).replace(/^\w+ /, '')}</span>
          <span>this week</span>
        </div>
      </div>
      {months.map(({month, sessions}) => (
        <Section
          key={month}
          title={`${monthName(Number(month.slice(5)) - 1)}${month.startsWith(year) ? '' : ` ${month.slice(0, 4)}`}`}
        >
          <ul className={LIST}>
            {sessions.map(s => (
              <SessionRow key={s.id} session={s} />
            ))}
          </ul>
        </Section>
      ))}
    </TabScreen>
  );
}

function SessionRow({session}: {session: Session}) {
  const data = useClimb(s => s.data);
  const place = placeById(data, session.placeId);
  const climbs = climbsOf(data, session.id);
  const flashed = climbs.filter(c => c.tries <= 1).length;
  const top = hardest(climbs, systemOf(settingsOf(data)));
  const running = session.end === undefined;
  const [day, date] = shortDate(dayOf(session)).split(' ');
  return (
    <li>
      <a
        href={href(
          running ? {name: 'session'} : {name: 'summary', id: session.id},
        )}
        className="flex min-h-16 items-center gap-3 px-4 py-2"
      >
        <div className="w-10 text-center leading-tight">
          <div className="text-[12px] text-dim">{day}</div>
          <div className="text-[20px] font-semibold text-strong">{date}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-strong">
            {place?.name ?? 'Unknown place'}
          </div>
          <div className="text-[14px] text-dim">
            {running ? (
              <span className="inline-flex items-center gap-1 text-accent">
                <Timer size={13} aria-hidden /> running since{' '}
                {timeOf(session.start)}
              </span>
            ) : (
              <>
                {formatLength(lengthOf(session))} · {climbs.length} climb
                {climbs.length === 1 ? '' : 's'} · {flashed} flashed
              </>
            )}
          </div>
        </div>
        <span className="font-semibold text-strong">{top}</span>
        <ChevronRight size={18} className="text-dim" aria-hidden />
      </a>
    </li>
  );
}
