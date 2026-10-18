import {beforeEach, describe, expect, it, vi} from 'vitest';
import {GoogleApiError} from '../google/errors';
import {sampleData} from '../model/sample';
import {emptyData, type AppData} from '../model/types';
import {FakeDrive} from './fakeDrive';
import {same} from './merge';
import {SyncRunner, useSync, type SyncDeps} from './runner';
import type {SyncBase} from './sync';

const sample = () => structuredClone(sampleData('2026-10-12'));

/** A runner over an in-memory store and Drive. */
function setUp(initial: AppData, drive = new FakeDrive()) {
  const state = {
    data: initial,
    saved: null as {data: AppData; base: SyncBase} | null,
  };
  const deps: SyncDeps = {
    remote: drive,
    getData: () => state.data,
    setData: d => (state.data = d),
    canSync: () => true,
    loadBase: async () => state.saved?.base ?? null,
    saveSynced: async (data, base) => void (state.saved = {data, base}),
    clearBase: async () => void (state.saved = null),
    onConflicts: vi.fn(),
  };
  return {state, deps, drive, runner: new SyncRunner(deps)};
}

describe('SyncRunner', () => {
  beforeEach(() => useSync.setState({status: {kind: 'off'}, lastSynced: 0}));

  it('syncs and saves the data together with the base', async () => {
    const {runner, state, drive} = setUp(sample());
    await runner.sync();
    expect(useSync.getState().status).toEqual({kind: 'idle'});
    expect(useSync.getState().lastSynced).toBeGreaterThan(0);
    expect(state.saved?.data).toBe(state.data);
    expect(state.saved?.base.fileId).toBe([...drive.files.keys()][0]);
  });

  it('waits for sign-in without touching Drive', async () => {
    const {runner, deps, drive} = setUp(sample());
    deps.canSync = () => false;
    await runner.sync();
    expect(useSync.getState().status).toEqual({kind: 'signed-out'});
    expect(drive.calls).toEqual([]);
  });

  it('runs one sync at a time, and once more for requests made meanwhile', async () => {
    const {runner, drive} = setUp(sample());
    await Promise.all([runner.sync(), runner.sync(), runner.sync()]);
    // The first creates the file; the queued one finds nothing new.
    expect(drive.calls).toEqual(['find', 'create', 'info']);
  });

  it('keeps edits made during a sync, and uploads them', async () => {
    const {runner, state, drive} = setUp(sample());
    await runner.sync();
    // Drive gets a change from another device.
    const other = structuredClone(state.data);
    other.items[0].title = 'From the phone';
    await drive.updateFile([...drive.files.keys()][0], JSON.stringify(other));

    // The user edits something while the download is in flight.
    const download = drive.download.bind(drive);
    drive.download = async id => {
      state.data = structuredClone(state.data);
      state.data.items[1].title = 'Typed meanwhile';
      return download(id);
    };
    await runner.sync();
    expect(state.data.items[0].title).toBe('From the phone');
    expect(state.data.items[1].title).toBe('Typed meanwhile');
    expect(same(drive.content(), state.data)).toBe(true);
    expect(runner.applied).toBe(state.data);
  });

  it('reports offline, expired sessions and other errors', async () => {
    const {runner, deps} = setUp(sample());
    const fail = (e: Error) => (deps.remote.findFile = () => Promise.reject(e));
    fail(new GoogleApiError('offline', 'offline'));
    await runner.sync();
    expect(useSync.getState().status).toEqual({kind: 'offline'});
    fail(new GoogleApiError('expired', 'expired'));
    await runner.sync();
    expect(useSync.getState().status).toEqual({kind: 'signed-out'});
    fail(new Error('boom'));
    await runner.sync();
    expect(useSync.getState().status).toEqual({kind: 'error', message: 'boom'});
  });

  it('asks on a first sync with different data, and waits for the answer', async () => {
    const drive = new FakeDrive();
    await setUp(sample(), drive).runner.sync();
    const own = emptyData();
    own.dayNotes['2026-10-13'] = 'mine';
    const {runner, state} = setUp(own, drive);
    await runner.sync();
    const {status} = useSync.getState();
    expect(status.kind).toBe('choose');
    expect(status.kind === 'choose' && status.drive.projects).toBe(
      sample().projects.length,
    );

    drive.calls = [];
    await runner.sync(); // automatic syncs don't ask again
    expect(drive.calls).toEqual([]);

    await runner.sync('merge');
    expect(useSync.getState().status).toEqual({kind: 'idle'});
    expect(state.data.dayNotes['2026-10-13']).toBe('mine');
    expect(state.data.projects.length).toBe(sample().projects.length);
  });

  it('reports conflicts', async () => {
    const drive = new FakeDrive();
    const laptop = setUp(sample(), drive);
    await laptop.runner.sync();
    const phone = setUp(emptyData(), drive);
    await phone.runner.sync();
    phone.state.data = structuredClone(phone.state.data);
    phone.state.data.items[0].title = 'Phone';
    await phone.runner.sync();
    laptop.state.data = structuredClone(laptop.state.data);
    laptop.state.data.items[0].title = 'Laptop';
    await laptop.runner.sync();
    expect(laptop.state.data.items[0].title).toBe('Laptop');
    expect(laptop.deps.onConflicts).toHaveBeenCalledWith([
      {
        path: ['items', laptop.state.data.items[0].id, 'title'],
        local: 'Laptop',
        remote: 'Phone',
      },
    ]);
  });

  it('forgets the base when stopped', async () => {
    const {runner, state} = setUp(sample());
    await runner.sync();
    await runner.stop();
    expect(state.saved).toBeNull();
    expect(useSync.getState().status).toEqual({kind: 'off'});
  });
});
