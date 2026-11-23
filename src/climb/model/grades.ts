/**
 * @fileoverview Bouldering grades: Font (6A, 6B+…) and V (V3, V4…), their
 * order, the conversion between them, and the range of logging buttons.
 */

import {
  CLIMB_BOARD_BUTTONS_FONT,
  CLIMB_BOARD_BUTTONS_V,
  CLIMB_GYM_BUTTONS_FONT,
  CLIMB_GYM_BUTTONS_V,
} from '../../config';
import {GradeSystem, PlaceKind, type Settings} from './data';

/** Font grades, easiest first. */
export const FONT = [
  '3',
  '4',
  '4+',
  '5',
  '5+',
  '6A',
  '6A+',
  '6B',
  '6B+',
  '6C',
  '6C+',
  '7A',
  '7A+',
  '7B',
  '7B+',
  '7C',
  '7C+',
  '8A',
  '8A+',
  '8B',
  '8B+',
  '8C',
  '8C+',
  '9A',
] as const;

/** V grades, easiest first. */
export const V = [
  'VB',
  'V0',
  'V1',
  'V2',
  'V3',
  'V4',
  'V5',
  'V6',
  'V7',
  'V8',
  'V9',
  'V10',
  'V11',
  'V12',
  'V13',
  'V14',
  'V15',
  'V16',
  'V17',
] as const;

/**
 * The V grade of each Font grade (the table in docs/climbing.md). The
 * sources agree on the ends and differ in the middle, so a converted grade
 * is shown with "≈".
 */
const FONT_TO_V: Readonly<Record<string, string>> = {
  '3': 'VB',
  '4': 'V0',
  '4+': 'V0',
  '5': 'V1',
  '5+': 'V2',
  '6A': 'V3',
  '6A+': 'V3',
  '6B': 'V4',
  '6B+': 'V4',
  '6C': 'V5',
  '6C+': 'V5',
  '7A': 'V6',
  '7A+': 'V7',
  '7B': 'V8',
  '7B+': 'V8',
  '7C': 'V9',
  '7C+': 'V10',
  '8A': 'V11',
  '8A+': 'V12',
  '8B': 'V13',
  '8B+': 'V14',
  '8C': 'V15',
  '8C+': 'V16',
  '9A': 'V17',
};

/** The system the settings use: Font unless V is chosen. */
export function systemOf(settings: Settings): GradeSystem {
  return settings.grades === GradeSystem.V ? GradeSystem.V : GradeSystem.FONT;
}

/** The grades of `system`, easiest first. */
export function scale(system: GradeSystem): readonly string[] {
  return system === GradeSystem.V ? V : FONT;
}

/** `grade` (of `from`) in `to`: itself, or the nearest by the table. */
export function convert(
  grade: string,
  from: GradeSystem,
  to: GradeSystem,
): string {
  const a = from === GradeSystem.V ? GradeSystem.V : GradeSystem.FONT;
  const b = to === GradeSystem.V ? GradeSystem.V : GradeSystem.FONT;
  if (a === b) return grade;
  if (b === GradeSystem.V) return FONT_TO_V[grade] ?? grade;
  // V to Font: the easiest Font grade with that V grade.
  return FONT.find(f => FONT_TO_V[f] === grade) ?? grade;
}

/** The default range of buttons for a kind of place, in `system`. */
function defaultRange(
  kind: PlaceKind,
  system: GradeSystem,
): readonly [string, string] {
  const board = kind === PlaceKind.BOARD;
  if (system === GradeSystem.V)
    return board ? CLIMB_BOARD_BUTTONS_V : CLIMB_GYM_BUTTONS_V;
  return board ? CLIMB_BOARD_BUTTONS_FONT : CLIMB_GYM_BUTTONS_FONT;
}

/**
 * The range of grade buttons for a kind of place, from and to: the
 * settings' if both are grades of the scale in order, else the default.
 */
export function buttonRange(
  settings: Settings,
  kind: PlaceKind,
): readonly [string, string] {
  const system = systemOf(settings);
  const all = scale(system);
  const [from, to] =
    kind === PlaceKind.BOARD
      ? [settings.boardButtonsFrom, settings.boardButtonsTo]
      : [settings.gymButtonsFrom, settings.gymButtonsTo];
  const i = all.indexOf(from);
  const j = all.indexOf(to);
  return i >= 0 && j >= i ? [from, to] : defaultRange(kind, system);
}

/** The grades on the logging buttons, easiest first. */
export function buttons(settings: Settings, kind: PlaceKind): string[] {
  const all = scale(systemOf(settings));
  const [from, to] = buttonRange(settings, kind);
  return all.slice(all.indexOf(from), all.indexOf(to) + 1);
}
