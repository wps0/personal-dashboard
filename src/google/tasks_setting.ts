import {useStore} from '../store';
import {useGoogle} from './auth';

/**
 * Whether Google Tasks are shown is kept in the data (Settings.google_tasks),
 * so it lasts across reloads and syncs to other devices. The Google store
 * keeps a copy for signing in: turning them on or off there (Settings, the
 * calendar's sidebar, or their access refused) is written to the data, and
 * the data's value (loaded, imported, synced, undone) is copied there.
 *
 * Copied in, it doesn't sign in: a device that gets them turned on from
 * elsewhere asks Google for their access at its next sign-in, not with a
 * popup out of nowhere. Call once the data has loaded, before sync starts.
 */
export function setUpGoogleTasks() {
  const inData = () => useStore.getState().data.settings.googleTasks;
  useGoogle.setState({tasks: inData()});
  useStore.subscribe((s, prev) => {
    const on = s.data.settings.googleTasks;
    if (
      on !== prev.data.settings.googleTasks &&
      on !== useGoogle.getState().tasks
    )
      useGoogle.setState({tasks: on});
  });
  useGoogle.subscribe((s, prev) => {
    if (s.tasks !== prev.tasks && s.tasks !== inData())
      useStore.getState().setGoogleTasks(s.tasks);
  });
}
