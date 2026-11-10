import * as RP from '@radix-ui/react-popover';
import {useLayoutEffect, useRef, useState, type ComponentProps} from 'react';

export const Popover = RP.Root;
export const PopoverTrigger = RP.Trigger;
export const PopoverAnchor = RP.Anchor;

/** Space kept between a floating card and the window edge. */
const EDGE = 8;
/** Width of the event cards (w-[448px] in EventEditor and DraftEditor). */
const CARD_WIDTH = 448;
const GAP = 10;

/**
 * PopoverContent props for a card shown beside its anchor (an event block).
 * Radix flips the card between right and left by itself, but when the anchor
 * is so wide that the card fits on neither side (a block in Day view) it would
 * hang off the window; the card then overlaps the anchor's right edge instead.
 *
 * `anchor` is the ref passed to the PopoverAnchor.
 */
export function useBeside(open: boolean, cardWidth = CARD_WIDTH) {
  const anchor = useRef<HTMLDivElement>(null);
  const [sideOffset, setSideOffset] = useState(GAP);
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const r = anchor.current.getBoundingClientRect();
    const need = cardWidth + GAP + EDGE;
    const fits = window.innerWidth - r.right >= need || r.left >= need;
    // Overlapping: the card's left edge lands inside the anchor, but never off the window.
    setSideOffset(
      fits ? GAP : Math.max(-(cardWidth + 2 * GAP), EDGE - r.right),
    );
  }, [open, cardWidth]);
  const placement = {
    side: 'right',
    align: 'start',
    sideOffset,
    sheet: true,
  } as const;
  return [anchor, placement] as const;
}

/**
 * Floating card: portalled, flips and shifts to stay on screen, animates in/out.
 *
 * A `sheet` (an event's card, the create card) is shown on phones as a sheet
 * at the top of the screen instead, as wide as it and no taller than what the
 * keyboard leaves visible: a card beside its block got pushed about, and
 * under the keyboard, as it opened (see `.sheet` in index.css).
 *
 * On open, focus goes to an element marked `data-autofocus` (or the card itself)
 * with `preventScroll`: Radix's default focus runs before the card is positioned,
 * which made the browser scroll the calendar back to midnight.
 */
export function PopoverContent({
  className = '',
  onOpenAutoFocus,
  sheet,
  ...props
}: ComponentProps<typeof RP.Content> & {sheet?: boolean}) {
  return (
    <RP.Portal>
      <RP.Content
        sideOffset={6}
        collisionPadding={EDGE}
        data-sheet={sheet || undefined}
        {...props}
        onOpenAutoFocus={e => {
          onOpenAutoFocus?.(e);
          if (e.defaultPrevented) return;
          e.preventDefault();
          const card = e.currentTarget as HTMLElement;
          (card.querySelector<HTMLElement>('[data-autofocus]') ?? card).focus({
            preventScroll: true,
          });
        }}
        className={`popover-motion z-[60] rounded-xl border border-line bg-panel shadow-2xl shadow-black/40 outline-none ${className}`}
      />
    </RP.Portal>
  );
}
