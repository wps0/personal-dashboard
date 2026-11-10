import {X} from 'lucide-react';
import {usePhoneNav} from '../nav';
import {useToasts} from '../toast';
import {UndoBar, useTouchScreen} from './undo_bar';

/** Bottom-left stack of short confirmations, some with Undo (kept off the calendar grid, like Google Calendar). */
export function Toaster() {
  const toasts = useToasts(s => s.toasts);
  const dismiss = useToasts(s => s.dismiss);
  // On a phone with tabs at the bottom, above them.
  const aboveTabs = usePhoneNav(s => s.nav === 'tabs');
  // On touch screens the undo bar offers Undo, and stays; other toasts go
  // above it.
  const touch = useTouchScreen();
  const shown = touch ? toasts.filter(t => !t.undo) : toasts;
  return (
    <>
      <UndoBar />
      <ToastStack
        toasts={shown}
        dismiss={dismiss}
        raised={touch}
        aboveTabs={aboveTabs}
      />
    </>
  );
}

function ToastStack({
  toasts,
  dismiss,
  raised,
  aboveTabs,
}: {
  toasts: ReturnType<typeof useToasts.getState>['toasts'];
  dismiss(id: number): void;
  /** Above the undo bar's place. */
  raised: boolean;
  aboveTabs: boolean;
}) {
  return (
    <div
      aria-live="polite"
      className={`pointer-events-none fixed left-4 z-[80] flex flex-col items-start gap-2 ${raised ? 'bottom-[4.5rem]' : 'bottom-4'} ${aboveTabs ? (raised ? 'max-sm:bottom-[calc(8rem+env(safe-area-inset-bottom))]' : 'max-sm:bottom-[calc(4.5rem+env(safe-area-inset-bottom))]') : ''}`}
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
