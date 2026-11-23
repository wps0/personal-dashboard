import {create} from '@bufbuild/protobuf';
import {describe, expect, it} from 'vitest';
import * as pb from '../../gen/climb/climb_pb';
import {emptyData, GradeSystem, PlaceKind, settingsOf} from './data';
import {buttonRange, buttons, convert, FONT, V} from './grades';
import {
  addColour,
  addPlace,
  deletePlace,
  placesOf,
  removeColour,
  renameColour,
  updatePlace,
  updateSettings,
} from './places';

describe('grades', () => {
  it('converts by the table, both ways', () => {
    expect(convert('6B+', GradeSystem.FONT, GradeSystem.V)).toBe('V4');
    expect(convert('V4', GradeSystem.V, GradeSystem.FONT)).toBe('6B');
    expect(convert('6B+', GradeSystem.UNSPECIFIED, GradeSystem.FONT)).toBe(
      '6B+',
    );
    for (const f of FONT)
      expect(V).toContain(convert(f, GradeSystem.FONT, GradeSystem.V));
  });

  it('offers 4 to 7A+ at gyms and 5 to 7B+ on boards by default', () => {
    const s = settingsOf(emptyData());
    expect(buttons(s, PlaceKind.GYM)).toEqual([
      '4',
      '4+',
      '5',
      '5+',
      '6A',
      '6A+',
      '6B',
      '6B+',
      '6C',
      '6C+',
      '7A',
      '7A+',
    ]);
    expect(buttonRange(s, PlaceKind.BOARD)).toEqual(['5', '7B+']);
  });

  it('uses a set range, and the default when it doesn’t fit the scale', () => {
    const s = create(pb.SettingsSchema, {
      gymButtonsFrom: '5+',
      gymButtonsTo: '6B',
      boardButtonsFrom: '7A',
      boardButtonsTo: '6A',
    });
    expect(buttons(s, PlaceKind.GYM)).toEqual(['5+', '6A', '6A+', '6B']);
    expect(buttonRange(s, PlaceKind.BOARD)).toEqual(['5', '7B+']);
    const v = {...s, grades: GradeSystem.V};
    expect(buttonRange(v, PlaceKind.GYM)).toEqual(['V0', 'V8']);
  });
});

describe('places', () => {
  it('adds gyms and boards, a board with the usual angle', () => {
    const [a, gym] = addPlace(emptyData(), PlaceKind.GYM, ' Blokownia ');
    const [b, board] = addPlace(a, PlaceKind.BOARD, 'Kilter');
    expect(placesOf(b, PlaceKind.GYM).map(p => p.name)).toEqual(['Blokownia']);
    expect(placesOf(b, PlaceKind.BOARD)[0].usualAngle).toBe(40);
    const c = updatePlace(b, gym, {archived: true});
    expect(placesOf(c, PlaceKind.GYM)).toEqual([]);
    expect(placesOf(c, PlaceKind.GYM, true)[0].id).toBe(gym);
    expect(deletePlace(c, board).places).toHaveLength(1);
  });

  it('keeps a place with sessions: it can only be archived', () => {
    const [a, gym] = addPlace(emptyData(), PlaceKind.GYM, 'Blokownia');
    const b = {
      ...a,
      sessions: [create(pb.SessionSchema, {id: 's', placeId: gym})],
    };
    expect(deletePlace(b, gym)).toBe(b);
  });

  it('adds, renames and removes colour labels; a removed one leaves its climbs', () => {
    const [a, gym] = addPlace(emptyData(), PlaceKind.GYM, 'Blokownia');
    const b = addColour(a, gym, 'Red', '#ef4444');
    const red = b.places[0].colours[0].id;
    const c = renameColour(b, gym, red, 'Crimson');
    expect(c.places[0].colours[0].name).toBe('Crimson');
    const d = {
      ...c,
      climbs: [create(pb.ClimbSchema, {id: 'x', grade: '6A', colourId: red})],
    };
    const e = removeColour(d, gym, red);
    expect(e.places[0].colours).toEqual([]);
    expect(e.climbs[0].colourId).toBeUndefined();
    expect(e.climbs[0].grade).toBe('6A');
  });

  it('changes the settings', () => {
    const a = updateSettings(emptyData(), {grades: GradeSystem.V});
    expect(settingsOf(a).grades).toBe(GradeSystem.V);
  });
});
