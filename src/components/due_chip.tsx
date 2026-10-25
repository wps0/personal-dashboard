import {Flag} from 'lucide-react';
import {memo} from 'react';
import {clicksSuppressed} from '../dnd';
import type {Lookups} from '../hooks';
import {blockKeys} from '../keyboard';
import {isItemDone} from '../model/selectors';
import type {ISODate, Item} from '../model/types';
import {useUi} from '../ui';

/**
 * A task's deadline on its due day (the time grid's all-day row, a month
 * cell): a flag, red once an open task is overdue. Opens the task.
 */
export const DueChip = memo(function DueChip({
  item,
  lookups,
  today,
  variant,
}: {
  item: Item;
  lookups: Lookups;
  today: ISODate;
  variant: 'strip' | 'month';
}) {
  const color = lookups.color(item);
  const done = isItemDone(item);
  const overdue = !done && !!item.dueDate && item.dueDate < today;
  const project = lookups.project(item.projectId);
  const label = `Due: ${item.title}${project ? ` · ${project.name}` : ''}`;
  const open = () => useUi.getState().openItem(item.id);
  return (
    <div
      role="button"
      tabIndex={0}
      data-block
      aria-label={label}
      title={label}
      onKeyDown={blockKeys({open})}
      onClick={() => !clicksSuppressed() && open()}
      className={`block-interactive flex shrink-0 cursor-pointer items-center gap-1 truncate rounded border text-[11px] font-medium ${
        variant === 'strip' ? 'px-1.5' : 'px-1'
      } ${done ? 'line-through opacity-60' : ''}`}
      style={{
        borderColor: color,
        background: `color-mix(in srgb, ${color} 18%, transparent)`,
      }}
    >
      <Flag
        size={11}
        aria-hidden
        className={`shrink-0 ${overdue ? 'text-danger' : ''}`}
        style={overdue ? undefined : {color}}
      />
      <span className="min-w-0 flex-1 truncate text-strong">{item.title}</span>
    </div>
  );
});
