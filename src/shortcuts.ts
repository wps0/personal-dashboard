import type {CalView} from './model/types';

/** What a key press means, independent of which page is showing. */
type Action =
  | {type: 'next'}
  | {type: 'prev'}
  | {type: 'today'}
  | {type: 'goto'}
  | {type: 'create'}
  | {type: 'help'}
  | {type: 'undo'}
  | {type: 'page'; page: Page}
  | {type: 'tab'; dir: 1 | -1}
  | {type: 'view'; view: CalView}
  | {type: 'move'; dir: 'up' | 'down' | 'left' | 'right'};

interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

const PAGES = ['home', 'week', 'calendar', 'projects', 'settings'] as const;
type Page = (typeof PAGES)[number];

/** The tab before or after `current` in the nav bar, wrapping around (vim's gT / gt). */
export function adjacentPage(current: Page, dir: 1 | -1): Page {
  const i = PAGES.indexOf(current);
  return PAGES[(i + dir + PAGES.length) % PAGES.length];
}

/**
 * Maps a key press to an action, following Google Calendar where it has an
 * equivalent. Ctrl/Cmd/Alt combinations are left to the browser, except Ctrl/Cmd+Z.
 */
export function actionFor(e: KeyLike): Action | null {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'z')
    return {type: 'undo'};
  if (mod || e.altKey) return null;
  switch (e.key) {
    case 'j':
    case 'n':
      return {type: 'next'};
    case 'k':
    case 'p':
      return {type: 'prev'};
    case 'h':
      return {type: 'tab', dir: -1};
    case 'l':
      return {type: 'tab', dir: 1};
    case 't':
      return {type: 'today'};
    case 'g':
      return {type: 'goto'};
    case 'c':
      return {type: 'create'};
    case '?':
      return {type: 'help'};
    case 'd':
      return {type: 'view', view: 'day'};
    case 'x':
      return {type: 'view', view: '3day'};
    case 'w':
      return {type: 'view', view: 'week'};
    case 'm':
      return {type: 'view', view: 'month'};
    case 'ArrowUp':
      return {type: 'move', dir: 'up'};
    case 'ArrowDown':
      return {type: 'move', dir: 'down'};
    case 'ArrowLeft':
      return {type: 'move', dir: 'left'};
    case 'ArrowRight':
      return {type: 'move', dir: 'right'};
  }
  if (/^[1-5]$/.test(e.key))
    return {type: 'page', page: PAGES[Number(e.key) - 1]};
  return null;
}

/** The help dialog's content, grouped. Kept next to the mapping so they can't drift apart. */
export const SHORTCUT_HELP: {group: string; keys: [string, string][]}[] = [
  {
    group: 'Navigation',
    keys: [
      ['j / n', 'Next period'],
      ['k / p', 'Previous period'],
      ['t', 'Today'],
      ['g', 'Go to date'],
      ['h / l', 'Previous / next tab'],
      ['1 – 5', 'Home · Week · Calendar · Projects · Settings'],
    ],
  },
  {
    group: 'Calendar views',
    keys: [
      ['d', 'Day'],
      ['x', '3 days'],
      ['w', 'Week'],
      ['m', 'Month'],
    ],
  },
  {
    group: 'Actions',
    keys: [
      ['c', 'Create event (or a task in a project)'],
      ['↑ ↓ ← →', 'Move between blocks'],
      ['e / Enter', 'Open the selected block'],
      ['Space', 'Toggle the selected session done'],
      ['Delete / Backspace', 'Delete the selected block'],
      ['Ctrl+Z', 'Undo'],
      ['Esc', 'Close'],
      ['?', 'This help'],
    ],
  },
];
