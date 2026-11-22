/**
 * The prototype's looks. Soft, the one chosen, is the default; ?look= shows
 * the others, kept for the record:
 * - soft: filled surfaces with no outlines, rounder;
 * - panes: bordered cards (the second and third rounds);
 * - open: no cards; type, space and hairlines.
 */
export type Look = 'panes' | 'open' | 'soft';

const asked = new URLSearchParams(location.search).get('look');

export const LOOK: Look =
  asked === 'open' || asked === 'panes' ? asked : 'soft';

/** The value for the current look. */
export function pick<T>(values: Record<Look, T>): T {
  return values[LOOK];
}

/** A container for a chart or a block of content. */
export const box = pick({
  panes: 'rounded-xl border border-line bg-panel p-3',
  open: 'py-1',
  soft: 'rounded-3xl bg-raised p-4',
});

/** A container for a list of rows. */
export const listBox = pick({
  panes: 'divide-y divide-line rounded-xl border border-line bg-panel',
  open: '-mx-4 divide-y divide-line border-y border-line',
  soft: 'divide-y divide-line/70 rounded-3xl bg-raised',
});

/** A row inside a list: open lists run edge to edge. */
export const listRow = pick({panes: 'px-3', open: 'px-4', soft: 'px-4'});
