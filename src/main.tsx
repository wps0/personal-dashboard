import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { IndexedDbStorage } from './storage/storage';
import { useStore } from './store';

const storage = new IndexedDbStorage();

async function boot() {
  const root = createRoot(document.getElementById('root')!);
  try {
    const data = await storage.load();
    if (data) useStore.getState().replaceAll(data);
  } catch (e) {
    // Don't overwrite data we couldn't read: surface it and stop.
    root.render(<pre className="p-4 text-danger">Failed to load saved data: {String(e)}</pre>);
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

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
