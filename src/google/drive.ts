/**
 * @fileoverview The dashboard's files on Google Drive (google/drive_files.ts
 * with the dashboard's names and marker).
 */

import {driveFiles} from './drive_files';
import {googleFetch} from './request';

export {DRIVE_SCOPE} from './auth';
export type {DriveFile, FileDetails} from './drive_files';

const files = driveFiles({
  fetch: googleFetch,
  markKey: 'personalDashboard',
  mergedKey: 'personalDashboardMergedInto',
  data: {
    name: 'personal-dashboard.binpb',
    mimeType: 'application/octet-stream',
    mark: 'binpb',
  },
  copy: {
    name: 'personal-dashboard.json',
    mimeType: 'application/json',
    mark: 'json-copy',
    description:
      'A read-only copy of your Personal Dashboard data, written by the app ' +
      'after every sync. The app never reads it: changes made here are lost.',
  },
});

export const {
  fileDetails,
  copyDetails,
  listFiles,
  fileInfo,
  trash,
  mergedInto,
  download,
  createFile,
  updateFile,
  writeCopy,
} = files;
