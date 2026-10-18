import {
  CloudOff,
  ExternalLink,
  GitMerge,
  HardDrive,
  RefreshCw,
} from 'lucide-react';
import {useState, type ReactNode} from 'react';
import {DRIVE_SCOPE, useGoogle} from '../google/auth';
import {copyDetails, fileDetails, type FileDetails} from '../google/drive';
import {SCHEMA_VERSION} from '../storage/codec';
import {downloadJson} from '../storage/storage';
import {useStore} from '../store';
import {useSync, type SyncStatus} from '../sync/runner';
import {usePendingConflicts} from '../sync/pending';
import {syncNow} from '../sync/setup';
import {useUi} from '../ui';

function time(ms: number) {
  return new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Settings → Google Drive sync: on/off for this device, status, and the first-sync choice. */
export function DriveSyncSettings() {
  const clientId = useGoogle(s => s.clientId);
  const on = useGoogle(s => s.driveSync);
  const setDriveSync = useGoogle(s => s.setDriveSync);
  const {status, lastSynced, fileId} = useSync();
  const conflicts = usePendingConflicts(s => s.conflicts.length);

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 rounded-md border border-line bg-panel px-3 py-2 text-[12px] text-dim">
        <HardDrive size={14} className="mt-px shrink-0" />
        <span>
          Keeps your data in one file in your Google Drive
          (personal-dashboard.binpb, with a readable copy beside it,
          personal-dashboard.json) and syncs it with your other devices. The app
          asks for{' '}
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
      {on && fileId && <DriveFiles fileId={fileId} />}
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

interface Files {
  data: FileDetails;
  copy: FileDetails | null;
}

/** The sync file and its readable copy as Drive shows them, loaded when opened. */
function DriveFiles({fileId}: {fileId: string}) {
  const [files, setFiles] = useState<Files | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    setError(null);
    try {
      const [data, copy] = await Promise.all([
        fileDetails(fileId),
        copyDetails(),
      ]);
      setFiles({data, copy});
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <details
      className="rounded-md border border-line px-3 py-2 text-[12px]"
      onToggle={e => {
        if ((e.target as HTMLDetailsElement).open) void load();
      }}
    >
      <summary className="cursor-pointer text-fg">File in Google Drive</summary>
      <div className="mt-2 space-y-2">
        {error ? (
          <p className="text-danger">{error}</p>
        ) : !files ? (
          <p className="text-dim">Loading…</p>
        ) : (
          <>
            <FileRows
              file={files.data}
              note={`protobuf binary, schema version ${SCHEMA_VERSION}`}
            />
            {files.copy && (
              <FileRows
                file={files.copy}
                note="readable copy, never read by the app"
              />
            )}
          </>
        )}
        <button className="btn h-6 text-[12px]" onClick={() => void load()}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>
    </details>
  );
}

function FileRows({file, note}: {file: FileDetails; note: string}) {
  return (
    <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-0.5">
      <dt className="text-dim">Name</dt>
      <dd className="flex flex-wrap items-center gap-x-2">
        <span className="font-mono text-fg">{file.name}</span>
        {file.webViewLink && (
          <a
            href={file.webViewLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-accent hover:underline"
          >
            Open in Drive <ExternalLink size={11} />
          </a>
        )}
      </dd>
      <dt className="text-dim">Format</dt>
      <dd>{note}</dd>
      <dt className="text-dim">Size</dt>
      <dd className="tabular-nums">
        {file.size ? `${(Number(file.size) / 1024).toFixed(1)} kB` : '–'}
      </dd>
      <dt className="text-dim">Last changed</dt>
      <dd className="tabular-nums">
        {new Date(file.modifiedTime).toLocaleString()}
      </dd>
      <dt className="text-dim">Drive version</dt>
      <dd className="tabular-nums">{file.version}</dd>
    </dl>
  );
}
