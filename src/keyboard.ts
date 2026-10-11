import {
  useEffect,
  useEffectEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {useLatest} from './hooks';
import type {CalView, ISODate} from './model/types';
import {navigate, type Route} from './router';
import {actionFor} from './shortcuts';
import {undoLast} from './toast';
import {nextHourDraft, useUi} from './ui';

/** What "next / previous / today / go to date / create / view" mean on the current page. */
export interface NavTarget {
  next(): void;
  prev(): void;
  today(): void;
  goTo(date: ISODate): void;
  create?(): void;
  view?(v: CalView): void;
}

let current: NavTarget | null = null;

/** Registers the page's navigation handlers for keyboard shortcuts while it is mounted. */
export function useNavTarget(target: NavTarget) {
  const ref = useLatest(target);
  useEffect(() => {
    const proxy: NavTarget = {
      next: () => ref.current.next(),
      prev: () => ref.current.prev(),
      today: () => ref.current.today(),
      goTo: d => ref.current.goTo(d),
      create: () => ref.current.create?.(),
      view: v => ref.current.view?.(v),
    };
    current = proxy;
    return () => {
      if (current === proxy) current = null;
    };
  }, [ref]);
}

export function navTarget(): NavTarget | null {
  return current;
}

type Dir = 'up' | 'down' | 'left' | 'right';

function visibleBlocks(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-block]')].filter(
    el => {
      const r = el.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        r.bottom > 0 &&
        r.top < window.innerHeight
      );
    },
  );
}

/**
 * The nearest block in a direction, by on-screen position, so the same logic
 * works in the week journal, the calendar grids, the backlog and lists.
 */
export function neighbour(from: HTMLElement, dir: Dir): HTMLElement | null {
  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of visibleBlocks()) {
    if (el === from) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;
    const [main, cross] =
      dir === 'up'
        ? [ay - by, bx - ax]
        : dir === 'down'
          ? [by - ay, bx - ax]
          : dir === 'left'
            ? [ax - bx, by - ay]
            : [bx - ax, by - ay];
    if (main <= 2) continue; // must be in that direction
    const score = main + Math.abs(cross) * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

function focusBlock(el: HTMLElement) {
  el.focus({preventScroll: true});
  el.scrollIntoView({block: 'nearest', inline: 'nearest'});
}

/** Moves the selection; with nothing selected, starts at the top-left block. */
export function moveFocus(dir: Dir): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (active?.hasAttribute('data-block')) {
    const next = neighbour(active, dir);
    if (next) focusBlock(next);
    return true;
  }
  const first = visibleBlocks().sort((x, y) => {
    const a = x.getBoundingClientRect();
    const b = y.getBoundingClientRect();
    return a.left - b.left || a.top - b.top;
  })[0];
  if (!first) return false;
  focusBlock(first);
  return true;
}

/**
 * Keys on a focused block: Enter / e open it, Space toggles done, Delete /
 * Backspace remove it (focus moves to a neighbour so you can keep going).
 */
export function blockKeys(h: {
  open?(): void;
  remove?(): void;
  toggle?(): void;
}) {
  return (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey)
      return;
    if ((e.key === 'Enter' || e.key === 'e') && h.open) {
      e.preventDefault();
      h.open();
    } else if (e.key === ' ' && h.toggle) {
      e.preventDefault();
      h.toggle();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && h.remove) {
      e.preventDefault();
      const next =
        neighbour(e.currentTarget, 'down') ?? neighbour(e.currentTarget, 'up');
      h.remove();
      if (next)
        requestAnimationFrame(() => next.isConnected && focusBlock(next));
    }
  };
}

function isTyping(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (el as HTMLElement).isContentEditable
  );
}

/** Something floating is open (popover, menu, dialog): leave keys to it. */
function overlayOpen(): boolean {
  const ui = useUi.getState();
  return (
    !!(
      ui.openItemId ||
      ui.openEventId ||
      ui.openGoogleKey ||
      ui.draft ||
      ui.dialog
    ) || !!document.querySelector('[data-radix-popper-content-wrapper]')
  );
}

/** Global single-key shortcuts (see SHORTCUT_HELP). */
export function useGlobalShortcuts(route: Route) {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || (e.repeat && e.key.length === 1)) return;
    const action = actionFor(e);
    if (!action) return;
    const typing = isTyping(document.activeElement);
    if (action.type === 'undo') {
      // Inside a text field, Ctrl+Z belongs to the field.
      if (typing) return;
      e.preventDefault();
      undoLast();
      return;
    }
    if (typing || overlayOpen()) return;
    const target = navTarget();
    const ui = useUi.getState();
    switch (action.type) {
      case 'next':
        target?.next();
        break;
      case 'prev':
        target?.prev();
        break;
      case 'today':
        target?.today();
        break;
      case 'goto':
        if (target) ui.setDialog('goto');
        break;
      case 'help':
        ui.setDialog('help');
        break;
      case 'page':
        navigate({name: action.page} as Route);
        break;
      case 'view':
        if (target?.view && route.name === 'calendar') target.view(action.view);
        else navigate({name: 'calendar', view: action.view});
        break;
      case 'create':
        if (target?.create) target.create();
        else if (route.name === 'projects')
          document.querySelector<HTMLElement>('[data-new-item]')?.focus();
        else {
          // No calendar here: start the draft, then open the calendar, which shows it.
          ui.setDraft(nextHourDraft());
          navigate({name: 'calendar'});
        }
        break;
      case 'move':
        if (!moveFocus(action.dir)) return; // nothing to select: let the arrow scroll
        break;
    }
    e.preventDefault();
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
