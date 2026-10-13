import type {Urgency} from './model/selectors';
import type {ItemKind} from './model/types';

/** 1.5 → "1.5", 0.25 → "0.25", 2 → "2". */
export const fmtNum = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '');
export const fmtH = (n: number) => `${fmtNum(n)}h`;

export const URGENCY_CLASS: Record<Urgency, string> = {
  overdue: 'text-danger',
  soon: 'text-danger',
  near: 'text-warn',
  far: 'text-dim',
};

export const KINDS: ItemKind[] = ['class', 'assignment', 'exam', 'task'];
export const KIND_BADGE: Record<ItemKind, string> = {
  class: 'CLS',
  assignment: 'ASG',
  exam: 'EXM',
  task: 'TSK',
};

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
