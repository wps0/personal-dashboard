/**
 * Sample data for the climbing log's prototype screens (nothing is stored).
 * Today is Saturday 21 November 2026.
 */

/** The Font grades on the logging buttons (a setting), easiest first. */
export const GRADES = [
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
];

/** The board's buttons: board grades run harder, so the range starts higher. */
export const BOARD_GRADES = [
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
];

/** The tries choices: 6+ opens a number. */
export const TRIES = ['Flash', '2', '3', '4', '5', '6+'];

/** Blokownia's colour labels: optional, only to tell problems apart. */
export const COLOURS: {name: string; hex: string}[] = [
  {name: 'Green', hex: '#22c55e'},
  {name: 'Yellow', hex: '#facc15'},
  {name: 'Blue', hex: '#3b82f6'},
  {name: 'Red', hex: '#ef4444'},
  {name: 'Purple', hex: '#a855f7'},
  {name: 'Black', hex: '#0a0a0a'},
];

export const colourHex = (name: string) =>
  COLOURS.find(c => c.name === name)!.hex;

export interface LoggedClimb {
  time: string;
  grade: string;
  /** Tries to top it; 1 is a flash. */
  tries: number;
  colour?: string;
  name?: string;
}

/** Tonight at Blokownia so far, latest first. */
export const LIVE: LoggedClimb[] = [
  {time: '19:52', grade: '6B+', tries: 3},
  {time: '19:44', grade: '6A+', tries: 1},
  {time: '19:38', grade: '6B', tries: 2, colour: 'Blue'},
  {time: '19:31', grade: '6B+', tries: 4},
  {time: '19:20', grade: '6A+', tries: 1},
  {time: '19:12', grade: '6A', tries: 1},
  {time: '19:05', grade: '6A+', tries: 2},
  {time: '18:58', grade: '5+', tries: 1},
  {time: '18:51', grade: '5', tries: 1},
];

/** A board session, latest first. */
export const BOARD_LIVE: LoggedClimb[] = [
  {time: '11:41', grade: '6B', tries: 4},
  {time: '11:33', grade: '6A+', tries: 2, name: 'Crimp city'},
  {time: '11:24', grade: '6A+', tries: 1},
  {time: '11:15', grade: '6A', tries: 1},
  {time: '11:09', grade: '5+', tries: 1},
];

/**
 * Climbs per grade tonight (13 by the end), hardest first, against an
 * average session over the last 30 days: at all gyms, or only at this one.
 */
export const SESSION_BY_GRADE = [
  {grade: '6C', tonight: 1, all: 0.1, here: 0.2},
  {grade: '6B+', tonight: 2, all: 1.0, here: 1.2},
  {grade: '6B', tonight: 3, all: 1.9, here: 2.2},
  {grade: '6A+', tonight: 3, all: 2.6, here: 2.8},
  {grade: '6A', tonight: 2, all: 2.4, here: 2.2},
  {grade: '5+', tonight: 1, all: 1.8, here: 1.6},
  {grade: '5 and below', tonight: 1, all: 1.6, here: 1.2},
];

/** Climbs by grade in the chosen period (and the one before it), hardest first. */
export const PYRAMID = [
  {grade: '6C', now: 2, before: 0},
  {grade: '6B+', now: 9, before: 5},
  {grade: '6B', now: 18, before: 12},
  {grade: '6A+', now: 31, before: 24},
  {grade: '6A', now: 44, before: 38},
  {grade: '5+', now: 38, before: 31},
  {grade: '5 and below', now: 26, before: 21},
];

/** Average tries to top, by grade, in the period and the one before (fewer is better). */
export const TRIES_BY_GRADE: {
  grade: string;
  now: number;
  /** null: none climbed then. */
  before: number | null;
}[] = [
  {grade: '6C', now: 4.5, before: null},
  {grade: '6B+', now: 3.4, before: 4.6},
  {grade: '6B', now: 2.6, before: 3.1},
  {grade: '6A+', now: 1.9, before: 2.3},
  {grade: '6A', now: 1.5, before: 1.7},
  {grade: '5+', now: 1.2, before: 1.3},
  {grade: '5 and below', now: 1.0, before: 1.1},
];

/** The grade groups the weekly columns stack, easiest first. */
export const GROUPS = ['≤5', '5+', '6A', '6A+', '6B', '6B+ ↑'];

/** Climbs per week by grade group (the order of GROUPS), the last 13 weeks. */
export const WEEKS: {week: string; counts: number[]}[] = [
  {week: '24 Aug', counts: [3, 3, 3, 1, 0, 0]},
  {week: '31 Aug', counts: [2, 4, 3, 2, 1, 0]},
  {week: '7 Sep', counts: [3, 3, 4, 2, 1, 0]},
  {week: '14 Sep', counts: [0, 0, 0, 0, 0, 0]},
  {week: '21 Sep', counts: [2, 3, 4, 3, 1, 0]},
  {week: '28 Sep', counts: [2, 3, 3, 3, 2, 1]},
  {week: '5 Oct', counts: [1, 3, 4, 3, 2, 1]},
  {week: '12 Oct', counts: [2, 2, 3, 4, 2, 1]},
  {week: '19 Oct', counts: [1, 3, 4, 3, 2, 1]},
  {week: '26 Oct', counts: [2, 2, 4, 3, 3, 1]},
  {week: '2 Nov', counts: [1, 3, 3, 3, 2, 2]},
  {week: '9 Nov', counts: [2, 3, 3, 2, 1, 1]},
  {week: '16 Nov', counts: [1, 2, 4, 3, 2, 2]},
];

/** The grade scale the trend chart uses, easiest first. */
export const SCALE = ['5', '5+', '6A', '6A+', '6B', '6B+', '6C'];

/** Per week: the typical (median) grade sent, and the average of the 5 hardest. */
export const TREND: {
  week: string;
  median: number | null;
  top5: number | null;
}[] = [
  {week: '24 Aug', median: 1.6, top5: 2.6},
  {week: '31 Aug', median: 1.8, top5: 3.0},
  {week: '7 Sep', median: 1.9, top5: 3.2},
  {week: '14 Sep', median: null, top5: null},
  {week: '21 Sep', median: 2.0, top5: 3.4},
  {week: '28 Sep', median: 2.1, top5: 3.8},
  {week: '5 Oct', median: 2.2, top5: 3.8},
  {week: '12 Oct', median: 2.3, top5: 4.0},
  {week: '19 Oct', median: 2.2, top5: 4.0},
  {week: '26 Oct', median: 2.4, top5: 4.2},
  {week: '2 Nov', median: 2.4, top5: 4.4},
  {week: '9 Nov', median: 2.3, top5: 4.0},
  {week: '16 Nov', median: 2.4, top5: 4.6},
];

export interface PastSession {
  date: string;
  place: string;
  board?: string;
  length: string;
  climbs: number;
  flashed: number;
  hardest: string;
}

export const HISTORY: PastSession[] = [
  {
    date: 'Sat 21 Nov',
    place: 'Blokownia',
    length: '1h 33m',
    climbs: 13,
    flashed: 6,
    hardest: '6C',
  },
  {
    date: 'Tue 18 Nov',
    place: 'Blokownia',
    length: '1h 52m',
    climbs: 15,
    flashed: 7,
    hardest: '6B+',
  },
  {
    date: 'Sun 16 Nov',
    place: 'Kilter',
    board: '40°',
    length: '1h 05m',
    climbs: 9,
    flashed: 2,
    hardest: '6B',
  },
  {
    date: 'Fri 14 Nov',
    place: 'West Bouldering',
    length: '1h 30m',
    climbs: 12,
    flashed: 5,
    hardest: '6B+',
  },
  {
    date: 'Wed 12 Nov',
    place: 'Blokownia',
    length: '2h 05m',
    climbs: 17,
    flashed: 8,
    hardest: '6B+',
  },
  {
    date: 'Tue 4 Nov',
    place: 'Blokownia',
    length: '1h 45m',
    climbs: 14,
    flashed: 6,
    hardest: '6B+',
  },
];
