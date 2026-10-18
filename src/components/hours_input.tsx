import {memo, useState} from 'react';

interface Props {
  value: number | undefined;
  onChange(v: number | undefined): void;
  placeholder?: string;
  className?: string;
  /** Allow clearing to undefined (e.g. optional estimates). */
  optional?: boolean;
  title?: string;
}

/** Numeric hours field that commits on blur/Enter, in 0.25h steps. */
function HoursInputImpl({
  value,
  onChange,
  placeholder = '–',
  className = '',
  optional,
  title,
}: Props) {
  const [text, setText] = useState(value?.toString() ?? '');
  // Show outside changes to the value (set during render, not in an effect).
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setText(value?.toString() ?? '');
  }

  const commit = () => {
    const t = text.trim().replace(',', '.');
    const n = Math.round(Number(t) * 4) / 4;
    if (t === '') {
      if (optional) onChange(undefined);
    } else if (Number.isFinite(n) && n >= 0) onChange(n);
    // Back to the stored value: typing 2.1 over 2 stores 2, and the parent may
    // reject a value. A change that is stored arrives as the new `value`.
    setText(value?.toString() ?? '');
  };

  return (
    <input
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      title={title}
      onChange={e => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={e =>
        e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()
      }
      onPointerDown={e => e.stopPropagation()}
      className={`w-10 rounded px-1 text-right tabular-nums hover:bg-raised focus:bg-raised ${className}`}
    />
  );
}

/** Memoized: re-renders only when its props change. */
export const HoursInput = memo(HoursInputImpl);
