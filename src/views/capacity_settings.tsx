import {Minus, Plus} from 'lucide-react';
import {fmtDuration} from '../format';
import {ruleFor} from '../model/capacity';
import {formatMedium} from '../model/dates';
import {isReserved} from '../model/reserved';
import {useToday} from '../hooks';
import {href} from '../router';
import {useStore} from '../store';

/**
 * The global adjustment, edited as a rule effective from today, and how a
 * day's capacity is counted.
 */
export function CapacitySettings() {
  const rules = useStore(s => s.data.settings.capacityRules);
  const change = useStore(s => s.changeCapacityRule);
  // The reserved time on the calendar, by name (each name once).
  const reserved = useStore(s =>
    [
      ...new Set(
        s.data.events.filter(isReserved).map(e => e.title || 'Reserved'),
      ),
    ].join(', '),
  );
  const today = useToday();
  const rule = ruleFor(rules, today);
  const history = rules.filter(r => r.from > '0000-01-01' && r.from < today);

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-dim">
        A day&apos;s capacity is the whole day (24h) less its reserved time
        (sleep, work…) and its calendar events, each minute once however many
        overlap, plus the global adjustment and the day&apos;s own ± (or a fixed
        value), both set from the day&apos;s header. All-day events take
        nothing. What&apos;s planned uses it: sessions without a time in full,
        time blocks except their part on reserved time or an event.
      </p>
      <p
        className={`rounded-md border px-3 py-2 text-[12px] ${reserved ? 'border-line bg-panel text-dim' : 'border-warn/40 bg-warn/10 text-fg'}`}
      >
        {reserved ? (
          <>Reserved time on the calendar: {reserved}. </>
        ) : (
          <>
            No reserved time yet, so every day counts all 24 hours. Add your
            sleep (e.g. 23:00–07:00, every day) and work on the calendar with
            the Reserved tab.{' '}
          </>
        )}
        <a
          href={href({name: 'calendar'})}
          className="text-accent hover:underline"
        >
          calendar ↗
        </a>
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
          {fmtDuration(Math.abs(rule.adjustment))}
        </span>
        <button
          className="icon-btn"
          aria-label="Increase"
          onClick={() => change({adjustment: rule.adjustment + 0.5})}
        >
          <Plus size={14} />
        </button>
        <span className="text-[12px] text-dim">
          added to every day (e.g. −3h for meals, travel and rest)
        </span>
      </div>
      <p className="text-[12px] text-dim">
        Changes apply from today ({formatMedium(today)}). Past days keep the
        adjustment they had.
        {history.length > 0 &&
          ` Earlier changes: ${history.map(r => formatMedium(r.from)).join(', ')}.`}
      </p>
    </div>
  );
}
