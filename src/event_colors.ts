import {readableOn} from './format';
import {EventColor} from './model/types';

/**
 * Google Calendar's event colours as its app shows them, in its menu's order.
 * The API's own /colors palette is an older, paler set that doesn't match what
 * you see in the app.
 */
export const EVENT_COLORS: readonly {
  color: EventColor;
  name: string;
  hex: string;
}[] = [
  {color: EventColor.TOMATO, name: 'Tomato', hex: '#d50000'},
  {color: EventColor.FLAMINGO, name: 'Flamingo', hex: '#e67c73'},
  {color: EventColor.TANGERINE, name: 'Tangerine', hex: '#f4511e'},
  {color: EventColor.BANANA, name: 'Banana', hex: '#f6bf26'},
  {color: EventColor.SAGE, name: 'Sage', hex: '#33b679'},
  {color: EventColor.BASIL, name: 'Basil', hex: '#0b8043'},
  {color: EventColor.PEACOCK, name: 'Peacock', hex: '#039be5'},
  {color: EventColor.BLUEBERRY, name: 'Blueberry', hex: '#3f51b5'},
  {color: EventColor.LAVENDER, name: 'Lavender', hex: '#7986cb'},
  {color: EventColor.GRAPE, name: 'Grape', hex: '#8e24aa'},
  {color: EventColor.GRAPHITE, name: 'Graphite', hex: '#616161'},
];

const HEX = new Map(EVENT_COLORS.map(c => [c.color, c.hex]));

/** A palette colour's hex (EventColor values are Google's colorId); undefined if unset or unknown. */
export function eventColorHex(color: EventColor): string | undefined {
  return HEX.get(color);
}

/** Background and text colour for a local event: its own colour, or the default one. */
export function eventStyle(color: EventColor): {
  background: string;
  color: string;
} {
  const hex = HEX.get(color);
  return hex
    ? {background: hex, color: readableOn(hex)}
    : {background: 'var(--color-event)', color: 'var(--color-on-block)'};
}
