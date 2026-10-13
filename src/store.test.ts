import {beforeEach, describe, expect, it} from 'vitest';
import {emptyData} from './model/types';
import {useStore} from './store';

describe('USOS settings in the store', () => {
  beforeEach(() => useStore.getState().replaceAll(emptyData()));
  const usos = () => useStore.getState().data.settings.usos;

  it('sets and clears the source', () => {
    useStore.getState().setUsosSource({kind: 'google', calendarId: 'usos@x'});
    expect(usos().source).toEqual({kind: 'google', calendarId: 'usos@x'});
    useStore.getState().setUsosSource(undefined);
    expect(usos().source).toBeUndefined();
  });

  it('remembers handled class meetings once each', () => {
    useStore.getState().markUsosHandled(['a', 'b']);
    useStore.getState().markUsosHandled(['b', 'c']);
    expect(usos().handled).toEqual(['a', 'b', 'c']);
  });
});
