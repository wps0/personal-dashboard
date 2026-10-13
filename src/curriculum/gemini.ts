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
