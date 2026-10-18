import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './app';
import {LoadError} from './components/load_error';
import {OpenElsewhere} from './components/open_elsewhere';
import './index.css';
import {setUpPwa} from './pwa';
import {claimSingleTab} from './storage/single_tab';
import {IndexedDbStorage} from './storage/storage';
import {useStore} from './store';
import {setUpSync} from './sync/setup';

const storage = new IndexedDbStorage();
setUpPwa();

async function boot() {
  const root = createRoot(document.getElementById('root')!);
  if (!(await claimSingleTab())) {
    root.render(<OpenElsewhere />);
    return;
  }
  try {
    const data = await storage.load();
    if (data) useStore.getState().replaceAll(data);
  } catch (e) {
    // Don't overwrite data we couldn't read: surface it and stop.
    root.render(<LoadError error={e} storage={storage} />);
    return;
  }

  // Debounced autosave; flush when the tab is hidden or closed.
  let timer: number | undefined;
  const flush = () => {
    window.clearTimeout(timer);
    timer = undefined;
    void storage.save(useStore.getState().data);
  };
  useStore.subscribe((s, prev) => {
    if (s.data === prev.data) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, 400);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && timer !== undefined) flush();
  });
  window.addEventListener('pagehide', () => timer !== undefined && flush());
  setUpSync(storage);

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
