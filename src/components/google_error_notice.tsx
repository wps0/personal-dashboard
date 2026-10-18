import {AlertTriangle, ExternalLink, RotateCw} from 'lucide-react';
import {useGoogle} from '../google/auth';
import {useGoogleError} from '../google/status';
import {retryGoogle} from '../google/use_google_events';

/** The latest Google problem, with a fix-it link when there is one and a Retry button. */
export function GoogleErrorNotice({compact = false}: {compact?: boolean}) {
  const error = useGoogleError(s => s.error);
  const signedIn = useGoogle(s => s.status === 'signed-in');
  if (!error || !signedIn) return null;
  return (
    <div
      role="alert"
      className={`flex animate-fade-in gap-2 rounded-md border border-danger/40 bg-danger/10 text-fg ${compact ? 'p-2 text-[12px]' : 'p-3'}`}
    >
      <AlertTriangle
        size={compact ? 14 : 16}
        className="mt-px shrink-0 text-danger"
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p>{error.message}</p>
        <div className="flex flex-wrap gap-2">
          {error.help && (
            <a
              className="inline-flex items-center gap-1 text-accent hover:underline"
              href={error.help}
              target="_blank"
              rel="noreferrer"
            >
              Open Google Cloud console <ExternalLink size={12} />
            </a>
          )}
          <button
            className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
            onClick={retryGoogle}
          >
            <RotateCw size={12} /> Retry
          </button>
        </div>
      </div>
    </div>
  );
}
