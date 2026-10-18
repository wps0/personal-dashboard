/**
 * Curriculum import (SPEC 5.2): a course description pasted from USOS →
 * Gemini extracts the lecture plan, keeping the original wording → class
 * items. Pure functions plus the API call; the UI is in components/.
 */
import type {Schema} from '@google/genai';
import {ItemKind, type ItemInit} from '../model/types';

export interface Topic {
  title: string;
  description: string;
  lectureFrom: number | null;
  lectureTo: number | null;
}

export interface CurriculumResult {
  topics: Topic[];
  courseNotes: string;
  warnings: string[];
  corrections: {from: string; to: string}[];
}

export const SYSTEM_INSTRUCTION = `You extract the lecture plan from a university course description. Return JSON that matches the schema.

1. Extract only the lectures or topics of the syllabus: numbered lists, or headings like "Wykłady 5–8: …". Do not create topics from the course goals, the schedule or the assessment rules.
2. Preserve the original wording and language verbatim. Do not translate, paraphrase, summarise, shorten or reorder. You may only fix obvious typos, capitalisation at the start of a sentence, and broken whitespace or line breaks.
3. title: the topic heading without its numbering prefix ("Wykłady 1-4:", "3."). description: the text that belongs to that topic, verbatim, joined into one paragraph. Use an empty string if there is none. Never invent a description.
4. lectureFrom / lectureTo: the lecture numbers if they are stated (both the same for a single lecture), otherwise null. Keep ranges exactly as written, even if they overlap or leave gaps.
5. courseNotes: verbatim sentences about scheduling that matter for planning (how often lectures happen, whether the order may change), or an empty string.
6. warnings: overlapping or missing lecture numbers, ambiguous structure, or a note that the order may change. Write them in English.
7. corrections: every change you made to the original text, as from / to pairs.`;

/** Gemini's response schema (an OpenAPI subset). */
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    topics: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: {type: 'STRING'},
          description: {type: 'STRING'},
          lectureFrom: {type: 'INTEGER', nullable: true},
          lectureTo: {type: 'INTEGER', nullable: true},
        },
        required: ['title', 'description', 'lectureFrom', 'lectureTo'],
        propertyOrdering: ['title', 'description', 'lectureFrom', 'lectureTo'],
      },
    },
    courseNotes: {type: 'STRING'},
    warnings: {type: 'ARRAY', items: {type: 'STRING'}},
    corrections: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {from: {type: 'STRING'}, to: {type: 'STRING'}},
        required: ['from', 'to'],
      },
    },
  },
  required: ['topics', 'courseNotes', 'warnings', 'corrections'],
  propertyOrdering: ['topics', 'courseNotes', 'warnings', 'corrections'],
};

function isStr(v: unknown): v is string {
  return typeof v === 'string';
}
function isNumOrNull(v: unknown): v is number | null {
  return v === null || typeof v === 'number';
}

/** Lecture numbers above this are taken as a mistake. */
const MAX_LECTURE = 500;
/** The most lectures one topic can span. */
const MAX_LECTURES_PER_TOPIC = 100;

/** A lecture number: a positive integer up to MAX_LECTURE, otherwise null. */
export function lectureNumber(v: number | null): number | null {
  return v !== null && Number.isInteger(v) && v > 0 && v <= MAX_LECTURE
    ? v
    : null;
}

/** A topic's lectures in order, at most MAX_LECTURES_PER_TOPIC of them. */
function lectureSpan(from: number, to: number): [number, number] {
  const lo = Math.min(from, to);
  return [lo, Math.min(Math.max(from, to), lo + MAX_LECTURES_PER_TOPIC - 1)];
}

/** Checks the model's JSON against the schema. Throws a readable error otherwise. */
export function validateResult(raw: unknown): CurriculumResult {
  const r = raw as Partial<CurriculumResult> | null;
  if (!r || typeof r !== 'object' || !Array.isArray(r.topics))
    throw new Error('Gemini’s answer has no topic list.');
  const topics = r.topics.map((t, i) => {
    const x = (t ?? {}) as Partial<Topic>;
    const rawFrom = x.lectureFrom ?? null;
    const rawTo = x.lectureTo ?? null;
    if (!isStr(x.title) || !x.title.trim() || !isStr(x.description ?? ''))
      throw new Error(`Topic ${i + 1} in Gemini’s answer is incomplete.`);
    if (!isNumOrNull(rawFrom) || !isNumOrNull(rawTo))
      throw new Error(`Topic ${i + 1} has invalid lecture numbers.`);
    // 0, fractions and absurd numbers count as not stated.
    const from = lectureNumber(rawFrom) ?? lectureNumber(rawTo);
    const to = lectureNumber(rawTo) ?? from;
    const span = from !== null && to !== null ? lectureSpan(from, to) : null;
    return {
      title: x.title.trim(),
      description: (x.description ?? '').trim(),
      lectureFrom: span?.[0] ?? null,
      lectureTo: span?.[1] ?? null,
    };
  });
  return {
    topics,
    courseNotes: isStr(r.courseNotes) ? r.courseNotes.trim() : '',
    warnings: Array.isArray(r.warnings) ? r.warnings.filter(isStr) : [],
    corrections: Array.isArray(r.corrections)
      ? r.corrections.filter(
          (c): c is {from: string; to: string} =>
            !!c && isStr(c.from) && isStr(c.to),
        )
      : [],
  };
}

/** The parts of a generateContent response that matter here. */
interface GenerateResponse {
  candidates?: {
    content?: {parts?: {text?: string}[]};
    finishReason?: string;
  }[];
  promptFeedback?: {blockReason?: string};
}

/** The result from a generateContent response, or a readable error. */
export function parseResponse(res: GenerateResponse): CurriculumResult {
  if (res.promptFeedback?.blockReason)
    throw new Error(
      `Gemini refused the text (${res.promptFeedback.blockReason}).`,
    );
  const c = res.candidates?.[0];
  const text = c?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
  if (c?.finishReason === 'MAX_TOKENS')
    throw new Error('The answer was cut off: the description is too long.');
  if (!text) throw new Error('Gemini returned no answer.');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Gemini’s answer isn’t valid JSON.');
  }
  return validateResult(json);
}

/**
 * Sends the description to Gemini with Google's Gen AI SDK, loaded only when
 * needed. The text goes to Google; the API key is the user's own (Settings).
 */
export async function extractCurriculum(
  text: string,
  {apiKey, model}: {apiKey: string; model: string},
): Promise<CurriculumResult> {
  const {GoogleGenAI, ApiError} = await import('@google/genai');
  const ai = new GoogleGenAI({apiKey});
  let res: GenerateResponse;
  try {
    res = await ai.models.generateContent({
      model,
      contents: text,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA as Schema,
      },
    });
  } catch (e) {
    if (!(e instanceof ApiError))
      throw new Error(
        e instanceof TypeError
          ? 'Couldn’t reach Gemini. Are you offline?'
          : `Gemini: ${(e as Error).message}`,
      );
    const why = apiErrorMessage(e.message);
    if (e.status === 400 && /API key/i.test(why))
      throw new Error('Gemini rejected the API key. Check it in Settings.');
    if (e.status === 404)
      throw new Error(`Gemini doesn’t know the model “${model}”.`);
    if (e.status === 429)
      throw new Error('Gemini’s quota or rate limit is reached; try later.');
    throw new Error(`Gemini: ${why}`);
  }
  return parseResponse(res);
}

/** The SDK's error message is the API's JSON error body; this picks out its text. */
function apiErrorMessage(raw: string): string {
  try {
    return (
      (JSON.parse(raw) as {error?: {message?: string}}).error?.message ?? raw
    );
  } catch {
    return raw;
  }
}

/** Unicode-normalised, whitespace collapsed, for comparing wording. */
function norm(s: string) {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/**
 * Whether `fragment` appears in the pasted text (ignoring whitespace), after
 * undoing the corrections the model reported. Catches paraphrasing.
 */
export function isVerbatim(
  fragment: string,
  source: string,
  corrections: CurriculumResult['corrections'] = [],
): boolean {
  const f = norm(fragment);
  if (!f) return true;
  const src = norm(source);
  if (src.includes(f)) return true;
  let undone = f;
  for (const c of corrections)
    if (c.to) undone = undone.split(norm(c.to)).join(norm(c.from));
  return src.includes(undone);
}

/** Which titles and descriptions aren't found verbatim in the pasted text. */
export function notVerbatim(result: CurriculumResult, source: string) {
  const ok = (s: string) => isVerbatim(s, source, result.corrections);
  return {
    topics: result.topics.map(t => ({
      title: !ok(t.title),
      description: !ok(t.description),
    })),
    courseNotes: !ok(result.courseNotes),
  };
}

export type Granularity = 'topic' | 'lecture';

/**
 * Class items from the topics: one per topic, or one per lecture number
 * (a lecture listed under several topics becomes one item, its titles joined
 * with " / "). Topics without lecture numbers always make one item each.
 */
export function itemsFromTopics(
  topics: Topic[],
  granularity: Granularity,
  estimateHours?: number,
): ItemInit[] {
  const base = {kind: ItemKind.CLASS, estimateHours};
  if (granularity === 'topic')
    return topics.map(t => ({
      ...base,
      title: t.title,
      notes: t.description || undefined,
    }));
  const byLecture = new Map<number, Topic[]>();
  const unnumbered: Topic[] = [];
  for (const t of topics) {
    if (t.lectureFrom == null || t.lectureTo == null) {
      unnumbered.push(t);
      continue;
    }
    // Ranges typed in the review can be backwards or long.
    const [lo, hi] = lectureSpan(t.lectureFrom, t.lectureTo);
    for (let n = lo; n <= hi; n++) {
      if (!byLecture.has(n)) byLecture.set(n, []);
      byLecture.get(n)!.push(t);
    }
  }
  return [
    ...[...byLecture]
      .sort(([a], [b]) => a - b)
      .map(([n, ts]) => ({
        ...base,
        title: `${n}. ${ts.map(t => t.title).join(' / ')}`,
        notes:
          ts
            .map(t => t.description)
            .filter(Boolean)
            .join('\n\n') || undefined,
      })),
    ...unnumbered.map(t => ({
      ...base,
      title: t.title,
      notes: t.description || undefined,
    })),
  ];
}
