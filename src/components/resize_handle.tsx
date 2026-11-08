/**
 * @fileoverview Resizable layouts. A page lays out its panes as usual and
 * puts a ResizeHandle between two of them: dragging it sizes the pane on one
 * side, and the pane on the other side takes what's left. usePaneSize keeps
 * the size, remembered on this device, for the page to apply.
 *
 * The handle works across (`x`) or up and down (`y`), in a grid or a flex
 * layout, as long as the two panes are its siblings. Arrow keys move it too,
 * a double click puts the default size back, and any key or another press
 * while dragging cancels (drag_cancel.ts).
 */
import {
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {holdDrag} from '../drag_cancel';

const KEY_PREFIX = 'personal-dashboard/layout/';
/** Arrow keys move a handle by this much (px). */
const KEY_STEP = 16;

function read(key: string): number | null {
  try {
    const v = Number(localStorage.getItem(key));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

function write(key: string, size: number | null) {
  try {
    if (size === null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(Math.round(size)));
  } catch {
    // Storage blocked: the size just won't outlive the tab.
  }
}

export interface PaneSize {
  /** In px: the one dragged to, or the default. */
  size: number;
  /** Whether it was dragged (else it's the default). */
  custom: boolean;
  /** Shows `size`; `keep` also remembers it on this device. */
  set(size: number, keep: boolean): void;
  /** Back to the default, forgotten on this device. */
  reset(): void;
}

/**
 * A pane's size, remembered on this device under `id`; `initial` until it's
 * dragged. `legacyKey` is where an older version kept it, read if nothing is
 * kept under `id` yet.
 */
export function usePaneSize(
  id: string,
  initial: number,
  legacyKey?: string,
): PaneSize {
  const key = KEY_PREFIX + id;
  const [stored, setStored] = useState<number | null>(
    () => read(key) ?? (legacyKey ? read(legacyKey) : null),
  );
  return {
    size: stored ?? initial,
    custom: stored !== null,
    set: (size, keep) => {
      setStored(size);
      if (keep) write(key, size);
    },
    reset: () => {
      setStored(null);
      write(key, null);
      if (legacyKey) write(legacyKey, null);
    },
  };
}

interface Props {
  pane: PaneSize;
  /** Which sibling it sizes: the one before it or the one after it. */
  sizes: 'before' | 'after';
  /** `x`: a handle between columns; `y`: between rows. */
  axis: 'x' | 'y';
  /** The sized pane's least size (px). */
  min: number;
  /** The least the other pane is left (px). */
  keep: number;
  /** What it resizes, for screen readers and as a tooltip. */
  label: string;
  className?: string;
}

/**
 * A handle between two sibling panes; see the file overview. Style it with
 * `className` (its place in the layout); it draws a line when hovered or
 * dragged.
 */
export function ResizeHandle({
  pane,
  sizes,
  axis,
  min,
  keep,
  label,
  className = '',
}: Props) {
  const [dragging, setDragging] = useState(false);
  const measure = (el: Element | null) => {
    const r = el?.getBoundingClientRect();
    return r ? (axis === 'x' ? r.width : r.height) : 0;
  };
  /** The sized pane's size now, and the most it can take. */
  const limits = (handle: HTMLElement) => {
    const before = handle.previousElementSibling;
    const after = handle.nextElementSibling;
    const [sized, other] =
      sizes === 'before' ? [before, after] : [after, before];
    const now = measure(sized);
    return {now, max: Math.max(min, now + measure(other) - keep)};
  };
  // Moving the handle toward the other pane grows the sized one.
  const grow = sizes === 'before' ? 1 : -1;

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const {now, max} = limits(handle);
    const was = pane.size;
    const at = (ev: {clientX: number; clientY: number}) =>
      axis === 'x' ? ev.clientX : ev.clientY;
    const from = at(e);
    let last = now;
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
    setDragging(true);
    const move = (ev: PointerEvent) => {
      last = Math.max(min, Math.min(max, now + grow * (at(ev) - from)));
      pane.set(last, false);
    };
    const stop = () => {
      release();
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', cancel);
      handle.removeEventListener('lostpointercapture', cancel);
      document.body.style.cursor = '';
      setDragging(false);
    };
    const up = () => {
      stop();
      pane.set(last, true);
    };
    // A key, another press, or the browser taking the touch: back to before.
    const cancel = () => {
      stop();
      pane.set(was, false);
    };
    const release = holdDrag(cancel);
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', cancel);
    handle.addEventListener('lostpointercapture', cancel);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const keys =
      axis === 'x' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
    const dir = keys.indexOf(e.key);
    if (dir < 0) return;
    e.preventDefault();
    const {now, max} = limits(e.currentTarget);
    const step = (dir === 1 ? 1 : -1) * grow * KEY_STEP;
    pane.set(Math.max(min, Math.min(max, now + step)), true);
  };

  return (
    <div
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      aria-valuenow={Math.round(pane.size)}
      aria-valuemin={min}
      title={`${label} (drag, or double-click for the default)`}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={pane.reset}
      className={`group relative shrink-0 touch-none outline-none ${axis === 'x' ? 'cursor-col-resize' : 'cursor-row-resize'} ${className}`}
    >
      <div
        className={`absolute rounded-full transition-colors duration-150 group-hover:bg-accent/40 group-focus-visible:bg-accent/60 ${dragging ? 'bg-accent/60' : ''} ${axis === 'x' ? 'inset-y-0 left-1/2 w-0.5 -translate-x-1/2' : 'inset-x-0 top-1/2 h-0.5 -translate-y-1/2'}`}
      />
    </div>
  );
}
