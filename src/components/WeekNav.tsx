import {ChevronDown, ChevronLeft, ChevronRight} from 'lucide-react';
import {useState} from 'react';
import {
  addDays,
  formatMonthYear,
  isoWeek,
  shortDate,
  startOfWeek,
  todayISO,
} from '../model/dates';
import type {ISODate} from '../model/types';
import {href, navigate} from '../router';
import {MiniMonth} from './MiniMonth';
import {Popover, PopoverContent, PopoverTrigger} from './ui/Popover';

/** Today / prev / next, plus a mini-month popover to jump to any week. */
export function WeekNav({monday}: {monday: ISODate}) {
  const [open, setOpen] = useState(false);
  const thisWeek = startOfWeek(todayISO());
  const go = (date: ISODate) =>
    navigate({
      name: 'week',
      week: startOfWeek(date) === thisWeek ? undefined : startOfWeek(date),
    });

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
        href={href({name: 'week', week: addDays(monday, -7)})}
        aria-label="Previous week"
        title="Previous week (k)"
      >
        <ChevronLeft size={18} />
      </a>
      <a
        className="icon-btn"
        href={href({name: 'week', week: addDays(monday, 7)})}
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
            {formatMonthYear(addDays(monday, 3))}
          </span>
          <span className="whitespace-nowrap text-dim tabular-nums">
            W{isoWeek(monday)}
            {/* The dates don't fit next to the month on a phone. */}
            <span className="hidden sm:inline">
              {' '}
              · {shortDate(monday)} – {shortDate(addDays(monday, 6))}
            </span>
          </span>
          <ChevronDown size={16} className="text-dim" />
        </PopoverTrigger>
        <PopoverContent align="start" className="p-3">
          <MiniMonth
            selected={monday}
            range={[monday, addDays(monday, 6)]}
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
