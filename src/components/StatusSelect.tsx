import {STATUS_LABEL} from '../model/selectors';
import {STATUSES, type ItemStatus} from '../model/types';
import {Select} from './ui/Select';

export const STATUS_COLOR: Record<ItemStatus, string> = {
  todo: '#94a3b8',
  doing: '#60a5fa',
  done: '#34d399',
};

const OPTIONS = STATUSES.map(s => ({
  value: s,
  label: STATUS_LABEL[s],
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
