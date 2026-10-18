import {GraduationCap, X} from 'lucide-react';
import {useState} from 'react';
import {importClasses} from '../actions';
import {useStore} from '../store';
import {useUi} from '../ui';
import {useUsosProposals} from '../usos/proposals';
import {meetingTitle, type Proposal} from '../usos/usos';
import {Modal} from './modal';

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** "3 new classes from USOS · Review", on Home (all courses) and in a course's project panel. */
export function UsosBanner({projectId}: {projectId?: string}) {
  const proposals = useUsosProposals(projectId);
  if (!proposals.length) return null;
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[12px]">
      <GraduationCap size={16} className="shrink-0 text-accent" />
      <span className="flex-1 text-fg">
        {plural(proposals.length, 'new class', 'new classes')} from USOS
      </span>
      <button
        className="btn h-7"
        onClick={() => useUi.getState().reviewUsos(projectId)}
      >
        Review
      </button>
    </div>
  );
}

/** Review new USOS classes: tick the ones to add as tasks. */
export function UsosReview() {
  const projectId = useUi(s => s.usosProjectId);
  const proposals = useUsosProposals(projectId ?? undefined);
  const close = () => useUi.getState().setDialog(null);
  // Unticked classes, by key; everything starts ticked.
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());
  const projects = useStore(s => s.data.projects);
  const name = (id: string) => projects.find(p => p.id === id)?.name ?? '';

  const groups = new Map<string, Proposal[]>();
  for (const p of proposals)
    groups.set(p.projectId, [...(groups.get(p.projectId) ?? []), p]);
  const chosen = proposals.filter(p => !off.has(p.meeting.key));
  const toggle = (keys: string[], on: boolean) =>
    setOff(prev => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.delete(k);
        else next.add(k);
      }
      return next;
    });

  return (
    <Modal onClose={close} width="max-w-2xl">
      <div className="p-5">
        <div className="mb-1 flex items-center">
          <h2 className="flex-1 text-lg font-medium text-strong">
            New classes from USOS
          </h2>
          <button className="icon-btn" aria-label="Close" onClick={close}>
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-[12px] text-dim">
          Each ticked class becomes a task in its course’s project. Unticked
          classes are skipped and won’t be offered again.
        </p>
        {!proposals.length && (
          <p className="text-dim">Nothing new to review.</p>
        )}
        <div className="space-y-4">
          {[...groups].map(([pid, list]) => {
            const keys = list.map(p => p.meeting.key);
            const allOn = keys.every(k => !off.has(k));
            return (
              <section key={pid} aria-label={name(pid)}>
                <label className="mb-1 flex cursor-pointer items-center gap-2 border-b border-line pb-1 font-medium text-strong">
                  <input
                    type="checkbox"
                    className="accent-accent"
                    checked={allOn}
                    onChange={e => toggle(keys, e.target.checked)}
                  />
                  {name(pid)}
                  <span className="text-[12px] font-normal text-dim">
                    {plural(list.length, 'class', 'classes')}
                  </span>
                </label>
                <ul className="space-y-0.5">
                  {list.map(({meeting: m}) => (
                    <li key={m.key}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-raised">
                        <input
                          type="checkbox"
                          className="accent-accent"
                          checked={!off.has(m.key)}
                          onChange={e => toggle([m.key], e.target.checked)}
                        />
                        <span className="tabular-nums">{meetingTitle(m)}</span>
                        <span className="min-w-0 flex-1 truncate text-[12px] text-dim">
                          {m.course}
                          {m.location && ` · ${m.location}`}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button className="btn" onClick={close}>
            Not now
          </button>
          <button
            className="btn-primary"
            disabled={!proposals.length}
            onClick={() => {
              importClasses(chosen, proposals);
              close();
            }}
          >
            {chosen.length
              ? `Add ${plural(chosen.length, 'task', 'tasks')}`
              : 'Skip all'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
