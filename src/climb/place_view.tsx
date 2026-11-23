import {Archive, ArchiveRestore, Minus, Plus, Trash2, X} from 'lucide-react';
import {useState} from 'react';
import {CLIMB_COLOURS} from '../config';
import {PlaceKind, type Colour, type Place} from './model/data';
import {
  addColour,
  deletePlace,
  hasSessions,
  placeById,
  removeColour,
  renameColour,
  updatePlace,
} from './model/places';
import {change, useClimb} from './store';
import {BLOCK, IN_BLOCK, LIST, Section, SMALL_BUTTON, SubScreen} from './ui';

/** A gym or a board: its name, a gym's colour labels, a board's angle. */
export function PlaceView({id}: {id: string}) {
  const place = useClimb(s => placeById(s.data, id));
  const used = useClimb(s => hasSessions(s.data, id));
  if (!place)
    return (
      <SubScreen title="Not found" back={{name: 'settings'}}>
        <p className="px-4 pt-6 text-dim">
          This gym or board isn&apos;t in the log (any more).
        </p>
      </SubScreen>
    );
  const board = place.kind === PlaceKind.BOARD;
  return (
    <SubScreen title={place.name || 'Unnamed'} back={{name: 'settings'}}>
      <Section title="Name">
        <NameField key={place.name} place={place} />
      </Section>
      {board ? <AngleSetting place={place} /> : <Colours place={place} />}
      <Section title={board ? 'This board' : 'This gym'}>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={SMALL_BUTTON}
            onClick={() =>
              change(
                d => updatePlace(d, id, {archived: !place.archived}),
                place.archived
                  ? `${place.name} is back`
                  : `Archived ${place.name}`,
              )
            }
          >
            {place.archived ? (
              <>
                <ArchiveRestore size={16} aria-hidden /> Unarchive
              </>
            ) : (
              <>
                <Archive size={16} aria-hidden /> Archive
              </>
            )}
          </button>
          {!used && (
            <button
              type="button"
              className={`${SMALL_BUTTON} text-danger`}
              onClick={() => {
                change(d => deletePlace(d, id), `Deleted ${place.name}`);
                location.hash = '#/settings';
              }}
            >
              <Trash2 size={16} aria-hidden /> Delete
            </button>
          )}
        </div>
        <p className="mt-2 text-[13px] text-dim">
          {used
            ? 'It has sessions, so it can be archived but not deleted: archived, it isn’t offered when you start a session, and its sessions stay.'
            : 'Archived, it isn’t offered when you start a session.'}
        </p>
      </Section>
    </SubScreen>
  );
}

function NameField({place}: {place: Place}) {
  const [name, setName] = useState(place.name);
  const save = () => {
    const n = name.trim();
    if (n && n !== place.name) change(d => updatePlace(d, place.id, {name: n}));
    else setName(place.name);
  };
  return (
    <input
      value={name}
      aria-label="Name"
      onChange={e => setName(e.target.value)}
      onBlur={save}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      className={`h-12 w-full px-4 text-[16px] text-strong ${BLOCK}`}
    />
  );
}

function AngleSetting({place}: {place: Place}) {
  const angle = place.usualAngle ?? 0;
  const set = (a: number) =>
    change(d =>
      updatePlace(d, place.id, {usualAngle: Math.max(0, Math.min(90, a))}),
    );
  return (
    <Section title="Usual angle">
      <div className={`flex items-center gap-3 px-4 py-2 ${BLOCK}`}>
        <span className="flex-1 text-[14px] text-dim">
          A session starts at this angle; you can change it there.
        </span>
        <button
          type="button"
          aria-label="5° less"
          onClick={() => set(angle - 5)}
          className={`flex h-11 w-11 items-center justify-center rounded-full ${IN_BLOCK}`}
        >
          <Minus size={18} />
        </button>
        <span className="w-12 text-center text-[20px] font-semibold tabular-nums text-strong">
          {angle}°
        </span>
        <button
          type="button"
          aria-label="5° more"
          onClick={() => set(angle + 5)}
          className={`flex h-11 w-11 items-center justify-center rounded-full ${IN_BLOCK}`}
        >
          <Plus size={18} />
        </button>
      </div>
    </Section>
  );
}

function Swatch({hex, size = 'h-7 w-7'}: {hex: string; size?: string}) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-md ring-1 ring-white/25 ${size}`}
      style={{background: hex}}
    />
  );
}

function Colours({place}: {place: Place}) {
  const [adding, setAdding] = useState(false);
  const taken = new Set(place.colours.map(c => c.hex));
  return (
    <Section
      title="Colour labels (optional)"
      more={
        !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-[14px] text-accent"
          >
            <Plus size={15} aria-hidden /> colour
          </button>
        )
      }
    >
      {place.colours.length > 0 && (
        <ul className={LIST}>
          {place.colours.map(c => (
            <ColourRow key={`${c.id}:${c.name}`} place={place} colour={c} />
          ))}
        </ul>
      )}
      {adding && (
        <div className={`mt-2 p-3 ${BLOCK}`}>
          <div className="mb-2 flex items-center">
            <span className="flex-1 text-[13px] text-dim">Add a colour</span>
            <button
              type="button"
              aria-label="Done adding"
              onClick={() => setAdding(false)}
              className="icon-btn h-8 w-8"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {CLIMB_COLOURS.filter(([, hex]) => !taken.has(hex)).map(
              ([name, hex]) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => change(d => addColour(d, place.id, name, hex))}
                  className={`flex h-10 items-center gap-2 rounded-full pr-3 pl-2 text-[14px] ${IN_BLOCK}`}
                >
                  <Swatch hex={hex} size="h-6 w-6" /> {name}
                </button>
              ),
            )}
          </div>
        </div>
      )}
      <p className="mt-2 text-[13px] text-dim">
        Only to tell problems apart: tap a logged climb to add its colour. You
        never need one to log, and the charts don&apos;t use them.
      </p>
    </Section>
  );
}

function ColourRow({place, colour}: {place: Place; colour: Colour}) {
  const [name, setName] = useState(colour.name);
  return (
    <li className="flex min-h-14 items-center gap-3 px-4">
      <Swatch hex={colour.hex} />
      <input
        value={name}
        aria-label="Colour name"
        onChange={e => setName(e.target.value)}
        onBlur={() => {
          const n = name.trim();
          if (n && n !== colour.name)
            change(d => renameColour(d, place.id, colour.id, n));
          else setName(colour.name);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        className="h-10 min-w-0 flex-1 bg-transparent text-[15px] text-strong"
      />
      <button
        type="button"
        aria-label={`Remove ${colour.name}`}
        onClick={() =>
          change(
            d => removeColour(d, place.id, colour.id),
            `Removed ${colour.name}`,
          )
        }
        className="icon-btn h-10 w-10"
      >
        <X size={18} />
      </button>
    </li>
  );
}
