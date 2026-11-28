/**
 * @fileoverview Bouldering grades: Font (6A, 6B+…) and V (V3, V4…), their
 * order, the conversion between them, and the range of logging buttons.
 */

import {create} from '@bufbuild/protobuf';
import {CLIMB_BUTTONS_FONT, CLIMB_BUTTONS_V} from '../../config';
import * as pb from '../../gen/climb/climb_pb';
import type {Grade, Settings} from './data';

/** A grade scale: the case of a Grade's oneof. */
export type GradeSystem = 'font' | 'v';
export const GradeSystem = {FONT: 'font', V: 'v'} as const;

/** An enum's grades, by number, as labels: "FONT_GRADE_6A_PLUS" is "6A+". */
function labels(
  values: readonly {name: string; number: number}[],
  prefix: string,
  shown: string,
): readonly string[] {
  return values
    .filter(v => v.number > 0)
    .sort((a, b) => a.number - b.number)
    .map(v => shown + v.name.slice(prefix.length).replace('_PLUS', '+'));
}

/** Font grades, easiest first (FontGrade from 1, in climb.proto). */
export const FONT = labels(pb.FontGradeSchema.values, 'FONT_GRADE_', '');

/** V grades, easiest first (VGrade from 1): VB, V0… */
export const V = labels(pb.VGradeSchema.values, 'V_GRADE_', 'V');

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

/** The grades of `system`, easiest first. */
export function scale(system: GradeSystem): readonly string[] {
  return system === 'v' ? V : FONT;
}

/** A grade as stored, from its scale and label ("6B+"). */
export function gradeOf(system: GradeSystem, label: string): Grade {
  const value = scale(system).indexOf(label) + 1;
  return create(pb.GradeSchema, {
    scale:
      system === 'v'
        ? {case: 'v', value: value as pb.VGrade}
        : {case: 'font', value: value as pb.FontGrade},
  });
}

/** A grade's scale; Font if unset. */
export function systemOfGrade(grade: Grade | undefined): GradeSystem {
  return grade?.scale.case === 'v' ? 'v' : 'font';
}

/** A grade's label ("6B+"); '' if unset or unknown. */
export function labelOf(grade: Grade | undefined): string {
  if (!grade?.scale.case) return '';
  return scale(grade.scale.case)[grade.scale.value - 1] ?? '';
}

/** `label` (of `from`) in `to`: itself, or the nearest by the table. */
export function convert(
  label: string,
  from: GradeSystem,
  to: GradeSystem,
): string {
  if (from === to) return label;
  if (to === 'v') return FONT_TO_V[label] ?? label;
  // V to Font: the easiest Font grade with that V grade.
  return FONT.find(f => FONT_TO_V[f] === label) ?? label;
}

/** Where `grade` sits on `system`'s scale (converted if it's in the other); -1 if unknown. */
export function rankOf(grade: Grade | undefined, system: GradeSystem): number {
  const label = labelOf(grade);
  if (!label) return -1;
  return scale(system).indexOf(convert(label, systemOfGrade(grade), system));
}

/** The scale the settings use: the button range's, Font by default. */
export function systemOf(settings: Settings): GradeSystem {
  return systemOfGrade(settings.buttonsFrom);
}

/**
 * The range of grade buttons, from and to, as labels: the settings' if both
 * are grades of one scale in order, else the default.
 */
export function buttonRange(settings: Settings): readonly [string, string] {
  const system = systemOf(settings);
  const all = scale(system);
  const from = labelOf(settings.buttonsFrom);
  const to = labelOf(settings.buttonsTo);
  const i = all.indexOf(from);
  const j = all.indexOf(to);
  if (i >= 0 && j >= i && systemOfGrade(settings.buttonsTo) === system)
    return [from, to];
  return system === 'v' ? CLIMB_BUTTONS_V : CLIMB_BUTTONS_FONT;
}

/** The default button range of a scale, as stored. */
export function defaultRange(system: GradeSystem): [Grade, Grade] {
  const [from, to] = system === 'v' ? CLIMB_BUTTONS_V : CLIMB_BUTTONS_FONT;
  return [gradeOf(system, from), gradeOf(system, to)];
}

/** The grades on the logging buttons, easiest first. */
export function buttons(settings: Settings): string[] {
  const all = scale(systemOf(settings));
  const [from, to] = buttonRange(settings);
  return all.slice(all.indexOf(from), all.indexOf(to) + 1);
}
