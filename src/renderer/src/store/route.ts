import { useMemo } from 'react';
import { create } from 'zustand';
import type { WorkspaceView } from '../../../shared/api.js';
import { useWorkspaceStore } from './workspace.js';
import { useStatusStore } from './status.js';

export interface Route {
  page: 'home' | 'overview' | 'claim' | 'labor' | 'rejected' | 'rules';
  dir?: string;
  group?: string;
  ruleId?: string;
}
export function routeForDir(view: WorkspaceView | null, dir: string | null): Route {
  if (!view) return { page: 'home' };
  if (!dir) return { page: 'overview' };
  if (view.labor?.some((labor) => labor.report.dir === dir)) return { page: 'labor', dir };
  if (view.rejected?.batch.dir === dir) return { page: 'rejected', dir };
  return { page: 'claim', dir };
}
interface RouteState {
  route: Route;
  revision: number;
  selectionRevision: number;
  highlight: string;
  navigate: (route: Route) => void;
  select: (dir: string, group?: string) => void;
}
export const useRouteStore = create<RouteState>((set, get) => ({
  route: { page: 'home' },
  revision: 0,
  selectionRevision: 0,
  highlight: '',
  navigate: (route) => {
    const next =
      route.page === 'rules' ? { dir: get().route.dir, group: get().route.group, ...route } : route;
    set(({ revision, selectionRevision }) => ({
      route: next,
      revision: revision + 1,
      selectionRevision: next.page === 'rules' ? selectionRevision : selectionRevision + 1,
    }));
    if (next.page === 'rules') return;
    const selectedBatchDir = next.dir || null;
    const { view, setView } = useWorkspaceStore.getState();
    if (!view) return;
    setView({ ...view, selectedBatchDir });
    void window.precheck
      .selectBatch(selectedBatchDir)
      .catch((error: unknown) => useStatusStore.setState({ error: String(error) }));
  },
  select: (dir, group) =>
    get().navigate({
      ...routeForDir(useWorkspaceStore.getState().view, dir || null),
      ...(group ? { group } : {}),
    }),
}));

export function useRuleFocus() {
  const route = useRouteStore((state) => state.route);
  const revision = useRouteStore((state) => state.revision);
  return useMemo(
    () =>
      route.page === 'rules' && route.ruleId !== undefined ? { id: route.ruleId, revision } : null,
    [route, revision],
  );
}
