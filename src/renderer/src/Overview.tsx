import uiStyles from './styles/ui.module.css';
import { nameOf } from './ui.js';
import { useWorkspaceStore } from './store/workspace.js';
import type { WorkspaceView } from '../../shared/api.js';
import { OverviewTable } from './overview/OverviewTable.js';
import { OverviewReferences } from './overview/OverviewReferences.js';

export function Overview({ view }: { view: WorkspaceView }) {
  const refresh = useWorkspaceStore((state) => state.refresh);
  return (
    <main>
      <div className={uiStyles.pageHeading}>
        <div>
          <h1>{nameOf(view.dir)}</h1>
          <p className={uiStyles.path}>{view.dir}</p>
        </div>
        <button onClick={refresh}>全部重新检查</button>
      </div>
      <OverviewTable key={view.dir} batches={view.batches} />
      <OverviewReferences view={view} />
    </main>
  );
}
