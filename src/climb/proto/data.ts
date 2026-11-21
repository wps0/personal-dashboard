/**
 * Sample data for the climbing log's prototype screens (nothing is stored).
 * Today is Saturday 21 November 2026.
 */

export interface Circuit {
  name: string;
  hex: string;
  /** The Font grades this colour covers at the gym. */
  range: string;
  grades: string[];
}

/** Blokownia's colours, easiest first: each gym has its own. */
export const CIRCUITS: Circuit[] = [
  {name: 'Green', hex: '#22c55e', range: '4–5', grades: ['4', '4+', '5']},
  {name: 'Yellow', hex: '#facc15', range: '5+–6A', grades: ['5+', '6A']},
  {name: 'Blue', hex: '#3b82f6', range: '6A+–6B', grades: ['6A+', '6B']},
  {name: 'Red', hex: '#ef4444', range: '6B+–6C', grades: ['6B+', '6C']},
  {name: 'Purple', hex: '#a855f7', range: '6C+–7A', grades: ['6C+', '7A']},
  {name: 'Black', hex: '#0a0a0a', range: '7A+ up', grades: ['7A+', '7B']},
];

export const circuit = (name: string) => CIRCUITS.find(c => c.name === name)!;

/** Tonight's climbs at Blokownia, latest first: topped, by colour. */
export const LIVE: {time: string; colour: string; grade?: string}[] = [
  {time: '19:52', colour: 'Red', grade: '6B+'},
  {time: '19:44', colour: 'Blue'},
  {time: '19:38', colour: 'Blue', grade: '6B'},
  {time: '19:31', colour: 'Red'},
  {time: '19:20', colour: 'Blue'},
  {time: '19:12', colour: 'Yellow'},
  {time: '19:05', colour: 'Blue'},
  {time: '18:58', colour: 'Yellow', grade: '6A'},
];

/** Climbs per colour tonight, and an average session at this gym over the past 30 days. */
export const SESSION_VS_MONTH = [
  {colour: 'Green', today: 2, month: 3.2},
  {colour: 'Yellow', today: 4, month: 4.5},
  {colour: 'Blue', today: 5, month: 3.0},
  {colour: 'Red', today: 2, month: 1.1},
  {colour: 'Purple', today: 0, month: 0.3},
  {colour: 'Black', today: 0, month: 0},
];

/** Font grades on the board, easiest first. */
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

/** Tonight on the Kilter, 40°: climbs by grade, latest first. */
export const BOARD_LIVE = [
  {time: '20:41', grade: '6B'},
  {time: '20:33', grade: '6A+'},
  {time: '20:24', grade: '6A+'},
  {time: '20:15', grade: '6A'},
  {time: '20:09', grade: '5+'},
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
  hardest: string;
  colour?: string;
}

export const HISTORY: PastSession[] = [
  {
    date: 'Tue 18 Nov',
    place: 'Blokownia',
    length: '1h 52m',
    climbs: 15,
    hardest: '6C',
    colour: 'Red',
  },
  {
    date: 'Sun 16 Nov',
    place: 'Kilter',
    board: '40°',
    length: '1h 05m',
    climbs: 9,
    hardest: '6B',
  },
  {
    date: 'Fri 14 Nov',
    place: 'Blokownia',
    length: '1h 30m',
    climbs: 12,
    hardest: '6B+',
    colour: 'Red',
  },
  {
    date: 'Wed 12 Nov',
    place: 'Blokownia',
    length: '2h 05m',
    climbs: 17,
    hardest: '6B+',
    colour: 'Red',
  },
  {
    date: 'Tue 4 Nov',
    place: 'Blokownia',
    length: '1h 45m',
    climbs: 14,
    hardest: '6C',
    colour: 'Red',
  },
];
