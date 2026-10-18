import {ExternalLink, Lock} from 'lucide-react';
import {DEFAULT_MODEL, useGemini} from '../curriculum/gemini';
import {BufferedInput} from './buffered';

const ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';

/** Settings → Gemini: the API key and model used to import curricula. */
export function GeminiSettings() {
  const {apiKey, model, set} = useGemini();
  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 rounded-md border border-line bg-panel px-3 py-2 text-[12px] text-dim">
        <Lock size={14} className="mt-px shrink-0" />
        <span>
          The key is stored only in this browser, never exported or synced. When
          you import a curriculum, the pasted text is sent to Google’s Gemini
          API under your key. In Google Cloud, restrict the key to the
          Generative Language API and to this site’s address ({ORIGIN}), so it’s
          of no use anywhere else.
        </span>
      </p>
      <label className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-full sm:w-48">API key</span>
        <BufferedInput
          type="password"
          value={apiKey}
          placeholder="AIza…"
          onCommit={v => set({apiKey: v.trim()})}
          className="field h-8 min-w-0 flex-1"
          autoComplete="off"
          spellCheck={false}
          aria-label="Gemini API key"
        />
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-[12px] text-accent hover:underline"
        >
          Get a key <ExternalLink size={12} />
        </a>
      </label>
      <label className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-full sm:w-48">Model</span>
        <BufferedInput
          value={model}
          placeholder={DEFAULT_MODEL}
          onCommit={v => set({model: v.trim() || DEFAULT_MODEL})}
          className="field h-8 w-64 font-mono"
          spellCheck={false}
          aria-label="Gemini model"
        />
        <span className="text-[12px] text-dim">
          {DEFAULT_MODEL} follows Google’s current Flash model.
        </span>
      </label>
    </div>
  );
}
