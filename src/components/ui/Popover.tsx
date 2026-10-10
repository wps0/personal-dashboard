import * as RP from '@radix-ui/react-popover';
import type { ComponentProps } from 'react';

export const Popover = RP.Root;
export const PopoverTrigger = RP.Trigger;
export const PopoverAnchor = RP.Anchor;
export const PopoverClose = RP.Close;

/** Floating card: portalled, flips and shifts to stay on screen. */
export function PopoverContent({ className = '', ...props }: ComponentProps<typeof RP.Content>) {
  return (
    <RP.Portal>
      <RP.Content
        sideOffset={6}
        collisionPadding={8}
        {...props}
        className={`z-[60] rounded-xl border border-line bg-panel shadow-2xl shadow-black/40 outline-none ${className}`}
      />
    </RP.Portal>
  );
}
