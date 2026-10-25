import { createContext, useContext, type KeyboardEvent } from 'react';

export interface TreeState {
  expanded: Set<string>;
  focused: string | undefined;
  selected: string | null;
  selectedGroup?: string;
  settingsOpen: boolean;
  busy: boolean;
  toggle: (id: string, value: boolean) => void;
  selectNode: (dir: string, group?: string) => void;
  setFocused: (id: string) => void;
  keyboard: (
    event: KeyboardEvent<HTMLElement>,
    id: string,
    dir: string,
    group?: string,
    parent?: string,
    branch?: boolean,
  ) => void;
}
export const TreeContext = createContext<TreeState | null>(null);
export const useTreeState = () => useContext(TreeContext)!;
