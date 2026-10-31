import {useState, type ReactNode} from 'react';
import {CoursePattern} from '../components/course_pattern';
import {DateField} from '../components/date_field';
import {HoursInput} from '../components/hours_input';
import {Select} from '../components/ui/select';
import {groupOptions, KIND_OPTIONS} from '../format';
import {
  ItemKind,
  ProgressMode,
  type ItemGroup,
  type Project,
} from '../model/types';
import {navigate} from '../router';
import {useStore} from '../store';
import {withUndo} from '../toast';
import {useUi} from '../ui';

const PROGRESS_OPTIONS = [
  {value: ProgressMode.CHECKLIST, label: 'Items done'},
  {value: ProgressMode.HOURS, label: 'Hours spent / estimate'},
  {value: ProgressMode.MANUAL, label: 'Set by hand'},
];

/**
 * A project's settings, used now and then rather than every day: its area,
 * how progress is computed, its due date and USOS course, adding many items
 * at once, and archiving or deleting it.
 */
export function ProjectDetails({
  project,
  showItems,
}: {
  project: Project;
  /** Shows the items, where added ones appear. */
  showItems(): void;
}) {
  const areas = useStore(s => s.data.areas);
  const {updateProject, deleteProject} = useStore.getState();
  const set = (patch: Partial<Project>) => updateProject(project.id, patch);
  const [bulk, setBulk] = useState(false);
  return (
    <div className="scroll-thin h-full space-y-5 overflow-y-auto p-3">
      <section className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
        <Row label="Area">
          <Select
            value={project.areaId}
            onChange={areaId => set({areaId})}
            options={areas.map(a => ({
              value: a.id,
              label: a.name,
              color: a.color,
            }))}
            className="w-44"
            ariaLabel="Area"
          />
        </Row>
        <Row label="Progress">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={project.progressMode}
              onChange={(progressMode: ProgressMode) => set({progressMode})}
              options={PROGRESS_OPTIONS}
              className="w-52"
              ariaLabel="How progress is computed"
            />
            {project.progressMode === ProgressMode.MANUAL && (
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={project.manualProgress}
                onChange={e => set({manualProgress: Number(e.target.value)})}
                className="w-28 accent-accent"
                aria-label="Progress"
              />
            )}
          </div>
        </Row>
        <Row label="Due date">
          <DateField
            optional
            value={project.dueDate}
            onChange={dueDate => set({dueDate})}
            placeholder="None"
          />
        </Row>
        <div className="col-span-2">
          <CoursePattern project={project} />
        </div>
      </section>

      <section>
        <h3 className="label mb-1">Add many items</h3>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn"
            onClick={() => {
              // The items show behind the dialog, ready for what it adds.
              showItems();
              useUi.getState().importCurriculum(project.id);
            }}
            title="Turn a course description into class items, with Gemini"
          >
            Import curriculum…
          </button>
          <button
            className="btn"
            aria-expanded={bulk}
            onClick={() => setBulk(b => !b)}
            title="E.g. Lecture 1 to Lecture 13"
          >
            {bulk ? 'Cancel' : 'Numbered series…'}
          </button>
        </div>
        {bulk && (
          <BulkAdd
            projectId={project.id}
            groups={project.groups}
            onDone={() => {
              setBulk(false);
              showItems();
            }}
          />
        )}
      </section>

      <section>
        <h3 className="label mb-1">Project</h3>
        <div className="space-y-2">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              className="btn"
              onClick={() => set({archived: !project.archived})}
            >
              {project.archived ? 'Unarchive' : 'Archive'}
            </button>
            <span className="text-[12px] text-dim">
              {project.archived
                ? 'Archived: hidden from the backlog and the project cards (unless “show archived”).'
                : 'Hides it from the backlog and the project cards; nothing is deleted.'}
            </span>
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              className="btn hover:!border-danger hover:!text-danger"
              onClick={() => {
                if (
                  confirm(
                    `Delete "${project.name}" with all its items and planned time?`,
                  )
                ) {
                  navigate({name: 'projects'});
                  withUndo(`Deleted “${project.name}”`, () =>
                    deleteProject(project.id),
                  );
                }
              }}
            >
              Delete
            </button>
            <span className="text-[12px] text-dim">
              With its items and planned time. Undo brings it back.
            </span>
          </p>
        </div>
      </section>
    </div>
  );
}

function Row({label, children}: {label: string; children: ReactNode}) {
  return (
    <>
      <span className="text-[12px] text-dim">{label}</span>
      <div className="min-w-0">{children}</div>
    </>
  );
}

/** "Lecture 1" to "Lecture 13" (or any prefix and range) in one go. */
function BulkAdd({
  projectId,
  groups,
  onDone,
}: {
  projectId: string;
  groups: ItemGroup[];
  onDone(): void;
}) {
  const [kind, setKind] = useState(ItemKind.CLASS);
  const [groupId, setGroupId] = useState('');
  const [prefix, setPrefix] = useState('Lecture');
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(13);
  const [estimate, setEstimate] = useState<number | undefined>(1.5);
  // Whole numbers from 1 (not "Lecture 1.5" or "Lecture -1"); otherwise nothing to add.
  const whole = Number.isInteger(from) && Number.isInteger(to) && from >= 1;
  const count = whole ? Math.max(0, to - from + 1) : 0;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-panel p-2">
      <Select
        value={kind}
        onChange={setKind}
        options={KIND_OPTIONS}
        className="w-32"
        ariaLabel="Kind"
      />
      <input
        className="field w-28"
        value={prefix}
        onChange={e => setPrefix(e.target.value)}
        aria-label="Title prefix"
      />
      <input
        type="number"
        className="field w-14 tabular-nums"
        min={1}
        step={1}
        value={from}
        onChange={e => setFrom(Number(e.target.value))}
        aria-label="From"
      />
      <span className="text-dim">to</span>
      <input
        type="number"
        className="field w-14 tabular-nums"
        min={1}
        step={1}
        value={to}
        onChange={e => setTo(Number(e.target.value))}
        aria-label="To"
      />
      <HoursInput
        optional
        value={estimate}
        onChange={setEstimate}
        placeholder="est"
        className="field w-14"
      />
      <span className="text-dim">h each</span>
      {groups.length > 0 && (
        <Select
          value={groupId}
          onChange={setGroupId}
          options={groupOptions(groups)}
          className="w-32"
          ariaLabel="Group"
        />
      )}
      <button
        className="btn"
        disabled={count === 0 || count > 200}
        onClick={() => {
          useStore.getState().addItems(
            projectId,
            Array.from({length: count}, (_, k) => ({
              kind,
              title: `${prefix} ${from + k}`.trim(),
              estimateHours: estimate,
              groupId: groupId || undefined,
            })),
          );
          onDone();
        }}
      >
        Add {count}
      </button>
    </div>
  );
}
