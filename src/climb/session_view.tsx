import {Minus, Plus, Trash2, Zap} from 'lucide-react';
import {useEffect, useState} from 'react';
import {
  settingsOf,
  type Climb,
  type GradeSystem,
  type Place,
} from './model/data';
import {buttons, gradeOf, labelOf, systemOf} from './model/grades';
import {placeById} from './model/places';
import {
  climbsOf,
  deleteClimb,
  finishSession,
  formatLength,
  hardest,
  lengthOf,
  logClimb,
  runningSession,
  timeOf,
  triesText,
  updateClimb,
} from './model/sessions';
import {href, navigate} from './router';
import {change, useClimb} from './store';
import {Header, IN_BLOCK, Segmented, Swatch, UndoBar} from './ui';

/** The tries offered before the grade; the last one opens a counter. */
const TRIES = ['1', '2', '3', '4', '5', '6'] as const;

/** The time now, updated every `ms`. */
function useNow(ms: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

/**
 * The running session: pick the tries if it wasn't a flash, then tap the
 * grade; one tap logs one climb topped, and the tries go back to Flash.
 */
export function SessionView() {
  const data = useClimb(s => s.data);
  const session = runningSession(data);
  const now = useNow(15_000);
  const [tries, setTries] = useState(1);
  const [editing, setEditing] = useState<string>();
  if (!session)
    return (
      <div className="flex h-full flex-col bg-bg text-[15px]">
        <Header
          title="No session running"
          back={{name: 'today'}}
          right={<span />}
        />
        <p className="px-4 pt-6 text-dim">
          Start one on{' '}
          <a href={href({name: 'today'})} className="text-accent">
            Today
          </a>
          .
        </p>
      </div>
    );
  const place = placeById(data, session.placeId);
  const settings = settingsOf(data);
  const system = systemOf(settings);
  const grades = buttons(settings);
  const climbs = climbsOf(data, session.id);
  const counts = new Map<string, number>();
  for (const c of climbs) {
    const label = labelOf(c.grade);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const flashed = climbs.filter(c => c.tries <= 1).length;
  const top = hardest(climbs, system);
  const editingClimb = climbs.find(c => c.id === editing);

  const log = (grade: string) => {
    const at = new Date();
    change(
      d => logClimb(d, session.id, gradeOf(system, grade), tries, at)[0],
      `${grade} ${tries <= 1 ? 'flash' : `in ${tries} tries`} logged`,
    );
    setTries(1);
  };
  const finish = () => {
    const n = climbs.length;
    change(
      d => finishSession(d, session.id, new Date()),
      n
        ? `Session saved: ${n} climb${n === 1 ? '' : 's'}`
        : 'Nothing logged, so the session isn’t kept',
    );
    navigate(n ? {name: 'summary', id: session.id} : {name: 'today'});
  };

  return (
    <div className="relative flex h-full flex-col bg-bg text-[15px]">
      <Header
        back={{name: 'today'}}
        title={
          <span className="flex items-baseline gap-2">
            <span className="truncate">{place?.name ?? 'Session'}</span>
            <span className="shrink-0 text-[14px] font-normal tabular-nums text-dim">
              {formatLength(lengthOf(session, now))}
            </span>
          </span>
        }
        right={
          <button
            type="button"
            onClick={finish}
            className="flex h-10 items-center rounded-full bg-raised px-4 text-[15px] font-semibold text-strong"
          >
            Finish
          </button>
        }
      />
      <div className="flex shrink-0 items-center gap-3 px-4 pb-2 text-[13px] text-dim">
        <span>
          <b className="text-[17px] font-semibold text-strong">
            {climbs.length}
          </b>{' '}
          climb{climbs.length === 1 ? '' : 's'}
        </span>
        <span>
          <b className="text-[17px] font-semibold text-strong">{flashed}</b>{' '}
          flashed
        </span>
        {top && <span className="ml-auto">hardest {top}</span>}
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-line/70 overflow-y-auto">
        {climbs.map(c => (
          <ClimbRow
            key={c.id}
            climb={c}
            place={place}
            onOpen={() => setEditing(c.id)}
          />
        ))}
        {!climbs.length && (
          <li className="px-4 py-6 text-center text-[14px] text-dim">
            Topped one? If it wasn&apos;t a flash, pick the tries first. Then
            tap its grade.
          </li>
        )}
      </ul>
      <section aria-label="Log a climb" className="shrink-0 px-4 pt-3 pb-3">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[13px] font-medium text-dim">Tries</span>
          <Segmented
            label="Tries"
            options={TRIES.map(t => ({
              value: t,
              label: t === '1' ? 'Flash' : t === '6' ? '6+' : t,
            }))}
            value={String(Math.min(tries, 6)) as (typeof TRIES)[number]}
            onChange={t => setTries(Number(t))}
          />
        </div>
        {tries >= 6 && (
          <div className="mb-3 flex items-center justify-end gap-3 text-[14px] text-dim">
            More tries
            <button
              type="button"
              aria-label="One try fewer"
              onClick={() => setTries(Math.max(6, tries - 1))}
              className={`flex h-9 w-9 items-center justify-center rounded-full ${IN_BLOCK}`}
            >
              <Minus size={16} />
            </button>
            <span className="w-6 text-center text-[17px] font-semibold text-strong tabular-nums">
              {tries}
            </span>
            <button
              type="button"
              aria-label="One try more"
              onClick={() => setTries(tries + 1)}
              className={`flex h-9 w-9 items-center justify-center rounded-full ${IN_BLOCK}`}
            >
              <Plus size={16} />
            </button>
          </div>
        )}
        <h2 className="mb-2 text-[13px] font-medium text-dim">
          Topped one? Tap its grade
        </h2>
        <div className="grid grid-cols-4 gap-2">
          {grades.map(g => (
            <button
              key={g}
              type="button"
              onClick={() => log(g)}
              className="relative flex h-14 items-center justify-center rounded-2xl bg-raised text-[18px] font-semibold text-strong active:bg-accent/25"
            >
              {g}
              {(counts.get(g) ?? 0) > 0 && (
                <span className="absolute top-1 right-1 rounded-full bg-accent px-1.5 text-[12px] font-semibold text-on-accent tabular-nums">
                  {counts.get(g)}
                </span>
              )}
            </button>
          ))}
        </div>
      </section>
      <UndoBar />
      {editingClimb && (
        <ClimbSheet
          climb={editingClimb}
          place={place}
          grades={grades}
          system={system}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}

function ClimbRow({
  climb,
  place,
  onOpen,
}: {
  climb: Climb;
  place: Place | undefined;
  onOpen(): void;
}) {
  const colour = place?.colours.find(c => c.id === climb.colourId);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-12 w-full items-center gap-3 px-4 text-left"
      >
        <span className="w-12 text-[17px] font-semibold text-strong">
          {labelOf(climb.grade)}
        </span>
        <span className="text-[14px] text-fg">
          {climb.tries <= 1 ? (
            <span className="flex items-center gap-1 text-accent">
              <Zap size={13} aria-hidden /> flash
            </span>
          ) : (
            triesText(climb.tries)
          )}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[14px] text-dim">
          {colour && <Swatch hex={colour.hex} size="h-3.5 w-3.5" />}
          <span className="truncate">{climb.name}</span>
        </span>
        <span className="w-12 text-right text-[13px] tabular-nums text-dim">
          {timeOf(climb.at)}
        </span>
      </button>
    </li>
  );
}

/** A logged climb, opened from the list: everything but the grade is optional. */
function ClimbSheet({
  climb,
  place,
  grades,
  system,
  onClose,
}: {
  climb: Climb;
  place: Place | undefined;
  grades: string[];
  system: GradeSystem;
  onClose(): void;
}) {
  const logged = labelOf(climb.grade);
  const [grade, setGrade] = useState(logged);
  const [tries, setTries] = useState(Math.max(1, climb.tries));
  const [colourId, setColourId] = useState(climb.colourId);
  const [name, setName] = useState(climb.name ?? '');
  // The climb's own grade stays offered, should it be outside the buttons.
  const offered = grades.includes(logged) ? grades : [logged, ...grades];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const save = () => {
    change(
      d =>
        updateClimb(d, climb.id, {
          grade: grade === logged ? climb.grade : gradeOf(system, grade),

          tries,
          colourId,
          name: name.trim() || undefined,
        }),
      `The ${timeOf(climb.at)} climb changed`,
    );
    onClose();
  };
  const colours = place?.colours ?? [];
  return (
    <div
      className="absolute inset-0 z-10 flex flex-col justify-end bg-black/50"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label={`Climb at ${timeOf(climb.at)}`}
        className="rounded-t-[28px] bg-panel px-4 pt-3 pb-5 shadow-2xl"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <div className="mb-3 flex items-center">
          <h2 className="flex-1 text-[17px] font-semibold text-strong">
            Climb at {timeOf(climb.at)}
          </h2>
          <button
            type="button"
            onClick={() => {
              change(d => deleteClimb(d, climb.id), `Deleted a ${logged}`);
              onClose();
            }}
            className="flex h-10 items-center gap-1.5 rounded-full px-3 text-[14px] text-danger"
          >
            <Trash2 size={16} aria-hidden /> Delete
          </button>
        </div>
        <div className="mb-1 text-[12px] text-dim">Grade</div>
        <div className="grid grid-cols-6 gap-1.5">
          {offered.map(g => (
            <button
              key={g}
              type="button"
              aria-pressed={g === grade}
              onClick={() => setGrade(g)}
              className={`h-10 rounded-xl text-[15px] font-semibold ${g === grade ? 'bg-accent text-on-accent' : 'bg-raised text-fg'}`}
            >
              {g}
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <span className="flex-1 text-[12px] text-dim">
            Tries{tries <= 1 && <span className="text-accent"> · flash</span>}
          </span>
          <button
            type="button"
            aria-label="One try fewer"
            onClick={() => setTries(Math.max(1, tries - 1))}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-raised text-fg"
          >
            <Minus size={18} />
          </button>
          <span className="w-8 text-center text-[20px] font-semibold tabular-nums text-strong">
            {tries}
          </span>
          <button
            type="button"
            aria-label="One try more"
            onClick={() => setTries(tries + 1)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-raised text-fg"
          >
            <Plus size={18} />
          </button>
        </div>
        {colours.length > 0 && (
          <>
            <div className="mt-4 mb-1 text-[12px] text-dim">
              Colour (optional)
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={!colourId}
                onClick={() => setColourId(undefined)}
                className={`h-10 rounded-full px-3 text-[14px] ${colourId ? 'bg-raised text-fg' : 'bg-accent font-semibold text-on-accent'}`}
              >
                None
              </button>
              {colours.map(c => (
                <button
                  key={c.id}
                  type="button"
                  aria-label={c.name}
                  aria-pressed={c.id === colourId}
                  onClick={() => setColourId(c.id)}
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${c.id === colourId ? 'ring-2 ring-accent' : ''}`}
                >
                  <Swatch hex={c.hex} />
                </button>
              ))}
            </div>
          </>
        )}
        <div className="mt-4 mb-1 text-[12px] text-dim">Name (optional)</div>
        <input
          value={name}
          aria-label="Name"
          onChange={e => setName(e.target.value)}
          placeholder="the overhang by the window"
          className="h-12 w-full rounded-2xl bg-raised px-4 text-[15px] text-strong placeholder:text-dim"
        />
        <button
          type="button"
          onClick={save}
          className="mt-4 flex h-12 w-full items-center justify-center rounded-2xl bg-accent text-[16px] font-semibold text-on-accent"
        >
          Save
        </button>
      </div>
    </div>
  );
}
