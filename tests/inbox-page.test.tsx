// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { InboxItem } from '../src/core/types.js';
import { InboxPage } from '../src/renderer/src/inbox/InboxPage.js';
import { Sidebar } from '../src/renderer/src/Sidebar.js';
import { RequirementChecklist } from '../src/renderer/src/claim/RequirementChecklist.js';
import { useWorkspaceStore } from '../src/renderer/src/store/workspace.js';
import { useRouteStore } from '../src/renderer/src/store/route.js';
import { useStatusStore } from '../src/renderer/src/store/status.js';
import { seedWorkspace } from './store-helpers.js';
import { pageWorkspace } from './page-fixtures.js';

afterEach(cleanup);
const item = (changes: Partial<InboxItem> = {}): InboxItem => ({
  path: '/synthetic/20260102/PCB/photo.png',
  relativePath: 'PCB/photo.png',
  batchDir: '/synthetic/20260102',
  group: 'PCB',
  kind: 'unnamed',
  suggestions: ['payment', 'inventory', 'contract', 'store'],
  ...changes,
});
function setup(items = [item()]) {
  const view = pageWorkspace();
  seedWorkspace(view);
  const inbox = vi.fn(async () => items);
  const confirmAttachment = vi.fn(async () => {
    items = [];
    return { ...view };
  });
  const ignoreFile = vi.fn(async () => {
    items = [];
    return { ...view };
  });
  Object.assign(window, {
    precheck: {
      inbox,
      confirmAttachment,
      ignoreFile,
      selectBatch: vi.fn(async () => {}),
      recheck: vi.fn(async () => ({ ...view })),
      openFile: vi.fn(async () => {}),
      revealFile: vi.fn(async () => {}),
    },
  });
  return { view, inbox, confirmAttachment, ignoreFile };
}
it('按批次列出种类、组和最多三个建议，文件可打开及定位', async () => {
  setup([
    item(),
    item({
      path: '/synthetic/20260103/broken.pdf',
      relativePath: 'broken.pdf',
      batchDir: '/synthetic/20260103',
      kind: 'parseFailed',
      group: '根目录',
      suggestions: [],
    }),
    item({
      path: '/synthetic/20260102/unknown.txt',
      relativePath: 'unknown.txt',
      kind: 'unidentified',
    }),
  ]);
  render(<InboxPage />);
  expect(await screen.findByRole('heading', { name: '20260102' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: '20260103' })).toBeTruthy();
  expect(screen.getByText('未命名附件')).toBeTruthy();
  expect(screen.getByText('解析失败')).toBeTruthy();
  expect(screen.getByText('未识别')).toBeTruthy();
  const row = screen.getByRole('article', { name: 'photo.png' });
  expect(within(row).getByText('PCB')).toBeTruthy();
  expect(within(row).getAllByRole('button', { name: /^是(?!收据)/ })).toHaveLength(3);
  fireEvent.click(within(row).getByRole('button', { name: 'photo.png' }));
  await waitFor(() => expect(window.precheck.openFile).toHaveBeenCalledWith(item().path));
  fireEvent.click(within(row).getByRole('button', { name: '在文件夹中显示 photo.png' }));
  await waitFor(() => expect(window.precheck.revealFile).toHaveBeenCalledWith(item().path));
});
it('建议分类调用现有 IPC，更新工作区和成功消息后刷新为空', async () => {
  const { confirmAttachment, view } = setup();
  render(<InboxPage />);
  fireEvent.click(await screen.findByRole('button', { name: '是支付记录' }));
  expect(await screen.findByText('收件箱是空的：所有文件都已识别。')).toBeTruthy();
  expect(confirmAttachment).toHaveBeenCalledWith(
    view.batches[0]!.batch.dir,
    'PCB/photo.png',
    'payment',
  );
  expect(useStatusStore.getState().notice).toBe('已标记为支付记录');
});
it('全部类型下拉可以分类，没有文件名建议时仍提供支付记录快捷操作', async () => {
  const { confirmAttachment } = setup([item({ suggestions: [] })]);
  render(<InboxPage />);
  expect(await screen.findByRole('button', { name: '是支付记录' })).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: '其他类型 photo.png' }), {
    target: { value: 'contract' },
  });
  await waitFor(() =>
    expect(confirmAttachment).toHaveBeenCalledWith(
      item().batchDir,
      item().relativePath,
      'contract',
    ),
  );
});
it('忽略后刷新，手填跳转保留所属批次和分组', async () => {
  const { ignoreFile } = setup();
  const { unmount } = render(<InboxPage />);
  fireEvent.click(await screen.findByRole('button', { name: '是收据，去手填' }));
  expect(useRouteStore.getState().route).toEqual({
    page: 'claim',
    dir: item().batchDir,
    group: 'PCB',
  });
  unmount();
  render(<InboxPage />);
  fireEvent.click(await screen.findByRole('button', { name: '忽略' }));
  expect(await screen.findByText('收件箱是空的：所有文件都已识别。')).toBeTruthy();
  expect(ignoreFile).toHaveBeenCalledWith(item().batchDir, item().relativePath);
});
it('工作区变化重新读取并丢弃过期请求，读取失败不能显示空状态', async () => {
  const { view, inbox } = setup();
  let finish!: (items: InboxItem[]) => void;
  inbox.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<InboxPage />);
  act(() => useWorkspaceStore.getState().setView({ ...view }));
  expect(await screen.findByRole('button', { name: 'photo.png' })).toBeTruthy();
  await act(async () => finish([]));
  expect(screen.queryByText('收件箱是空的：所有文件都已识别。')).toBeNull();
  inbox.mockRejectedValueOnce(new Error('合成读取失败'));
  act(() => useWorkspaceStore.getState().setView({ ...view }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', '合成读取失败');
});
it('侧栏显示待处理徽标及发票张数，页面选中可达，清空后隐藏收件箱徽标', async () => {
  const { view, inbox } = setup();
  render(<Sidebar />);
  const nav = screen.getByRole('navigation', { name: '工作区页面' });
  const button = await within(nav).findByRole('button', { name: '收件箱 1' });
  expect(within(nav).getByRole('button', { name: '发票列表 3 张' })).toBeTruthy();
  expect(
    within(nav)
      .getAllByRole('button')
      .map((node) => node.textContent),
  ).toEqual(['批次总览', '收件箱1', '发票列表3 张', '台账']);
  const batches = screen.getByRole('region', { name: '批次' });
  expect(within(batches).getByRole('button', { name: '打开其他文件夹' })).toBeTruthy();
  expect(within(batches).getByRole('button', { name: '全部重新检查' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '设置' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'synthetic' })).toBeNull();
  fireEvent.click(button);
  expect(button.getAttribute('aria-current')).toBe('page');
  expect(useRouteStore.getState().route.page).toBe('inbox');
  fireEvent.click(within(nav).getByRole('button', { name: '批次总览' }));
  expect(useRouteStore.getState().route.page).toBe('overview');
  expect(within(nav).getByRole('button', { name: '批次总览' }).getAttribute('aria-current')).toBe(
    'page',
  );
  inbox.mockResolvedValue([]);
  act(() => useWorkspaceStore.getState().setView({ ...view }));
  expect(await within(nav).findByRole('button', { name: '收件箱' })).toBeTruthy();
});
it('分组与材料保留集中处理链接', () => {
  setup();
  const report = pageWorkspace().batches[0]!.report;
  render(
    <RequirementChecklist
      groups={report.groups}
      counts={report.requirementCounts}
      dir={item().batchDir}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '到收件箱集中处理 →' }));
  expect(useRouteStore.getState().route.page).toBe('inbox');
});
