import {PointerSensor, TouchSensor, useSensor, useSensors} from '@dnd-kit/core';

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
