import {AlertTriangle, Sparkles, Trash2, X} from 'lucide-react';
import {useMemo, useState, type ReactNode} from 'react';
import {
  extractCurriculum,
  itemsFromTopics,
  lectureNumber,
  notVerbatim,
  type CurriculumResult,
  type Granularity,
  type Topic,
} from '../curriculum/curriculum';
import {useGemini} from '../curriculum/gemini';
import {importCurriculum} from '../actions';
import {groupOptions} from '../format';
import {importGroup} from '../model/selectors';
import {href} from '../router';
import {useStore} from '../store';
import {useUi} from '../ui';
import {HoursInput} from './hours_input';
import {Modal} from './modal';
import {Select} from './ui/select';

type Step =
  | {kind: 'paste'; error?: string}
  | {kind: 'loading'}
  | {kind: 'review'; result: CurriculumResult};

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Import curriculum (SPEC 5.2): paste a course description, Gemini extracts
 * the topics with their original wording, you review and edit them, and they
 * become class items of the project.
 */
export function CurriculumImport() {
  const projectId = useUi(s => s.curriculumProjectId);
  const project = useStore(s => s.data.projects.find(p => p.id === projectId));
  const {apiKey, model} = useGemini();
  const [text, setText] = useState('');
  const [step, setStep] = useState<Step>({kind: 'paste'});
  const close = () => useUi.getState().setDialog(null);
  if (!project) return null;

  const extract = async () => {
    setStep({kind: 'loading'});
    try {
      const result = await extractCurriculum(text, {apiKey, model});
      if (!result.topics.length)
        throw new Error('Gemini found no lectures or topics in this text.');
      setStep({kind: 'review', result});
    } catch (e) {
      setStep({kind: 'paste', error: (e as Error).message});
    }
  };

  return (
    <Modal onClose={close} width="max-w-4xl">
      <div className="p-5">
        <div className="mb-1 flex items-center gap-2">
          <Sparkles size={18} className="text-accent" />
          <h2 className="flex-1 text-lg font-medium text-strong">
            Import curriculum into {project.name}
          </h2>
          <button className="icon-btn" aria-label="Close" onClick={close}>
            <X size={18} />
          </button>
        </div>
        {step.kind === 'review' ? (
          <Review
            source={text}
            initial={step.result}
            projectId={project.id}
            onBack={() => setStep({kind: 'paste'})}
            onDone={close}
          />
        ) : (
          <div className="space-y-3">
            <p className="text-[12px] text-dim">
              Paste the course description, e.g. “Pełny opis” from USOS. Gemini
              extracts the lectures or topics, keeping the original wording; you
              review everything before items are created.{' '}
              <strong className="font-medium text-fg">
                The text is sent to Google (Gemini API).
              </strong>
            </p>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={12}
              placeholder="Wykłady 1-4: …"
              aria-label="Course description"
              className="w-full resize-y rounded-md bg-raised px-3 py-2 text-[13px] placeholder:text-dim"
              disabled={step.kind === 'loading'}
            />
            {step.kind === 'paste' && step.error && (
              <p role="alert" className="text-[12px] text-danger">
                {step.error}
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
                disabled={!apiKey || !text.trim() || step.kind === 'loading'}
                onClick={() => void extract()}
              >
                {step.kind === 'loading' ? 'Asking Gemini…' : 'Extract topics'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Review({
  source,
  initial,
  projectId,
  onBack,
  onDone,
}: {
  source: string;
  initial: CurriculumResult;
  projectId: string;
  onBack(): void;
  onDone(): void;
}) {
  const [topics, setTopics] = useState<Topic[]>(initial.topics);
  const [notes, setNotes] = useState(initial.courseNotes);
  const [addNotes, setAddNotes] = useState(!!initial.courseNotes);
  const numbered = topics.every(t => t.lectureFrom != null);
  const [granularity, setGranularity] = useState<Granularity>(
    numbered ? 'lecture' : 'topic',
  );
  const [estimate, setEstimate] = useState<number | undefined>(1.5);
  const project = useStore(s => s.data.projects.find(p => p.id === projectId));
  const groups = project?.groups ?? [];
  const [groupId, setGroupId] = useState(
    () => (project && importGroup(project)?.id) ?? '',
  );
  const flags = useMemo(
    () =>
      notVerbatim(
        {...initial, topics, courseNotes: addNotes ? notes : ''},
        source,
      ),
    [initial, topics, notes, addNotes, source],
  );
  const items = useMemo(
    () => itemsFromTopics(topics, granularity, estimate),
    [topics, granularity, estimate],
  );
  const edit = (i: number, patch: Partial<Topic>) =>
    setTopics(ts => ts.map((t, j) => (j === i ? {...t, ...patch} : t)));
  const flagged =
    flags.topics.filter(f => f.title || f.description).length +
    (flags.courseNotes ? 1 : 0);

  const doImport = () => {
    importCurriculum(projectId, items, groupId, addNotes ? notes : '');
    onDone();
  };

  return (
    <div className="space-y-4">
      {(initial.warnings.length > 0 || flagged > 0) && (
        <div className="space-y-1 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[12px]">
          {flagged > 0 && (
            <p className="flex items-center gap-1.5 text-warn">
              <AlertTriangle size={13} />
              {plural(flagged, 'field isn’t', 'fields aren’t')} in the pasted
              text word for word (marked below): check for paraphrasing.
            </p>
          )}
          {initial.warnings.map(w => (
            <p key={w} className="text-fg">
              {w}
            </p>
          ))}
        </div>
      )}
      {initial.corrections.length > 0 && (
        <div className="text-[12px] text-dim">
          Gemini’s corrections:{' '}
          {initial.corrections.map((c, i) => (
            <span key={i}>
              {i > 0 && '; '}“{c.from}” → “
              <span className="text-fg">{c.to}</span>”
            </span>
          ))}
        </div>
      )}

      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="label text-left [&>th]:px-1 [&>th]:pb-1 [&>th]:font-medium">
            <th className="w-24">Lectures</th>
            <th>Title and description</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {topics.map((t, i) => (
            <tr key={i} className="border-t border-line align-top">
              <td className="px-1 py-1.5">
                <span className="flex items-center gap-0.5">
                  <NumberInput
                    value={t.lectureFrom}
                    onChange={v =>
                      edit(i, {lectureFrom: v, lectureTo: t.lectureTo ?? v})
                    }
                    label={`Topic ${i + 1}: first lecture`}
                  />
                  –
                  <NumberInput
                    value={t.lectureTo}
                    onChange={v => edit(i, {lectureTo: v})}
                    label={`Topic ${i + 1}: last lecture`}
                  />
                </span>
              </td>
              <td className="space-y-1 px-1 py-1.5">
                <Flagged on={flags.topics[i]?.title}>
                  <input
                    value={t.title}
                    onChange={e => edit(i, {title: e.target.value})}
                    aria-label={`Topic ${i + 1}: title`}
                    className="field h-7 w-full font-medium"
                  />
                </Flagged>
                {(t.description || flags.topics[i]?.description) && (
                  <Flagged on={flags.topics[i]?.description}>
                    <textarea
                      value={t.description}
                      onChange={e => edit(i, {description: e.target.value})}
                      rows={2}
                      aria-label={`Topic ${i + 1}: description`}
                      className="w-full resize-y rounded-md bg-raised px-2 py-1 text-[12px]"
                    />
                  </Flagged>
                )}
              </td>
              <td className="px-1 py-1.5">
                <button
                  className="icon-btn hover:!text-danger"
                  aria-label={`Remove topic ${i + 1}`}
                  onClick={() => setTopics(ts => ts.filter((_, j) => j !== i))}
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {initial.courseNotes && (
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              className="accent-accent"
              checked={addNotes}
              onChange={e => setAddNotes(e.target.checked)}
            />
            Add the course notes to the project’s description
          </label>
          {addNotes && (
            <Flagged on={flags.courseNotes}>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                aria-label="Course notes"
                className="w-full resize-y rounded-md bg-raised px-2 py-1 text-[12px]"
              />
            </Flagged>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3 text-[13px]">
        <fieldset className="flex items-center gap-3">
          <legend className="sr-only">Items</legend>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="granularity"
              className="accent-accent"
              checked={granularity === 'lecture'}
              onChange={() => setGranularity('lecture')}
            />
            One item per lecture
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="granularity"
              className="accent-accent"
              checked={granularity === 'topic'}
              onChange={() => setGranularity('topic')}
            />
            One item per topic
          </label>
        </fieldset>
        <label className="flex items-center gap-1.5">
          Estimate
          <HoursInput
            optional
            value={estimate}
            onChange={setEstimate}
            className="field w-14"
            title="Hours per item"
          />
          h each
        </label>
        {groups.length > 0 && (
          <label className="flex items-center gap-1.5">
            Group
            <Select
              value={groupId}
              onChange={setGroupId}
              options={groupOptions(groups)}
              className="w-36"
              ariaLabel="Group"
            />
          </label>
        )}
        <span className="ml-auto flex gap-2">
          <button className="btn" onClick={onBack}>
            Back
          </button>
          <button
            className="btn-primary"
            disabled={!items.length}
            onClick={doImport}
          >
            Create {plural(items.length, 'class item', 'class items')}
          </button>
        </span>
      </div>
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  label,
}: {
  value: number | null;
  onChange(v: number | null): void;
  label: string;
}) {
  return (
    <input
      inputMode="numeric"
      value={value ?? ''}
      onChange={e => {
        const n = parseInt(e.target.value, 10);
        onChange(lectureNumber(Number.isFinite(n) ? n : null));
      }}
      aria-label={label}
      className="field h-7 w-9 px-1 text-center tabular-nums"
    />
  );
}

/** Marks a field whose text isn't found word for word in the pasted description. */
function Flagged({on, children}: {on?: boolean; children: ReactNode}) {
  if (!on) return <>{children}</>;
  return (
    <div className="rounded-md ring-1 ring-warn">
      {children}
      <p className="px-2 pb-0.5 text-[11px] text-warn">
        Not word for word in the pasted text
      </p>
    </div>
  );
}
