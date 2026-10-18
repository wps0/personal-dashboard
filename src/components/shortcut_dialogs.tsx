import {X} from 'lucide-react';
import {navTarget} from '../keyboard';
import {todayISO} from '../model/dates';
import {SHORTCUT_HELP} from '../shortcuts';
import {useUi} from '../ui';
import {MiniMonth} from './mini_month';
import {Modal} from './modal';
import {UsosReview} from './usos_review';
import {CurriculumImport} from './curriculum_import';
import {ConflictReview} from './conflict_review';

/** The `?` help sheet and the `g` go-to-date picker. */
export function ShortcutDialogs() {
  const dialog = useUi(s => s.dialog);
  const close = () => useUi.getState().setDialog(null);
  if (dialog === 'help') {
    return (
      <Modal onClose={close} width="max-w-2xl">
        <div className="p-5">
          <div className="mb-4 flex items-center">
            <h2 className="flex-1 text-lg font-medium text-strong">
              Keyboard shortcuts
            </h2>
            <button className="icon-btn" aria-label="Close" onClick={close}>
              <X size={18} />
            </button>
          </div>
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {SHORTCUT_HELP.map(g => (
              <section key={g.group}>
                <h3 className="label mb-2">{g.group}</h3>
                <dl className="space-y-1.5">
                  {g.keys.map(([keys, what]) => (
                    <div
                      key={keys}
                      className="flex items-center justify-between gap-3"
                    >
                      <dt className="text-fg">{what}</dt>
                      <dd className="flex shrink-0 gap-1">
                        {keys.split(' / ').map(k => (
                          <kbd
                            key={k}
                            className="rounded-md border border-line bg-raised px-1.5 py-0.5 text-[11px] text-strong shadow-[0_1px_0_var(--color-line)]"
                          >
                            {k}
                          </kbd>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
          <p className="mt-5 text-[12px] text-dim">
            Shortcuts are off while you type in a field. Inside a field, Ctrl+Z
            undoes your typing.
          </p>
        </div>
      </Modal>
    );
  }
  if (dialog === 'usos') return <UsosReview />;
  if (dialog === 'curriculum') return <CurriculumImport />;
  if (dialog === 'conflicts') return <ConflictReview />;
  if (dialog === 'goto') {
    return (
      <Modal onClose={close} width="max-w-[260px]">
        <div className="p-3">
          <div className="mb-2 flex items-center">
            <h2 className="flex-1 font-medium text-strong">Go to date</h2>
            <button className="icon-btn" aria-label="Close" onClick={close}>
              <X size={16} />
            </button>
          </div>
          <MiniMonth
            selected={todayISO()}
            onSelect={d => {
              close();
              navTarget()?.goTo(d);
            }}
          />
        </div>
      </Modal>
    );
  }
  return null;
}
