import {create} from '@bufbuild/protobuf';
import {useState} from 'react';
import * as pb from '../gen/dashboard/data_pb';
import {
  describeRecurrence,
  nthDate,
  weekdayName,
  weekdayOf,
  WORK_DAYS,
  type Recurrence,
} from '../model/recurrence';
import type {ISODate} from '../model/types';
import {DateField} from './date_field';
import {Select} from './ui/select';

const {DAY, WEEK} = pb.RecurrenceUnit;
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 7] as pb.Weekday[];

type Preset = 'none' | 'daily' | 'weekly' | 'weekdays' | 'custom';

function presetOf(r: Recurrence | undefined): Preset {
  if (!r) return 'none';
  if (r.until !== undefined || Math.max(1, r.interval) !== 1) return 'custom';
  if (r.unit === DAY) return 'daily';
  if (r.unit === WEEK && !r.weekdays.length) return 'weekly';
  if (
    r.unit === WEEK &&
    r.weekdays.length === 5 &&
    WORK_DAYS.every(d => r.weekdays.includes(d))
  )
    return 'weekdays';
  return 'custom';
}

/**
 * How an event repeats, like Google Calendar's: does not repeat, daily,
 * weekly on its weekday, every weekday, or a custom rule (every N days or
 * weeks, on chosen weekdays, ending never, on a date or after N times).
 */
export function RepeatSelect({
  value,
  date,
  onChange,
}: {
  value: Recurrence | undefined;
  /** The event's date: weekly repeats default to its weekday. */
  date: ISODate;
  onChange(r: Recurrence | undefined): void;
}) {
  const [custom, setCustom] = useState(false);
  const preset = presetOf(value);
  const options: {value: Preset; label: string}[] = [
    {value: 'none', label: 'Does not repeat'},
    {value: 'daily', label: 'Daily'},
    {value: 'weekly', label: `Weekly on ${weekdayName(weekdayOf(date))}`},
    {value: 'weekdays', label: 'Every weekday (Monday to Friday)'},
    {value: 'custom', label: 'Custom…'},
  ];
  const pick = (p: Preset) => {
    if (p === 'custom') return setCustom(true);
    setCustom(false);
    onChange(
      p === 'none'
        ? undefined
        : create(pb.RecurrenceSchema, {
            unit: p === 'daily' ? DAY : WEEK,
            interval: 1,
            weekdays: p === 'weekdays' ? WORK_DAYS : [],
          }),
    );
  };
  return (
    <div className="min-w-0 flex-1">
      <Select
        value={preset}
        onChange={pick}
        options={options}
        variant="ghost"
        className="w-fit"
        ariaLabel="Repeat"
        display={
          preset === 'custom' && value
            ? describeRecurrence(value, date)
            : undefined
        }
      />
      {custom && (
        <CustomRepeat
          value={value}
          date={date}
          onDone={r => {
            setCustom(false);
            onChange(r);
          }}
          onCancel={() => setCustom(false)}
        />
      )}
    </div>
  );
}

/** The custom rule, edited inline and applied with Done. */
function CustomRepeat({
  value,
  date,
  onDone,
  onCancel,
}: {
  value: Recurrence | undefined;
  date: ISODate;
  onDone(r: Recurrence): void;
  onCancel(): void;
}) {
  const [every, setEvery] = useState(Math.max(1, value?.interval ?? 1));
  const [unit, setUnit] = useState(value?.unit === DAY ? DAY : WEEK);
  const [days, setDays] = useState<pb.Weekday[]>(
    value?.weekdays.length ? value.weekdays : [weekdayOf(date)],
  );
  const [ends, setEnds] = useState<'never' | 'on' | 'after'>(
    value?.until ? 'on' : 'never',
  );
  const [until, setUntil] = useState(value?.until ?? date);
  const [times, setTimes] = useState(10);
  const toggle = (d: pb.Weekday) =>
    setDays(ds =>
      ds.includes(d)
        ? ds.length > 1
          ? ds.filter(x => x !== d)
          : ds
        : [...ds, d].sort((a, b) => a - b),
    );
  const done = () => {
    const rule = create(pb.RecurrenceSchema, {
      unit,
      interval: every,
      weekdays: unit === WEEK ? days : [],
    });
    onDone({
      ...rule,
      until:
        ends === 'on'
          ? until
          : ends === 'after'
            ? nthDate(rule, date, times)
            : undefined,
    });
  };
  const count = (v: string) => Math.max(1, Math.min(999, Number(v) || 1));
  return (
    <div
      role="group"
      aria-label="Custom repeat"
      className="mt-1.5 space-y-2 rounded-md border border-line bg-raised/40 p-2 text-[12px]"
    >
      <div className="flex items-center gap-1.5">
        Every
        <input
          type="number"
          min={1}
          value={every}
          onChange={e => setEvery(count(e.target.value))}
          aria-label="Repeat every"
          className="field w-14"
        />
        <Select
          value={unit}
          onChange={setUnit}
          options={[
            {value: DAY, label: every === 1 ? 'day' : 'days'},
            {value: WEEK, label: every === 1 ? 'week' : 'weeks'},
          ]}
          className="w-fit"
          ariaLabel="Repeat unit"
        />
      </div>
      {unit === WEEK && (
        <div className="flex gap-1" role="group" aria-label="On">
          {WEEK_ORDER.map(d => (
            <button
              key={d}
              aria-pressed={days.includes(d)}
              aria-label={weekdayName(d)}
              onClick={() => toggle(d)}
              className={`h-7 w-7 rounded-full text-[11px] font-medium ${
                days.includes(d)
                  ? 'bg-accent text-on-accent'
                  : 'bg-raised text-fg hover:bg-line'
              }`}
            >
              {weekdayName(d)[0]}
            </button>
          ))}
        </div>
      )}
      <fieldset className="space-y-1">
        <legend className="mb-1 text-dim">Ends</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            className="accent-accent"
            checked={ends === 'never'}
            onChange={() => setEnds('never')}
          />
          Never
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            className="accent-accent"
            checked={ends === 'on'}
            onChange={() => setEnds('on')}
          />
          On
          <DateField
            value={until}
            onChange={d => {
              if (d) setUntil(d);
              setEnds('on');
            }}
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            className="accent-accent"
            checked={ends === 'after'}
            onChange={() => setEnds('after')}
          />
          After
          <input
            type="number"
            min={1}
            value={times}
            onChange={e => {
              setTimes(count(e.target.value));
              setEnds('after');
            }}
            aria-label="Number of times"
            className="field w-14"
          />
          times
        </label>
      </fieldset>
      <div className="flex justify-end gap-1">
        <button className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn-primary h-7" onClick={done}>
          Done
        </button>
      </div>
    </div>
  );
}
