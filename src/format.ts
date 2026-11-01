import type {Urgency} from './model/selectors';
import {ItemKind, type ItemGroup} from './model/types';

/** 1.5 → "1.5", 0.25 → "0.25", 2 → "2". */
export function fmtNum(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '');
}
export function fmtH(n: number) {
  return `${fmtNum(n)}h`;
}
/** Hours as "1h 53m", "45m" or "2h" (whole minutes); nothing is "0h". */
export function fmtDuration(hours: number) {
  const min = Math.round(hours * 60);
  if (min === 0) return '0h';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h && `${h}h`, m && `${m}m`].filter(Boolean).join(' ');
}
/**
 * Hours as whole hours, rounded down ("8h" for 8h 53m): for totals, where the
 * minutes would be noise. Counted in whole minutes, so 7.99999 is "8h".
 */
export function fmtHours(hours: number) {
  return `${Math.floor(Math.round(hours * 60) / 60)}h`;
}

export const URGENCY_CLASS: Record<Urgency, string> = {
  overdue: 'text-danger',
  soon: 'text-danger',
  near: 'text-warn',
  far: 'text-dim',
};

const KINDS: Record<ItemKind, {name: string; badge: string}> = {
  [ItemKind.UNSPECIFIED]: {name: 'Other', badge: '?'},
  [ItemKind.CLASS]: {name: 'Class', badge: 'CLS'},
  [ItemKind.ASSIGNMENT]: {name: 'Assignment', badge: 'ASG'},
  [ItemKind.EXAM]: {name: 'Exam', badge: 'EXM'},
  [ItemKind.TASK]: {name: 'Task', badge: 'TSK'},
};

/** The short badge for an item kind; "?" for a kind this version doesn't know. */
export function kindBadge(kind: ItemKind): string {
  return KINDS[kind]?.badge ?? '?';
}

/** The kinds you can pick for an item, for a Select. */
export const KIND_OPTIONS = [
  ItemKind.CLASS,
  ItemKind.ASSIGNMENT,
  ItemKind.EXAM,
  ItemKind.TASK,
].map(kind => ({value: kind, label: KINDS[kind].name}));

/** "No group" ('') and a project's groups, for a Select. */
export function groupOptions(groups: ItemGroup[]) {
  return [
    {value: '', label: 'No group'},
    ...groups.map(g => ({value: g.id, label: g.name})),
  ];
}

/**
 * Text color that stays readable on a solid background (dark on light colors,
 * white on dark ones), using WCAG relative luminance.
 */
export function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 'var(--color-on-block)';
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L =
    0.2126 * lin((n >> 16) & 255) +
    0.7152 * lin((n >> 8) & 255) +
    0.0722 * lin(n & 255);
  // Pick whichever of near-black (#0b1626) or white gives more contrast.
  const dark = (L + 0.05) / (0.0084 + 0.05);
  const light = 1.05 / (L + 0.05);
  return dark >= light ? '#0b1626' : '#ffffff';
}
