import {CalendarDays, GraduationCap, X} from 'lucide-react';
import {useState} from 'react';
import {importClasses} from '../actions';
import {groupOptions} from '../format';
import {importGroup} from '../model/selectors';
import {useStore} from '../store';
import {useUi} from '../ui';
import {useUsosProposals} from '../usos/proposals';
import {meetingTitle, type Proposal} from '../usos/usos';
import {Modal} from './modal';
import {Select} from './ui/select';

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** The set of keys turned off, after turning `keys` on or off. */
function switched(
  off: ReadonlySet<string>,
  keys: string[],
  on: boolean,
): ReadonlySet<string> {
  const next = new Set(off);
  for (const k of keys) {
    if (on) next.delete(k);
    else next.add(k);
  }
  return next;
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
  // Classes imported without a session on the calendar, by key.
  const [offCalendar, setOffCalendar] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const projects = useStore(s => s.data.projects);
  const name = (id: string) => projects.find(p => p.id === id)?.name ?? '';
  // Groups picked per project; the rest go into their project's import group.
  const [targets, setTargets] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const types = [...new Set(proposals.map(p => p.meeting.type))].sort();

  const groups = new Map<string, Proposal[]>();
  for (const p of proposals)
    groups.set(p.projectId, [...(groups.get(p.projectId) ?? []), p]);
  const chosen = proposals.filter(p => !off.has(p.meeting.key));
  const toggle = (keys: string[], on: boolean) =>
    setOff(prev => switched(prev, keys, on));
  const toggleCalendar = (keys: string[], on: boolean) =>
    setOffCalendar(prev => switched(prev, keys, on));

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
          Each ticked class becomes a task in its course’s project (in the group
          picked there, if it has groups); with{' '}
          <CalendarDays size={12} className="inline align-[-1px]" /> ticked, it
          also goes on the calendar at the class’s time. Unticked classes are
          skipped and won’t be offered again.
        </p>
        {!proposals.length && (
          <p className="text-dim">Nothing new to review.</p>
        )}
        {types.length > 0 && (
          <div
            role="group"
            aria-label="Add to calendar"
            className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]"
          >
            <span className="text-dim">Add to calendar:</span>
            {types.map(t => {
              const keys = proposals
                .filter(p => p.meeting.type === t)
                .map(p => p.meeting.key);
              const on = keys.filter(k => !offCalendar.has(k)).length;
              return (
                <label
                  key={t}
                  className="flex cursor-pointer items-center gap-1"
                >
                  <input
                    type="checkbox"
                    className="accent-accent"
                    checked={on === keys.length}
                    ref={el => {
                      if (el) el.indeterminate = on > 0 && on < keys.length;
                    }}
                    onChange={e => toggleCalendar(keys, e.target.checked)}
                  />
                  {t}
                </label>
              );
            })}
          </div>
        )}
        <div className="space-y-4">
          {[...groups].map(([pid, list]) => {
            const keys = list.map(p => p.meeting.key);
            const allOn = keys.every(k => !off.has(k));
            const project = projects.find(p => p.id === pid);
            return (
              <section key={pid} aria-label={name(pid)}>
                <div className="mb-1 flex items-center gap-2 border-b border-line pb-1">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 font-medium text-strong">
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
                  {!!project?.groups.length && (
                    <Select
                      value={targets.get(pid) ?? importGroup(project)?.id ?? ''}
                      onChange={id =>
                        setTargets(prev => new Map(prev).set(pid, id))
                      }
                      options={groupOptions(project.groups)}
                      className="h-6 w-36 text-[12px]"
                      ariaLabel={`Group in ${name(pid)}`}
                    />
                  )}
                </div>
                <ul className="space-y-0.5">
                  {list.map(({meeting: m}) => (
                    <li
                      key={m.key}
                      className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-raised"
                    >
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
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
                      <label
                        className={`flex shrink-0 cursor-pointer items-center gap-1 text-dim ${off.has(m.key) ? 'opacity-40' : ''}`}
                        title="Also plan it on the calendar at the class’s time"
                      >
                        <input
                          type="checkbox"
                          className="accent-accent"
                          aria-label={`${meetingTitle(m)} on the calendar`}
                          checked={!offCalendar.has(m.key)}
                          disabled={off.has(m.key)}
                          onChange={e =>
                            toggleCalendar([m.key], e.target.checked)
                          }
                        />
                        <CalendarDays size={14} />
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
              const keys = chosen
                .map(p => p.meeting.key)
                .filter(k => !offCalendar.has(k));
              importClasses(chosen, proposals, new Set(keys), targets);
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
