import {beforeEach, describe, expect, it, vi} from 'vitest';
import {importClasses} from './actions';
import {ItemKind, emptyData} from './model/types';
import {useStore} from './store';
import {clearHistory, undoLast, useToasts} from './toast';
import type {ClassMeeting, Proposal} from './usos/usos';

const meeting = (key: string, date: string): ClassMeeting => ({
  key,
  type: 'WYK',
  course: 'Analiza',
  date,
  start: '10:15',
  end: '12:00',
});

describe('importClasses', () => {
  let projectId: string;
  beforeEach(() => {
    vi.stubGlobal('window', {setTimeout: () => 0});
    useStore.getState().replaceAll(emptyData());
    useToasts.setState({toasts: []});
    clearHistory();
    const area = useStore.getState().addArea('University');
    projectId = useStore.getState().addProject(area, 'Analiza');
  });

  const shown: Proposal[] = [
    {projectId: '', meeting: meeting('a', '2026-10-14')},
    {projectId: '', meeting: meeting('b', '2026-10-21')},
  ];

  it('adds the chosen classes as tasks and remembers every class shown', () => {
    const all = shown.map(p => ({...p, projectId}));
    importClasses([all[1]], all);
    const {items, settings} = useStore.getState().data;
    expect(items).toMatchObject([
      {
        projectId,
        kind: ItemKind.CLASS,
        title: 'WYK · Wed 21 Oct, 10:15',
        heldOn: '2026-10-21',
        source: {source: {case: 'usosMeeting', value: 'b'}},
      },
    ]);
    expect(settings.usos.handled).toEqual(['a', 'b']);
    expect(useToasts.getState().toasts[0].message).toBe(
      'Imported 1 class from USOS',
    );
  });

  it('is one undo step', () => {
    const all = shown.map(p => ({...p, projectId}));
    importClasses(all, all);
    expect(useStore.getState().data.items).toHaveLength(2);
    undoLast();
    expect(useStore.getState().data.items).toHaveLength(0);
    expect(useStore.getState().data.settings.usos.handled).toEqual([]);
  });

  it('skipping everything only remembers the classes', () => {
    const all = shown.map(p => ({...p, projectId}));
    importClasses([], all);
    expect(useStore.getState().data.items).toHaveLength(0);
    expect(useStore.getState().data.settings.usos.handled).toEqual(['a', 'b']);
    expect(useToasts.getState().toasts[0].message).toBe('Skipped 2 classes');
  });
});
