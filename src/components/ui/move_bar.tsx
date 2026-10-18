import {GripHorizontal, X} from 'lucide-react';
import type {KeyboardEvent, PointerEvent} from 'react';

/** Keep at least this much of the card on screen (px), so it can be dragged back. */
const KEEP = 48;
/** Arrow keys move the card by this much (px). */
const KEY_STEP = 24;

function wrapperOf(el: Element): HTMLElement | null {
  return el.closest<HTMLElement>('[data-radix-popper-content-wrapper]');
}

function offsetOf(wrapper: HTMLElement): [number, number] {
  const [x = 0, y = 0] = (wrapper.style.translate || '0px 0px')
    .split(' ')
    .map(v => parseFloat(v) || 0);
  return [x, y];
}

/**
 * Moves a popover card by `dx, dy` from where it was. Applied as CSS `translate`
 * on Radix's wrapper, which composes with the `transform` Radix positions it
 * with, so the card keeps following its anchor while staying offset.
 */
function moveBy(
  wrapper: HTMLElement,
  from: [number, number],
  rect: DOMRect,
  dx: number,
  dy: number,
) {
  const x = Math.min(
    Math.max(dx, KEEP - rect.right),
    window.innerWidth - KEEP - rect.left,
  );
  const y = Math.min(
    Math.max(dy, -rect.top),
    window.innerHeight - KEEP - rect.top,
  );
  wrapper.style.translate = `${from[0] + x}px ${from[1] + y}px`;
}

/**
 * Top bar of a floating card, like Google Calendar's create popup: drag the
 * grip (or the bar) to move the card, arrow keys move it from the keyboard.
 */
export function MoveBar({onClose}: {onClose(): void}) {
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('[data-no-move]'))
      return;
    const wrapper = wrapperOf(e.currentTarget);
    if (!wrapper) return;
    e.preventDefault();
    const bar = e.currentTarget;
    bar.setPointerCapture(e.pointerId);
    const from = offsetOf(wrapper);
    const rect = wrapper.getBoundingClientRect();
    const [x0, y0] = [e.clientX, e.clientY];
    const move = (ev: globalThis.PointerEvent) =>
      moveBy(wrapper, from, rect, ev.clientX - x0, ev.clientY - y0);
    const up = () => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      bar.removeEventListener('pointercancel', up);
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const d = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    }[e.key];
    const wrapper = wrapperOf(e.currentTarget);
    if (!d || !wrapper) return;
    e.preventDefault();
    moveBy(
      wrapper,
      offsetOf(wrapper),
      wrapper.getBoundingClientRect(),
      d[0],
      d[1],
    );
  };

  return (
    <div
      onPointerDown={onPointerDown}
      className="-mx-3 -mt-3 mb-2 flex h-9 cursor-grab touch-none items-center justify-between rounded-t-xl bg-raised px-2 select-none active:cursor-grabbing"
    >
      <button
        className="icon-btn h-7 w-7 cursor-grab text-dim active:cursor-grabbing"
        aria-label="Move (drag, or arrow keys)"
        title="Drag to move"
        onKeyDown={onKeyDown}
      >
        <GripHorizontal size={18} />
      </button>
      <button
        data-no-move
        className="icon-btn h-7 w-7"
        aria-label="Close"
        onClick={onClose}
      >
        <X size={16} />
      </button>
    </div>
  );
}
