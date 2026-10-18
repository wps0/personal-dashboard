import type {IndexedDbStorage} from '../storage/storage';

/**
 * Shown instead of the app when the saved data can't be read. Nothing is
 * saved over it until the user chooses to reset.
 */
export function LoadError({
  error,
  storage,
}: {
  error: unknown;
  storage: IndexedDbStorage;
}) {
  async function download() {
    const blob = await storage.loadRaw();
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dashboard-unreadable.${blob.type === 'application/json' ? 'json' : 'binpb'}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function reset() {
    if (
      !confirm(
        'Delete the saved data on this device and start empty? If Google Drive sync is on, the data comes back from Drive.',
      )
    )
      return;
    await storage.reset();
    location.reload();
  }

  return (
    <div className="mx-auto mt-24 max-w-md space-y-4 px-4">
      <h1 className="text-lg font-semibold text-strong">
        The saved data can’t be read
      </h1>
      <p className="text-danger">
        {String((error as Error)?.message ?? error)}
      </p>
      <p className="text-dim">
        If it was saved by a newer version of the app, reload to update. If it
        is from an older version, download it to keep a copy, then reset: the
        app starts empty, and takes the data from Google Drive if sync is on.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="btn" onClick={() => location.reload()}>
          Reload
        </button>
        <button className="btn" onClick={() => void download()}>
          Download the saved data
        </button>
        <button className="btn" onClick={() => void reset()}>
          Reset the saved data
        </button>
      </div>
    </div>
  );
}
