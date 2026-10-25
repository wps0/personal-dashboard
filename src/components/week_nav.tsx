import {ChevronDown, ChevronLeft, ChevronRight} from 'lucide-react';
import {useState} from 'react';
import {
  addDays,
  formatMonthYear,
  MONDAY,
  shortDate,
  startOfWeek,
  todayISO,
  weekNumber,
} from '../model/dates';
import type {ISODate} from '../model/types';
import {href, navigate} from '../router';
import {MiniMonth} from './mini_month';
import {Popover, PopoverContent, PopoverTrigger} from './ui/popover';

/**
 * The week journal's today / prev / next, plus a mini-month popover to jump to
 * any week. Its weeks always start on Monday.
 */
export function WeekNav({start}: {start: ISODate}) {
  const [open, setOpen] = useState(false);
  const thisWeek = startOfWeek(todayISO(), MONDAY);
  const go = (date: ISODate) => {
    const week = startOfWeek(date, MONDAY);
    navigate({name: 'week', week: week === thisWeek ? undefined : week});
  };

  return (
    <div className="flex items-center gap-1">
      <a
        className="btn h-8 rounded-full px-3 sm:px-4"
        href={href({name: 'week'})}
        title="This week (t)"
      >
        Today
      </a>
      <a
        className="icon-btn"
        href={href({name: 'week', week: addDays(start, -7)})}
        aria-label="Previous week"
        title="Previous week (k)"
      >
        <ChevronLeft size={18} />
      </a>
      <a
        className="icon-btn"
        href={href({name: 'week', week: addDays(start, 7)})}
        aria-label="Next week"
        title="Next week (j)"
      >
        <ChevronRight size={18} />
      </a>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-raised sm:ml-1 sm:px-2"
          title="Pick a week (g)"
        >
          <span className="text-base whitespace-nowrap text-strong sm:text-lg">
            {formatMonthYear(addDays(start, 3))}
          </span>
          <span className="whitespace-nowrap text-dim tabular-nums">
            W{weekNumber(start)}
            {/* The dates don't fit next to the month on a phone. */}
            <span className="hidden sm:inline">
              {' '}
              · {shortDate(start)} – {shortDate(addDays(start, 6))}
            </span>
          </span>
          <ChevronDown size={16} className="text-dim" />
        </PopoverTrigger>
        <PopoverContent align="start" className="p-3">
          <MiniMonth
            selected={start}
            range={[start, addDays(start, 6)]}
            weekStart={MONDAY}
            weekHover
            onSelect={d => {
              go(d);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
