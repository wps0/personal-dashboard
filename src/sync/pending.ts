import {create} from 'zustand';
import type {Conflict} from './merge';

/**
 * Conflicts from recent syncs, waiting for review. In memory only: until
 * reviewed, this device's values stay, which is also what happens if the
 * tab is closed.
 */
export const usePendingConflicts = create<{conflicts: Conflict[]}>(() => ({
  conflicts: [],
}));

const key = (c: Conflict) => c.path.join('\u0000');

/** Adds conflicts; a newer one about the same value replaces the older. */
export function addConflicts(added: Conflict[]) {
  const fresh = new Set(added.map(key));
  usePendingConflicts.setState(s => ({
    conflicts: [...s.conflicts.filter(c => !fresh.has(key(c))), ...added],
  }));
}

export function clearConflicts() {
  usePendingConflicts.setState({conflicts: []});
}

/** Removes these conflicts (reviewed), keeping any that arrived meanwhile. */
export function resolveConflicts(done: Conflict[]) {
  const gone = new Set(done);
  usePendingConflicts.setState(s => ({
    conflicts: s.conflicts.filter(c => !gone.has(c)),
  }));
}
