import {create} from '@bufbuild/protobuf';
import * as pb from '../gen/dashboard/data_pb';
import {addDays, startOfWeek, todayISO} from './dates';
import {
  ItemKind,
  ItemStatus,
  ProgressMode,
  emptyData,
  type Allocation,
  type AppData,
  type InitOf,
  type Item,
  type Project,
} from './types';

/** Demo data placed relative to today, so the week view has something in it. */
export function sampleData(today = todayISO()): AppData {
  const d = emptyData();
  const monday = startOfWeek(today);
  let n = 0;
  const id = (p: string) => `${p}-${++n}`;
  const created = new Date().toISOString();

  d.areas = [
    create(pb.AreaSchema, {id: 'uni', name: 'University', color: '#60a5fa'}),
    create(pb.AreaSchema, {id: 'work', name: 'Work', color: '#34d399'}),
    create(pb.AreaSchema, {
      id: 'personal',
      name: 'Personal',
      color: '#f472b6',
    }),
  ];

  const project = (
    areaId: string,
    name: string,
    extra: InitOf<typeof pb.ProjectSchema> = {},
  ): Project => {
    const p = create(pb.ProjectSchema, {
      id: id('p'),
      areaId,
      name,
      progressMode: ProgressMode.CHECKLIST,
      createdAt: created,
      ...extra,
    });
    d.projects.push(p);
    return p;
  };
  const item = (
    p: Project,
    title: string,
    extra: InitOf<typeof pb.ItemSchema> = {},
  ): Item => {
    const i = create(pb.ItemSchema, {
      id: id('i'),
      projectId: p.id,
      kind: ItemKind.TASK,
      title,
      status: ItemStatus.TODO,
      createdAt: created,
      ...extra,
    });
    d.items.push(i);
    return i;
  };
  const alloc = (
    i: Item,
    date: string,
    plannedHours: number,
    done = false,
    start?: string,
  ): Allocation => {
    const a = create(pb.AllocationSchema, {
      id: id('a'),
      itemId: i.id,
      date,
      plannedHours,
      done,
      actualHours: done ? plannedHours : undefined,
      start,
    });
    d.allocations.push(a);
    return a;
  };

  // University: a course with a lecture backlog, an assignment and an exam.
  const os = project('uni', 'Operating Systems', {
    overviewDoc:
      '## Goals\n- Pass the exam with ≥ 4.0\n- Finish the scheduler assignment on time\n\n## Links\n- Lecture slides: _add link_\n- Recordings: _add link_',
    log: [
      {
        id: id('l'),
        at: new Date(Date.now() - 86_400_000).toISOString(),
        text: 'Caught up on lectures 1–3.',
      },
    ],
  });
  const firstLecture = addDays(monday, -28);
  // Weekly lectures up to two weeks ahead (later ones come from USOS in v2).
  const lectures: Item[] = [];
  for (
    let k = 0, date = firstLecture;
    date <= addDays(today, 14);
    k++, date = addDays(date, 7)
  ) {
    lectures.push(
      item(os, `Lecture ${k + 1}`, {
        kind: ItemKind.CLASS,
        estimateHours: 1.5,
        heldOn: date,
        status:
          k < 3
            ? ItemStatus.DONE
            : k === 3
              ? ItemStatus.DOING
              : ItemStatus.TODO,
      }),
    );
  }
  const assignment = item(os, 'Assignment 2: scheduler', {
    kind: ItemKind.ASSIGNMENT,
    estimateHours: 8,
    dueDate: addDays(today, 4),
  });
  item(os, 'Midterm', {
    kind: ItemKind.EXAM,
    estimateHours: 6,
    dueDate: addDays(today, 24),
  });
  alloc(lectures[3], addDays(monday, -2), 1.5); // missed last weekend
  alloc(lectures[4], monday, 1, true);
  alloc(lectures[4], addDays(monday, 1), 0.5);
  alloc(assignment, addDays(monday, 2), 2);
  alloc(assignment, addDays(monday, 5), 3);

  const net = project('uni', 'Computer Networks', {
    progressMode: ProgressMode.HOURS,
  });
  for (let k = 0; k < 6; k++) {
    item(net, `Lecture ${k + 1}`, {
      kind: ItemKind.CLASS,
      estimateHours: 1.5,
      status: k < 2 ? ItemStatus.DONE : ItemStatus.TODO,
    });
  }
  const lab = item(net, 'Lab report: TCP congestion', {
    kind: ItemKind.ASSIGNMENT,
    estimateHours: 3,
    dueDate: addDays(today, 9),
  });
  alloc(lab, addDays(monday, 3), 1.5);

  // Work.
  const slo = project('work', 'SLO dashboards (Q4)', {
    dueDate: addDays(today, 50),
  });
  item(slo, 'Inventory existing alerts', {status: ItemStatus.DONE});
  item(slo, 'Draft SLI definitions', {
    status: ItemStatus.DOING,
    dueDate: addDays(today, 6),
  });
  item(slo, 'Review with team');
  item(slo, 'Roll out burn-rate alerts');

  // Personal.
  project('personal', 'Driving license', {
    progressMode: ProgressMode.MANUAL,
    manualProgress: 40,
  });
  const homelab = project('personal', 'Homelab migration');
  item(homelab, 'Pick new hardware', {status: ItemStatus.DONE});
  const k8s = item(homelab, 'Set up k3s', {estimateHours: 4});
  item(homelab, 'Migrate Nextcloud');
  alloc(k8s, addDays(monday, 6), 2);
  alloc(lectures[lectures.length - 2], today, 1.5, false, '17:00');
  alloc(assignment, addDays(today, 1), 2, false, '10:00');

  // Calendar events (local until Google Calendar sync). Timetable entries mimic USOS.
  const event = (
    date: string,
    start: string,
    end: string,
    title: string,
    notes?: string,
  ) =>
    d.events.push(
      create(pb.CalendarEventSchema, {
        id: id('e'),
        date,
        start,
        end,
        title,
        notes,
      }),
    );
  event(addDays(monday, 1), '10:15', '12:00', 'OS lecture (USOS)', 'Room 3180');
  event(addDays(monday, 2), '14:15', '15:45', 'Networks lab (USOS)');
  event(addDays(monday, 8), '10:15', '12:00', 'OS lecture (USOS)', 'Room 3180');
  event(today, '19:00', '20:30', 'Climbing');
  d.events.push(
    create(pb.CalendarEventSchema, {
      id: id('e'),
      date: addDays(today, 2),
      allDay: true,
      start: '00:00',
      end: '23:59',
      title: 'Mum’s birthday',
    }),
  );
  event(addDays(today, 1), '08:30', '09:00', 'Dentist');
  event(addDays(today, 2), '09:30', '10:00', 'Team standup');
  event(addDays(today, 2), '14:00', '14:30', '1:1 with manager');

  d.dayNotes[today] = 'Freeform notes for the day go here.';
  return d;
}
