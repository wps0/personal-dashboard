import {ChevronRight, Download, Plus, Upload} from 'lucide-react';
import {useRef, useState, type ReactNode} from 'react';
import {useTheme, type ThemeChoice} from '../theme';
import {GradeSystem, PlaceKind, settingsOf, type Place} from './model/data';
import {buttonRange, scale, systemOf} from './model/grades';
import {addPlace, placesOf, updateSettings} from './model/places';
import {href} from './router';
import {downloadBinary, downloadJson, readExport} from './storage';
import {change, useClimb} from './store';
import {
  IN_BLOCK,
  LIST,
  Section,
  Segmented,
  SMALL_BUTTON,
  SubScreen,
} from './ui';

const THEMES: {value: ThemeChoice; label: string}[] = [
  {value: 'system', label: 'System'},
  {value: 'light', label: 'Light'},
  {value: 'dark', label: 'Dark'},
];

const SYSTEMS: {value: 'font' | 'v'; label: string}[] = [
  {value: 'font', label: 'Font (6A, 6B+…)'},
  {value: 'v', label: 'V (V3, V4…)'},
];

export function SettingsView() {
  const [theme, setTheme] = useTheme();
  return (
    <SubScreen title="Settings" back={{name: 'today'}}>
      <GradesSettings />
      <PlacesSettings kind={PlaceKind.GYM} />
      <PlacesSettings kind={PlaceKind.BOARD} />
      <ArchivedPlaces />
      <DataSettings />
      <Section title="Theme">
        <Segmented
          label="Theme"
          options={THEMES}
          value={theme}
          onChange={setTheme}
        />
        <p className="mt-2 text-[13px] text-dim">
          The same on this device as the dashboard&apos;s.
        </p>
      </Section>
    </SubScreen>
  );
}

function Row({children}: {children: ReactNode}) {
  return (
    <div className="flex min-h-12 items-center gap-2 px-4 py-1.5">
      {children}
    </div>
  );
}

function GradesSettings() {
  const settings = useClimb(s => settingsOf(s.data));
  const system = systemOf(settings);
  const grades = scale(system);
  const range = (kind: PlaceKind) => {
    const [from, to] = buttonRange(settings, kind);
    const set = (which: 'from' | 'to', grade: string) => {
      const [f, t] = which === 'from' ? [grade, to] : [from, grade];
      // Kept in order: the other end follows.
      const i = grades.indexOf(f);
      const j = grades.indexOf(t);
      const [a, b] = i <= j ? [f, t] : which === 'from' ? [f, f] : [t, t];
      change(d =>
        updateSettings(
          d,
          kind === PlaceKind.BOARD
            ? {boardButtonsFrom: a, boardButtonsTo: b}
            : {gymButtonsFrom: a, gymButtonsTo: b},
        ),
      );
    };
    return (
      <>
        <GradeSelect
          label={`${kind === PlaceKind.BOARD ? 'Boards' : 'Gyms'}: from`}
          grades={grades}
          value={from}
          onChange={g => set('from', g)}
        />
        <span className="text-dim">to</span>
        <GradeSelect
          label={`${kind === PlaceKind.BOARD ? 'Boards' : 'Gyms'}: to`}
          grades={grades}
          value={to}
          onChange={g => set('to', g)}
        />
      </>
    );
  };
  return (
    <Section title="Grades">
      <Segmented
        label="Grade scale"
        options={SYSTEMS}
        value={system === GradeSystem.V ? 'v' : 'font'}
        onChange={v =>
          // The ranges are grades of the old scale: back to the defaults.
          change(d =>
            updateSettings(d, {
              grades: v === 'v' ? GradeSystem.V : GradeSystem.FONT,
              gymButtonsFrom: '',
              gymButtonsTo: '',
              boardButtonsFrom: '',
              boardButtonsTo: '',
            }),
          )
        }
      />
      <div className={`mt-2 ${LIST}`}>
        <Row>
          <span className="flex-1">Buttons at gyms</span>
          {range(PlaceKind.GYM)}
        </Row>
        <Row>
          <span className="flex-1">Buttons on boards</span>
          {range(PlaceKind.BOARD)}
        </Row>
      </div>
      <p className="mt-2 text-[13px] text-dim">
        The grades you tap to log a climb. Board grades run harder than a
        gym&apos;s, so boards have their own range.
      </p>
    </Section>
  );
}

function GradeSelect({
  label,
  grades,
  value,
  onChange,
}: {
  label: string;
  grades: readonly string[];
  value: string;
  onChange(grade: string): void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`h-9 px-2 text-[15px] text-strong ${IN_BLOCK}`}
    >
      {grades.map(g => (
        <option key={g} value={g}>
          {g}
        </option>
      ))}
    </select>
  );
}

function placeMeta(p: Place): string {
  if (p.kind === PlaceKind.BOARD)
    return p.usualAngle ? `usually ${p.usualAngle}°` : '';
  const n = p.colours.length;
  return n ? `${n} colour label${n === 1 ? '' : 's'}` : 'no colour labels';
}

function PlaceRow({place}: {place: Place}) {
  return (
    <a
      href={href({name: 'place', id: place.id})}
      className="flex min-h-14 items-center gap-3 px-4"
    >
      <span className="min-w-0 flex-1 truncate text-strong">
        {place.name || 'Unnamed'}
      </span>
      <span className="text-[14px] text-dim">{placeMeta(place)}</span>
      <ChevronRight size={18} className="text-dim" aria-hidden />
    </a>
  );
}

function PlacesSettings({kind}: {kind: PlaceKind}) {
  const places = useClimb(s => s.data.places);
  const list = places.filter(p => p.kind === kind && !p.archived);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const board = kind === PlaceKind.BOARD;
  const add = () => {
    const n = name.trim();
    if (n) change(d => addPlace(d, kind, n)[0], `Added ${n}`);
    setName('');
    setAdding(false);
  };
  return (
    <Section
      title={board ? 'Boards' : 'Gyms'}
      more={
        !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-[14px] text-accent"
          >
            <Plus size={15} aria-hidden /> {board ? 'board' : 'gym'}
          </button>
        )
      }
    >
      {(list.length > 0 || adding) && (
        <div className={LIST}>
          {list.map(p => (
            <PlaceRow key={p.id} place={p} />
          ))}
          {adding && (
            <form
              className="flex items-center gap-2 px-4 py-2"
              onSubmit={e => {
                e.preventDefault();
                add();
              }}
            >
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                onBlur={add}
                aria-label={board ? 'New board' : 'New gym'}
                placeholder={board ? 'Kilter, MoonBoard 2019…' : 'The gym'}
                className={`h-10 min-w-0 flex-1 px-3 text-[15px] text-strong ${IN_BLOCK}`}
              />
              <button
                type="submit"
                className="h-10 rounded-full bg-accent px-4 font-semibold text-on-accent"
              >
                Add
              </button>
            </form>
          )}
        </div>
      )}
      {!list.length && !adding && (
        <p className="text-[14px] text-dim">
          {board
            ? 'None yet. Add the boards you use, like a Kilter or a MoonBoard.'
            : 'None yet. Add the gyms you climb at.'}
        </p>
      )}
      {board && list.length > 0 && (
        <p className="mt-2 text-[13px] text-dim">
          Board grades run harder than a gym&apos;s, so boards are charted and
          compared on their own.
        </p>
      )}
    </Section>
  );
}

function ArchivedPlaces() {
  const data = useClimb(s => s.data);
  const list = [
    ...placesOf(data, PlaceKind.GYM, true),
    ...placesOf(data, PlaceKind.BOARD, true),
  ];
  if (!list.length) return null;
  return (
    <Section title="Archived">
      <div className={LIST}>
        {list.map(p => (
          <PlaceRow key={p.id} place={p} />
        ))}
      </div>
    </Section>
  );
}

function DataSettings() {
  const data = useClimb(s => s.data);
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const importFile = async (f: File) => {
    setError('');
    try {
      const imported = readExport(new Uint8Array(await f.arrayBuffer()));
      change(() => imported, `Imported ${f.name}`);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  };
  return (
    <Section title="Data">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={SMALL_BUTTON}
          onClick={() => downloadJson(data)}
        >
          <Download size={16} aria-hidden /> Export JSON
        </button>
        <button
          type="button"
          className={SMALL_BUTTON}
          onClick={() => downloadBinary(data)}
        >
          <Download size={16} aria-hidden /> Export binary
        </button>
        <button
          type="button"
          className={SMALL_BUTTON}
          onClick={() => file.current?.click()}
        >
          <Upload size={16} aria-hidden /> Import…
        </button>
        <input
          ref={file}
          type="file"
          accept=".json,.binpb,application/json,application/octet-stream"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void importFile(f);
          }}
        />
      </div>
      {error && <p className="mt-2 text-[14px] text-danger">{error}</p>}
      <p className="mt-2 text-[13px] text-dim">
        Kept apart from the dashboard&apos;s data: its own file on this device.
        An import replaces the log&apos;s data here (Undo brings it back).
      </p>
    </Section>
  );
}
