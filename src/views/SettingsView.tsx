import { useRef, useState, type ReactNode } from 'react';
import { HoursInput } from '../components/HoursInput';
import { InlineText } from '../components/InlineText';
import { sampleData } from '../model/sample';
import { AREA_COLORS, emptyData } from '../model/types';
import { exportJson, parseAppData } from '../storage/storage';
import { useData, useStore } from '../store';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function SettingsView() {
  const data = useData();
  const { setCapacity, addArea, updateArea, deleteArea, replaceAll } = useStore.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  const [newArea, setNewArea] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const download = () => {
    const blob = new Blob([exportJson(data)], { type: 'application/json' });
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
        setMessage(`Imported ${parsed.projects.length} projects, ${parsed.items.length} items.`);
      }
    } catch (e) {
      setMessage(`Import failed: ${String(e)}`);
    }
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-6 p-4">
        <Section title="Daily capacity" hint="Hours you can realistically plan per day. Days over capacity turn red.">
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d, i) => (
              <label key={d} className="flex flex-col items-center gap-1 rounded border border-line bg-panel px-2 py-1.5">
                <span className="label">{d}</span>
                <span className="flex items-center">
                  <HoursInput value={data.settings.capacity[i]} onChange={(h) => setCapacity(i, h ?? 0)} />
                  <span className="text-dim">h</span>
                </span>
              </label>
            ))}
          </div>
        </Section>

        <Section title="Areas" hint="Top-level groups for projects. Deleting an area deletes its projects.">
          <ul className="space-y-1">
            {data.areas.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded border border-line bg-panel px-2 py-1">
                <div className="flex gap-0.5">
                  {AREA_COLORS.map((c) => (
                    <button
                      key={c}
                      aria-label={`Color ${c}`}
                      onClick={() => updateArea(a.id, { color: c })}
                      className={`h-3.5 w-3.5 rounded-full ${a.color === c ? 'ring-2 ring-fg' : 'opacity-50 hover:opacity-100'}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <InlineText value={a.name} onChange={(name) => updateArea(a.id, { name })} className="flex-1" />
                <span className="font-mono text-[11px] text-dim">
                  {data.projects.filter((p) => p.areaId === a.id).length} projects
                </span>
                <button
                  className="btn-ghost hover:text-danger"
                  onClick={() => {
                    const n = data.projects.filter((p) => p.areaId === a.id).length;
                    if (n === 0 || confirm(`Delete "${a.name}" and its ${n} project(s)?`)) deleteArea(a.id);
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newArea.trim()) addArea(newArea.trim());
              setNewArea('');
            }}
          >
            <input className="field flex-1" placeholder="New area…" value={newArea} onChange={(e) => setNewArea(e.target.value)} />
            <button className="btn">add</button>
          </form>
        </Section>

        <Section title="Data" hint="Everything is stored in this browser (IndexedDB). Export regularly until Drive sync lands.">
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
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = '';
              }}
            />
            <button className="btn" onClick={() => confirm('Replace all data with sample data?') && replaceAll(sampleData())}>
              Load sample data
            </button>
            <button
              className="btn hover:!border-danger hover:!text-danger"
              onClick={() => confirm('Delete ALL data? Export first if unsure.') && replaceAll(emptyData())}
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

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="label mb-0.5">{title}</h2>
      <p className="mb-2 text-[12px] text-dim">{hint}</p>
      {children}
    </section>
  );
}
