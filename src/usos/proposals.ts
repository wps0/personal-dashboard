import {useMemo} from 'react';
import {useStore} from '../store';
import {useTimetableLoaded} from './timetable';
import {proposeImports, type Proposal} from './usos';

/**
 * New USOS classes to review: timetable meetings matched to projects by their
 * course patterns, minus those already imported or skipped. Optionally for one
 * project only.
 */
export function useUsosProposals(projectId?: string): Proposal[] {
  const {meetings} = useTimetableLoaded();
  const projects = useStore(s => s.data.projects);
  const items = useStore(s => s.data.items);
  const handled = useStore(s => s.data.settings.usos.handled);
  return useMemo(() => {
    const rules = projects
      .filter(p => !p.archived && p.coursePattern)
      .map(p => ({projectId: p.id, pattern: p.coursePattern!}));
    if (!rules.length || !meetings.length) return [];
    const done = new Set(handled);
    for (const i of items)
      if (i.source?.kind === 'usos') done.add(i.source.key);
    const all = proposeImports(meetings, rules, done);
    return projectId ? all.filter(p => p.projectId === projectId) : all;
  }, [meetings, projects, items, handled, projectId]);
}
