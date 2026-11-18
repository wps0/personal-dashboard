import {memo, useState} from 'react';
import {fmtDuration} from '../format';
import {parseDuration} from '../model/duration';

interface Props {
  value: number | undefined;
  onChange(v: number | undefined): void;
  placeholder?: string;
  className?: string;
  /** Allow clearing to undefined (e.g. optional estimates). */
  optional?: boolean;
  title?: string;
}

function shown(v: number | undefined) {
  return v === undefined ? '' : fmtDuration(v);
}

/**
 * Hours, written with their unit ("1h 30m", "2h") and typed as "1h 30m",
 * "45m", "1:30" or "1.5"; in whole minutes. Commits on blur or Enter; text
 * that isn't a length goes back. Unlike DurationInput it can be empty, when
 * `optional`.
 */
function HoursInputImpl({
  value,
  onChange,
  placeholder = '–',
  className = '',
  optional,
  title,
}: Props) {
  const [text, setText] = useState(shown(value));
  // Show outside changes to the value (set during render, not in an effect).
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setText(shown(value));
  }

  const commit = () => {
    const t = text.trim();
    if (t === '') {
      if (optional) onChange(undefined);
    } else {
      const hours = parseDuration(t);
      if (hours !== null && hours !== value) onChange(hours);
    }
    // Back to the stored value: the parent may reject a value. A change that
    // is stored arrives as the new `value`.
    setText(shown(value));
  };

  return (
    <input
      value={text}
      placeholder={placeholder}
      title={title}
      aria-label={title}
      onChange={e => setText(e.target.value)}
      onFocus={e => e.currentTarget.select()}
      onBlur={commit}
      onKeyDown={e =>
        e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()
      }
      onPointerDown={e => e.stopPropagation()}
      className={`w-12 rounded px-1 text-right tabular-nums hover:bg-raised focus:bg-raised ${className}`}
    />
  );
}

/** Memoized: re-renders only when its props change. */
export const HoursInput = memo(HoursInputImpl);
