import {Timer} from 'lucide-react';
import {Empty, TabScreen} from './ui';

export function TodayView() {
  return (
    <TabScreen tab="today" title="Climb">
      <Empty icon={Timer} title="Nothing logged yet">
        Sessions and logging by grade come in the next steps of the climbing
        log.
      </Empty>
    </TabScreen>
  );
}
