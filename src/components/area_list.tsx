import {
  DndContext,
  DragOverlay,
  pointerWithin,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import {GripVertical} from 'lucide-react';
import {useState} from 'react';
import {createPortal} from 'react-dom';
import {moveArea} from '../actions';
import {ghostUnderPointer, suppressClicks, useDragSensors} from '../dnd';
import {AREA_COLORS, type Area, type Project} from '../model/types';
import {useStore} from '../store';
import {InlineText} from './inline_text';

/**
 * The areas in their order, which the rest of the app lists them in. Drag
 * one by its grip to reorder (a line shows where it lands).
 */
export function AreaList({
  areas,
  projects,
}: {
  areas: Area[];
  projects: Project[];
}) {
  const sensors = useDragSensors();
  const [drag, setDrag] = useState<{from: number; to?: number} | null>(null);
  const dragged = drag && areas[drag.from];
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={e => setDrag({from: e.active.data.current?.index})}
      onDragOver={e =>
        setDrag(d => d && {...d, to: e.over?.data.current?.index})
      }
      onDragEnd={e => {
        setDrag(null);
        suppressClicks();
        const to = e.over?.data.current?.index;
        if (drag && to !== undefined && to !== drag.from)
          moveArea(areas[drag.from].id, to);
      }}
      onDragCancel={() => setDrag(null)}
    >
      <ul className="space-y-1">
        {areas.map((a, i) => (
          <AreaRow
            key={a.id}
            area={a}
            index={i}
            projects={projects.filter(p => p.areaId === a.id).length}
            lifted={drag?.from === i}
            lands={
              drag && drag.to === i && drag.to !== drag.from
                ? drag.from < i
                  ? 'after'
                  : 'before'
                : null
            }
          />
        ))}
      </ul>
      {/* In the body, so no transformed parent offsets the ghost. */}
      {createPortal(
        <DragOverlay dropAnimation={null} modifiers={[ghostUnderPointer]}>
          {dragged && (
            <div className="flex w-max items-center gap-1.5 rounded-md border border-line bg-panel px-2 py-1 text-[12px] font-medium text-strong shadow-lg">
              <GripVertical size={13} className="text-dim" />
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{background: dragged.color}}
              />
              {dragged.name}
            </div>
          )}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

function AreaRow({
  area,
  index,
  projects,
  lifted,
  lands,
}: {
  area: Area;
  index: number;
  projects: number;
  lifted: boolean;
  lands: 'before' | 'after' | null;
}) {
  const {updateArea, deleteArea} = useStore.getState();
  const {setNodeRef: dropRef} = useDroppable({id: area.id, data: {index}});
  const {setNodeRef: dragRef, listeners} = useDraggable({
    id: area.id,
    data: {index},
  });
  const line =
    lands === 'before'
      ? 'shadow-[0_-2px_0_var(--color-accent)]'
      : lands === 'after'
        ? 'shadow-[0_2px_0_var(--color-accent)]'
        : '';
  return (
    <li
      ref={dropRef}
      aria-label={area.name}
      className={`group flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-line bg-panel px-1 py-1 ${line} ${lifted ? 'opacity-50' : ''}`}
    >
      {/* Dragged with the mouse or a finger. */}
      <span
        ref={dragRef}
        {...listeners}
        aria-hidden
        title="Drag to reorder"
        className="flex h-6 w-4 shrink-0 cursor-grab touch-none items-center justify-center text-dim active:cursor-grabbing"
      >
        <GripVertical size={13} />
      </span>
      {/* On phones the colours go on a line of their own, under the name. */}
      <div className="order-last flex basis-full gap-0.5 pl-6 sm:order-none sm:basis-auto sm:pl-0">
        {AREA_COLORS.map(c => (
          <button
            key={c}
            aria-label={`Color ${c}`}
            onClick={() => updateArea(area.id, {color: c})}
            className={`h-3.5 w-3.5 rounded-full ${area.color === c ? 'ring-2 ring-fg' : 'opacity-50 hover:opacity-100'}`}
            style={{background: c}}
          />
        ))}
      </div>
      <InlineText
        value={area.name}
        onChange={name => updateArea(area.id, {name})}
        className="min-w-0 flex-1"
      />
      <span className="tabular-nums text-[11px] text-dim">
        {projects} {projects === 1 ? 'project' : 'projects'}
      </span>
      <button
        className="btn-ghost hover:text-danger"
        onClick={() => {
          if (
            projects === 0 ||
            confirm(`Delete "${area.name}" and its ${projects} project(s)?`)
          )
            deleteArea(area.id);
        }}
      >
        ×
      </button>
    </li>
  );
}
