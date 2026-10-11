import {
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Modifier,
} from '@dnd-kit/core';

/**
 * Drag sensors shared by the calendar grids and the week planner: a mouse drag
 * starts after 5px of movement (so clicks still click), a touch drag after a
 * 200ms press (so swipes still scroll).
 */
export function useDragSensors() {
  return useSensors(
    useSensor(PointerSensor, {activationConstraint: {distance: 5}}),
    useSensor(TouchSensor, {activationConstraint: {delay: 200, tolerance: 6}}),
  );
}

let suppressClickUntil = 0;

/** Ignore clicks for a moment: the pointer-up ending a drag or resize also fires a click. */
export function suppressClicks() {
  suppressClickUntil = performance.now() + 200;
}

export function clicksSuppressed() {
  return performance.now() < suppressClickUntil;
}

function pointOf(e: Event | null): {x: number; y: number} | null {
  if (!e) return null;
  if ('touches' in e) {
    const t = (e as TouchEvent).touches[0];
    return t ? {x: t.clientX, y: t.clientY} : null;
  }
  if ('clientX' in e) {
    const p = e as PointerEvent;
    return {x: p.clientX, y: p.clientY};
  }
  return null;
}

/**
 * DragOverlay modifier: the floating copy hangs just below the pointer, rather
 * than where the original block's corner was (which could be far to the side
 * when a wide block was grabbed near its right edge).
 */
export const ghostUnderPointer: Modifier = ({
  activatorEvent,
  activeNodeRect,
  transform,
}) => {
  const p = pointOf(activatorEvent);
  if (!p || !activeNodeRect) return transform;
  return {
    ...transform,
    x: transform.x + p.x - activeNodeRect.left - 8,
    y: transform.y + p.y - activeNodeRect.top + 6,
  };
};
