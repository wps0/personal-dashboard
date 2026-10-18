/**
 * Shown instead of the app while it is open in another tab or window
 * (storage/single_tab.ts). This tab doesn't load, save or sync the data.
 */
export function OpenElsewhere() {
  return (
    <div className="mx-auto mt-24 max-w-md space-y-4 px-4">
      <h1 className="text-lg font-semibold text-strong">
        The dashboard is open in another tab or window
      </h1>
      <p className="text-dim">Close it, then reload here.</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    </div>
  );
}
