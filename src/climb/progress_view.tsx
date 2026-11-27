import {ChartNoAxesColumn} from 'lucide-react';
import {Empty, TabScreen} from './ui';

export function ProgressView() {
  return (
    <TabScreen tab="progress" title="Progress">
      <Empty icon={ChartNoAxesColumn} title="No climbs to chart yet">
        Your climbs by grade, tries and the trend over any period show here once
        you log sessions.
      </Empty>
    </TabScreen>
  );
}
