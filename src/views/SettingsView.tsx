import {useRef, useState, type ReactNode} from 'react';
import {InlineText} from '../components/InlineText';
import {sampleData} from '../model/sample';
import {AREA_COLORS, emptyData} from '../model/types';
import {exportJson, parseAppData} from '../storage/storage';
import {useData, useStore} from '../store';
import {CapacitySettings} from './CapacitySettings';
import {GoogleSettings} from '../components/GoogleSettings';
import {Select} from '../components/ui/Select';

const CAL_VIEW_OPTIONS = [
  {value: 'day', label: 'Day'},
  {value: '3day', label: '3 days'},
  {value: 'week', label: 'Week'},
  {value: 'month', label: 'Month'},
] as const;

const EVENT_LENGTHS = [15, 30, 45, 60, 90, 120].map(m => ({
  value: String(m),
  label: m < 60 ? `${m} minutes` : m === 60 ? '1 hour' : `${m / 60} hours`,
}));

export function SettingsView() {
  const data = useData();
  const {addArea, updateArea, deleteArea, replaceAll} = useStore.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  const [newArea, setNewArea] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const download = () => {
    const blob = new Blob([exportJson(data)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dashboard-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importFile = async (file: File) => {
    try {
      const parsed = parseAppData(JSON.parse(await file.text()));
      if (confirm(`Replace all current data with "${file.name}"?`)) {
        replaceAll(parsed);
        setMessage(
          `Imported ${parsed.projects.length} projects, ${parsed.items.length} items.`,
        );
      }
    } catch (e) {
      setMessage(`Import failed: ${String(e)}`);
    }
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-5 p-4">
        <Section
          title="Calendar"
          hint="How events created by clicking the calendar start out."
        >
          <label className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="w-full sm:w-48">Default event length</span>
            <Select
              value={String(data.settings.defaultEventMinutes)}
              onChange={v =>
                useStore.getState().setDefaultEventMinutes(Number(v))
              }
              options={EVENT_LENGTHS}
              className="w-36"
              ariaLabel="Default event length"
            />
            <span className="text-[12px] text-dim">
              Dragging on the calendar still selects any length.
            </span>
          </label>
          <label className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 sm:mt-2">
            <span className="w-full sm:w-48">Default view</span>
            <Select
              value={data.settings.defaultCalendarView}
              onChange={v => useStore.getState().setDefaultCalendarView(v)}
              options={CAL_VIEW_OPTIONS}
              className="w-36"
              ariaLabel="Default calendar view"
            />
            <span className="text-[12px] text-dim">
              The calendar opens in this view whenever you come to it from
              another page.
            </span>
          </label>
        </Section>

        <Section
          title="Google Calendar"
          hint="Show your Google calendars next to your plan (read-only for now)."
        >
          <GoogleSettings />
        </Section>

        <Section
          title="Capacity & reserved time"
          hint="When you can plan work, and which hours are taken (sleep, work)."
        >
          <CapacitySettings />
        </Section>

        <Section
          title="Areas"
          hint="Top-level groups for projects. Deleting an area deletes its projects."
        >
          <ul className="space-y-1">
            {data.areas.map(a => (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded border border-line bg-panel px-2 py-1"
              >
                <div className="flex gap-0.5">
                  {AREA_COLORS.map(c => (
                    <button
                      key={c}
                      aria-label={`Color ${c}`}
                      onClick={() => updateArea(a.id, {color: c})}
                      className={`h-3.5 w-3.5 rounded-full ${a.color === c ? 'ring-2 ring-fg' : 'opacity-50 hover:opacity-100'}`}
                      style={{background: c}}
                    />
                  ))}
                </div>
                <InlineText
                  value={a.name}
                  onChange={name => updateArea(a.id, {name})}
                  className="flex-1"
                />
                <span className="tabular-nums text-[11px] text-dim">
                  {data.projects.filter(p => p.areaId === a.id).length} projects
                </span>
                <button
                  className="btn-ghost hover:text-danger"
                  onClick={() => {
                    const n = data.projects.filter(
                      p => p.areaId === a.id,
                    ).length;
                    if (
                      n === 0 ||
                      confirm(`Delete "${a.name}" and its ${n} project(s)?`)
                    )
                      deleteArea(a.id);
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <form
            className="mt-2 flex gap-2"
            onSubmit={e => {
              e.preventDefault();
              if (newArea.trim()) addArea(newArea.trim());
              setNewArea('');
            }}
          >
            <input
              className="field flex-1"
              placeholder="New area…"
              value={newArea}
              onChange={e => setNewArea(e.target.value)}
            />
            <button className="btn">add</button>
          </form>
        </Section>

        <Section
          title="Data"
          hint="Everything is stored in this browser (IndexedDB). Export regularly until Drive sync lands."
        >
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={download}>
              Export JSON
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              Import JSON…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = '';
              }}
            />
            <button
              className="btn"
              onClick={() =>
                confirm('Replace all data with sample data?') &&
                replaceAll(sampleData())
              }
            >
              Load sample data
            </button>
            <button
              className="btn hover:!border-danger hover:!text-danger"
              onClick={() =>
                confirm('Delete ALL data? Export first if unsure.') &&
                replaceAll(emptyData())
              }
            >
              Reset everything
            </button>
          </div>
          {message && <p className="mt-2 text-dim">{message}</p>}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  const id = `settings-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <section
      aria-labelledby={id}
      className="rounded-xl border border-line bg-panel p-4 shadow-sm"
    >
      <header className="mb-4 border-b border-line pb-3">
        <h2 id={id} className="text-[15px] font-semibold text-strong">
          {title}
        </h2>
        <p className="mt-0.5 text-[12px] text-dim">{hint}</p>
      </header>
      {children}
    </section>
  );
}
