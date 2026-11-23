import {describe, expect, it} from 'vitest';
import {emptyData, PlaceKind} from './model/data';
import {addPlace, updatePlace} from './model/places';
import {change, replaceAll, undo, useClimb} from './store';

describe('the log’s store', () => {
  it('undoes changes with a message, newest first, and keeps quiet ones out of it', () => {
    replaceAll(emptyData());
    change(d => addPlace(d, PlaceKind.GYM, 'A')[0], 'Added A');
    const id = useClimb.getState().data.places[0].id;
    change(d => updatePlace(d, id, {name: 'B'}));
    expect(useClimb.getState().bar?.message).toBe('Added A');
    change(d => addPlace(d, PlaceKind.GYM, 'C')[0], 'Added C');
    undo();
    expect(useClimb.getState().data.places.map(p => p.name)).toEqual(['B']);
    undo();
    expect(useClimb.getState().data.places).toEqual([]);
    undo();
    expect(useClimb.getState().data.places).toEqual([]);
  });

  it('ignores a change that changes nothing', () => {
    replaceAll(emptyData());
    change(d => d, 'Nothing');
    expect(useClimb.getState().history).toEqual([]);
  });
});
