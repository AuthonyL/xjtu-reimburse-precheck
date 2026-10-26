import { PageHeader } from './ui.js';
import type { WorkspaceView } from '../../shared/api.js';
import { OverviewTable } from './overview/OverviewTable.js';
import { OverviewReferences } from './overview/OverviewReferences.js';

export function Overview({ view }: { view: WorkspaceView }) {
  return (
    <main>
      <PageHeader title="批次总览" />
      <OverviewTable key={view.dir} batches={view.batches} />
      <OverviewReferences view={view} />
    </main>
  );
}
