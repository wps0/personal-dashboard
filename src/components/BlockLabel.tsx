import type {ReactNode} from 'react';

/** Below this height (px) a block's text fits on one line only. */
const COMPACT_BELOW = 30;

/**
 * Padding and line height for a time-grid block of this height. Short blocks
 * get no vertical padding and a 13px line, so one line fits even in a 15-minute
 * block (14px).
 */
export function blockTextClass(height: number): string {
  return height < COMPACT_BELOW
    ? 'py-0 leading-[13px]'
    : 'py-0.5 leading-tight';
}

/**
 * The text inside a time-grid block. Short blocks show one line, "Title, 16:30",
 * like Google Calendar; taller ones show the title and a details line.
 */
export function BlockLabel({
  height,
  title,
  start,
  details,
  titleClassName = '',
}: {
  height: number;
  title: ReactNode;
  /** Start time, shown after the title on short blocks. */
  start: string;
  /** Second line on taller blocks, e.g. "09:00 – 10:30". */
  details: ReactNode;
  titleClassName?: string;
}) {
  if (height < COMPACT_BELOW)
    return (
      <div className="truncate">
        <span className={`font-medium ${titleClassName}`}>{title}</span>
        <span className="opacity-80">, {start}</span>
      </div>
    );
  return (
    <>
      <div className={`truncate font-medium ${titleClassName}`}>{title}</div>
      <div className="truncate opacity-80">{details}</div>
    </>
  );
}
