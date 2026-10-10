import { useMemo } from 'react';
import { TimeGrid } from '../components/TimeGrid';
import { WeekNav } from '../components/WeekNav';
import { addDays, startOfWeek, todayISO } from '../model/dates';
import type { ISODate } from '../model/types';
import { useUi } from '../ui';

export function CalendarView({ week }: { week?: ISODate }) {
  const monday = startOfWeek(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : todayISO());
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  const setOpenEvent = useUi((s) => s.setOpenEvent);
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1">
        <WeekNav view="calendar" monday={monday} />
        <span className="ml-auto text-[11px] text-dim">click the grid to add an event · drag tasks from “todo” to time-block them</span>
        <button
          className="btn py-0.5"
          onClick={() => setOpenEvent({ draft: { title: '', date: todayISO(), start: '09:00', end: '10:00' } })}
        >
          + event
        </button>
      </div>
      <div className="min-h-0 flex-1 p-2">
        <TimeGrid days={days} />
      </div>
    </div>
  );
}
