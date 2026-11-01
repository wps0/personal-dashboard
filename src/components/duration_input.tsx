import {memo, useState} from 'react';
import {fmtDuration} from '../format';
import {parseDuration} from '../model/duration';

interface Props {
  /** Hours. */
  value: number;
  onChange(hours: number): void;
  className?: string;
  title?: string;
  ariaLabel?: string;
}

/**
 * A length of time shown as "1h 53m", typed as "1h 53m", "1:53", "113m" or
 * "1.5" (hours); in whole minutes. Commits on blur or Enter; text that isn't
 * a length goes back.
 */
function DurationInputImpl({
  value,
  onChange,
  /** Its width too; 4rem when not given. */
  className = 'w-16',
  title,
  ariaLabel,
}: Props) {
  const [text, setText] = useState(fmtDuration(value));
  // Show outside changes to the value (set during render, not in an effect).
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setText(fmtDuration(value));
  }

  const commit = () => {
    const hours = parseDuration(text);
    if (hours !== null && hours !== value) onChange(hours);
    // Back to the stored value; a change that's stored arrives as `value`.
    setText(fmtDuration(value));
  };

  return (
    <input
      value={text}
      title={title}
      aria-label={ariaLabel ?? title}
      onChange={e => setText(e.target.value)}
      onFocus={e => e.currentTarget.select()}
      onBlur={commit}
      onKeyDown={e =>
        e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()
      }
      onPointerDown={e => e.stopPropagation()}
      className={`rounded px-1 text-right tabular-nums hover:bg-raised focus:bg-raised ${className}`}
    />
  );
}

/** Memoized: re-renders only when its props change. */
export const DurationInput = memo(DurationInputImpl);
