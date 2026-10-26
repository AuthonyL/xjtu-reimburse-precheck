// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { Overview } from '../src/renderer/src/Overview.js';
import { useWorkspaceStore } from '../src/renderer/src/store/workspace.js';
import { useStatusStore } from '../src/renderer/src/store/status.js';
import { useRouteStore } from '../src/renderer/src/store/route.js';
import { pageWorkspace } from './page-fixtures.js';
import { seedWorkspace } from './store-helpers.js';

afterEach(cleanup);
function setup() {
  const view = pageWorkspace();
  seedWorkspace(view);
  const calls: string[] = [];
  const api = {
    selectBatch: vi.fn(async () => {}),
    exportBatch: vi.fn(async (dir: string) => {
      calls.push(dir);
      await new Promise((resolve) => setTimeout(resolve, 5));
      return view;
    }),
    transitionClaim: vi.fn(async () => view),
  };
  Object.assign(window, { precheck: api });
  function Harness() {
    return <Overview view={useWorkspaceStore((state) => state.view!)} />;
  }
  render(<Harness />);
  return { api, calls, view, table: screen.getByRole('table', { name: '报销批次' }) };
}
it('按批次日期倒序展示表格，展开支出合计并可进入报销单和参考目录', () => {
  const { table } = setup();
  expect(screen.getByRole('heading', { level: 1, name: '批次总览' })).toBeTruthy();
  const rows = within(table).getAllByRole('row');
  expect(rows[1]!.textContent).toContain('20260103');
  expect(rows[2]!.textContent).toContain('20260102');
  for (const name of ['CNY 合计', '错误 / 警告 / 已豁免', '学校报销单', '最近流转'])
    expect(within(table).getByRole('columnheader', { name })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '展开支出合计 20260103' }));
  expect(screen.getByText('各支出内容合计')).toBeTruthy();
  fireEvent.click(within(table).getByRole('button', { name: '20260103' }));
  expect(useRouteStore.getState().route.page).toBe('claim');
  fireEvent.click(screen.getByRole('button', { name: '无法报销费用' }));
  expect(useRouteStore.getState().route.page).toBe('rejected');
});
it('全选、取消和部分选中可读，批量导出顺序执行并汇报数量', async () => {
  const { api, calls } = setup();
  const all = screen.getByRole('checkbox', { name: '全选批次' }) as HTMLInputElement;
  fireEvent.click(screen.getByRole('checkbox', { name: '选择 20260102' }));
  expect(all.indeterminate).toBe(true);
  fireEvent.click(all);
  expect(screen.getByText('已选 2 个批次')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '批量导出汇总' }));
  await waitFor(() => expect(useStatusStore.getState().notice).toBe('已导出 2 个批次'));
  expect(calls).toEqual(['/synthetic/20260103', '/synthetic/20260102']);
  expect(api.exportBatch).toHaveBeenCalledTimes(2);
  fireEvent.click(all);
  expect(screen.queryByRole('button', { name: '批量导出汇总' })).toBeNull();
});
it('批量待提交只执行允许的迁移，操作前显示跳过数量', async () => {
  const { api } = setup();
  fireEvent.click(screen.getByRole('checkbox', { name: '全选批次' }));
  expect(screen.getByText('将跳过 1 个不允许的批次')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '标记为待提交' }));
  await waitFor(() => expect(api.transitionClaim).toHaveBeenCalledTimes(1));
  expect(api.transitionClaim).toHaveBeenCalledWith('/synthetic/20260102', 'ready');
});
it('批量导出中途失败时保留已完成数量并停止', async () => {
  const { api } = setup();
  api.exportBatch.mockImplementationOnce(async () => pageWorkspace());
  api.exportBatch.mockRejectedValueOnce(new Error('合成写入失败'));
  fireEvent.click(screen.getByRole('checkbox', { name: '全选批次' }));
  fireEvent.click(screen.getByRole('button', { name: '批量导出汇总' }));
  await waitFor(() => expect(useStatusStore.getState().error).toContain('已导出 1 个批次'));
  expect(useStatusStore.getState().error).toContain('合成写入失败');
  expect(useStatusStore.getState().notice).toBe('');
});
