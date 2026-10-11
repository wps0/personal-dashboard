import {describe, expect, it} from 'vitest';
import {actionFor} from './shortcuts';

describe('actionFor', () => {
  it('maps Google Calendar keys', () => {
    expect(actionFor({key: 'j'})).toEqual({type: 'next'});
    expect(actionFor({key: 'n'})).toEqual({type: 'next'});
    expect(actionFor({key: 'k'})).toEqual({type: 'prev'});
    expect(actionFor({key: 't'})).toEqual({type: 'today'});
    expect(actionFor({key: 'g'})).toEqual({type: 'goto'});
    expect(actionFor({key: 'c'})).toEqual({type: 'create'});
    expect(actionFor({key: 'w'})).toEqual({type: 'view', view: 'week'});
    expect(actionFor({key: 'x'})).toEqual({type: 'view', view: '3day'});
    expect(actionFor({key: '?', shiftKey: true})).toEqual({type: 'help'});
  });

  it('maps numbers to pages and arrows to moves', () => {
    expect(actionFor({key: '1'})).toEqual({type: 'page', page: 'home'});
    expect(actionFor({key: '4'})).toEqual({type: 'page', page: 'projects'});
    expect(actionFor({key: '6'})).toBeNull();
    expect(actionFor({key: 'ArrowLeft'})).toEqual({type: 'move', dir: 'left'});
  });

  it('leaves browser combinations alone, except undo', () => {
    expect(actionFor({key: 'j', ctrlKey: true})).toBeNull();
    expect(actionFor({key: 't', metaKey: true})).toBeNull();
    expect(actionFor({key: 'z', ctrlKey: true})).toEqual({type: 'undo'});
    expect(actionFor({key: 'Z', metaKey: true})).toEqual({type: 'undo'});
    expect(actionFor({key: 'z', ctrlKey: true, shiftKey: true})).toBeNull(); // redo: not handled
    expect(actionFor({key: 'q'})).toBeNull();
  });
});
