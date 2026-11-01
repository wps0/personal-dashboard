import {USOS_TIMETABLE_FRESH_MS} from '../config';
import {useEffect} from 'react';
import {create} from 'zustand';
import type {UsosSource} from '../model/types';
import {useStore} from '../store';
import {fetchMeetings} from './fetch';
import type {ClassMeeting} from './usos';

interface Timetable {
  state: 'idle' | 'loading' | 'ready' | 'error';
  meetings: ClassMeeting[];
  warnings: string[];
  error?: string;
  /** Which source the data is from (JSON of the source). */
  source?: string;
  fetchedAt: number;
}

/** The USOS timetable, fetched on demand and shared by every view that needs it. */
export const useTimetable = create<Timetable>(() => ({
  state: 'idle',
  meetings: [],
  warnings: [],
  fetchedAt: 0,
}));

/** Fetches the timetable unless a fresh copy from the same source is already here (or on its way). */
export async function loadTimetable(force = false): Promise<void> {
  const src: UsosSource = useStore.getState().data.settings.usos.source;
  if (!src.case) return;
  const key = JSON.stringify(src);
  const t = useTimetable.getState();
  const fresh =
    t.source === key &&
    (t.state === 'loading' ||
      (t.state === 'ready' &&
        Date.now() - t.fetchedAt < USOS_TIMETABLE_FRESH_MS));
  if (fresh && !force) return;
  useTimetable.setState({state: 'loading', source: key, error: undefined});
  try {
    const {meetings, warnings} = await fetchMeetings(src);
    if (useTimetable.getState().source !== key) return; // source changed meanwhile
    useTimetable.setState({
      state: 'ready',
      meetings,
      warnings,
      fetchedAt: Date.now(),
    });
  } catch (e) {
    if (useTimetable.getState().source !== key) return;
    useTimetable.setState({
      state: 'error',
      meetings: [],
      error: (e as Error).message,
    });
  }
}

/** The timetable for the configured source, loading it if needed. */
export function useTimetableLoaded(): Timetable {
  const source = useStore(s => s.data.settings.usos.source);
  const t = useTimetable();
  useEffect(() => {
    if (source.case) void loadTimetable();
  }, [source]);
  return t;
}
