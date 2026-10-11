import {X} from 'lucide-react';
import {useToasts} from '../toast';

/** Bottom-left stack of short confirmations, some with Undo (kept off the calendar grid, like Google Calendar). */
export function Toaster() {
  const toasts = useToasts(s => s.toasts);
  const dismiss = useToasts(s => s.dismiss);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-4 z-[80] flex flex-col items-start gap-2"
    >
      {toasts.map(t => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex min-w-64 max-w-md animate-toast-in items-center gap-3 rounded-lg bg-strong py-2 pr-2 pl-4 text-bg shadow-2xl shadow-black/40"
        >
          <span className="flex-1">{t.message}</span>
          {t.action && (
            <button
              className="rounded-md px-2 py-1 font-semibold text-accent transition-colors hover:bg-black/10 active:scale-95"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button
            className="rounded-full p-1 opacity-60 transition-opacity hover:opacity-100"
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
