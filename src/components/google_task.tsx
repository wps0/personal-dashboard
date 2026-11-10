import {
  AlignLeft,
  Circle,
  CircleCheck,
  Clock,
  ExternalLink,
  ListTodo,
  Lock,
  X,
} from 'lucide-react';
import {memo, useState, type ReactNode} from 'react';
import {clicksSuppressed} from '../dnd';
import type {GTask} from '../google/tasks';
import {blockKeys} from '../keyboard';
import {formatLong} from '../model/dates';
import {Popover, PopoverAnchor, PopoverContent, useBeside} from './ui/popover';

const CARD_WIDTH = 360;

/** Read-only details for a Google task, with a link to it in Google Tasks. */
function GoogleTaskCard({task, onClose}: {task: GTask; onClose(): void}) {
  return (
    <div className="max-w-[calc(100vw-24px)] p-3" style={{width: CARD_WIDTH}}>
      <div className="mb-1 flex justify-end gap-0.5">
        {task.link && (
          <a
            className="icon-btn"
            href={task.link}
            target="_blank"
            rel="noreferrer"
            title="Open in Google Tasks"
            aria-label="Open in Google Tasks"
          >
            <ExternalLink size={16} />
          </a>
        )}
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="mb-3 flex items-start gap-3">
        {task.done ? (
          <CircleCheck size={16} className="mt-1 shrink-0 text-accent" />
        ) : (
          <Circle size={16} className="mt-1 shrink-0 text-accent" />
        )}
        <h3
          className={`min-w-0 flex-1 text-lg leading-snug break-words text-strong ${task.done ? 'line-through decoration-dim' : ''}`}
        >
          {task.title}
        </h3>
      </div>
      <div className="space-y-2.5 text-[13px]">
        <Row icon={<Clock size={16} />}>
          Due {formatLong(task.due)}
          {task.done && ' · done'}
        </Row>
        {task.notes && (
          <Row icon={<AlignLeft size={16} />}>
            <p className="max-h-48 overflow-y-auto break-words whitespace-pre-wrap">
              {task.notes}
            </p>
          </Row>
        )}
        {task.listTitle && (
          <Row icon={<ListTodo size={16} />}>{task.listTitle}</Row>
        )}
      </div>
      <p className="mt-3 flex items-center gap-1.5 pl-7 text-[11px] text-dim">
        <Lock size={11} /> From Google Tasks · read-only here
      </p>
    </div>
  );
}

function Row({icon, children}: {icon: ReactNode; children: ReactNode}) {
  return (
    <div className="flex gap-3">
      <span className="mt-px shrink-0 text-dim">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * A Google task on its due day (the time grid's all-day row, a month cell):
 * a circle, ticked and struck through once done. Opens a read-only card.
 */
export const GoogleTaskChip = memo(function GoogleTaskChip({
  task,
  variant,
}: {
  task: GTask;
  variant: 'strip' | 'month';
}) {
  const [open, setOpen] = useState(false);
  const [anchor, beside] = useBeside(open, CARD_WIDTH);
  const label = `Google task: ${task.title}${task.done ? ' (done)' : ''}`;
  const Icon = task.done ? CircleCheck : Circle;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild ref={anchor}>
        <div
          role="button"
          tabIndex={0}
          data-block
          aria-label={label}
          title={`${label}\n${task.listTitle} (Google Tasks, read-only)`}
          onKeyDown={blockKeys({open: () => setOpen(true)})}
          onClick={() => !clicksSuppressed() && setOpen(true)}
          className={`block-interactive flex shrink-0 cursor-pointer items-center gap-1 truncate rounded border border-accent/60 bg-accent/10 text-[11px] font-medium ${
            variant === 'strip' ? 'px-1.5' : 'px-1'
          } ${task.done ? 'opacity-60' : ''}`}
        >
          <Icon size={11} aria-hidden className="shrink-0 text-accent" />
          <span
            className={`min-w-0 flex-1 truncate text-strong ${task.done ? 'line-through' : ''}`}
          >
            {task.title}
          </span>
        </div>
      </PopoverAnchor>
      {open && (
        <PopoverContent {...beside}>
          <GoogleTaskCard task={task} onClose={() => setOpen(false)} />
        </PopoverContent>
      )}
    </Popover>
  );
});
