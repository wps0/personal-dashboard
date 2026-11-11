import {Check, LoaderCircle} from 'lucide-react';
import {useCallback, useEffect, useState} from 'react';
import {
  countStarted,
  type GeminiProgress,
  type GeminiStage,
} from '../curriculum/gemini';

const STEPS: {stage: GeminiStage; label: string}[] = [
  {stage: 'loading', label: 'Loading the client'},
  {stage: 'waiting', label: 'Gemini is thinking'},
  {stage: 'receiving', label: 'Receiving the answer'},
  {stage: 'checking', label: 'Checking it'},
];

/** A request's progress, and when (`Date.now()`) its stage began. */
export interface Progress extends GeminiProgress {
  since: number;
}

/**
 * The progress of the Gemini request in flight, if any; pass `onProgress`
 * along with the request, and `clear` it when the request ends.
 */
export function useGeminiProgress() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const onProgress = useCallback((p: GeminiProgress) => {
    const now = Date.now();
    setProgress(old => ({
      ...p,
      since: old?.stage === p.stage ? old.since : now,
    }));
  }, []);
  const clear = useCallback(() => setProgress(null), []);
  return {progress, onProgress, clear};
}

/**
 * Where a Gemini request is: its stages in a row, the current one with a
 * spinner and how long it has taken so far, or while the answer comes in,
 * how many of `items` it has, counted by their `field` (e.g. "title").
 */
export function GeminiStatus({
  progress,
  field,
  items: [one, many],
}: {
  progress: Progress;
  field: string;
  items: [string, string];
}) {
  const [now, setNow] = useState(progress.since);
  useEffect(() => {
    // Often enough that the seconds change on time, whenever the stage began.
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - progress.since) / 1000));
  const current = STEPS.findIndex(s => s.stage === progress.stage);
  const count = countStarted(progress.received, field);
  const detail =
    progress.stage === 'receiving'
      ? `${count} ${count === 1 ? one : many} so far`
      : progress.stage === 'waiting'
        ? `${seconds} s`
        : '';
  return (
    <ol
      aria-label="Gemini request"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]"
    >
      {STEPS.map((s, i) => (
        <li
          key={s.stage}
          aria-current={i === current ? 'step' : undefined}
          className={`flex items-center gap-1.5 ${i === current ? 'text-fg' : 'text-dim'}`}
        >
          {i < current ? (
            <Check size={13} className="text-ok" />
          ) : i === current ? (
            <LoaderCircle
              size={13}
              className="animate-spin text-accent motion-reduce:animate-none"
            />
          ) : (
            <span className="size-[13px] rounded-full border border-line" />
          )}
          {s.label}
          {i === current && detail && (
            // The seconds tick: kept out of what a screen reader announces.
            <span
              className="text-dim tabular-nums"
              aria-hidden={progress.stage === 'waiting'}
            >
              · {detail}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
