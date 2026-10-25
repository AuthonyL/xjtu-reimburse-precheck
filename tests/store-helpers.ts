import type { AppSettings, BatchView, WorkspaceView } from '../src/shared/api.js';
import { useWorkspaceStore } from '../src/renderer/src/store/workspace.js';
import { routeForDir, useRouteStore } from '../src/renderer/src/store/route.js';
import { useStatusStore } from '../src/renderer/src/store/status.js';
import { useLayoutStore } from '../src/renderer/src/store/layout.js';

export function resetStores() {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
  useRouteStore.setState(useRouteStore.getInitialState(), true);
  useStatusStore.setState(useStatusStore.getInitialState(), true);
  useLayoutStore.setState(useLayoutStore.getInitialState(), true);
}
export function seedWorkspace(view: WorkspaceView) {
  useStatusStore.setState({ busy: false });
  useWorkspaceStore.getState().setView(view);
  useRouteStore.setState({ route: routeForDir(view, view.selectedBatchDir) });
}

export function seedSettings(settings: AppSettings) {
  useWorkspaceStore.setState({
    boot: {
      settings,
      recent: [],
      userData: 'synthetic',
      session: {
        openedDir: null,
        selectedBatchDir: null,
        sidebarWidth: 280,
        sidebarCollapsed: false,
      },
      restored: { workspace: null, message: null },
    },
  });
}

export function seedBatch(view: BatchView) {
  seedWorkspace({
    kind: 'batch',
    dir: view.batch.dir,
    openedDir: view.batch.dir,
    selectedBatchDir: view.batch.dir,
    batches: [view],
    rejected: null,
  });
  return view;
}
