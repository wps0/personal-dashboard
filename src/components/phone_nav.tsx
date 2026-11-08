import {CircleGauge, Menu, Settings, X} from 'lucide-react';
import {useCallback, useEffect, useRef, useState, type ReactNode} from 'react';
import {PAGES, usePhoneNav} from '../nav';
import {href, type Route} from '../router';

/**
 * The header on a phone (below 640px): the page's name, and either a menu
 * button (☰) for the drawer of pages or, with tabs at the bottom, a Settings
 * button (Settings has no tab). `actions` go at the right (theme, conflicts).
 */
export function PhoneHeader({
  route,
  actions,
}: {
  route: Route;
  actions: ReactNode;
}) {
  const nav = usePhoneNav(s => s.nav);
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const page = PAGES.find(p => p.route.name === route.name);
  const close = useCallback(() => {
    setOpen(false);
    menuButton.current?.focus();
  }, []);
  return (
    <header className="flex shrink-0 items-center gap-1 border-b border-line bg-panel px-2 py-1.5 sm:hidden">
      {nav === 'menu' ? (
        <button
          ref={menuButton}
          className="icon-btn h-9 w-9 shrink-0"
          aria-label="Pages"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Menu size={20} />
        </button>
      ) : (
        <CircleGauge
          size={20}
          aria-hidden
          className="mx-1.5 shrink-0 text-accent"
        />
      )}
      <span className="min-w-0 flex-1 truncate text-[16px] font-semibold text-strong">
        {page?.label}
      </span>
      {actions}
      {nav === 'tabs' && (
        <a
          href={href({name: 'settings'})}
          aria-label="Settings"
          aria-current={route.name === 'settings' ? 'page' : undefined}
          className={`icon-btn h-9 w-9 shrink-0 ${route.name === 'settings' ? 'text-accent' : ''}`}
        >
          <Settings size={18} />
        </a>
      )}
      {nav === 'menu' && open && <PageDrawer route={route} onClose={close} />}
    </header>
  );
}

/** Tabs along the bottom of a phone's screen: every page but Settings. */
export function BottomTabs({route}: {route: Route}) {
  const pages = PAGES.filter(p => p.route.name !== 'settings');
  return (
    <nav
      aria-label="Pages"
      className="grid shrink-0 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] sm:hidden"
      style={{gridTemplateColumns: `repeat(${pages.length}, minmax(0, 1fr))`}}
    >
      {pages.map(p => {
        const active = p.route.name === route.name;
        return (
          <a
            key={p.label}
            href={href(p.route)}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-col items-center gap-0.5 pt-1.5 pb-1 text-[11px] ${active ? 'font-medium text-strong' : 'text-dim'}`}
          >
            <span
              className={`flex h-7 w-14 items-center justify-center rounded-full transition-colors duration-150 ${active ? 'bg-accent/20 text-accent' : ''}`}
            >
              <p.icon size={20} aria-hidden />
            </span>
            {p.label}
          </a>
        );
      })}
    </nav>
  );
}

/** The pages in a drawer from the left; Esc, a tap outside or a page closes it. */
function PageDrawer({route, onClose}: {route: Route; onClose(): void}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    // The current page's link, else the first.
    const links = panel.current?.querySelectorAll<HTMLElement>('a');
    const current = [...(links ?? [])].find(a => a.ariaCurrent === 'page');
    (current ?? links?.[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pages"
      className="fixed inset-0 z-[70] sm:hidden"
    >
      <div
        className="absolute inset-0 animate-fade-in bg-black/50"
        onClick={onClose}
      />
      <nav
        ref={panel}
        aria-label="Pages"
        className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] animate-from-left flex-col bg-panel shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <CircleGauge size={20} aria-hidden className="text-accent" />
          <span className="flex-1 text-[16px] font-semibold text-strong">
            Dashboard
          </span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-0.5 p-2">
          {PAGES.map(p => {
            const active = p.route.name === route.name;
            return (
              <a
                key={p.label}
                href={href(p.route)}
                onClick={onClose}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] ${active ? 'bg-accent/15 font-medium text-accent' : 'text-fg hover:bg-raised'}`}
              >
                <p.icon size={19} aria-hidden />
                {p.label}
              </a>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
