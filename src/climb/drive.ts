/**
 * @fileoverview The climbing log's files on Google Drive: climb.binpb, and
 * climb.json as a read-only copy. Their own names and marker, so they never
 * mix with the dashboard's.
 */

import {driveFiles} from '../google/drive_files';
import {climbFetch} from './google';

export const climbDrive = driveFiles({
  fetch: climbFetch,
  markKey: 'climbLog',
  mergedKey: 'climbLogMergedInto',
  data: {
    name: 'climb.binpb',
    mimeType: 'application/octet-stream',
    mark: 'binpb',
  },
  copy: {
    name: 'climb.json',
    mimeType: 'application/json',
    mark: 'json-copy',
    description:
      'A read-only copy of your climbing log, written by the app after every ' +
      'sync. The app never reads it: changes made here are lost.',
  },
});
