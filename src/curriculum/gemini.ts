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
    content?: {parts?: {text?: string}[]};
    finishReason?: string;
  }[];
  promptFeedback?: {blockReason?: string};
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
  const c = res.candidates?.[0];
  const text = c?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
  // The text, if any, is cut off where Gemini stopped.
  const stopped = finishError(c?.finishReason);
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
 * with Google's Gen AI SDK, loaded only when needed. `contents` goes to
 * Google; the API key is the user's own (Settings → Gemini), sent in a
 * header. Errors come back readable.
 */
export async function generateJson({
  apiKey,
  model,
  system,
  contents,
  schema,
}: {
  apiKey: string;
  model: string;
  system: string;
  contents: string;
  /** Gemini's response schema (an OpenAPI subset). */
  schema: object;
}): Promise<unknown> {
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
  let res: GenerateResponse;
  try {
    res = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: system,
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: schema as Schema,
      },
    });
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
  return parseJson(res);
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
