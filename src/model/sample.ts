import { addDays, startOfWeek, todayISO } from './dates';
import type { Allocation, AppData, Item, Project } from './types';
import { emptyData } from './types';

/** Demo data placed relative to today, so the week view has something in it. */
export function sampleData(today = todayISO()): AppData {
  const d = emptyData();
  const monday = startOfWeek(today);
  let n = 0;
  const id = (p: string) => `${p}-${++n}`;
  const created = new Date().toISOString();

  d.areas = [
    { id: 'uni', name: 'University', color: '#60a5fa' },
    { id: 'work', name: 'Work', color: '#34d399' },
    { id: 'personal', name: 'Personal', color: '#f472b6' },
  ];

  const project = (areaId: string, name: string, extra: Partial<Project> = {}): Project => {
    const p: Project = {
      id: id('p'),
      areaId,
      name,
      progressMode: 'checklist',
      manualProgress: 0,
      overviewDoc: '',
      log: [],
      archived: false,
      createdAt: created,
      ...extra,
    };
    d.projects.push(p);
    return p;
  };
  const item = (p: Project, title: string, extra: Partial<Item> = {}): Item => {
    const i: Item = { id: id('i'), projectId: p.id, kind: 'task', title, status: 'todo', createdAt: created, ...extra };
    d.items.push(i);
    return i;
  };
  const alloc = (i: Item, date: string, plannedHours: number, done = false): Allocation => {
    const a: Allocation = { id: id('a'), itemId: i.id, date, plannedHours, done, actualHours: done ? plannedHours : undefined };
    d.allocations.push(a);
    return a;
  };

  // University: a course with a lecture backlog, an assignment and an exam.
  const os = project('uni', 'Operating Systems', {
    overviewDoc:
      '## Goals\n- Pass the exam with ≥ 4.0\n- Finish the scheduler assignment on time\n\n## Links\n- Lecture slides: _add link_\n- Recordings: _add link_',
    log: [{ id: id('l'), at: new Date(Date.now() - 86_400_000).toISOString(), text: 'Caught up on lectures 1–3.' }],
  });
  const firstLecture = addDays(monday, -28);
  // Weekly lectures up to two weeks ahead (later ones come from USOS in v2).
  const lectures: Item[] = [];
  for (let k = 0, date = firstLecture; date <= addDays(today, 14); k++, date = addDays(date, 7)) {
    lectures.push(
      item(os, `Lecture ${k + 1}`, {
        kind: 'lecture',
        estimateHours: 1.5,
        heldOn: date,
        status: k < 3 ? 'notes' : k === 3 ? 'watched' : 'todo',
      }),
    );
  }
  const assignment = item(os, 'Assignment 2: scheduler', { kind: 'assignment', estimateHours: 8, dueDate: addDays(today, 4) });
  item(os, 'Midterm', { kind: 'exam', estimateHours: 6, dueDate: addDays(today, 24) });
  alloc(lectures[3], addDays(monday, -2), 1.5); // missed last weekend
  alloc(lectures[4], monday, 1, true);
  alloc(lectures[4], addDays(monday, 1), 0.5);
  alloc(assignment, addDays(monday, 2), 2);
  alloc(assignment, addDays(monday, 5), 3);

  const net = project('uni', 'Computer Networks', { progressMode: 'hours' });
  for (let k = 0; k < 6; k++) {
    item(net, `Lecture ${k + 1}`, { kind: 'lecture', estimateHours: 1.5, status: k < 2 ? 'revised' : 'todo' });
  }
  const lab = item(net, 'Lab report: TCP congestion', { kind: 'assignment', estimateHours: 3, dueDate: addDays(today, 9) });
  alloc(lab, addDays(monday, 3), 1.5);

  // Work.
  const slo = project('work', 'SLO dashboards (Q4)', { dueDate: addDays(today, 50) });
  item(slo, 'Inventory existing alerts', { status: 'done' });
  item(slo, 'Draft SLI definitions', { status: 'doing', dueDate: addDays(today, 6) });
  item(slo, 'Review with team');
  item(slo, 'Roll out burn-rate alerts');

  // Personal.
  project('personal', 'Driving license', { progressMode: 'manual', manualProgress: 40 });
  const homelab = project('personal', 'Homelab migration');
  item(homelab, 'Pick new hardware', { status: 'done' });
  const k8s = item(homelab, 'Set up k3s', { estimateHours: 4 });
  item(homelab, 'Migrate Nextcloud');
  alloc(k8s, addDays(monday, 6), 2);

  d.dayNotes[today] = 'Freeform notes for the day go here.';
  return d;
}
