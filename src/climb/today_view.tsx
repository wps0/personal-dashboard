import {ChevronDown, Settings, Timer} from 'lucide-react';
import {useState} from 'react';
import {
  climbsOf,
  nextPlaceId,
  runningSession,
  startSession,
  timeOf,
} from './model/sessions';
import {placeById} from './model/places';
import {href, navigate} from './router';
import {change, useClimb} from './store';
import {BLOCK, Empty, TabScreen} from './ui';

export function TodayView() {
  const data = useClimb(s => s.data);
  const running = runningSession(data);
  const open = data.places.filter(p => !p.archived);
  const [chosen, setChosen] = useState<string>();
  const placeId =
    chosen && open.some(p => p.id === chosen) ? chosen : nextPlaceId(data);

  let top;
  if (running) {
    const place = placeById(data, running.placeId);
    const n = climbsOf(data, running.id).length;
    top = (
      <div className={`p-4 ${BLOCK}`}>
        <div className="text-[13px] text-dim">Session running</div>
        <div className="text-[17px] font-semibold text-strong">
          {place?.name ?? 'Unknown place'}
        </div>
        <div className="text-[14px] text-dim">
          since {timeOf(running.start)} · {n} climb{n === 1 ? '' : 's'}
        </div>
        <a
          href={href({name: 'session'})}
          className="mt-3 flex h-14 items-center justify-center gap-2 rounded-2xl bg-accent text-[17px] font-semibold text-on-accent"
        >
          <Timer size={20} aria-hidden /> Back to the session
        </a>
      </div>
    );
  } else if (!open.length) {
    return (
      <TabScreen tab="today" title="Climb">
        <Empty icon={Settings} title="Add a gym">
          <p>Then start a session there and log your climbs by grade.</p>
          <a
            href={href({name: 'settings'})}
            className="mt-4 inline-flex h-11 items-center rounded-full bg-accent px-5 font-semibold text-on-accent"
          >
            Settings
          </a>
        </Empty>
      </TabScreen>
    );
  } else {
    const start = () => {
      if (!placeId) return;
      change(d => startSession(d, placeId, new Date())[0]);
      navigate({name: 'session'});
    };
    top = (
      <div className={`p-4 ${BLOCK}`}>
        <label className="relative flex h-14 items-center rounded-2xl bg-bg px-4">
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] text-dim">Where</span>
            <span className="block truncate text-strong">
              {placeById(data, placeId ?? '')?.name}
            </span>
          </span>
          <ChevronDown size={18} className="text-dim" aria-hidden />
          <select
            aria-label="Where"
            value={placeId}
            onChange={e => setChosen(e.target.value)}
            className="absolute inset-0 opacity-0"
          >
            {open.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={start}
          className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[17px] font-semibold text-on-accent"
        >
          <Timer size={20} aria-hidden /> Start a session
        </button>
      </div>
    );
  }
  return (
    <TabScreen tab="today" title="Climb">
      <div className="px-4 pt-4">{top}</div>
      <p className="px-4 pt-4 text-[13px] text-dim">
        A session starts only when you press Start, and ends with Finish.
      </p>
    </TabScreen>
  );
}
