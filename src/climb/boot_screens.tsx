/**
 * @fileoverview What the log shows instead of itself: when it's open in
 * another tab, or when its saved data can't be read.
 */

import {useState, type ReactNode} from 'react';
import type {LocalStore} from '../saving/local_store';
import {downloadFile} from '../saving/local_store';
import type {ClimbData} from './model/data';
import {today} from './model/dates';
import {BLOCK, DashboardLink} from './ui';

function Page({title, children}: {title: string; children: ReactNode}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg p-6 text-center text-[15px]">
      <h1 className="text-[18px] font-semibold text-strong">{title}</h1>
      {children}
    </div>
  );
}

export function OpenElsewhere() {
  return (
    <Page title="The climbing log is open in another tab or window">
      <p className="text-dim">Close it, then reload here.</p>
      <button
        type="button"
        onClick={() => location.reload()}
        className="h-11 rounded-full bg-accent px-5 font-semibold text-on-accent"
      >
        Reload
      </button>
      <DashboardLink />
    </Page>
  );
}

/**
 * The saved data can't be read (saved by a newer version, or damaged). It's
 * never overwritten from here without asking: keep a copy, then start empty.
 */
export function LoadError({
  error,
  storage,
}: {
  error: unknown;
  storage: LocalStore<ClimbData>;
}) {
  const [sure, setSure] = useState(false);
  return (
    <Page title="The climbing log’s data can’t be read">
      <p className={`max-w-md p-4 text-[14px] text-fg ${BLOCK}`}>
        {String((error as Error)?.message ?? error)}
      </p>
      <button
        type="button"
        onClick={async () => {
          const raw = await storage.loadRaw();
          if (raw) downloadFile(raw, `climb-unreadable-${today()}.binpb`);
        }}
        className="h-11 rounded-full bg-accent px-5 font-semibold text-on-accent"
      >
        Download it as it is
      </button>
      <button
        type="button"
        onClick={async () => {
          if (!sure) return setSure(true);
          await storage.reset();
          location.reload();
        }}
        className="h-11 rounded-full bg-raised px-5 text-danger"
      >
        {sure ? 'Delete it and start empty' : 'Start empty…'}
      </button>
      <DashboardLink />
    </Page>
  );
}
