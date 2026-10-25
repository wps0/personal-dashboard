import {CalendarDays, Check, ChevronDown} from 'lucide-react';
import {useState} from 'react';
import {EVENT_COLORS, eventStyle} from '../event_colors';
import {EventColor} from '../model/types';
import {Popover, PopoverContent, PopoverTrigger} from './ui/popover';

const CHOICES = [
  {color: EventColor.UNSPECIFIED, name: 'Default colour'},
  ...EVENT_COLORS,
];

/**
 * The event card's calendar row, like Google Calendar's: the calendar's name
 * and the event's colour, which opens the palette.
 */
export function EventColorRow({
  value,
  onChange,
}: {
  value: EventColor;
  onChange(color: EventColor): void;
}) {
  const [open, setOpen] = useState(false);
  const name = CHOICES.find(c => c.color === value)?.name ?? 'Default colour';
  return (
    <div className="flex items-center gap-3">
      <CalendarDays size={16} className="shrink-0 text-dim" />
      <span>Events</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="-ml-1 flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-raised"
            aria-label={`Event colour: ${name}`}
            title="Event colour"
          >
            <span
              className="h-3.5 w-3.5 rounded-full"
              style={{background: eventStyle(value).background}}
            />
            <ChevronDown size={14} className="text-dim" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="start" className="p-2">
          <div
            role="radiogroup"
            aria-label="Event colour"
            className="grid grid-cols-6 gap-1.5"
          >
            {CHOICES.map(c => {
              const style = eventStyle(c.color);
              return (
                <button
                  key={c.color}
                  role="radio"
                  aria-checked={c.color === value}
                  aria-label={c.name}
                  title={c.name}
                  className="flex h-6 w-6 items-center justify-center rounded-full transition-transform hover:scale-110"
                  style={style}
                  onClick={() => {
                    onChange(c.color);
                    setOpen(false);
                  }}
                >
                  {c.color === value && <Check size={14} strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
