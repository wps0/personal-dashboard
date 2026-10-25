import {useState} from 'react';

interface Props {
  value: string;
  onChange(v: string): void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}

/** Text that looks like a label and edits in place; commits on blur/Enter, Esc reverts. */
export function InlineText({
  value,
  onChange,
  className = '',
  placeholder,
  ariaLabel,
}: Props) {
  const [text, setText] = useState(value);
  // Show outside changes to the value (set during render, not in an effect).
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setText(value);
  }
  return (
    <input
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={e => setText(e.target.value)}
      onBlur={() =>
        text.trim() ? text !== value && onChange(text.trim()) : setText(value)
      }
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setText(value);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
      className={`min-w-0 rounded px-1 hover:bg-raised focus:bg-raised ${className}`}
    />
  );
}
