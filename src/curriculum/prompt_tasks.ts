/**
 * Tasks from a prompt (SPEC 5.4), a general form of the curriculum import:
 * say what tasks you want and paste any material (a curriculum, a list of
 * lectures, an assignment schedule); Gemini returns them as a list to
 * review. A change asked for in words goes along with the current list and
 * comes back as the whole revised list. Pure functions plus the call; the UI
 * is in components/prompt_tasks.tsx.
 */
import {PROMPT_TASKS_MAX} from '../config';
import {dayName, isISODate} from '../model/dates';
import {
  ItemKind,
  type ISODate,
  type ItemGroup,
  type ItemInit,
} from '../model/types';
import {generateJson} from './gemini';

export interface PromptTask {
  title: string;
  kind: ItemKind;
  dueDate: ISODate | null;
  estimateHours: number | null;
  /** One of the project's groups, by name; null for none. */
  group: string | null;
  notes: string;
}

export interface PromptResult {
  tasks: PromptTask[];
  warnings: string[];
}

/** The kinds as the model names them. */
const KINDS: Record<string, ItemKind> = {
  CLASS: ItemKind.CLASS,
  ASSIGNMENT: ItemKind.ASSIGNMENT,
  EXAM: ItemKind.EXAM,
  TASK: ItemKind.TASK,
  OTHER: ItemKind.UNSPECIFIED,
};

function kindName(kind: ItemKind): string {
  return Object.keys(KINDS).find(k => KINDS[k] === kind) ?? 'TASK';
}

export const SYSTEM_INSTRUCTION = `You turn a request into tasks for one project in a personal planner. Return JSON that matches the schema.

1. Do what the request asks: one task per thing it asks for (for example one per lecture, or one per problem set). Use the pasted material, if any, as the source.
2. title: short, in the language of the material; keep its names and numbering (for example "Lecture 3: Scheduling", "Problem set 2").
3. kind: CLASS for a class to attend or catch up on (lecture, lab, tutorial); ASSIGNMENT for something to hand in; EXAM for an exam or a test; TASK for other work; OTHER if unclear.
4. dueDate: YYYY-MM-DD when the request or the material gives or implies one. Work out relative dates ("Fridays", "the day before the next lecture") from the dates in the material and today's date. Otherwise null; never invent a date that nothing implies.
5. estimateHours: the hours the request or the material gives (for example "2h each"), otherwise null.
6. group: one of the project's groups, listed in the request, when the request or the material points to it; otherwise null.
7. notes: the details from the material that belong to the task, verbatim where possible, or an empty string.
8. warnings: in English: anything ambiguous, dates you had to work out, and anything in the request you couldn't do.
9. Given a current list and a change, return the whole list with only that change made.`;

/** Gemini's response schema (an OpenAPI subset). */
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    tasks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: {type: 'STRING'},
          kind: {type: 'STRING', enum: Object.keys(KINDS)},
          dueDate: {
            type: 'STRING',
            nullable: true,
            description: 'YYYY-MM-DD',
          },
          estimateHours: {type: 'NUMBER', nullable: true},
          group: {type: 'STRING', nullable: true},
          notes: {type: 'STRING'},
        },
        required: [
          'title',
          'kind',
          'dueDate',
          'estimateHours',
          'group',
          'notes',
        ],
        propertyOrdering: [
          'title',
          'kind',
          'dueDate',
          'estimateHours',
          'group',
          'notes',
        ],
      },
    },
    warnings: {type: 'ARRAY', items: {type: 'STRING'}},
  },
  required: ['tasks', 'warnings'],
  propertyOrdering: ['tasks', 'warnings'],
};

/** What the model is asked: the request, and for a revision the list and the change. */
export interface PromptRequest {
  /** What tasks to make, in the user's words. */
  request: string;
  /** Pasted material, possibly empty. */
  material: string;
  projectName: string;
  groups: readonly ItemGroup[];
  today: ISODate;
  /** For a revision: the list as it stands, and the change asked for. */
  revise?: {tasks: PromptTask[]; change: string};
}

/** The message sent to Gemini (the system instruction aside). */
export function promptContents(r: PromptRequest): string {
  const groups = r.groups.length
    ? `The project's groups: ${r.groups.map(g => JSON.stringify(g.name)).join(', ')}.`
    : 'The project has no groups.';
  const parts = [
    `Today: ${r.today} (${dayName(r.today)}).`,
    `Project: ${r.projectName}.`,
    groups,
    `Request:\n${r.request.trim()}`,
    `Material:\n${r.material.trim() || '(none)'}`,
  ];
  if (r.revise)
    parts.push(
      `Current list:\n${JSON.stringify(
        r.revise.tasks.map(t => ({...t, kind: kindName(t.kind)})),
        null,
        1,
      )}`,
      `Change:\n${r.revise.change.trim()}`,
    );
  return parts.join('\n\n');
}

function isStr(v: unknown): v is string {
  return typeof v === 'string';
}

/**
 * Checks the model's JSON and tidies it: an unknown kind is a task, a date
 * that isn't one or an absurd estimate is dropped, and a group the project
 * doesn't have is none. Throws a readable error if it isn't a task list.
 */
export function validateTasks(
  raw: unknown,
  groups: readonly ItemGroup[],
): PromptResult {
  const r = raw as {tasks?: unknown; warnings?: unknown} | null;
  if (!r || typeof r !== 'object' || !Array.isArray(r.tasks))
    throw new Error('Gemini’s answer has no task list.');
  const warnings = Array.isArray(r.warnings) ? r.warnings.filter(isStr) : [];
  let list = r.tasks as unknown[];
  if (list.length > PROMPT_TASKS_MAX) {
    warnings.push(
      `Gemini made ${list.length} tasks; only the first ${PROMPT_TASKS_MAX} are shown.`,
    );
    list = list.slice(0, PROMPT_TASKS_MAX);
  }
  const byName = new Map(groups.map(g => [g.name.trim().toLowerCase(), g]));
  const tasks = list.map((t, i): PromptTask => {
    const x = (t ?? {}) as Record<string, unknown>;
    if (!isStr(x.title) || !x.title.trim())
      throw new Error(`Task ${i + 1} in Gemini’s answer has no title.`);
    const hours = x.estimateHours;
    const group = isStr(x.group)
      ? byName.get(x.group.trim().toLowerCase())
      : undefined;
    return {
      title: x.title.trim(),
      // Other is kind 0, so not `KINDS[x.kind] || …`.
      kind:
        isStr(x.kind) && Object.hasOwn(KINDS, x.kind)
          ? KINDS[x.kind]
          : ItemKind.TASK,
      dueDate: isStr(x.dueDate) && isISODate(x.dueDate) ? x.dueDate : null,
      // Whole minutes, at most a working week.
      estimateHours:
        typeof hours === 'number' && hours > 0 && hours <= 40
          ? Math.round(hours * 60) / 60
          : null,
      group: group?.name ?? null,
      notes: isStr(x.notes) ? x.notes.trim() : '',
    };
  });
  return {tasks, warnings};
}

/** The items to add for the reviewed tasks, their groups by id. */
export function itemsFromTasks(
  tasks: readonly PromptTask[],
  groups: readonly ItemGroup[],
): ItemInit[] {
  return tasks.map(t => ({
    kind: t.kind,
    title: t.title,
    dueDate: t.dueDate ?? undefined,
    estimateHours: t.estimateHours ?? undefined,
    groupId: groups.find(g => g.name === t.group)?.id,
    notes: t.notes || undefined,
  }));
}

/**
 * Asks Gemini (gemini.ts) for the tasks, or for the revised list. The request
 * and the material go to Google; the API key is the user's own (Settings).
 */
export async function askForTasks(
  r: PromptRequest,
  options: {apiKey: string; model: string},
): Promise<PromptResult> {
  return validateTasks(
    await generateJson({
      ...options,
      system: SYSTEM_INSTRUCTION,
      contents: promptContents(r),
      schema: RESPONSE_SCHEMA,
    }),
    r.groups,
  );
}
