import {Trash2, Trophy} from 'lucide-react';
import {useState} from 'react';
import {NowVsPast, num, Tile, trendOf} from './charts';
import {settingsOf} from './model/data';
import {addDays, shortDate} from './model/dates';
import {systemOf, scale} from './model/grades';
import {placeById} from './model/places';
import {
  dayOf,
  deleteSession,
  formatLength,
  lengthOf,
  sessionById,
  setNotes,
  timeOf,
} from './model/sessions';
import {firsts, sessionStats, type Scope} from './model/stats';
import {CLIMB_COMPARE_DAYS} from '../config';
import {href, navigate} from './router';
import {change, useClimb} from './store';
import {BLOCK, Section, Segmented, SMALL_BUTTON, SubScreen} from './ui';

/** A finished session: how it went, against your usual one. */
export function SummaryView({id}: {id: string}) {
  const data = useClimb(s => s.data);
  const [scope, setScope] = useState<Scope>('all');
  const session = sessionById(data, id);
  if (!session)
    return (
      <SubScreen title="Session" back={{name: 'history'}}>
        <p className="px-4 pt-6 text-dim">
          This session isn&apos;t in the log.
        </p>
      </SubScreen>
    );
  if (session.end === undefined)
    return (
      <SubScreen title="Session" back={{name: 'today'}}>
        <p className="px-4 pt-6 text-dim">
          This session is still running:{' '}
          <a href={href({name: 'session'})} className="text-accent">
            back to it
          </a>
          .
        </p>
      </SubScreen>
    );
  const place = placeById(data, session.placeId);
  const system = systemOf(settingsOf(data));
  const stats = sessionStats(data, session, scope, system);
  const news = firsts(data, session, system);
  const n = stats.climbs.now;
  const grades = scale(system);
  const rank = (g: string | undefined) => (g ? grades.indexOf(g) : -1);
  const since = shortDate(addDays(dayOf(session), -CLIMB_COMPARE_DAYS)).replace(
    /^\w+ /,
    '',
  );
  const avg = (v: number | null) =>
    v === null ? 'no average' : `avg ${num(v)}`;

  return (
    <SubScreen title="Session" back={{name: 'today'}}>
      <div className="px-4 pt-2">
        <div className="text-[13px] text-dim">
          {shortDate(dayOf(session))} · {place?.name ?? 'Unknown place'} ·{' '}
          {timeOf(session.start)}–{timeOf(session.end)}
        </div>
        <div className="text-[22px] font-semibold text-strong">
          {n} climb{n === 1 ? '' : 's'} in {formatLength(lengthOf(session))}
        </div>
        {news.length > 0 && (
          <div className="mt-3 flex items-center gap-3 rounded-3xl bg-accent/15 p-4">
            <Trophy size={22} className="shrink-0 text-accent" aria-hidden />
            <div>
              <div className="font-medium text-strong">{news[0]}</div>
              {news.slice(1).map(t => (
                <div key={t} className="text-[13px] text-dim">
                  and {t[0].toLowerCase() + t.slice(1)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <Section title="By grade, against an average session">
        <div className="mb-3 flex">
          <Segmented<Scope>
            label="Compare with"
            options={[
              {value: 'all', label: 'All gyms'},
              {value: 'place', label: `Only ${place?.name ?? 'here'}`},
            ]}
            value={scope}
            onChange={setScope}
          />
        </div>
        <div className={`p-4 ${BLOCK}`}>
          <NowVsPast
            rows={stats.rows}
            nowLabel="This session"
            pastLabel={`Average session, last ${CLIMB_COMPARE_DAYS} days`}
          />
          <p className="mt-2 text-[12px] text-dim">
            {stats.sessions
              ? `The average of your ${stats.sessions} session${stats.sessions === 1 ? '' : 's'}${scope === 'place' ? ` at ${place?.name}` : ''} since ${since}.`
              : `No sessions${scope === 'place' ? ` at ${place?.name}` : ''} in the ${CLIMB_COMPARE_DAYS} days before to compare with.`}
          </p>
        </div>
      </Section>
      <Section title="Numbers, against the same average">
        <div className="grid grid-cols-2 gap-2">
          <Tile
            label="Climbs"
            value={n}
            was={avg(stats.climbs.avg)}
            trend={trendOf(n, stats.climbs.avg)}
          />
          <Tile
            label="Hardest"
            value={stats.hardest.now ?? '–'}
            was={stats.hardest.avg ? `avg ${stats.hardest.avg}` : 'no average'}
            trend={
              stats.hardest.avg
                ? trendOf(rank(stats.hardest.now), rank(stats.hardest.avg))
                : undefined
            }
          />
          <Tile
            label="Flashed"
            value={stats.flashed.now}
            was={avg(stats.flashed.avg)}
            trend={trendOf(stats.flashed.now, stats.flashed.avg)}
          />
          <Tile
            label="Tries per climb"
            value={num(Math.round(stats.triesPerClimb.now * 10) / 10)}
            was={
              stats.triesPerClimb.avg === null
                ? 'no average'
                : `avg ${num(Math.round(stats.triesPerClimb.avg * 10) / 10)}`
            }
            trend={trendOf(
              Math.round(stats.triesPerClimb.now * 10),
              stats.triesPerClimb.avg === null
                ? null
                : Math.round(stats.triesPerClimb.avg * 10),
            )}
            better="down"
          />
        </div>
      </Section>
      <Section title="Notes">
        <Notes key={session.notes} id={session.id} notes={session.notes} />
      </Section>
      <div className="px-4 pt-6">
        <button
          type="button"
          className={`${SMALL_BUTTON} text-danger`}
          onClick={() => {
            change(
              d => deleteSession(d, session.id),
              `Deleted the session of ${shortDate(dayOf(session))}`,
            );
            navigate({name: 'today'});
          }}
        >
          <Trash2 size={16} aria-hidden /> Delete this session
        </button>
      </div>
      <div className="px-4 pt-6">
        <button
          type="button"
          onClick={() => navigate({name: 'today'})}
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-accent text-[16px] font-semibold text-on-accent"
        >
          Done
        </button>
      </div>
    </SubScreen>
  );
}

function Notes({id, notes}: {id: string; notes: string}) {
  const [text, setText] = useState(notes);
  return (
    <textarea
      value={text}
      aria-label="Notes"
      rows={3}
      onChange={e => setText(e.target.value)}
      onBlur={() => text !== notes && change(d => setNotes(d, id, text))}
      placeholder="Skin, sleep, a problem to come back to…"
      className="w-full resize-none rounded-2xl bg-raised px-4 py-3 text-[15px] text-strong placeholder:text-dim"
    />
  );
}
