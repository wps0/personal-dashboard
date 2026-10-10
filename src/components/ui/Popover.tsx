import * as RP from '@radix-ui/react-popover';
import type { ComponentProps } from 'react';

export const Popover = RP.Root;
export const PopoverTrigger = RP.Trigger;
export const PopoverAnchor = RP.Anchor;
export const PopoverClose = RP.Close;

/**
 * Floating card: portalled, flips and shifts to stay on screen, animates in/out.
 *
 * On open, focus goes to an element marked `data-autofocus` (or the card itself)
 * with `preventScroll`: Radix's default focus runs before the card is positioned,
 * which made the browser scroll the calendar back to midnight.
 */
export function PopoverContent({ className = '', onOpenAutoFocus, ...props }: ComponentProps<typeof RP.Content>) {
  return (
    <RP.Portal>
      <RP.Content
        sideOffset={6}
        collisionPadding={8}
        {...props}
        onOpenAutoFocus={(e) => {
          onOpenAutoFocus?.(e);
          if (e.defaultPrevented) return;
          e.preventDefault();
          const card = e.currentTarget as HTMLElement;
          (card.querySelector<HTMLElement>('[data-autofocus]') ?? card).focus({ preventScroll: true });
        }}
        className={`popover-motion z-[60] rounded-xl border border-line bg-panel shadow-2xl shadow-black/40 outline-none ${className}`}
      />
    </RP.Portal>
  );
}
