import {CloudOff, GitMerge, HardDrive, RefreshCw} from 'lucide-react';
import type {ReactNode} from 'react';
import {DRIVE_SCOPE, useGoogle} from '../google/auth';
import {downloadJson} from '../storage/storage';
import {useStore} from '../store';
import {useSync, type SyncStatus} from '../sync/runner';
import {usePendingConflicts} from '../sync/pending';
import {syncNow} from '../sync/setup';
import {useUi} from '../ui';

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});

/** Settings → Google Drive sync: on/off for this device, status, and the first-sync choice. */
export function DriveSyncSettings() {
  const clientId = useGoogle(s => s.clientId);
  const on = useGoogle(s => s.driveSync);
  const setDriveSync = useGoogle(s => s.setDriveSync);
  const {status, lastSynced} = useSync();
  const conflicts = usePendingConflicts(s => s.conflicts.length);

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 rounded-md border border-line bg-panel px-3 py-2 text-[12px] text-dim">
        <HardDrive size={14} className="mt-px shrink-0" />
        <span>
          Keeps a copy of your data in one file in your Google Drive
          (personal-dashboard.json) and syncs it with your other devices. The
          app asks for{' '}
          <code className="text-fg">{DRIVE_SCOPE.split('/').pop()}</code> only:
          access to the files it creates, nothing else in your Drive. This
          browser keeps its own copy, so the app works offline. Needs the{' '}
          <b>Google Drive API</b> enabled in your Cloud project and the{' '}
          <code>drive.file</code> scope on its consent screen.
        </span>
      </p>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={on}
          disabled={!clientId && !on}
          onChange={e => setDriveSync(e.target.checked)}
        />
        Sync this device with Google Drive
        {!clientId && (
          <span className="text-[12px] text-dim">
            (add the OAuth Client ID under Google Calendar first)
          </span>
        )}
      </label>

      {on && <Status status={status} lastSynced={lastSynced} />}
      {conflicts > 0 && (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-warn">
          <GitMerge size={14} />
          {conflicts === 1
            ? '1 conflict to review.'
            : `${conflicts} conflicts to review.`}
          <button
            className="btn ml-2"
            onClick={() => useUi.getState().setDialog('conflicts')}
          >
            Review
          </button>
        </p>
      )}
    </div>
  );
}

function Status({
  status,
  lastSynced,
}: {
  status: SyncStatus;
  lastSynced?: number;
}) {
  const since = lastSynced ? ` Last synced at ${time(lastSynced)}.` : '';
  switch (status.kind) {
    case 'choose':
      return <FirstSyncChoice drive={status.drive} />;
    case 'signed-out':
      return (
        <Line icon={<CloudOff size={14} className="text-warn" />}>
          Sign in to Google to sync (sessions last an hour).{since}
          <button
            className="btn ml-2"
            onClick={() => void useGoogle.getState().signIn()}
          >
            Connect
          </button>
        </Line>
      );
    case 'offline':
      return (
        <Line icon={<CloudOff size={14} className="text-warn" />}>
          Offline; changes will sync when you’re back online.{since}
        </Line>
      );
    case 'error':
      return (
        <Line icon={<CloudOff size={14} className="text-danger" />}>
          <span role="alert" className="text-danger">
            {status.message}
          </span>{' '}
          {status.help && (
            <a
              href={status.help}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Fix it
            </a>
          )}
          <SyncButton />
        </Line>
      );
    default:
      return (
        <Line
          icon={
            <RefreshCw
              size={14}
              className={status.kind === 'syncing' ? 'animate-spin' : ''}
            />
          }
        >
          {status.kind === 'syncing'
            ? 'Syncing…'
            : lastSynced
              ? `Synced at ${time(lastSynced)}.`
              : 'Not synced yet.'}
          <SyncButton disabled={status.kind === 'syncing'} />
        </Line>
      );
  }
}

function Line({icon, children}: {icon: ReactNode; children: ReactNode}) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px]">
      {icon}
      {children}
    </p>
  );
}

function SyncButton({disabled}: {disabled?: boolean}) {
  return (
    <button
      className="btn ml-2"
      disabled={disabled}
      onClick={() => void syncNow()}
    >
      Sync now
    </button>
  );
}

function FirstSyncChoice({
  drive,
}: {
  drive: {projects: number; items: number; modifiedTime: string};
}) {
  const saved = new Date(drive.modifiedTime).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return (
    <div className="space-y-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[13px]">
      <p>
        Google Drive already has dashboard data ({drive.projects} projects,{' '}
        {drive.items} items, saved {saved}), and this device has different data.
        What should this device do?
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => void syncNow('drive')}>
          Use Drive’s data
        </button>
        <button className="btn" onClick={() => void syncNow('merge')}>
          Merge both
        </button>
        <button
          className="btn-ghost"
          onClick={() => downloadJson(useStore.getState().data)}
        >
          Export this device’s data first
        </button>
      </div>
      <p className="text-[12px] text-dim">
        “Use Drive’s data” replaces what’s on this device. “Merge both” keeps
        everything from both, which can duplicate things you set up twice.
      </p>
    </div>
  );
}
