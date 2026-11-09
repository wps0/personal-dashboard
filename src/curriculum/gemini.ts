import type {Schema} from '@google/genai';
import {create} from 'zustand';

const KEY = 'personal-dashboard/gemini';
/** Google's alias for the current Gemini Flash model. */
export const DEFAULT_MODEL = 'gemini-flash-latest';

interface GeminiSettings {
  apiKey: string;
  model: string;
}

function load(): GeminiSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
      model:
        typeof raw.model === 'string' && raw.model ? raw.model : DEFAULT_MODEL,
    };
  } catch {
    return {apiKey: '', model: DEFAULT_MODEL};
  }
}

/**
 * The Gemini API key and model. Stored only in this browser (localStorage):
 * never part of the app data, so never exported or synced.
 */
export const useGemini = create<
  GeminiSettings & {set(patch: Partial<GeminiSettings>): void}
>((set, get) => ({
  ...load(),
  set: patch => {
    set(patch);
    const {apiKey, model} = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({apiKey, model}));
    } catch {
      // Not persisted; fine for this session.
    }
  },
}));

/** The parts of a generateContent response that matter here. */
export interface GenerateResponse {
  candidates?: {
    content?: {parts?: {text?: string; thought?: boolean}[]};
    finishReason?: string;
  }[];
  promptFeedback?: {blockReason?: string};
}

/**
 * The stages of a request, in order: loading the Gen AI SDK (only the first
 * time), waiting for Gemini to start answering (it thinks first, often for
 * most of the time), receiving the answer, and checking it.
 */
export type GeminiStage = 'loading' | 'waiting' | 'receiving' | 'checking';

export interface GeminiProgress {
  stage: GeminiStage;
  /** The answer so far: JSON cut off mid-way while it's being received. */
  received: string;
}

export interface GeminiOptions {
  apiKey: string;
  model: string;
  /** Told each time the request moves on, and for each piece of the answer. */
  onProgress?(progress: GeminiProgress): void;
}

/**
 * How many objects with `key` the answer so far has started, e.g. the tasks
 * in it by their "title" fields: a count to show while it's being received.
 */
export function countStarted(received: string, key: string): number {
  return received.split(`"${key}"`).length - 1;
}

/** The text of a response's first candidate, without thoughts. */
function answerText(res: GenerateResponse): string {
  return (
    res.candidates?.[0]?.content?.parts
      ?.map(p => (p.thought ? '' : (p.text ?? '')))
      .join('') ?? ''
  );
}

/** Why Gemini stopped early, for the finish reasons that leave no usable answer. */
function finishError(reason: string | undefined): string | null {
  switch (reason) {
    case 'MAX_TOKENS':
      return 'The answer was cut off: the text is too long.';
    case 'RECITATION':
      return 'Gemini stopped because its answer repeated published text word for word (its recitation filter). Try again, or send the text in smaller parts.';
    case 'SAFETY':
      return 'Gemini’s safety filter blocked the answer. Check what you pasted.';
    case 'PROHIBITED_CONTENT':
      return 'Gemini refused the text as prohibited content. Check what you pasted.';
    default:
      return null;
  }
}

/** The JSON in a generateContent response, or a readable error. */
export function parseJson(res: GenerateResponse): unknown {
  if (res.promptFeedback?.blockReason)
    throw new Error(
      `Gemini refused the text (${res.promptFeedback.blockReason}).`,
    );
  const text = answerText(res);
  // The text, if any, is cut off where Gemini stopped.
  const stopped = finishError(res.candidates?.[0]?.finishReason);
  if (stopped) throw new Error(stopped);
  if (!text) throw new Error('Gemini returned no answer.');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Gemini’s answer isn’t valid JSON.');
  }
}

/**
 * Asks Gemini for JSON matching `schema` (structured output, temperature 0),
 * with Google's Gen AI SDK, loaded only when needed. The answer is streamed,
 * so `onProgress` can tell which stage the request is at. `contents` goes to
 * Google; the API key is the user's own (Settings → Gemini), sent in a
 * header. Errors come back readable.
 */
export async function generateJson({
  apiKey,
  model,
  onProgress,
  system,
  contents,
  schema,
}: GeminiOptions & {
  system: string;
  contents: string;
  /** Gemini's response schema (an OpenAPI subset). */
  schema: object;
}): Promise<unknown> {
  let received = '';
  const report = (stage: GeminiStage) => onProgress?.({stage, received});
  report('loading');
  let sdk: typeof import('@google/genai');
  try {
    sdk = await import('@google/genai');
  } catch {
    // After a deploy, the old version's chunks are gone.
    throw new Error(
      'Couldn’t load the Gemini client. If you’re online, the app was probably updated: reload the page and try again.',
    );
  }
  const {GoogleGenAI, ApiError} = sdk;
  const ai = new GoogleGenAI({apiKey});
  // The pieces of the answer, put back together as one response.
  let finishReason: string | undefined;
  let blockReason: string | undefined;
  try {
    report('waiting');
    const stream = await ai.models.generateContentStream({
      model,
      contents,
      config: {
        systemInstruction: system,
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: schema as Schema,
      },
    });
    for await (const chunk of stream as AsyncIterable<GenerateResponse>) {
      blockReason ??= chunk.promptFeedback?.blockReason;
      finishReason = chunk.candidates?.[0]?.finishReason ?? finishReason;
      received += answerText(chunk);
      report('receiving');
    }
  } catch (e) {
    if (!(e instanceof ApiError))
      throw new Error(
        e instanceof TypeError
          ? 'Couldn’t reach Gemini. Are you offline?'
          : `Gemini: ${(e as Error).message}`,
        {cause: e},
      );
    const why = apiErrorMessage(e.message);
    if (e.status === 400 && /API key/i.test(why))
      throw new Error('Gemini rejected the API key. Check it in Settings.', {
        cause: e,
      });
    if (e.status === 404)
      throw new Error(`Gemini doesn’t know the model “${model}”.`, {cause: e});
    if (e.status === 429)
      throw new Error('Gemini’s quota or rate limit is reached; try later.', {
        cause: e,
      });
    throw new Error(`Gemini: ${why}`, {cause: e});
  }
  report('checking');
  return parseJson({
    candidates: [{content: {parts: [{text: received}]}, finishReason}],
    promptFeedback: blockReason ? {blockReason} : undefined,
  });
}

/**
 * The SDK's error message is the API's JSON error body, after "got status:
 * …" for an error in the middle of a stream; this picks out its text.
 */
function apiErrorMessage(raw: string): string {
  try {
    return (
      (JSON.parse(raw.slice(raw.indexOf('{'))) as {error?: {message?: string}})
        .error?.message ?? raw
    );
  } catch {
    return raw;
  }
}
