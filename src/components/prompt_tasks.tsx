import {AlertTriangle, Sparkles, X} from 'lucide-react';
import {useState} from 'react';
import {addPromptTasks} from '../actions';
import {
  askForTasks,
  itemsFromTasks,
  type PromptRequest,
  type PromptResult,
  type PromptTask,
} from '../curriculum/prompt_tasks';
import {useGemini} from '../curriculum/gemini';
import {groupOptions, KIND_OPTIONS} from '../format';
import {useToday} from '../hooks';
import {shortDate} from '../model/dates';
import {ItemKind} from '../model/types';
import {href} from '../router';
import {useStore} from '../store';
import {useUi} from '../ui';
import {DateField} from './date_field';
import {HoursInput} from './hours_input';
import {Modal} from './modal';
import {Select} from './ui/select';

/** A task in the review, and whether it's ticked to be added. */
interface Row extends PromptTask {
  on: boolean;
}

function rowsOf(result: PromptResult): Row[] {
  return result.tasks.map(t => ({...t, on: true}));
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** The kinds to pick from, with Other for a task the model couldn't place. */
const KINDS = [...KIND_OPTIONS, {value: ItemKind.UNSPECIFIED, label: 'Other'}];

/**
 * Tasks from a prompt (SPEC 5.4): say what tasks you want, paste any
 * material, review what Gemini makes of it (edit, untick, or ask for changes
 * in words), and add them in one undoable step.
 */
export function PromptTasks() {
  const projectId = useUi(s => s.promptProjectId);
  const project = useStore(s => s.data.projects.find(p => p.id === projectId));
  const {apiKey, model} = useGemini();
  const today = useToday();
  const [request, setRequest] = useState('');
  const [material, setMaterial] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [change, setChange] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const close = () => useUi.getState().setDialog(null);
  if (!project) return null;
  const groups = project.groups;

  /** Asks Gemini; with `revise`, for the list with the change made. */
  const ask = async (revise?: PromptRequest['revise']) => {
    setBusy(true);
    setError('');
    try {
      const result = await askForTasks(
        {request, material, projectName: project.name, groups, today, revise},
        {apiKey, model},
      );
      if (!result.tasks.length)
        throw new Error(
          'Gemini made no tasks from this. Say more, or paste the material.',
        );
      setRows(rowsOf(result));
      setWarnings(result.warnings);
      setChange('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const ticked = rows?.filter(r => r.on) ?? [];
  const edit = (i: number, patch: Partial<Row>) =>
    setRows(rs => rs && rs.map((r, j) => (j === i ? {...r, ...patch} : r)));

  return (
    <Modal onClose={close} width="max-w-4xl" label="Tasks from a prompt">
      <div className="p-5">
        <div className="mb-1 flex items-center gap-2">
          <Sparkles size={18} className="text-accent" />
          <h2 className="flex-1 text-lg font-medium text-strong">
            Tasks from a prompt, into {project.name}
          </h2>
          <button className="icon-btn" aria-label="Close" onClick={close}>
            <X size={18} />
          </button>
        </div>

        {rows === null ? (
          <div className="space-y-3">
            <p className="text-[12px] text-dim">
              Say what tasks you want and paste the material they come from; you
              review the list before anything is added.{' '}
              <strong className="font-medium text-fg">
                Both are sent to Google (Gemini API).
              </strong>
            </p>
            <label className="block space-y-1">
              <span className="label">What tasks?</span>
              <textarea
                value={request}
                onChange={e => setRequest(e.target.value)}
                rows={3}
                placeholder="One task per lecture below, 2h each, due the day before the next one"
                className="w-full resize-y rounded-md bg-raised px-3 py-2 text-[13px] placeholder:text-dim"
                disabled={busy}
              />
            </label>
            <label className="block space-y-1">
              <span className="label">Material (optional)</span>
              <textarea
                value={material}
                onChange={e => setMaterial(e.target.value)}
                rows={9}
                placeholder="A curriculum, a list of lectures, an assignment schedule…"
                className="w-full resize-y rounded-md bg-raised px-3 py-2 text-[13px] placeholder:text-dim"
                disabled={busy}
              />
            </label>
            {error && (
              <p role="alert" className="text-[12px] text-danger">
                {error}
              </p>
            )}
            {!apiKey && (
              <p className="text-[12px] text-warn">
                Add your Gemini API key in{' '}
                <a
                  href={href({name: 'settings'})}
                  onClick={close}
                  className="underline"
                >
                  Settings → Gemini
                </a>{' '}
                first.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button className="btn" onClick={close}>
                Cancel
              </button>
              <button
                className="btn-primary"
                disabled={!apiKey || !request.trim() || busy}
                onClick={() => void ask()}
              >
                {busy ? 'Asking Gemini…' : 'Make tasks'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {warnings.length > 0 && (
              <div className="space-y-1 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[12px]">
                {warnings.map(w => (
                  <p key={w} className="flex gap-1.5 text-fg">
                    <AlertTriangle
                      size={13}
                      className="mt-0.5 shrink-0 text-warn"
                    />
                    {w}
                  </p>
                ))}
              </div>
            )}
            <ul className="divide-y divide-line">
              {rows.map((r, i) => (
                <li
                  key={i}
                  aria-label={`Task ${i + 1}`}
                  className={`flex gap-2 py-2 ${r.on ? '' : 'opacity-50'}`}
                >
                  <input
                    type="checkbox"
                    className="mt-1.5 accent-accent"
                    checked={r.on}
                    onChange={e => edit(i, {on: e.target.checked})}
                    aria-label={`Add task ${i + 1}`}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <input
                      value={r.title}
                      onChange={e => edit(i, {title: e.target.value})}
                      aria-label={`Task ${i + 1}: title`}
                      className="field h-7 w-full font-medium"
                    />
                    <div className="flex flex-wrap items-center gap-2 text-[12px]">
                      <Select
                        value={r.kind}
                        onChange={kind => edit(i, {kind})}
                        options={KINDS}
                        className="h-7 w-32"
                        ariaLabel={`Task ${i + 1}: kind`}
                      />
                      <DateField
                        optional
                        value={r.dueDate ?? undefined}
                        onChange={d => edit(i, {dueDate: d ?? null})}
                        placeholder="No due date"
                        format={d => `Due ${shortDate(d)}`}
                        className="w-40"
                      />
                      <span className="flex items-center gap-1">
                        <HoursInput
                          optional
                          value={r.estimateHours ?? undefined}
                          onChange={h => edit(i, {estimateHours: h ?? null})}
                          className="field w-14"
                          title={`Task ${i + 1}: estimate`}
                        />
                        <span className="text-dim">h</span>
                      </span>
                      {groups.length > 0 && (
                        <Select
                          value={groups.find(g => g.name === r.group)?.id ?? ''}
                          onChange={id =>
                            edit(i, {
                              group:
                                groups.find(g => g.id === id)?.name ?? null,
                            })
                          }
                          options={groupOptions(groups)}
                          className="h-7 w-36"
                          ariaLabel={`Task ${i + 1}: group`}
                        />
                      )}
                    </div>
                    {r.notes && (
                      <textarea
                        value={r.notes}
                        onChange={e => edit(i, {notes: e.target.value})}
                        rows={2}
                        aria-label={`Task ${i + 1}: notes`}
                        className="w-full resize-y rounded-md bg-raised px-2 py-1 text-[12px]"
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <form
              className="flex flex-wrap items-center gap-2 border-t border-line pt-3"
              onSubmit={e => {
                e.preventDefault();
                if (change.trim()) void ask({tasks: ticked, change});
              }}
            >
              <input
                value={change}
                onChange={e => setChange(e.target.value)}
                placeholder="Ask for changes: “estimates 1h”, “drop the labs”…"
                aria-label="Ask for changes"
                className="field h-8 min-w-0 flex-1"
                disabled={busy}
              />
              <button className="btn h-8" disabled={!change.trim() || busy}>
                {busy ? 'Asking Gemini…' : 'Revise'}
              </button>
            </form>
            {error && (
              <p role="alert" className="text-[12px] text-danger">
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="mr-auto text-[12px] text-dim">
                The revision sends the ticked tasks along with your words.
              </span>
              <button
                className="btn"
                onClick={() => {
                  setRows(null);
                  setError('');
                }}
              >
                Back
              </button>
              <button
                className="btn-primary"
                disabled={!ticked.length || busy}
                onClick={() => {
                  addPromptTasks(project.id, itemsFromTasks(ticked, groups));
                  close();
                }}
              >
                Add {plural(ticked.length, 'task', 'tasks')}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
