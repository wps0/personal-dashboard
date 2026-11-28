import {ChevronRight, Cloud, Download, Plus, Upload} from 'lucide-react';
import {useRef, useState, type ReactNode} from 'react';
import {useTheme, type ThemeChoice} from '../theme';
import {GradeSystem, settingsOf, type Place} from './model/data';
import {
  buttonRange,
  defaultRange,
  gradeOf,
  scale,
  systemOf,
} from './model/grades';
import {addPlace, placesOf, updateSettings} from './model/places';
import {href} from './router';
import {setSyncOn, signIn, useDrive} from './google';
import {downloadBinary, downloadJson, readExport} from './storage';
import {syncNow, useSyncStatus} from './sync';
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
      <PlacesSettings />
      <ArchivedPlaces />
      <DriveSync />
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
  const [from, to] = buttonRange(settings);
  const set = (which: 'from' | 'to', grade: string) => {
    const [f, t] = which === 'from' ? [grade, to] : [from, grade];
    // Kept in order: the other end follows.
    const i = grades.indexOf(f);
    const j = grades.indexOf(t);
    const [a, b] = i <= j ? [f, t] : which === 'from' ? [f, f] : [t, t];
    change(d =>
      updateSettings(d, {
        buttonsFrom: gradeOf(system, a),
        buttonsTo: gradeOf(system, b),
      }),
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
              // The scale is the button range's: its default in the other.
              buttonsFrom: defaultRange(
                v === 'v' ? GradeSystem.V : GradeSystem.FONT,
              )[0],
              buttonsTo: defaultRange(
                v === 'v' ? GradeSystem.V : GradeSystem.FONT,
              )[1],
            }),
          )
        }
      />
      <div className={`mt-2 ${LIST}`}>
        <Row>
          <span className="flex-1">Buttons</span>
          <GradeSelect
            label="Buttons from"
            grades={grades}
            value={from}
            onChange={g => set('from', g)}
          />
          <span className="text-dim">to</span>
          <GradeSelect
            label="Buttons to"
            grades={grades}
            value={to}
            onChange={g => set('to', g)}
          />
        </Row>
      </div>
      <p className="mt-2 text-[13px] text-dim">
        The grades you tap to log a climb.
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

function PlacesSettings() {
  const places = useClimb(s => s.data.places);
  const list = places.filter(p => !p.archived);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const add = () => {
    const n = name.trim();
    if (n) change(d => addPlace(d, n)[0], `Added ${n}`);
    setName('');
    setAdding(false);
  };
  return (
    <Section
      title="Gyms"
      more={
        !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-[14px] text-accent"
          >
            <Plus size={15} aria-hidden /> gym
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
                aria-label="New gym"
                placeholder="The gym"
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
          None yet. Add the gyms you climb at.
        </p>
      )}
    </Section>
  );
}

function ArchivedPlaces() {
  const data = useClimb(s => s.data);
  const list = [...placesOf(data, true)];
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
        Kept apart from the dashboard&apos;s data: its own file on this device
        and on Drive. An import replaces the log&apos;s data here (Undo brings
        it back).
      </p>
    </Section>
  );
}

function syncText(
  status: ReturnType<typeof useSyncStatus.getState>,
  signingIn: boolean,
): string {
  if (signingIn) return 'Signing in…';
  switch (status.status) {
    case 'syncing':
      return 'Syncing…';
    case 'idle':
      return status.lastSynced
        ? `Synced at ${new Date(status.lastSynced).toTimeString().slice(0, 5)}`
        : 'On';
    case 'signed-out':
      return 'Waiting for you to sign in';
    case 'offline':
      return 'Offline: syncs when you’re back online';
    case 'error':
      return `Paused: ${status.error ?? 'something went wrong'}`;
    default:
      return 'On';
  }
}

/** Drive sync of the log's own files, climb.binpb and climb.json. */
function DriveSync() {
  const {on, signingIn, error, token} = useDrive();
  const status = useSyncStatus();
  const signedOut = on && (!token || status.status === 'signed-out');
  return (
    <Section title="Google Drive sync">
      <div className={LIST}>
        <Row>
          <Cloud size={18} className="text-dim" aria-hidden />
          <span className="flex-1">
            Sync the log
            {on && (
              <span className="block text-[13px] text-dim">
                {syncText(status, signingIn)}
              </span>
            )}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="Sync the log with Google Drive"
            onClick={() => setSyncOn(!on)}
            className={`relative h-7 w-12 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-bg'}`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-strong transition-[left] ${on ? 'left-6' : 'left-1'}`}
            />
          </button>
        </Row>
        {on && (
          <Row>
            {signedOut ? (
              <button
                type="button"
                onClick={() => void signIn()}
                className="h-10 rounded-full bg-accent px-4 font-semibold text-on-accent"
              >
                Sign in with Google
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void syncNow()}
                className={`${SMALL_BUTTON} bg-bg`}
              >
                Sync now
              </button>
            )}
          </Row>
        )}
      </div>
      {error && <p className="mt-2 text-[14px] text-danger">{error}</p>}
      <p className="mt-2 text-[13px] text-dim">
        Your climbs in climb.binpb on your Google Drive, with climb.json as a
        copy to read, apart from the dashboard&apos;s file. The log can only see
        files it made. It uses the OAuth Client ID from the dashboard&apos;s{' '}
        <a href="../#/settings" className="text-accent">
          Settings
        </a>{' '}
        and signs in on its own.
      </p>
    </Section>
  );
}
