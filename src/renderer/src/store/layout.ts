import { create } from 'zustand';
import type { SidebarLayout } from '../../../shared/api.js';
import { SIDEBAR_DEFAULT } from '../../../shared/navigation.js';
import { useStatusStore } from './status.js';

interface LayoutState extends SidebarLayout {
  dragging: boolean;
  saveLayout: (patch: Partial<SidebarLayout>) => Promise<void>;
}
export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarWidth: SIDEBAR_DEFAULT,
  sidebarCollapsed: false,
  dragging: false,
  saveLayout: async (patch) => {
    set(patch);
    try {
      await window.precheck.saveLayout(patch);
    } catch (error) {
      useStatusStore.setState({ error: String(error) });
    }
  },
}));
