import { useEffect, useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

/**
 * Keeps keystrokes local and writes to the store after a short pause (and on
 * blur/unmount), so typing re-renders only this field instead of the whole view.
 */
function useBuffered(value: string, onCommit: (v: string) => void, delay: number) {
  const [text, setText] = useState(value);
  const pending = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  const flush = () => {
    window.clearTimeout(timer.current);
    if (pending.current !== null) {
      const v = pending.current;
      pending.current = null;
      commitRef.current(v);
    }
  };

  // Accept outside changes (import, other views) when we have nothing pending.
  useEffect(() => {
    if (pending.current === null) setText(value);
  }, [value]);
  useEffect(() => flush, []);

  const change = (v: string) => {
    setText(v);
    pending.current = v;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, delay);
  };
  return { text, change, flush };
}

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onCommit(v: string): void;
  delay?: number;
};

export function BufferedTextarea({ value, onCommit, delay = 400, onBlur, ...rest }: TextareaProps) {
  const { text, change, flush } = useBuffered(value, onCommit, delay);
  return (
    <textarea
      {...rest}
      value={text}
      onChange={(e) => change(e.target.value)}
      onBlur={(e) => {
        flush();
        onBlur?.(e);
      }}
    />
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onCommit(v: string): void;
  delay?: number;
};

export function BufferedInput({ value, onCommit, delay = 400, onBlur, onKeyDown, ...rest }: InputProps) {
  const { text, change, flush } = useBuffered(value, onCommit, delay);
  return (
    <input
      {...rest}
      value={text}
      onChange={(e) => change(e.target.value)}
      onBlur={(e) => {
        flush();
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        onKeyDown?.(e);
      }}
    />
  );
}
