import type { Urgency } from './model/selectors';
import type { ItemKind } from './model/types';

/** 1.5 → "1.5", 0.25 → "0.25", 2 → "2". */
export const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));
export const fmtH = (n: number) => `${fmtNum(n)}h`;

export const URGENCY_CLASS: Record<Urgency, string> = {
  overdue: 'text-danger',
  soon: 'text-danger',
  near: 'text-warn',
  far: 'text-dim',
};

export const KINDS: ItemKind[] = ['lecture', 'assignment', 'exam', 'task'];
export const KIND_BADGE: Record<ItemKind, string> = { lecture: 'LEC', assignment: 'ASG', exam: 'EXM', task: 'TSK' };
