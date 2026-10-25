import {useMemo, type ReactNode} from 'react';
import {moveToGroup} from '../actions';
import {groupOptions} from '../format';
import {groupIdOf} from '../model/selectors';
import type {Item, ItemGroup} from '../model/types';
import {Select} from './ui/select';

/** Moves an item to another of its project's groups, or to none; undoable. */
export function GroupSelect({
  item,
  groups,
  ariaLabel,
  variant,
  className,
  display,
}: {
  item: Item;
  /** Its project's groups. */
  groups: ItemGroup[];
  ariaLabel: string;
  variant?: 'field' | 'ghost';
  className?: string;
  display?: ReactNode;
}) {
  const options = useMemo(() => groupOptions(groups), [groups]);
  return (
    <Select
      value={groupIdOf(item, groups)}
      onChange={id =>
        moveToGroup(
          [item],
          groups.find(g => g.id === id),
        )
      }
      options={options}
      variant={variant}
      className={className}
      display={display}
      ariaLabel={ariaLabel}
    />
  );
}
