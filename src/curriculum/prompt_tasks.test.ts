import {create} from '@bufbuild/protobuf';
import {afterEach, describe, expect, it, vi} from 'vitest';
import * as pb from '../gen/dashboard/data_pb';
import {ItemKind} from '../model/types';
import {
  askForTasks,
  itemsFromTasks,
  promptContents,
  RESPONSE_SCHEMA,
  SYSTEM_INSTRUCTION,
  validateTasks,
  type PromptTask,
} from './prompt_tasks';

const groups = [
  create(pb.ItemGroupSchema, {id: 'g1', name: 'Lectures'}),
  create(pb.ItemGroupSchema, {id: 'g2', name: 'Problem sets'}),
];

const task = (patch: Partial<PromptTask> = {}): PromptTask => ({
  title: 'Lecture 1',
  kind: ItemKind.CLASS,
  dueDate: '2026-11-12',
  estimateHours: 2,
  group: 'Lectures',
  notes: '',
  ...patch,
});

describe('validateTasks', () => {
  it('reads the model’s tasks and warnings', () => {
    expect(
      validateTasks(
        {
          tasks: [
            {
              title: ' Lecture 1: Intro ',
              kind: 'CLASS',
              dueDate: '2026-11-12',
              estimateHours: 2,
              group: 'lectures',
              notes: ' Read ch. 1 ',
            },
          ],
          warnings: ['The lecture dates are guesses.'],
        },
        groups,
      ),
    ).toEqual({
      tasks: [
        {
          title: 'Lecture 1: Intro',
          kind: ItemKind.CLASS,
          dueDate: '2026-11-12',
          estimateHours: 2,
          group: 'Lectures',
          notes: 'Read ch. 1',
        },
      ],
      warnings: ['The lecture dates are guesses.'],
    });
  });

  it('tidies what doesn’t fit: kind, date, estimate, group', () => {
    const [t] = validateTasks(
      {
        tasks: [
          {
            title: 'x',
            kind: 'CHORE',
            dueDate: '2026-02-30',
            estimateHours: 1000,
            group: 'Labs',
          },
        ],
      },
      groups,
    ).tasks;
    expect(t).toEqual({
      title: 'x',
      kind: ItemKind.TASK,
      dueDate: null,
      estimateHours: null,
      group: null,
      notes: '',
    });
    // Estimates in whole minutes; OTHER is a task of no particular kind.
    const [u] = validateTasks(
      {tasks: [{title: 'y', kind: 'OTHER', estimateHours: 1.333333}]},
      [],
    ).tasks;
    expect(u.kind).toBe(ItemKind.UNSPECIFIED);
    expect(u.estimateHours).toBe(80 / 60);
  });

  it('refuses an answer that isn’t a task list', () => {
    expect(() => validateTasks({}, groups)).toThrow(/no task list/);
    expect(() => validateTasks({tasks: [{kind: 'TASK'}]}, groups)).toThrow(
      /Task 1 .* no title/,
    );
  });

  it('keeps the first 200 tasks of a runaway answer, and says so', () => {
    const many = Array.from({length: 250}, (_, i) => ({title: `T${i}`}));
    const r = validateTasks({tasks: many}, []);
    expect(r.tasks).toHaveLength(200);
    expect(r.warnings.at(-1)).toMatch(/250 tasks; only the first 200/);
  });
});

describe('promptContents', () => {
  const base = {
    request: 'One task per lecture, 2h each',
    material: 'Lecture 1 (12 Nov): Intro',
    projectName: 'Operating Systems',
    groups,
    today: '2026-11-09',
  };

  it('gives today, the project, its groups, the request and the material', () => {
    const text = promptContents(base);
    expect(text).toContain('Today: 2026-11-09 (Mon).');
    expect(text).toContain('Project: Operating Systems.');
    expect(text).toContain('groups: "Lectures", "Problem sets".');
    expect(text).toContain('Request:\nOne task per lecture, 2h each');
    expect(text).toContain('Material:\nLecture 1 (12 Nov): Intro');
    expect(text).not.toContain('Current list');
    expect(promptContents({...base, groups: [], material: ' '})).toContain(
      'The project has no groups.\n\nRequest:',
    );
    expect(promptContents({...base, material: ''})).toContain(
      'Material:\n(none)',
    );
  });

  it('sends the current list along with a change, kinds by name', () => {
    const text = promptContents({
      ...base,
      revise: {tasks: [task()], change: 'estimates 1h'},
    });
    expect(text).toContain('Current list:');
    expect(text).toContain('"kind": "CLASS"');
    expect(text).toContain('"title": "Lecture 1"');
    expect(text.endsWith('Change:\nestimates 1h')).toBe(true);
  });
});

describe('itemsFromTasks', () => {
  it('makes items, with groups by id', () => {
    expect(
      itemsFromTasks(
        [
          task({notes: 'Read ch. 1'}),
          task({
            title: 'Problem set 1',
            kind: ItemKind.ASSIGNMENT,
            dueDate: null,
            estimateHours: null,
            group: null,
          }),
        ],
        groups,
      ),
    ).toEqual([
      {
        kind: ItemKind.CLASS,
        title: 'Lecture 1',
        dueDate: '2026-11-12',
        estimateHours: 2,
        groupId: 'g1',
        notes: 'Read ch. 1',
      },
      {
        kind: ItemKind.ASSIGNMENT,
        title: 'Problem set 1',
        dueDate: undefined,
        estimateHours: undefined,
        groupId: undefined,
        notes: undefined,
      },
    ]);
  });
});

describe('askForTasks', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks Gemini for structured JSON at temperature 0, with the key in a header', async () => {
    const answer = {tasks: [{title: 'Lecture 1', kind: 'CLASS'}], warnings: []};
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [{content: {parts: [{text: JSON.stringify(answer)}]}}],
          }),
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const out = await askForTasks(
      {
        request: 'One task per lecture',
        material: 'Lecture 1',
        projectName: 'OS',
        groups: [],
        today: '2026-11-09',
      },
      {apiKey: 'AIza-test', model: 'gemini-flash-latest'},
    );
    expect(out.tasks.map(t => t.title)).toEqual(['Lecture 1']);
    const [url, init = {}] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
    );
    expect(new Headers(init.headers).get('x-goog-api-key')).toBe('AIza-test');
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig).toEqual({
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    });
    expect(body.systemInstruction.parts[0].text).toBe(SYSTEM_INSTRUCTION);
    expect(body.contents[0].parts[0].text).toContain(
      'Request:\nOne task per lecture',
    );
  });
});
