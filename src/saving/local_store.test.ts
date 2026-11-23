import 'fake-indexeddb/auto';
import {createStore, get} from 'idb-keyval';
import {describe, expect, it} from 'vitest';
import {LocalStore, readFile} from './local_store';

const text = new TextEncoder();
const bytes = (s: string) => text.encode(s) as Uint8Array<ArrayBuffer>;

/** A store of strings, in a database of its own. */
function stringStore() {
  return new LocalStore<string>({
    key: 'app/data',
    baseKey: 'app/sync-base',
    read: b => new TextDecoder().decode(b),
    write: bytes,
    store: createStore('other-app', 'keyval'),
  });
}

describe('LocalStore', () => {
  it('keeps an app’s data in its own database, apart from the default one', async () => {
    const store = stringStore();
    expect(await store.load()).toBeNull();
    await store.save('hello');
    expect(await store.load()).toBe('hello');
    expect(await get('app/data')).toBeUndefined();
  });

  it('saves the data with its sync base, and clears them', async () => {
    const store = stringStore();
    await store.saveSynced('mine', {fileId: 'f', version: '3', data: 'base'});
    expect(await store.load()).toBe('mine');
    expect(await store.loadSyncBase()).toEqual({
      fileId: 'f',
      version: '3',
      data: 'base',
    });
    await store.clearSyncBase();
    expect(await store.loadSyncBase()).toBeNull();
    await store.reset();
    expect(await store.load()).toBeNull();
  });
});

describe('readFile', () => {
  it('tells JSON from binary by its first character', () => {
    const read = {json: () => 'json', binary: () => 'binary'};
    expect(readFile(bytes('﻿  {"a": 1}'), read)).toBe('json');
    expect(readFile(new Uint8Array([8, 1]), read)).toBe('binary');
  });
});
