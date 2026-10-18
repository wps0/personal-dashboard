import {GitMerge, X} from 'lucide-react';
import {useMemo, useState} from 'react';
import {useStore} from '../store';
import {
  applyChoices,
  describe,
  keptSide,
  type ConflictView,
  type Side,
} from '../sync/conflicts';
import type {Conflict} from '../sync/merge';
import {resolveConflicts, usePendingConflicts} from '../sync/pending';
import {toast, withUndo} from '../toast';
import {useUi} from '../ui';
import {Modal} from './modal';

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Review sync conflicts: values changed differently on this device and
 * another one. Each starts on what sync kept (this device's), so Apply
 * changes only what you switch.
 */
export function ConflictReview() {
  // What's pending when the dialog opens; later syncs don't reshuffle it.
  const [conflicts] = useState(() => usePendingConflicts.getState().conflicts);
  const [views] = useState(() =>
    conflicts.map(c => describe(c, useStore.getState().data)),
  );
  const close = () => useUi.getState().setDialog(null);
  const [sides, setSides] = useState<Side[]>(() => conflicts.map(keptSide));
  const changed = sides.filter((s, i) => s !== keptSide(conflicts[i])).length;

  const groups = useMemo(() => {
    const byRecord = new Map<string, number[]>();
    views.forEach((v, i) =>
      byRecord.set(v.what, [...(byRecord.get(v.what) ?? []), i]),
    );
    return [...byRecord];
  }, [views]);

  const apply = () => {
    const choices = conflicts.map((conflict, i) => ({
      conflict,
      side: sides[i],
    }));
    let skipped = 0;
    withUndo(
      `Resolved ${plural(conflicts.length, 'conflict', 'conflicts')}`,
      () => {
        const out = applyChoices(useStore.getState().data, choices);
        skipped = out.skipped;
        useStore.getState().replaceAll(out.data);
      },
    );
    if (skipped)
      toast(
        `${plural(skipped, 'value was', 'values were')} edited since the sync and left as is.`,
      );
    resolveConflicts(conflicts);
    close();
  };

  if (!conflicts.length) {
    return (
      <Modal onClose={close}>
        <div className="flex items-center gap-2 p-5">
          <p className="flex-1">No sync conflicts to review.</p>
          <button className="btn" onClick={close}>
            Close
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={close} width="max-w-3xl">
      <div className="p-5">
        <div className="mb-1 flex items-center gap-2">
          <GitMerge size={18} className="text-accent" />
          <h2 className="flex-1 text-lg font-medium text-strong">
            Review sync conflicts
          </h2>
          <button className="icon-btn" aria-label="Close" onClick={close}>
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-[12px] text-dim">
          These were changed differently on this device and on another one. Sync
          kept the highlighted version; click the other one where you prefer it.
        </p>

        <div className="mb-3 flex flex-wrap gap-2 text-[12px]">
          <button
            className="btn-ghost"
            onClick={() => setSides(conflicts.map(() => 'local'))}
          >
            All from this device
          </button>
          <button
            className="btn-ghost"
            onClick={() => setSides(conflicts.map(() => 'remote'))}
          >
            All from the other device
          </button>
        </div>

        <div className="space-y-4">
          {groups.map(([what, indexes]) => (
            <section key={what} className="rounded-lg border border-line">
              <h3 className="border-b border-line px-3 py-2 text-[13px] font-medium text-strong">
                {what}
              </h3>
              <div className="divide-y divide-line">
                {indexes.map(i => (
                  <ConflictRow
                    key={i}
                    view={views[i]}
                    conflict={conflicts[i]}
                    side={sides[i]}
                    onChoose={side =>
                      setSides(s => s.map((x, j) => (j === i ? side : x)))
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">
          <span className="flex-1 text-[12px] text-dim">
            {changed
              ? `${plural(changed, 'value', 'values')} will change.`
              : 'Nothing will change.'}
          </span>
          <button className="btn" onClick={close}>
            Later
          </button>
          <button className="btn-primary" onClick={apply}>
            {changed ? 'Apply' : 'Keep as is'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ConflictRow({
  view,
  conflict,
  side,
  onChoose,
}: {
  view: ConflictView;
  conflict: Conflict;
  side: Side;
  onChoose(side: Side): void;
}) {
  const name = `${view.what} ${view.field}`.trim();
  return (
    <fieldset className="px-3 py-2">
      <legend className="sr-only">{name}</legend>
      {view.field && <div className="label mb-1">{view.field}</div>}
      <div className="grid gap-2 sm:grid-cols-2">
        <Choice
          label="This device"
          value={view.local}
          checked={side === 'local'}
          kept={keptSide(conflict) === 'local'}
          name={name}
          onChoose={() => onChoose('local')}
        />
        <Choice
          label="Other device"
          value={view.remote}
          checked={side === 'remote'}
          kept={keptSide(conflict) === 'remote'}
          name={name}
          onChoose={() => onChoose('remote')}
        />
      </div>
    </fieldset>
  );
}

function Choice({
  label,
  value,
  checked,
  kept,
  name,
  onChoose,
}: {
  label: string;
  value: string;
  checked: boolean;
  kept: boolean;
  name: string;
  onChoose(): void;
}) {
  return (
    <label
      className={`flex cursor-pointer gap-2 rounded-md border px-3 py-2 ${checked ? 'border-accent bg-accent/10' : 'border-line hover:bg-raised'}`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChoose}
        className="mt-0.5 accent-accent"
        aria-label={`${name}: ${label.toLowerCase()}`}
      />
      <span className="min-w-0">
        <span className="block text-[11px] text-dim">
          {label}
          {kept && ' · kept by sync'}
        </span>
        <span className="flex items-center gap-1.5 break-words text-[13px] text-fg">
          {/^#[0-9a-f]{6}$/i.test(value) && (
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{background: value}}
            />
          )}
          {value}
        </span>
      </span>
    </label>
  );
}
