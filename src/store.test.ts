import {beforeEach, describe, expect, it} from 'vitest';
import {emptyData, Weekday} from './model/types';
import {useStore} from './store';

describe('USOS settings in the store', () => {
  beforeEach(() => useStore.getState().replaceAll(emptyData()));
  const usos = () => useStore.getState().data.settings.usos;

  it('sets and clears the source', () => {
    const source = {case: 'googleCalendarId', value: 'usos@x'} as const;
    useStore.getState().setUsosSource(source);
    expect(usos().source).toEqual(source);
    useStore.getState().setUsosSource({case: undefined});
    expect(usos().source.case).toBeUndefined();
  });

  it('remembers handled class meetings once each', () => {
    useStore.getState().markUsosHandled(['a', 'b']);
    useStore.getState().markUsosHandled(['b', 'c']);
    expect(usos().handled).toEqual(['a', 'b', 'c']);
  });
});

describe('week start in the store', () => {
  beforeEach(() => useStore.getState().replaceAll(emptyData()));

  it('starts unset (Sunday) and can be changed', () => {
    const weekStart = () => useStore.getState().data.settings.weekStart;
    expect(weekStart()).toBe(Weekday.UNSPECIFIED);
    useStore.getState().setWeekStart(Weekday.MONDAY);
    expect(weekStart()).toBe(Weekday.MONDAY);
  });
});
