/**
 * Tasks from a prompt (SPEC 5.4), a general form of the curriculum import:
 * say what tasks you want and paste any material (a curriculum, a list of
 * lectures, an assignment schedule); Gemini returns them as a list to
 * review. A change asked for in words goes along with the current list and
 * comes back as the whole revised list. The same request also makes a prompt
 * to copy into any AI chat, whose JSON answer is pasted back. Pure functions
 * plus the call; the UI is in components/prompt_tasks.tsx.
 */
import {PROMPT_TASKS_MAX} from '../config';
import {dayName, isISODate} from '../model/dates';
import {
  ItemKind,
  type ISODate,
  type ItemGroup,
  type ItemInit,
} from '../model/types';
import {generateJson, type GeminiOptions} from './gemini';

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

const INTRO =
  'You turn a request into tasks for one project in a personal planner.';

/** What each field holds; shared by Gemini's instruction and the copied prompt. */
const RULES = `1. Do what the request asks: one task per thing it asks for (for example one per lecture, or one per problem set). Use the pasted material, if any, as the source.
2. title: short, in the language of the material; keep its names and numbering (for example "Lecture 3: Scheduling", "Problem set 2").
3. kind: CLASS for a class to attend or catch up on (lecture, lab, tutorial); ASSIGNMENT for something to hand in; EXAM for an exam or a test; TASK for other work; OTHER if unclear.
4. dueDate: YYYY-MM-DD when the request or the material gives or implies one. Work out relative dates ("Fridays", "the day before the next lecture") from the dates in the material and today's date. Otherwise null; never invent a date that nothing implies.
5. estimateHours: the hours the request or the material gives (for example "2h each"), otherwise null.
6. group: one of the project's groups, listed in the request, when the request or the material points to it; otherwise null.
7. notes: the details from the material that belong to the task, verbatim where possible, or an empty string.
8. warnings: in English: anything ambiguous, dates you had to work out, and anything in the request you couldn't do.`;

const REVISION_RULE =
  '9. Given a current list and a change, return the whole list with only that change made.';

export const SYSTEM_INSTRUCTION = `${INTRO} Return JSON that matches the schema.\n\n${RULES}\n${REVISION_RULE}`;

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

/** Today, the project and its groups: what the dates and groups are read against. */
function context(r: PromptRequest): string[] {
  const groups = r.groups.length
    ? `The project's groups: ${r.groups.map(g => JSON.stringify(g.name)).join(', ')}.`
    : 'The project has no groups.';
  return [
    `Today: ${r.today} (${dayName(r.today)}).`,
    `Project: ${r.projectName}.`,
    groups,
  ];
}

/** The message sent to Gemini (the system instruction aside). */
export function promptContents(r: PromptRequest): string {
  const parts = [
    ...context(r),
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

/** The answer's format, shown to an AI that has no schema to follow. */
const EXAMPLE = `{
  "tasks": [
    {
      "title": "Lecture 3: Scheduling",
      "kind": "CLASS",
      "dueDate": "2026-03-12",
      "estimateHours": 1.5,
      "group": null,
      "notes": ""
    }
  ],
  "warnings": []
}`;

/**
 * A complete prompt to copy into any AI chat (ChatGPT, Claude, Gemini…),
 * whose JSON answer is pasted back and read by {@link parseAnswer}: the same
 * rules Gemini gets, the format spelled out (there's no schema to enforce
 * it), and the project's context. Without a request, it asks the AI to wait
 * for one, so the prompt can be pasted first and the request written there.
 */
export function copyPrompt(r: PromptRequest): string {
  const request = r.request.trim();
  const material = r.material.trim();
  return [
    'Turn my request below into tasks for one project in my planner app, which imports your answer.',
    `Answer with one JSON object in exactly this format and nothing else: no text before or after it (a \`\`\`json code block is fine).\n\n${EXAMPLE}`,
    `- kind is one of: ${Object.keys(KINDS).join(', ')}.\n- Use null, not an empty string, for an unknown dueDate, estimateHours or group.\n- estimateHours is a number of hours (1.5 for 1h 30m).`,
    `What each field holds:\n${RULES}`,
    'If I ask for a change after your answer, reply with the whole list again in the same format, with only that change made.',
    context(r).join('\n'),
    request
      ? `Request:\n${request}`
      : 'Request: I will write it in my next message, with the material. Until then, reply only "Ready: tell me what tasks you want."',
    ...(request || material ? [`Material:\n${material || '(none)'}`] : []),
  ].join('\n\n');
}

/**
 * Reads a pasted answer: the JSON object, also inside a code block or with
 * text around it; a bare list of tasks is taken as the task list. Throws a
 * readable error when there's no JSON in it.
 */
export function parseAnswer(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.search(/[[{]/);
  if (start < 0)
    throw new Error(
      'There’s no JSON in what’s pasted: it should start with { (paste the AI’s whole answer).',
    );
  const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
  let value: unknown;
  try {
    value = JSON.parse(body.slice(start, end + 1));
  } catch (e) {
    throw new Error(
      `The pasted answer isn’t valid JSON (${(e as Error).message}). Paste the whole answer, or ask the AI for “only the JSON”.`,
      {cause: e},
    );
  }
  return Array.isArray(value) ? {tasks: value, warnings: []} : value;
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
  /** Where the answer came from, for the messages. */
  from: 'gemini' | 'pasted' = 'gemini',
): PromptResult {
  const answer = from === 'gemini' ? 'Gemini’s answer' : 'the pasted answer';
  const r = raw as {tasks?: unknown; warnings?: unknown} | null;
  if (!r || typeof r !== 'object' || !Array.isArray(r.tasks))
    throw new Error(
      `${answer[0].toUpperCase()}${answer.slice(1)} has no task list ("tasks": [...]).`,
    );
  const warnings = Array.isArray(r.warnings) ? r.warnings.filter(isStr) : [];
  let list = r.tasks as unknown[];
  if (list.length > PROMPT_TASKS_MAX) {
    warnings.push(
      `${from === 'gemini' ? 'Gemini made' : 'The answer has'} ${list.length} tasks; only the first ${PROMPT_TASKS_MAX} are shown.`,
    );
    list = list.slice(0, PROMPT_TASKS_MAX);
  }
  const byName = new Map(groups.map(g => [g.name.trim().toLowerCase(), g]));
  const tasks = list.map((t, i): PromptTask => {
    const x = (t ?? {}) as Record<string, unknown>;
    if (!isStr(x.title) || !x.title.trim())
      throw new Error(`Task ${i + 1} in ${answer} has no title.`);
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
  options: GeminiOptions,
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
