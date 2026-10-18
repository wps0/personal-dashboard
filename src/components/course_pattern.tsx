import {GraduationCap} from 'lucide-react';
import {useMemo} from 'react';
import type {Project} from '../model/types';
import {useStore} from '../store';
import {coursesIn} from '../usos/fetch';
import {useTimetableLoaded} from '../usos/timetable';
import {coursePattern} from '../usos/usos';
import {BufferedInput} from './buffered';

/**
 * A project's USOS course pattern: text the course title contains (never the
 * class type), with the timetable courses it matches shown live.
 */
export function CoursePattern({project}: {project: Project}) {
  const hasSource = useStore(s => !!s.data.settings.usos.source.case);
  if (!hasSource && !project.coursePattern) return null;
  return <PatternField project={project} />;
}

function PatternField({project}: {project: Project}) {
  const timetable = useTimetableLoaded();
  const pattern = project.coursePattern ?? '';
  const matches = useMemo(() => {
    if (!pattern.trim()) return null;
    const re = coursePattern(pattern);
    return coursesIn(timetable.meetings).filter(c => re.test(c.course));
  }, [pattern, timetable.meetings]);

  return (
    <div className="space-y-1 text-[12px]">
      <label className="flex items-center gap-2">
        <GraduationCap size={15} className="shrink-0 text-dim" />
        <span className="shrink-0 text-dim">USOS course</span>
        <BufferedInput
          value={pattern}
          placeholder="part of the course title, e.g. systemów operacyjnych"
          onCommit={v =>
            useStore
              .getState()
              .updateProject(project.id, {coursePattern: v.trim() || undefined})
          }
          className="field h-7 min-w-0 flex-1 font-mono"
          spellCheck={false}
          aria-label="USOS course pattern"
          title="Text the course title contains, case-insensitive (not WYK / LAB / CW…)"
        />
      </label>
      <p className="pl-[1.4rem] text-dim" aria-live="polite">
        {!matches ? (
          'Classes of the matching course become tasks here after you review them.'
        ) : timetable.state === 'loading' ? (
          'Loading the timetable…'
        ) : timetable.state === 'error' ? (
          <span className="text-danger">{timetable.error}</span>
        ) : matches.length ? (
          <>
            Matches{' '}
            {matches.map((c, i) => (
              <span key={c.course}>
                {i > 0 && ', '}
                <span className="text-fg">{c.course}</span> (
                {c.types.join(', ')})
              </span>
            ))}
          </>
        ) : (
          <span className="text-warn">
            Matches no course in your timetable.
          </span>
        )}
      </p>
    </div>
  );
}
