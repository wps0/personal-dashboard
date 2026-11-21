/**
 * Sample data for the climbing app's prototype screens (nothing is stored).
 * Today is Saturday 21 November 2026.
 */

export interface Circuit {
  name: string;
  hex: string;
  /** The Font grades this colour covers at the gym. */
  range: string;
  grades: string[];
}

/** Blokownia's colour circuits, easiest first. */
export const CIRCUITS: Circuit[] = [
  {name: 'Green', hex: '#22c55e', range: '4–5', grades: ['4', '4+', '5']},
  {name: 'Yellow', hex: '#facc15', range: '5+–6A', grades: ['5+', '6A']},
  {name: 'Blue', hex: '#3b82f6', range: '6A+–6B', grades: ['6A+', '6B']},
  {name: 'Red', hex: '#ef4444', range: '6B+–6C', grades: ['6B+', '6C']},
  {name: 'Purple', hex: '#a855f7', range: '6C+–7A', grades: ['6C+', '7A']},
  {name: 'Black', hex: '#0a0a0a', range: '7A+ up', grades: ['7A+', '7B']},
];

export const circuit = (name: string) => CIRCUITS.find(c => c.name === name)!;

export type Result = 'flash' | 'sent' | 'repeat' | 'tried';

export interface Logged {
  time: string;
  colour: string;
  grade?: string;
  wall: string;
  result: Result;
  tries: number;
}

/** Tonight's session at Blokownia, latest first. */
export const LIVE: Logged[] = [
  {
    time: '19:42',
    colour: 'Red',
    grade: '6B+',
    wall: 'Cave',
    result: 'sent',
    tries: 3,
  },
  {
    time: '19:31',
    colour: 'Blue',
    grade: '6A+',
    wall: 'Slab',
    result: 'flash',
    tries: 1,
  },
  {
    time: '19:24',
    colour: 'Purple',
    grade: '6C+',
    wall: 'Cave',
    result: 'tried',
    tries: 4,
  },
  {
    time: '19:10',
    colour: 'Blue',
    grade: '6B',
    wall: 'Comp wall',
    result: 'sent',
    tries: 2,
  },
  {
    time: '19:02',
    colour: 'Yellow',
    grade: '6A',
    wall: 'Roof',
    result: 'flash',
    tries: 1,
  },
  {
    time: '18:55',
    colour: 'Yellow',
    grade: '5+',
    wall: 'Slab',
    result: 'repeat',
    tries: 1,
  },
];

export interface Project {
  colour: string;
  grade: string;
  wall: string;
  name?: string;
  tries: number;
  sessions: number;
  last: string;
  sent?: string;
}

export const PROJECTS: Project[] = [
  {
    colour: 'Purple',
    grade: '6C+',
    wall: 'Cave',
    name: 'The crimpy one',
    tries: 9,
    sessions: 3,
    last: 'Tue',
  },
  {
    colour: 'Red',
    grade: '6C',
    wall: 'Roof',
    tries: 5,
    sessions: 2,
    last: 'Tue',
  },
  {
    colour: 'Red',
    grade: '6B+',
    wall: 'Slab',
    tries: 3,
    sessions: 1,
    last: 'Fri 14 Nov',
  },
  {
    colour: 'Black',
    grade: '7A+',
    wall: 'Comp wall',
    tries: 2,
    sessions: 1,
    last: 'Wed 12 Nov',
  },
];

export const SENT_PROJECTS: Project[] = [
  {
    colour: 'Red',
    grade: '6C',
    wall: 'Cave',
    tries: 11,
    sessions: 4,
    last: 'Tue',
    sent: 'Tue 18 Nov',
  },
  {
    colour: 'Blue',
    grade: '6B',
    wall: 'Roof',
    tries: 6,
    sessions: 2,
    last: 'Fri',
    sent: 'Fri 14 Nov',
  },
];

/** Sends in the last three months, by grade, hardest first. */
export const PYRAMID = [
  {grade: '6C', flash: 0, sent: 2},
  {grade: '6B+', flash: 1, sent: 5},
  {grade: '6B', flash: 3, sent: 6},
  {grade: '6A+', flash: 5, sent: 6},
  {grade: '6A', flash: 8, sent: 6},
  {grade: '5+', flash: 10, sent: 4},
];

/** The grade scale the charts use, easiest first. */
export const SCALE = ['5+', '6A', '6A+', '6B', '6B+', '6C', '6C+'];

/** Hardest send per week, the last 12 weeks (null: no session). */
export const WEEKLY: {week: string; hardest: string | null}[] = [
  {week: '31 Aug', hardest: '6A+'},
  {week: '7 Sep', hardest: '6B'},
  {week: '14 Sep', hardest: '6B'},
  {week: '21 Sep', hardest: null},
  {week: '28 Sep', hardest: '6B'},
  {week: '5 Oct', hardest: '6B+'},
  {week: '12 Oct', hardest: '6B'},
  {week: '19 Oct', hardest: '6B+'},
  {week: '26 Oct', hardest: '6B+'},
  {week: '2 Nov', hardest: '6C'},
  {week: '9 Nov', hardest: '6B+'},
  {week: '16 Nov', hardest: '6C'},
];

export interface PastSession {
  date: string;
  gym: string;
  length: string;
  climbs: number;
  sends: number;
  hardest: string;
  colour: string;
}

export const HISTORY: PastSession[] = [
  {
    date: 'Tue 18 Nov',
    gym: 'Blokownia',
    length: '1h 52m',
    climbs: 17,
    sends: 12,
    hardest: '6C',
    colour: 'Red',
  },
  {
    date: 'Fri 14 Nov',
    gym: 'Blokownia',
    length: '1h 30m',
    climbs: 14,
    sends: 9,
    hardest: '6B+',
    colour: 'Red',
  },
  {
    date: 'Wed 12 Nov',
    gym: 'Blokownia',
    length: '2h 05m',
    climbs: 19,
    sends: 13,
    hardest: '6B+',
    colour: 'Red',
  },
  {
    date: 'Sun 9 Nov',
    gym: 'Ściana Centrum',
    length: '2h 20m',
    climbs: 8,
    sends: 7,
    hardest: '6a+',
    colour: 'Blue',
  },
  {
    date: 'Tue 4 Nov',
    gym: 'Blokownia',
    length: '1h 45m',
    climbs: 16,
    sends: 11,
    hardest: '6C',
    colour: 'Red',
  },
];

/** A project's history: newest first. */
export const PROBLEM_HISTORY = [
  {
    date: 'Tue 18 Nov',
    tries: 4,
    result: 'Not yet',
    note: 'Got to the last move twice',
  },
  {date: 'Fri 14 Nov', tries: 3, result: 'Not yet', note: ''},
  {
    date: 'Wed 12 Nov',
    tries: 2,
    result: 'Not yet',
    note: 'First tried; start is the crux',
  },
];
