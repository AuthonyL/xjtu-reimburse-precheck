import styles from './sidebar.module.css';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  expandExclusive,
  expansionForSelection,
  type BatchNode,
} from '../../../shared/navigation.js';
import { useRouteStore } from '../store/route.js';
import { useStatusStore } from '../store/status.js';
import { TreeContext } from './TreeState.js';
import { TreeNode } from './TreeNode.js';

export function WorkspaceTree({ nodes }: { nodes: BatchNode[] }) {
  const route = useRouteStore((state) => state.route);
  const selected = route.dir ?? null;
  const selectedGroup = route.group;
  const settingsOpen = route.page === 'rules';
  const selectionRevision = useRouteStore((state) => state.selectionRevision);
  const select = useRouteStore((state) => state.select);
  const busy = useStatusStore((state) => state.busy);
  const [expanded, setExpanded] = useState(() => expansionForSelection(nodes, selected));
  const [focused, setFocused] = useState(selected ?? nodes[0]?.id);
  const tree = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setExpanded(expansionForSelection(nodes, selected));
  }, [selected, selectedGroup, selectionRevision]);
  useEffect(() => {
    const visible = Array.from(
      tree.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [],
    );
    if (!visible.some((node) => node.dataset.nodeId === focused)) {
      setFocused(
        (visible.find((node) => node.dataset.nodeId === selected) ?? visible[0])?.dataset.nodeId,
      );
    }
  }, [expanded, focused, selected]);
  const toggle = (id: string, value: boolean) =>
    setExpanded((old) => {
      if (value) return expandExclusive(old, id, nodes);
      const next = new Set(old);
      next.delete(id);
      return next;
    });
  const selectNode = (batchDir: string, group?: string) => {
    setExpanded(expansionForSelection(nodes, batchDir));
    select(batchDir, group);
  };
  const focusNode = (id: string) => {
    const element = Array.from(
      tree.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [],
    ).find((node) => node.dataset.nodeId === id);
    element?.focus();
  };
  const keyboard = (
    event: KeyboardEvent<HTMLElement>,
    id: string,
    batchDir: string,
    group?: string,
    parentId?: string,
    branch = false,
  ) => {
    const visible = Array.from(
      tree.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [],
    );
    const index = visible.indexOf(event.currentTarget);
    switch (event.key) {
      case 'ArrowDown':
        visible[Math.min(index + 1, visible.length - 1)]?.focus();
        break;
      case 'ArrowUp':
        visible[Math.max(index - 1, 0)]?.focus();
        break;
      case 'Home':
        visible[0]?.focus();
        break;
      case 'End':
        visible.at(-1)?.focus();
        break;
      case 'ArrowRight':
        if (branch) {
          if (expanded.has(id)) visible[index + 1]?.focus();
          else toggle(id, true);
        }
        break;
      case 'ArrowLeft':
        if (branch && expanded.has(id)) toggle(id, false);
        else if (parentId) focusNode(parentId);
        break;
      case 'Enter':
      case ' ':
        if (branch) toggle(id, true);
        selectNode(batchDir, group);
        break;
      default:
        return;
    }
    event.preventDefault();
  };
  return (
    <TreeContext.Provider
      value={{
        expanded,
        focused,
        selected,
        selectedGroup,
        settingsOpen,
        busy,
        toggle,
        selectNode,
        setFocused,
        keyboard,
      }}
    >
      <div className={styles.explorerTree} role="tree" aria-label="工作区文件夹" ref={tree}>
        {nodes.map((node) => (
          <TreeNode key={node.id} node={node} level={1} />
        ))}
      </div>
    </TreeContext.Provider>
  );
}
