import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './app';
import {LoadError} from './components/load_error';
import {OpenElsewhere} from './components/open_elsewhere';
import './index.css';
import {setUpPwa} from './pwa';
import {setUpAutosave} from './storage/autosave';
import {claimSingleTab} from './storage/single_tab';
import {IndexedDbStorage} from './storage/storage';
import {useStore} from './store';
import {adoptFoldedGroups} from './ui';
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

  // Asks the browser not to evict the data when space runs low.
  navigator.storage?.persist?.().catch(() => {});
  setUpAutosave(storage);
  adoptFoldedGroups();
  setUpSync(storage);

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
