import {create} from '@bufbuild/protobuf';
import {timestampFromDate} from '@bufbuild/protobuf/wkt';
import {describe, expect, it} from 'vitest';
import * as pb from '../../gen/climb/climb_pb';
import {emptyData, GradeSystem, settingsOf} from './data';
import {
  buttonRange,
  buttons,
  convert,
  defaultRange,
  FONT,
  gradeOf,
  labelOf,
  rankOf,
  systemOf,
  V,
} from './grades';
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
  it('are stored as enums in their scale, and read back as labels', () => {
    const g = gradeOf(GradeSystem.FONT, '6B+');
    expect(g.scale).toEqual({
      case: 'font',
      value: pb.FontGrade.FONT_GRADE_6B_PLUS,
    });
    expect(labelOf(g)).toBe('6B+');
    expect(labelOf(gradeOf(GradeSystem.V, 'VB'))).toBe('VB');
    expect(labelOf(undefined)).toBe('');
    // The enums list the grades in the labels' order.
    expect(FONT).toHaveLength(Object.keys(pb.FontGrade).length / 2 - 1);
    expect(V).toHaveLength(Object.keys(pb.VGrade).length / 2 - 1);
  });

  it('convert by the table, and rank across scales', () => {
    expect(convert('6B+', GradeSystem.FONT, GradeSystem.V)).toBe('V4');
    expect(convert('V4', GradeSystem.V, GradeSystem.FONT)).toBe('6B');
    expect(rankOf(gradeOf(GradeSystem.V, 'V5'), GradeSystem.FONT)).toBe(
      FONT.indexOf('6C'),
    );
    for (const f of FONT)
      expect(V).toContain(convert(f, GradeSystem.FONT, GradeSystem.V));
  });

  it('offer 4 to 7A+ by default, or the range set, whose scale the log uses', () => {
    const s = settingsOf(emptyData());
    expect(systemOf(s)).toBe(GradeSystem.FONT);
    expect(buttons(s)).toEqual([
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
    const set = create(pb.SettingsSchema, {
      buttonsFrom: gradeOf(GradeSystem.FONT, '5+'),
      buttonsTo: gradeOf(GradeSystem.FONT, '6B'),
    });
    expect(buttons(set)).toEqual(['5+', '6A', '6A+', '6B']);
    const [from, to] = defaultRange(GradeSystem.V);
    const v = create(pb.SettingsSchema, {buttonsFrom: from, buttonsTo: to});
    expect(systemOf(v)).toBe(GradeSystem.V);
    expect(buttonRange(v)).toEqual(['V0', 'V8']);
    const backwards = create(pb.SettingsSchema, {
      buttonsFrom: gradeOf(GradeSystem.FONT, '7A'),
      buttonsTo: gradeOf(GradeSystem.FONT, '6A'),
    });
    expect(buttonRange(backwards)).toEqual(['4', '7A+']);
  });
});

describe('gyms', () => {
  it('are added, archived, and deleted while they have no sessions', () => {
    const [a, gym] = addPlace(emptyData(), ' Blokownia ');
    const [b, west] = addPlace(a, 'West');
    expect(placesOf(b).map(p => p.name)).toEqual(['Blokownia', 'West']);
    const c = updatePlace(b, gym, {archived: true});
    expect(placesOf(c).map(p => p.id)).toEqual([west]);
    expect(placesOf(c, true).map(p => p.id)).toEqual([gym]);
    expect(deletePlace(c, west).places).toHaveLength(1);
    const used = {
      ...c,
      sessions: [create(pb.SessionSchema, {id: 's', placeId: gym})],
    };
    expect(deletePlace(used, gym)).toBe(used);
  });

  it('have colour labels; a removed one leaves the climbs that had it', () => {
    const [a, gym] = addPlace(emptyData(), 'Blokownia');
    const b = addColour(a, gym, 'Red', '#ef4444');
    const red = b.places[0].colours[0].id;
    const c = renameColour(b, gym, red, 'Crimson');
    expect(c.places[0].colours[0].name).toBe('Crimson');
    const climb = create(pb.ClimbSchema, {
      id: 'x',
      at: timestampFromDate(new Date()),
      grade: gradeOf(GradeSystem.FONT, '6A'),
      colourId: red,
    });
    const d = {
      ...c,
      sessions: [
        create(pb.SessionSchema, {id: 's', placeId: gym, climbs: [climb]}),
      ],
    };
    const e = removeColour(d, gym, red);
    expect(e.places[0].colours).toEqual([]);
    expect(e.sessions[0].climbs[0].colourId).toBeUndefined();
    expect(labelOf(e.sessions[0].climbs[0].grade)).toBe('6A');
  });

  it('change the settings', () => {
    const [from, to] = defaultRange(GradeSystem.V);
    const a = updateSettings(emptyData(), {buttonsFrom: from, buttonsTo: to});
    expect(systemOf(settingsOf(a))).toBe(GradeSystem.V);
  });
});
