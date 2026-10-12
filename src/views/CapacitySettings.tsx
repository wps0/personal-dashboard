import {Copy, Minus, Plus, Trash2} from 'lucide-react';
import {BufferedInput} from '../components/Buffered';
import {TimeSelect} from '../components/TimeSelect';
import {fmtH} from '../format';
import {
  DEFAULT_RESERVED,
  ruleFor,
  type PlanningWindow,
  type Reserved,
} from '../model/capacity';
import {formatMedium, todayISO} from '../model/dates';
import {toMinutes} from '../model/time';
import {useStore} from '../store';

const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/** Planning windows, global adjustment and reserved time, edited as a rule effective from today. */
export function CapacitySettings() {
  const rules = useStore(s => s.data.settings.capacityRules);
  const change = useStore(s => s.changeCapacityRule);
  const today = todayISO();
  const rule = ruleFor(rules, today);
  const reserved = rule.reserved ?? DEFAULT_RESERVED;

  const setWindow = (i: number, w: Partial<PlanningWindow>) =>
    change({windows: rule.windows.map((x, j) => (j === i ? {...x, ...w} : x))});
  const setReserved = (i: number, list: Reserved[]) =>
    change({reserved: reserved.map((x, j) => (j === i ? list : x))});
  const history = rules.filter(r => r.from > '0000-01-01' && r.from < today);

  return (
    <div className="space-y-4">
      <p className="rounded-md border border-line bg-panel px-3 py-2 text-[12px] text-dim">
        Changes apply from today ({formatMedium(today)}). Past days keep the
        settings they had.
        {history.length > 0 &&
          ` Earlier changes: ${history.map(r => formatMedium(r.from)).join(', ')}.`}
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-full sm:w-48">Global adjustment</span>
        <button
          className="icon-btn"
          aria-label="Decrease"
          onClick={() => change({adjustment: rule.adjustment - 0.5})}
        >
          <Minus size={14} />
        </button>
        <span className="w-12 text-center tabular-nums">
          {rule.adjustment > 0 ? '+' : rule.adjustment < 0 ? '−' : '±'}
          {fmtH(Math.abs(rule.adjustment))}
        </span>
        <button
          className="icon-btn"
          aria-label="Increase"
          onClick={() => change({adjustment: rule.adjustment + 0.5})}
        >
          <Plus size={14} />
        </button>
        <span className="text-[12px] text-dim">
          added to every day (e.g. −1h buffer for rest)
        </span>
      </div>

      {/* Wider than a phone: scrolls sideways on its own, not the page. */}
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[600px] border-collapse">
          <thead>
            <tr className="label text-left [&>th]:px-2 [&>th]:pb-1 [&>th]:font-medium">
              <th className="w-28">Day</th>
              <th>Planning window</th>
              <th>Reserved time (shown hatched)</th>
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((name, i) => {
              const w = rule.windows[i];
              const hours =
                Math.max(0, toMinutes(w.end) - toMinutes(w.start)) / 60;
              return (
                <tr key={name} className="border-t border-line align-top">
                  <td className="px-2 py-2 font-medium">{name}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <TimeSelect
                        value={w.start}
                        onChange={start => setWindow(i, {start})}
                        className="w-20"
                        ariaLabel={`${name} window start`}
                      />
                      <span className="text-dim">–</span>
                      <TimeSelect
                        value={w.end}
                        after={w.start}
                        onChange={end => setWindow(i, {end})}
                        className="w-36"
                        ariaLabel={`${name} window end`}
                      />
                      <span className="ml-1 w-10 text-dim tabular-nums">
                        {fmtH(hours)}
                      </span>
                      {i === 0 && (
                        <button
                          className="icon-btn"
                          title="Copy Monday's window and reserved time to Tue–Fri"
                          onClick={() =>
                            change({
                              windows: rule.windows.map((x, j) =>
                                j > 0 && j < 5 ? rule.windows[0] : x,
                              ),
                              reserved: reserved.map((x, j) =>
                                j > 0 && j < 5 ? reserved[0] : x,
                              ),
                            })
                          }
                        >
                          <Copy size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="space-y-1">
                      {reserved[i].map((r, k) => (
                        <div key={k} className="flex items-center gap-1">
                          <TimeSelect
                            value={r.start}
                            onChange={start =>
                              setReserved(
                                i,
                                reserved[i].map((x, j) =>
                                  j === k ? {...x, start} : x,
                                ),
                              )
                            }
                            className="w-20"
                            ariaLabel="Reserved from"
                          />
                          <span className="text-dim">–</span>
                          <TimeSelect
                            value={r.end}
                            onChange={end =>
                              setReserved(
                                i,
                                reserved[i].map((x, j) =>
                                  j === k ? {...x, end} : x,
                                ),
                              )
                            }
                            className="w-20"
                            ariaLabel="Reserved until"
                          />
                          <BufferedInput
                            value={r.label ?? ''}
                            placeholder="Label"
                            onCommit={label =>
                              setReserved(
                                i,
                                reserved[i].map((x, j) =>
                                  j === k
                                    ? {...x, label: label || undefined}
                                    : x,
                                ),
                              )
                            }
                            className="field h-7 w-28"
                          />
                          <button
                            className="icon-btn hover:!text-danger"
                            aria-label="Remove reserved time"
                            onClick={() =>
                              setReserved(
                                i,
                                reserved[i].filter((_, j) => j !== k),
                              )
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      <button
                        className="btn h-6 text-[12px]"
                        onClick={() =>
                          setReserved(i, [
                            ...reserved[i],
                            {start: '12:00', end: '13:00', label: ''},
                          ])
                        }
                      >
                        <Plus size={12} /> Add
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-dim">
        A day's capacity = planning window − calendar events inside it + global
        adjustment + that day's own adjustment (or a fixed value set from the
        day's header). Reserved time is informational: you can still schedule
        over it. Ranges like 23:00–07:00 wrap past midnight.
      </p>
    </div>
  );
}
