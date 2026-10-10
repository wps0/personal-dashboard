import { useEffect, type ReactNode } from 'react';

/** Centered overlay; closes on Esc or backdrop click. */
export function Modal({ onClose, children, width = 'max-w-xl' }: { onClose(): void; children: ReactNode; width?: string }) {
  useEffect(() => {
    // defaultPrevented: a dropdown or popover inside the modal already handled this Esc.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-start justify-center bg-black/60 p-4 pt-[8vh] backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`scroll-thin max-h-[84vh] w-full ${width} animate-rise-in overflow-y-auto rounded-xl border border-line bg-panel shadow-2xl shadow-black/60`}
      >
        {children}
      </div>
    </div>
  );
}
