import {memo, useMemo} from 'react';
import {fromMinutes, toMinutes} from '../model/time';
import {Select} from './ui/select';

interface Props {
  value: string;
  onChange(v: string): void;
  /** For an end time: only offer times after this, labelled with the duration ("11:00 (1 h)"). */
  after?: string;
  variant?: 'field' | 'ghost';
  className?: string;
  ariaLabel?: string;
}

function duration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Google-Calendar-style time dropdown in 15-minute steps. */
function TimeSelectImpl({
  value,
  onChange,
  after,
  variant,
  className = 'w-24',
  ariaLabel,
}: Props) {
  const options = useMemo(() => {
    const from = after ? toMinutes(after) + 15 : 0;
    const list = [];
    for (let m = from; m < 24 * 60; m += 15) {
      const t = fromMinutes(m);
      list.push({
        value: t,
        label: after ? `${t} (${duration(m - toMinutes(after))})` : t,
      });
    }
    // Keep an off-grid current value selectable.
    if (!list.some(o => o.value === value)) list.unshift({value, label: value});
    return list;
  }, [after, value]);
  return (
    <Select
      value={value}
      onChange={onChange}
      options={options}
      variant={variant}
      className={className}
      ariaLabel={ariaLabel}
      display={value}
    />
  );
}

/** Memoized: re-renders only when its props change. */
export const TimeSelect = memo(TimeSelectImpl);
