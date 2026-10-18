import {GitMerge} from 'lucide-react';
import {usePendingConflicts} from '../sync/pending';
import {useUi} from '../ui';

/** In the header while sync conflicts wait for review; opens the review. */
export function ConflictsBadge() {
  const n = usePendingConflicts(s => s.conflicts.length);
  if (!n) return null;
  const label = `${n} sync ${n === 1 ? 'conflict' : 'conflicts'} to review`;
  return (
    <button
      className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-warn/40 bg-warn/10 px-2 text-[12px] text-warn hover:bg-warn/20"
      onClick={() => useUi.getState().setDialog('conflicts')}
      title={label}
      aria-label={label}
    >
      <GitMerge size={14} />
      <span className="tabular-nums">{n}</span>
    </button>
  );
}
