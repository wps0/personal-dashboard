/** `HH:MM` → minutes since midnight. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Minutes since midnight → `HH:MM` (clamped to the day). */
export function fromMinutes(min: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * A time of day as typed: "9", "930", "09:30", "9.30", "21:05", "9:30pm",
 * "12am". `HH:MM`, or null if it isn't a time of day.
 */
export function parseTime(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '');
  const m = /^(\d{1,2})(?:[:.h]?(\d{2}))?([ap])?\.?m?\.?$/.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3] === 'p' ? 12 : 0);
  }
  if (h > 23 || min > 59) return null;
  return fromMinutes(h * 60 + min);
}

/**
 * A time range with its start moved to `start`, keeping its length (at least
 * 15 min) as far as the day allows, like Google Calendar. An end of 23:59
 * means midnight.
 */
export function moveStart(
  range: {start: string; end: string},
  start: string,
): {start: string; end: string} {
  const end = range.end === '23:59' ? 24 * 60 : toMinutes(range.end);
  const len = Math.max(15, end - toMinutes(range.start));
  return {start, end: fromMinutes(toMinutes(start) + len)};
}

/**
 * Like `moveStart`, for a range that may end after midnight (reserved time):
 * keeps its length, ending the next day if it has to.
 */
export function moveStartOvernight(
  range: {start: string; end: string},
  start: string,
): {start: string; end: string} {
  const day = 24 * 60;
  const len = (toMinutes(range.end) - toMinutes(range.start) + day) % day || 15;
  return {start, end: fromMinutes((toMinutes(start) + len) % day)};
}

export function snap(min: number, step = 15): number {
  return Math.round(min / step) * step;
}

/** The 15-minute slots covered by a selection from minute `a` to `b`, as [start, end). Always at least one slot. */
export function slotRange(a: number, b: number): [number, number] {
  const first = Math.floor(Math.min(a, b) / 15);
  const last = Math.min(Math.floor(Math.max(a, b) / 15), (24 * 60) / 15 - 1);
  return [first * 15, (last + 1) * 15];
}

interface Span {
  id: string;
  start: number;
  end: number;
}

/**
 * Side-by-side layout for overlapping blocks in one day column: each block gets
 * a lane, and every block in an overlapping cluster shares the cluster's lane count.
 */
export function layoutSpans(
  spans: Span[],
): Map<string, {lane: number; lanes: number}> {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const out = new Map<string, {lane: number; lanes: number}>();
  let cluster: {id: string; lane: number}[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  const closeCluster = () => {
    for (const c of cluster)
      out.set(c.id, {lane: c.lane, lanes: laneEnds.length});
    cluster = [];
    laneEnds = [];
  };

  for (const s of sorted) {
    if (s.start >= clusterEnd) closeCluster();
    let lane = laneEnds.findIndex(end => end <= s.start);
    if (lane === -1) lane = laneEnds.push(s.end) - 1;
    else laneEnds[lane] = s.end;
    cluster.push({id: s.id, lane});
    clusterEnd = Math.max(clusterEnd, s.end);
  }
  closeCluster();
  return out;
}
