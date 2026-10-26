// @vitest-environment jsdom
import { afterEach, expect, it, onTestFinished } from 'vitest';
import { cleanup, render, screen, within, act } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { seedWorkspace } from './store-helpers.js';
import { routeForDir, useRouteStore } from '../src/renderer/src/store/route.js';
import { Sidebar } from '../src/renderer/src/Sidebar.js';
import { checkLabor } from '../src/core/labor/engine.js';
import type { WorkspaceView } from '../src/shared/api.js';
import { laborScan } from './labor-fixtures.js';
import { config } from './helpers.js';
import { view } from './disclosure-fixtures.js';
afterEach(cleanup);
it('侧栏所有展开入口互斥，折叠不改变选择，恢复深层劳务时只展开祖先', async () => {
  const a = view();
  a.batch = { ...a.batch, id: 'A', dir: '/root/A' };
  const b = view();
  b.batch = { ...b.batch, id: 'B', dir: '/root/B' };
  const scan = laborScan();
  scan.dir = '/root/A/劳务费';
  const workspace: WorkspaceView = {
    kind: 'root',
    dir: '/root',
    openedDir: '/root',
    selectedBatchDir: null,
    batches: [a, b],
    rejected: null,
    labor: [{ report: checkLabor(scan, config()), outputs: [] }],
  };
  let selected = '';
  const unsubscribe = useRouteStore.subscribe((state) => {
    selected = state.route.dir ?? '';
  });
  onTestFinished(unsubscribe);
  Object.assign(window, { precheck: { selectBatch: async () => {} } });
  seedWorkspace(workspace);
  const sidebar = (selection: string | null) => {
    act(() =>
      useRouteStore.setState(({ revision }) => ({
        route: routeForDir(workspace, selection),
        revision: revision + 1,
      })),
    );
    return <Sidebar />;
  };
  const result = render(sidebar(scan.dir));
  selected = '';
  const user = userEvent.setup();
  const aNode = screen.getByRole('treeitem', { name: /^A，/ });
  const bNode = screen.getByRole('treeitem', { name: /^B，/ });
  expect(aNode.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByRole('treeitem', { name: /劳务费/ }).getAttribute('aria-expanded')).toBe(
    'true',
  );
  bNode.focus();
  await user.keyboard('{ArrowRight}');
  expect(aNode.getAttribute('aria-expanded')).toBe('false');
  expect(bNode.getAttribute('aria-expanded')).toBe('true');
  expect(screen.queryByRole('treeitem', { name: /林示例/ })).toBeNull();
  await user.keyboard('{ArrowLeft}');
  expect(selected).toBe('');
  await user.keyboard('{Enter}');
  expect(selected).toBe('/root/B');
  await user.click(within(aNode).getByLabelText('展开批次'));
  expect(bNode.getAttribute('aria-expanded')).toBe('false');
  expect(screen.getByRole('treeitem', { name: /劳务费/ }).getAttribute('aria-expanded')).toBe(
    'false',
  );
  result.rerender(sidebar(scan.dir));
  // A new selection event also handles selecting the same directory again.
  result.rerender(sidebar('/root/B'));
  result.rerender(sidebar(scan.dir));
  expect(aNode.getAttribute('aria-expanded')).toBe('true');
  expect(bNode.getAttribute('aria-expanded')).toBe('false');
  expect(screen.getByRole('treeitem', { name: /劳务费/ }).getAttribute('aria-expanded')).toBe(
    'true',
  );
});

it('从树外切换批次并收起原分支后，键盘仍可通过 Tab 进入可见节点', async () => {
  const a = view();
  a.batch = { ...a.batch, id: 'A', dir: '/root/A' };
  const b = view();
  b.batch = { ...b.batch, id: 'B', dir: '/root/B' };
  const workspace: WorkspaceView = {
    kind: 'root',
    dir: '/root',
    openedDir: '/root',
    selectedBatchDir: '/root/A',
    batches: [a, b],
    rejected: null,
  };
  seedWorkspace(workspace);
  Object.assign(window, { precheck: { selectBatch: async () => {} } });
  const sidebar = (selected: string | null) => {
    act(() =>
      useRouteStore.setState(({ revision }) => ({
        route: routeForDir(workspace, selected),
        revision: revision + 1,
      })),
    );
    return <Sidebar />;
  };
  const result = render(sidebar('/root/A'));
  await userEvent.setup().click(screen.getByRole('treeitem', { name: /齐全根目录/ }));
  result.rerender(sidebar('/root/B'));
  const tabStops = screen.getAllByRole('treeitem').filter((node) => node.tabIndex === 0);
  expect(tabStops).toHaveLength(1);
  expect(tabStops[0]?.getAttribute('data-batch-id')).toBe('B');
});
