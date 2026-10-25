// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TreeNode } from '../src/renderer/src/sidebar/TreeNode.js';
import { TreeContext, type TreeState } from '../src/renderer/src/sidebar/TreeState.js';

afterEach(cleanup);
it('材料树节点保留状态、键盘焦点和选择目标', () => {
  const selectNode = vi.fn();
  const state: TreeState = {
    expanded: new Set(),
    focused: 'material',
    selected: 'batch',
    selectedGroup: '材料组',
    settingsOpen: false,
    busy: false,
    toggle: vi.fn(),
    selectNode,
    setFocused: vi.fn(),
    keyboard: vi.fn(),
  };
  render(
    <TreeContext.Provider value={state}>
      <TreeNode
        node={{ id: 'material', label: '材料组', batchDir: 'batch', status: 'missing' }}
        level={2}
        parentId="batch"
      />
    </TreeContext.Provider>,
  );
  const node = screen.getByRole('treeitem', { name: '缺失材料组' });
  expect(node.getAttribute('aria-selected')).toBe('true');
  expect(node.getAttribute('aria-level')).toBe('2');
  expect(node.tabIndex).toBe(0);
  fireEvent.click(node);
  expect(selectNode).toHaveBeenCalledWith('batch', '材料组');
});
