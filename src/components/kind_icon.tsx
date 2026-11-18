import {
  FileText,
  GraduationCap,
  PenLine,
  SquareCheck,
  type LucideIcon,
} from 'lucide-react';
import {kindName} from '../format';
import {ItemKind} from '../model/types';

const ICONS: Partial<Record<ItemKind, LucideIcon>> = {
  [ItemKind.CLASS]: GraduationCap,
  [ItemKind.ASSIGNMENT]: FileText,
  [ItemKind.EXAM]: PenLine,
  [ItemKind.TASK]: SquareCheck,
};

/**
 * An item's kind as an icon, named for screen readers (and on hover): a cap
 * for a class, a page for an assignment, a pen for an exam, a box for a task.
 * Nothing for Other. Where there's room, the word goes next to it instead of
 * the name: pass `named={false}` and write `kindName()`.
 */
export function KindIcon({
  kind,
  size = 13,
  named = true,
  className = '',
}: {
  kind: ItemKind;
  size?: number;
  /** Whether the icon carries the kind's name; false when the word is shown beside it. */
  named?: boolean;
  className?: string;
}) {
  const Icon = ICONS[kind];
  if (!Icon) return null;
  const name = kindName(kind);
  return named ? (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={`inline-flex shrink-0 ${className}`}
    >
      <Icon size={size} aria-hidden />
    </span>
  ) : (
    <Icon size={size} aria-hidden className={`shrink-0 ${className}`} />
  );
}
