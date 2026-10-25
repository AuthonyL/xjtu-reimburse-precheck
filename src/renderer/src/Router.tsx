import { Home } from './Home.js';
import { Overview } from './Overview.js';
import { Results } from './Results.js';
import { LaborPage } from './LaborPage.js';
import { RejectedPage } from './RejectedPage.js';
import { Settings } from './Settings.js';
import { useWorkspaceStore } from './store/workspace.js';
import { useRouteStore } from './store/route.js';

export function Router() {
  const workspace = useWorkspaceStore((state) => state.view);
  const boot = useWorkspaceStore((state) => state.boot);
  const route = useRouteStore((state) => state.route);
  const highlight = useRouteStore((state) => state.highlight);
  const current = workspace?.batches.find((view) => view.batch.dir === route.dir);
  switch (route.page) {
    case 'rules':
      return boot ? (
        <Settings initial={boot.settings} userData={boot.userData} version={boot.ruleVersion} />
      ) : (
        <Home />
      );
    case 'home':
      return <Home />;
    case 'overview':
      return workspace ? <Overview view={workspace} /> : <Home />;
    case 'labor': {
      const labor = workspace?.labor?.find((view) => view.report.dir === route.dir);
      return labor && boot ? (
        <LaborPage
          key={labor.report.dir}
          view={labor}
          config={boot.settings.rules}
          highlight={highlight}
        />
      ) : workspace ? (
        <Overview view={workspace} />
      ) : (
        <Home />
      );
    }
    case 'rejected':
      return workspace?.rejected ? (
        <RejectedPage view={workspace.rejected} />
      ) : workspace ? (
        <Overview view={workspace} />
      ) : (
        <Home />
      );
    case 'claim':
      return current ? (
        <Results
          key={current.batch.dir}
          view={current}
          settings={boot?.settings}
          highlight={highlight}
        />
      ) : workspace ? (
        <Overview view={workspace} />
      ) : (
        <Home />
      );
  }
}
