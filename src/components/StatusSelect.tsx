import {statusLabel} from '../model/selectors';
import {ItemStatus, STATUSES} from '../model/types';
import {Select} from './ui/Select';

const STATUS_COLOR: Record<ItemStatus, string> = {
  [ItemStatus.UNSPECIFIED]: '#94a3b8',
  [ItemStatus.TODO]: '#94a3b8',
  [ItemStatus.DOING]: '#60a5fa',
  [ItemStatus.DONE]: '#34d399',
};

const OPTIONS = STATUSES.map(s => ({
  value: s,
  label: statusLabel(s),
  color: STATUS_COLOR[s],
}));

/** To do / In progress / Done, with a colored dot. */
export function StatusSelect({
  value,
  onChange,
  variant = 'ghost',
  className = 'w-32',
}: {
  value: ItemStatus;
  onChange(s: ItemStatus): void;
  variant?: 'field' | 'ghost';
  className?: string;
}) {
  return (
    <Select
      value={value}
      onChange={onChange}
      options={OPTIONS}
      variant={variant}
      className={className}
      ariaLabel="Status"
    />
  );
}
