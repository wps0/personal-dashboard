import {ChevronLeft, ChevronRight} from 'lucide-react';
import {useState} from 'react';
import {useSlide} from '../hooks';
import {
  addMonths,
  firstOfMonth,
  formatMonthYear,
  monthGrid,
  startOfWeek,
  todayISO,
} from '../model/dates';
import type {ISODate} from '../model/types';

interface Props {
  /** Date to show as selected (and whose month to show initially). */
  selected?: ISODate;
  /** Inclusive range to tint, e.g. the days visible in the main view. */
  range?: [ISODate, ISODate];
  onSelect(date: ISODate): void;
  /** Tint the whole week under the pointer (for week pickers). */
  weekHover?: boolean;
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Google-Calendar-style month picker. Weeks start on Monday. */
export function MiniMonth({selected, range, onSelect, weekHover}: Props) {
  const today = todayISO();
  const [month, setMonth] = useState(firstOfMonth(selected ?? today));
  const [hoverWeek, setHoverWeek] = useState<ISODate | null>(null);
  // Jump to a newly selected date's month (set during render, not in an effect).
  const [shownSelected, setShownSelected] = useState(selected);
  if (selected !== shownSelected) {
    setShownSelected(selected);
    if (selected) setMonth(firstOfMonth(selected));
  }

  const days = monthGrid(month);
  const slide = useSlide(month);
  const inRange = (d: ISODate) =>
    range ? d >= range[0] && d <= range[1] : false;

  return (
    <div className="w-[224px] overflow-hidden select-none">
      <div className="mb-1 flex items-center pl-2">
        <span className="flex-1 text-[13px] font-medium text-strong">
          {formatMonthYear(month)}
        </span>
        <button
          className="icon-btn"
          aria-label="Previous month"
          onClick={() => setMonth(addMonths(month, -1))}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          className="icon-btn"
          aria-label="Next month"
          onClick={() => setMonth(addMonths(month, 1))}
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] font-medium text-dim">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="py-1">
            {d}
          </span>
        ))}
      </div>
      <div
        key={month}
        className={`grid grid-cols-7 ${slide}`}
        onMouseLeave={() => setHoverWeek(null)}
      >
        {days.map(d => {
          const isToday = d === today;
          const isSelected = d === selected;
          const outside = d.slice(0, 7) !== month.slice(0, 7);
          const tinted =
            inRange(d) || (weekHover && hoverWeek === startOfWeek(d));
          return (
            <div
              key={d}
              className={`flex justify-center py-px transition-colors duration-150 ${tinted ? 'bg-accent/12' : ''}`}
            >
              <button
                onClick={() => onSelect(d)}
                onMouseEnter={() => weekHover && setHoverWeek(startOfWeek(d))}
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] tabular-nums transition-[background-color,transform] duration-150 active:scale-90 ${
                  isToday
                    ? 'bg-accent font-semibold text-on-accent'
                    : isSelected
                      ? 'bg-accent/25 font-semibold text-strong'
                      : outside
                        ? 'text-dim/60 hover:bg-raised'
                        : 'text-fg hover:bg-raised'
                }`}
              >
                {Number(d.slice(8))}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
