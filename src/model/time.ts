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

export function snap(min: number, step = 15): number {
  return Math.round(min / step) * step;
}

export interface Span {
  id: string;
  start: number;
  end: number;
}

/**
 * Side-by-side layout for overlapping blocks in one day column: each block gets
 * a lane, and every block in an overlapping cluster shares the cluster's lane count.
 */
export function layoutSpans(spans: Span[]): Map<string, { lane: number; lanes: number }> {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const out = new Map<string, { lane: number; lanes: number }>();
  let cluster: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  const closeCluster = () => {
    for (const c of cluster) out.set(c.id, { lane: c.lane, lanes: laneEnds.length });
    cluster = [];
    laneEnds = [];
  };

  for (const s of sorted) {
    if (s.start >= clusterEnd) closeCluster();
    let lane = laneEnds.findIndex((end) => end <= s.start);
    if (lane === -1) lane = laneEnds.push(s.end) - 1;
    else laneEnds[lane] = s.end;
    cluster.push({ id: s.id, lane });
    clusterEnd = Math.max(clusterEnd, s.end);
  }
  closeCluster();
  return out;
}
