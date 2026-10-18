import DOMPurify from 'dompurify';
import {
  Clock,
  ExternalLink,
  Lock,
  MapPin,
  AlignLeft,
  CalendarDays,
  X,
  XCircle,
} from 'lucide-react';
import {memo, useMemo, type ReactElement, type ReactNode} from 'react';
import type {GEvent} from '../google/events';
import {blockKeys} from '../keyboard';
import {fromMinutes} from '../model/time';
import {readableOn} from '../format';
import {useUi} from '../ui';
import {BlockLabel, blockTextClass} from './BlockLabel';
import {Popover, PopoverAnchor, PopoverContent, useBeside} from './ui/Popover';

const CARD_WIDTH = 400;

/** Read-only details for a Google event, with a link to edit it in Google Calendar. */
function GoogleEventCard({ev}: {ev: GEvent}) {
  // Descriptions can contain HTML (links, line breaks); sanitize before rendering.
  const description = useMemo(
    () =>
      ev.description
        ? DOMPurify.sanitize(ev.description, {ADD_ATTR: ['target']})
        : '',
    [ev.description],
  );
  const close = () => useUi.getState().openGoogle(null);
  return (
    <div className="max-w-[calc(100vw-24px)] p-3" style={{width: CARD_WIDTH}}>
      <div className="mb-1 flex justify-end gap-0.5">
        {ev.htmlLink && (
          <a
            className="icon-btn"
            href={ev.htmlLink}
            target="_blank"
            rel="noreferrer"
            title="Open in Google Calendar"
            aria-label="Open in Google Calendar"
          >
            <ExternalLink size={16} />
          </a>
        )}
        <button className="icon-btn" aria-label="Close" onClick={close}>
          <X size={16} />
        </button>
      </div>
      <div className="mb-3 flex items-start gap-3">
        <span
          className="mt-1.5 h-3 w-3 shrink-0 rounded"
          style={{background: ev.color}}
        />
        <h3
          className={`min-w-0 flex-1 text-lg leading-snug text-strong ${ev.declined ? 'line-through decoration-dim' : ''}`}
        >
          {ev.title}
        </h3>
      </div>
      <div className="space-y-2.5 text-[13px]">
        <Row icon={<Clock size={16} />}>{ev.when}</Row>
        {ev.location && <Row icon={<MapPin size={16} />}>{ev.location}</Row>}
        {description && (
          <Row icon={<AlignLeft size={16} />}>
            <div
              className="prose-md max-h-48 overflow-y-auto break-words"
              dangerouslySetInnerHTML={{__html: description}}
            />
          </Row>
        )}
        <Row icon={<CalendarDays size={16} />}>{ev.calendarName}</Row>
        {ev.declined && (
          <Row icon={<XCircle size={16} />}>You declined this invitation</Row>
        )}
      </div>
      <p className="mt-3 flex items-center gap-1.5 pl-7 text-[11px] text-dim">
        <Lock size={11} /> From Google Calendar · read-only here
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

/** Wraps a block in its read-only popover; Enter/e opens it from the keyboard. */
function WithCard({ev, children}: {ev: GEvent; children: ReactElement}) {
  const open = useUi(s => s.openGoogleKey === ev.key);
  const [anchor, beside] = useBeside(open, CARD_WIDTH);
  return (
    <Popover
      open={open}
      onOpenChange={o => !o && useUi.getState().openGoogle(null)}
    >
      <PopoverAnchor asChild ref={anchor}>
        {children}
      </PopoverAnchor>
      {open && (
        <PopoverContent {...beside}>
          <GoogleEventCard ev={ev} />
        </PopoverContent>
      )}
    </Popover>
  );
}

/**
 * Declined invitations: outlined in the event's color on a plain background,
 * faded, with the title struck through (like Google Calendar's "show declined events").
 */
function declinedStyle(color: string) {
  return {
    background: 'var(--color-panel)',
    boxShadow: `inset 0 0 0 1px ${color}`,
    color: 'var(--color-dim)',
    opacity: 0.85,
  };
}

function tooltip(ev: GEvent) {
  return `${ev.title}${ev.declined ? ' (declined)' : ''}\n${ev.when}\n${ev.calendarName} (Google, read-only)`;
}

function openCard(ev: GEvent) {
  return () => useUi.getState().openGoogle(ev.key);
}

/** A timed Google event in a day column: same look as local events, in the calendar's color, not draggable. */
export const GoogleTimedBlock = memo(function GoogleTimedBlock(props: {
  ev: GEvent;
  pos?: {lane: number; lanes: number};
  hourHeight: number;
}) {
  const {ev, pos = {lane: 0, lanes: 1}, hourHeight} = props;
  const height = Math.max(
    ((ev.endMin - ev.startMin) / 60) * hourHeight - 1,
    14,
  );
  return (
    <WithCard ev={ev}>
      <div
        tabIndex={0}
        role="button"
        data-block
        onKeyDown={blockKeys({open: openCard(ev)})}
        onClick={openCard(ev)}
        className={`block-interactive absolute z-10 cursor-pointer overflow-hidden rounded-md px-1.5 text-[11px] ${blockTextClass(height)}`}
        style={{
          top: (ev.startMin / 60) * hourHeight,
          height,
          left: `calc(${(pos.lane / pos.lanes) * 100}% + 2px)`,
          width: `calc(${100 / pos.lanes}% - 6px)`,
          ...(ev.declined
            ? declinedStyle(ev.color)
            : {
                background: ev.color,
                color: readableOn(ev.color),
                opacity: ev.busy ? 1 : 0.75,
              }),
        }}
        title={tooltip(ev)}
      >
        <BlockLabel
          height={height}
          title={ev.title}
          titleClassName={ev.declined ? 'line-through' : ''}
          start={fromMinutes(ev.startMin)}
          details={`${fromMinutes(ev.startMin)} – ${fromMinutes(Math.min(ev.endMin, 1439))}`}
        />
      </div>
    </WithCard>
  );
});

/** An all-day Google event (all-day row), or any Google event in the month view. */
/** Pointed ends where a spanning bar continues past the visible days, like Google Calendar. */
function spanClip(before?: boolean, after?: boolean): string | undefined {
  if (!before && !after) return undefined;
  const left = before ? ['6px 100%', '0 50%', '6px 0'] : ['0 100%', '0 0'];
  const right = after
    ? ['calc(100% - 6px) 0', '100% 50%', 'calc(100% - 6px) 100%']
    : ['100% 0', '100% 100%'];
  return `polygon(${[...left, ...right].join(', ')})`;
}

export const GoogleChip = memo(function GoogleChip({
  ev,
  variant,
  before,
  after,
}: {
  ev: GEvent;
  /** 'span': one bar across a multi-day event's days. */
  variant: 'strip' | 'month' | 'span';
  before?: boolean;
  after?: boolean;
}) {
  const timedInMonth = variant === 'month' && !ev.allDay;
  return (
    <WithCard ev={ev}>
      <div
        tabIndex={0}
        role="button"
        data-block
        onKeyDown={blockKeys({open: openCard(ev)})}
        onClick={openCard(ev)}
        className={`block-interactive flex shrink-0 cursor-pointer items-center gap-1 truncate rounded py-px text-[11px] ${
          timedInMonth ? 'hover:bg-raised' : 'font-medium'
        } ${before ? 'pl-3' : 'pl-1.5'} ${after ? 'pr-3' : 'pr-1.5'}`}
        style={{
          ...(timedInMonth
            ? ev.declined
              ? {opacity: 0.6}
              : undefined
            : ev.declined
              ? declinedStyle(ev.color)
              : {background: ev.color, color: readableOn(ev.color)}),
          clipPath: variant === 'span' ? spanClip(before, after) : undefined,
        }}
        title={tooltip(ev)}
      >
        {timedInMonth && (
          <>
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{background: ev.color}}
            />
            <span className="text-dim tabular-nums">
              {fromMinutes(ev.startMin)}
            </span>
          </>
        )}
        <span className={`truncate ${ev.declined ? 'line-through' : ''}`}>
          {ev.title}
        </span>
      </div>
    </WithCard>
  );
});
