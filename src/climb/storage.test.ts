import 'fake-indexeddb/auto';
import {get} from 'idb-keyval';
import {describe, expect, it} from 'vitest';
import {emptyData} from './model/data';
import {addPlace} from './model/places';
import {climbStorage, codec, readExport, SCHEMA_VERSION} from './storage';

describe('the log’s storage', () => {
  it('keeps its data in its own database, not the dashboard’s', async () => {
    const [data] = addPlace(emptyData(), 'Blokownia');
    await climbStorage().save(data);
    expect((await climbStorage().load())?.places[0].name).toBe('Blokownia');
    expect(await get('climb/data')).toBeUndefined();
    expect(await get('personal-dashboard/data')).toBeUndefined();
  });

  it('starts at schema version 1, and reads its exports back', () => {
    expect(SCHEMA_VERSION).toBe(1);
    const [data] = addPlace(emptyData(), 'West');
    const json = new TextEncoder().encode(codec.toReadableJson(data));
    expect(readExport(json).places[0].name).toBe('West');
    expect(readExport(codec.encode(data)).places[0].name).toBe('West');
    expect(() => readExport(new TextEncoder().encode('{"areas": []}'))).toThrow(
      /climbing log data/,
    );
  });
});
