import {afterEach, describe, expect, it, vi} from 'vitest';
import {claimSingleTab} from './single_tab';

/** Web Locks shared by the tabs of one browser: exclusive, ifAvailable. */
class FakeLocks {
  held = new Set<string>();

  async request(
    name: string,
    _options: LockOptions,
    callback: (lock: Lock | null) => unknown,
  ) {
    if (this.held.has(name)) return callback(null);
    this.held.add(name);
    try {
      return await callback({name, mode: 'exclusive'});
    } finally {
      this.held.delete(name);
    }
  }
}

describe('claimSingleTab', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lets the first tab in, and keeps the others out while it is open', async () => {
    const fake = new FakeLocks();
    const locks = fake as unknown as LockManager;
    expect(await claimSingleTab(locks)).toBe(true);
    expect(await claimSingleTab(locks)).toBe(false);
    await new Promise(r => setTimeout(r, 10));
    expect(fake.held.has('personal-dashboard')).toBe(true);
    expect(await claimSingleTab(locks)).toBe(false);
  });

  it('goes ahead without Web Locks, or if the request fails', async () => {
    vi.stubGlobal('navigator', {});
    expect(await claimSingleTab()).toBe(true);
    const failing = {
      request: () => Promise.reject(new Error('SecurityError')),
    } as unknown as LockManager;
    expect(await claimSingleTab(failing)).toBe(true);
  });
});
