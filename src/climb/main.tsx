/**
 * @fileoverview The climbing log: a second app in this repository, on its
 * own page (climb/index.html). It shares building blocks with the dashboard
 * (styles, the saving code, the service worker) but none of its data.
 */

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {AUTOSAVE_DELAY_MS} from '../config';
import {setUpPwa} from '../pwa';
import {autosave} from '../saving/autosave';
import {claimSingleTab} from '../saving/single_tab';
import {App} from './app';
import {LoadError, OpenElsewhere} from './boot_screens';
import './climb.css';
import {climbStorage, LOCK} from './storage';
import {replaceAll, setNotice, useClimb} from './store';

// The one service worker serves both apps' pages.
setUpPwa('../sw.js');

async function boot() {
  const root = createRoot(document.getElementById('root')!);
  if (!(await claimSingleTab(navigator.locks, LOCK))) {
    root.render(<OpenElsewhere />);
    return;
  }
  const storage = climbStorage();
  try {
    const data = await storage.load();
    if (data) replaceAll(data);
  } catch (e) {
    // Don't overwrite data we couldn't read: surface it and stop.
    root.render(<LoadError error={e} storage={storage} />);
    return;
  }

  // Asks the browser not to evict the data when space runs low.
  navigator.storage?.persist?.().catch(() => {});
  autosave({
    subscribe: listener =>
      useClimb.subscribe((s, prev) => {
        if (s.data !== prev.data) listener();
      }),
    current: () => useClimb.getState().data,
    save: data => storage.save(data),
    delayMs: AUTOSAVE_DELAY_MS,
    onError: e =>
      setNotice(
        `Changes can’t be saved on this device; export the data (Settings) to keep them. ${String((e as Error)?.message ?? e)}`,
      ),
  });

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
