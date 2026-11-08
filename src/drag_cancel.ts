/**
 * @fileoverview Cancelling a drag, as Google Calendar does: while one is in
 * progress, any key, or another press (a second mouse button or finger),
 * cancels it and does nothing else, and what was dragged goes back where it
 * was. The click that ends the cancelled press is swallowed too.
 *
 * A drag holds this for as long as it lasts (holdDrag): dnd-kit's (moving
 * blocks and rows) through DragCancel, and the hand-made ones (resizing a
 * block, selecting slots, moving a card) themselves, with their own way back.
 */
import {useDndMonitor} from '@dnd-kit/core';
import {useEffect, useRef} from 'react';

/** How long after the press ends its click may still come, on a touch screen. */
const CLICK_AFTER_UP_MS = 400;

/** Whether a mouse event has a second button down besides the one held. */
function chord(e: MouseEvent): boolean {
  return (e.buttons & (e.buttons - 1)) !== 0;
}

/** Swallows the next click, which ends a cancelled drag's press. */
function swallowClick() {
  const swallow = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    stop();
  };
  const soon = () => setTimeout(stop, CLICK_AFTER_UP_MS);
  const stop = () => {
    removeEventListener('click', swallow, true);
    removeEventListener('pointerup', soon, true);
  };
  addEventListener('click', swallow, true);
  addEventListener('pointerup', soon, true);
}

/**
 * Marks a drag as in progress until the returned function is called (when
 * it ends; calling it again does nothing). Meanwhile, the first key pressed
 * (not one held since before) or another press calls `cancel`, which puts
 * things back, and goes no further: no shortcut runs, no button presses.
 */
export function holdDrag(cancel: () => void): () => void {
  const onKey = (e: KeyboardEvent) => {
    // A key held since before repeats; dnd-kit's own Escape isn't trusted.
    if (e.isTrusted && !e.repeat) stopWith(e);
  };
  // A finger or pen joining in. (A mouse's other buttons fire no pointerdown.)
  const onPointer = (e: PointerEvent) => stopWith(e);
  const onMouse = (e: MouseEvent) => chord(e) && stopWith(e);
  let held = true;
  const release = () => {
    if (!held) return;
    held = false;
    removeEventListener('keydown', onKey, true);
    removeEventListener('pointerdown', onPointer, true);
    removeEventListener('mousedown', onMouse, true);
  };
  const stopWith = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    release();
    swallowClick();
    cancel();
  };
  addEventListener('keydown', onKey, true);
  addEventListener('pointerdown', onPointer, true);
  addEventListener('mousedown', onMouse, true);
  return release;
}

/** Cancels dnd-kit's drag in progress, the way it cancels on Escape. */
function cancelDndKit() {
  document.dispatchEvent(
    new KeyboardEvent('keydown', {key: 'Escape', code: 'Escape'}),
  );
}

/** Inside a DndContext: its drags hold holdDrag while they last. */
export function DragCancel(): null {
  const release = useRef<(() => void) | null>(null);
  const end = () => {
    release.current?.();
    release.current = null;
  };
  useDndMonitor({
    onDragStart: () => {
      end();
      release.current = holdDrag(cancelDndKit);
    },
    onDragEnd: end,
    onDragCancel: end,
  });
  // Unmounted mid-drag: stop listening.
  useEffect(() => () => release.current?.(), []);
  return null;
}
