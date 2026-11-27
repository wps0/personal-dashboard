import {unreachable} from '../unreachable';
import {HistoryView} from './history_view';
import {ProgressView} from './progress_view';
import {useRoute} from './router';
import {SettingsView} from './settings_view';
import {TodayView} from './today_view';

export function App() {
  const route = useRoute();
  switch (route.name) {
    case 'today':
      return <TodayView />;
    case 'progress':
      return <ProgressView />;
    case 'history':
      return <HistoryView />;
    case 'settings':
      return <SettingsView />;
    default:
      return unreachable(route);
  }
}
