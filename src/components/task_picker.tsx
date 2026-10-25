import {X} from 'lucide-react';
import {useCallback, useId, useMemo, useState} from 'react';
import {fmtH} from '../format';
import {useLookups} from '../hooks';
import {todayISO} from '../model/dates';
import {backlogItems, findTasks} from '../model/selectors';
import {useStore} from '../store';

/**
 * Chooses the task a time block is for: a search field over open tasks
 * (without a query, the ones that still need time), or the chosen task.
 */
export function TaskPicker({
  itemId,
  onPick,
  onSave,
}: {
  itemId?: string;
  onPick(itemId: string | undefined): void;
  /** Enter on the chosen task. */
  onSave(): void;
}) {
  const items = useStore(s => s.data.items);
  const projects = useStore(s => s.data.projects);
  const allocations = useStore(s => s.data.allocations);
  const lookups = useLookups();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const today = todayISO();
  const data = useMemo(
    () => ({items, projects, allocations}),
    [items, projects, allocations],
  );
  const matches = useMemo(
    () => findTasks(data, query, today),
    [data, query, today],
  );
  const remaining = useMemo(
    () => new Map(backlogItems(data, today).map(b => [b.item.id, b.remaining])),
    [data, today],
  );
  const picked = itemId ? lookups.item(itemId) : undefined;
  // Switching to this tab, or picking, moves focus here (the card's own
  // autofocus only runs when it opens).
  const focusOnMount = useCallback(
    (el: HTMLElement | null) => el?.focus({preventScroll: true}),
    [],
  );

  if (picked) {
    const left = remaining.get(picked.id);
    return (
      <div className="mb-3 ml-7 flex items-center gap-2 border-b-2 border-line pb-1">
        <span
          className="h-3 w-3 shrink-0 rounded"
          style={{background: lookups.color(picked)}}
        />
        <div className="min-w-0 flex-1">
          <div
            ref={focusOnMount}
            data-autofocus
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onSave()}
            className="truncate text-lg text-strong outline-none"
          >
            {picked.title}
          </div>
          <div className="truncate text-[12px] text-dim">
            {lookups.project(picked.projectId)?.name}
            {left != null && ` · ${fmtH(left)} left to plan`}
          </div>
        </div>
        <button
          className="icon-btn"
          aria-label="Choose another task"
          title="Choose another task"
          onClick={() => onPick(undefined)}
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  const pick = (i: number) => {
    const item = matches[i];
    if (item) onPick(item.id);
  };
  return (
    <div className="mb-3 ml-7">
      <input
        ref={focusOnMount}
        data-autofocus
        role="combobox"
        aria-label="Task"
        aria-expanded
        aria-controls={listId}
        aria-activedescendant={
          matches[active] ? `${listId}-${matches[active].id}` : undefined
        }
        value={query}
        placeholder="Search tasks"
        onChange={e => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const step = e.key === 'ArrowDown' ? 1 : -1;
            setActive(
              a => (a + step + matches.length) % Math.max(1, matches.length),
            );
          } else if (e.key === 'Enter') {
            e.preventDefault();
            pick(active);
          }
        }}
        className="w-full border-b-2 border-x-0 border-t-0 border-line pb-1 text-lg text-strong placeholder:text-dim focus:border-accent"
      />
      <div
        id={listId}
        role="listbox"
        aria-label="Tasks"
        className="scroll-thin mt-1 max-h-48 overflow-y-auto"
      >
        {matches.map((item, i) => (
          <div
            key={item.id}
            id={`${listId}-${item.id}`}
            role="option"
            aria-selected={i === active}
            onMouseEnter={() => setActive(i)}
            onMouseDown={e => e.preventDefault()}
            onClick={() => pick(i)}
            className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 ${
              i === active ? 'bg-raised' : ''
            }`}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{background: lookups.color(item)}}
            />
            <span className="min-w-0 flex-1 truncate text-strong">
              {item.title}
            </span>
            <span className="max-w-[40%] shrink-0 truncate text-[12px] text-dim">
              {lookups.project(item.projectId)?.name}
            </span>
          </div>
        ))}
        {!matches.length && (
          <p className="px-2 py-1 text-[12px] text-dim">
            {query.trim()
              ? 'No open task matches.'
              : 'Nothing left to plan. Search for any open task.'}
          </p>
        )}
      </div>
    </div>
  );
}
