// @vitest-environment jsdom
import { afterEach, expect, it, onTestFinished, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { App } from '../src/renderer/src/App.js';
import { Shell } from '../src/renderer/src/Shell.js';
import { useWorkspaceStore } from '../src/renderer/src/store/workspace.js';
import { useStatusStore } from '../src/renderer/src/store/status.js';
import uiStyles from '../src/renderer/src/styles/ui.module.css';
import { buildReport, checkBatch } from '../src/core/index.js';
import { defaultClaim } from '../src/core/domain/claim.js';
import { groupAnchor } from '../src/shared/navigation.js';
import { batch, config } from './helpers.js';
import { resetStores, seedBatch, seedSettings, seedWorkspace } from './store-helpers.js';
import { pageWorkspace } from './page-fixtures.js';

afterEach(cleanup);
it('重复分组定位都在展开后的 DOM 提交后滚动，手动展开不会再次定位', async () => {
  const current = batch();
  seedBatch({
    batch: current,
    report: buildReport(checkBatch(current, config())),
    claim: defaultClaim(current.id, '2026-01-01'),
    waived: 0,
    markedAt: null,
    manualTasks: [],
    outputs: [],
  });
  seedSettings({ rules: config(), bocUrl: 'synthetic' });
  const bootstrap = {
    ...useWorkspaceStore.getState().boot!,
    restored: { workspace: useWorkspaceStore.getState().view, message: null },
  };
  resetStores();
  Object.assign(window, {
    precheck: {
      bootstrap: async () => bootstrap,
      onEvent: () => () => {},
      selectBatch: async () => {},
    },
  });
  const original = HTMLElement.prototype.scrollIntoView;
  const expandedWhenScrolled: boolean[] = [];
  HTMLElement.prototype.scrollIntoView = vi.fn(function (this: HTMLElement) {
    if (this.id === groupAnchor('根目录'))
      expandedWhenScrolled.push(
        this.querySelector('[class*="_groupSummary_"]')?.getAttribute('aria-expanded') === 'true',
      );
  });
  onTestFinished(() => {
    HTMLElement.prototype.scrollIntoView = original;
  });
  render(<App />);
  await screen.findByTestId('batch-summary');
  const user = userEvent.setup();
  const target = () => within(screen.getByRole('tree')).getByRole('treeitem', { name: /根目录/ });
  const summary = () =>
    within(screen.getByTestId('group-根目录')).getByRole('button', { name: /根目录/ });
  await user.click(target());
  expect(expandedWhenScrolled).toEqual([true]);
  await user.click(summary());
  await user.click(summary());
  expect(expandedWhenScrolled).toEqual([true]);
  await user.click(summary());
  await user.click(target());
  expect(expandedWhenScrolled).toEqual([true, true]);
});

async function renderShell(workspace = true) {
  const view = workspace ? pageWorkspace() : null;
  if (view) seedWorkspace(view);
  seedSettings({ rules: config(), bocUrl: 'synthetic' });
  const bootstrap = {
    ...useWorkspaceStore.getState().boot!,
    restored: { workspace: view, message: null },
  };
  const api = {
    bootstrap: vi.fn(async () => bootstrap),
    onEvent: () => () => {},
    inbox: vi.fn(async () => []),
    selectBatch: vi.fn(async () => {}),
    revealFile: vi.fn(async () => {}),
  };
  Object.assign(window, { precheck: api });
  await act(async () => {
    render(
      <Shell>
        <main>
          <h1>合成页面</h1>
        </main>
      </Shell>,
    );
  });
  return { api, view, header: screen.getByRole('banner') };
}
it('顶栏只保留应用名和可显示工作区的完整路径，侧栏不重复根名', async () => {
  const { api, view, header } = await renderShell();
  expect(within(header).getByText('报销预检')).toBeTruthy();
  expect(screen.queryByText('课题组票据核对')).toBeNull();
  const path = within(header).getByRole('button', { name: '在文件夹中显示当前工作区' });
  expect(path.textContent).toBe(view!.dir);
  expect(path.classList.contains(uiStyles.path!)).toBe(true);
  expect(within(screen.getByRole('complementary')).queryByText('synthetic')).toBeNull();
  fireEvent.click(path);
  await waitFor(() => expect(api.revealFile).toHaveBeenCalledWith(view!.dir));
});
it('忙碌状态只在顶栏播报一次，保留操作禁用并在结束后显示通知', async () => {
  const { header } = await renderShell();
  act(() => useStatusStore.setState({ busy: true, notice: '已保存' }));
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(within(header).getByRole('status').textContent).toBe('◌ 正在检查，请稍候…');
  expect(screen.getByTestId('result-pane').getAttribute('aria-busy')).toBe('true');
  expect(screen.getByRole('button', { name: '全部重新检查' }).hasAttribute('disabled')).toBe(true);
  act(() => useStatusStore.setState({ busy: false }));
  const status = within(header).getByRole('status');
  expect(status.textContent).toContain('已保存');
  fireEvent.click(within(status).getByRole('button', { name: '关闭' }));
  expect(screen.queryByRole('status')).toBeNull();
});
it('顶栏错误可关闭，无工作区时仍可进入设置和返回首页', async () => {
  const { header } = await renderShell(false);
  act(() => useStatusStore.setState({ error: '合成错误' }));
  const alert = within(header).getByRole('alert');
  expect(alert.textContent).toContain('合成错误');
  fireEvent.click(within(alert).getByRole('button', { name: '关闭' }));
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.click(within(header).getByRole('button', { name: '⚙ 设置' }));
  fireEvent.click(within(header).getByRole('button', { name: '返回首页' }));
  expect(within(header).getByRole('button', { name: '⚙ 设置' })).toBeTruthy();
});
