import {Undo2, X} from 'lucide-react';
import {useEffect} from 'react';
import {useMediaQuery} from '../hooks';
import {usePhoneNav} from '../nav';
import {useStore} from '../store';
import {dismissLastStep, undoStep, useLastStep} from '../toast';

/** Screens without a keyboard's Ctrl+Z: a finger is the main pointer. */
export function useTouchScreen(): boolean {
  return useMediaQuery('(pointer: coarse)');
}

/**
 * Undo for touch screens, where there's no Ctrl+Z: the latest change with an
 * Undo button, also for the quiet ones a toast doesn't announce (a drag, a
 * tick, a resize). It stays until the next change, a dismissal or another
 * page, rather than a few seconds: a slip on a phone is often noticed late.
 */
export function UndoBar() {
  const touch = useTouchScreen();
  const step = useLastStep(s => s.step);
  // Changed since by something that isn't undoable: the step can't be undone.
  const current = useStore(s => s.data === step?.after);
  const aboveTabs = usePhoneNav(s => s.nav === 'tabs');
  useEffect(() => {
    addEventListener('hashchange', dismissLastStep);
    return () => removeEventListener('hashchange', dismissLastStep);
  }, []);
  if (!touch || !step || !current) return null;
  return (
    <div
      role="status"
      className={`fixed right-3 bottom-3 left-3 z-[75] mx-auto flex h-12 max-w-md animate-toast-in items-center rounded-xl bg-strong pl-4 text-[14px] text-bg shadow-2xl shadow-black/40 ${aboveTabs ? 'max-sm:bottom-[calc(4.25rem+env(safe-area-inset-bottom))]' : ''}`}
    >
      <span className="min-w-0 flex-1 truncate">{step.message}</span>
      <button
        className="flex h-12 items-center gap-1.5 px-3 font-semibold"
        onClick={() => undoStep(step)}
      >
        <Undo2 size={16} aria-hidden /> Undo
      </button>
      <button
        className="flex h-12 w-11 items-center justify-center opacity-60"
        aria-label="Dismiss"
        onClick={dismissLastStep}
      >
        <X size={16} />
      </button>
    </div>
  );
}
