import { useStatusStore } from './status.js';
import { create } from 'zustand';
import type { AppSettings, Bootstrap, WorkspaceView } from '../../../shared/api.js';
import { routeForDir, useRouteStore } from './route.js';

interface WorkspaceState {
  view: WorkspaceView | null;
  boot: Bootstrap | null;
  setView: (view: WorkspaceView) => void;
  apply: (fn: () => Promise<WorkspaceView | void>) => Promise<WorkspaceView | void>;
  opened: (view: WorkspaceView | null) => void;
  choose: () => void;
  refresh: () => void;
  changeSettings: (settings: AppSettings) => Promise<void>;
}
export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  view: null,
  boot: null,
  setView: (view) => set({ view }),
  apply: async (fn) => {
    const view = await fn();
    if (view) set({ view });
    return view;
  },
  opened: (view) => {
    if (!view) return;
    set(({ boot }) => ({
      view,
      boot: boot
        ? {
            ...boot,
            recent: [view.openedDir, ...boot.recent.filter((dir) => dir !== view.openedDir)].slice(
              0,
              10,
            ),
          }
        : boot,
    }));
    useRouteStore.setState(({ revision }) => ({
      route: routeForDir(view, view.selectedBatchDir),
      revision: revision + 1,
    }));
  },
  choose: () =>
    void useStatusStore
      .getState()
      .run(async () => get().opened(await window.precheck.chooseFolder())),
  refresh: () =>
    void useStatusStore.getState().run(() => get().apply(() => window.precheck.recheck())),
  changeSettings: async (settings) => {
    set(({ boot }) => ({ boot: boot ? { ...boot, settings } : null }));
    if (window.precheck.ruleVersion) {
      const ruleVersion = await window.precheck.ruleVersion();
      set(({ boot }) => ({ boot: boot ? { ...boot, ruleVersion } : boot }));
    }
    if (get().view) await get().apply(() => window.precheck.recheck());
  },
}));
