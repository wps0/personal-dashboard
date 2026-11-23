import {History} from 'lucide-react';
import {Empty, TabScreen} from './ui';

export function HistoryView() {
  return (
    <TabScreen tab="history" title="History">
      <Empty icon={History} title="No sessions yet">
        Every session you finish is listed here.
      </Empty>
    </TabScreen>
  );
}
