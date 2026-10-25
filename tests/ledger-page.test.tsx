// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { LedgerPage } from '../src/renderer/src/ledger/LedgerPage.js';
import { useRouteStore } from '../src/renderer/src/store/route.js';
import { useStatusStore } from '../src/renderer/src/store/status.js';
import { useWorkspaceStore } from '../src/renderer/src/store/workspace.js';
import { pageWorkspace } from './page-fixtures.js';
import { seedWorkspace } from './store-helpers.js';
import type { Registry } from '../src/core/domain/registry.js';

afterEach(cleanup);
const registry: Registry = {
  version: 1,
  entries: [
    {
      number: 'SYNTH-LEDGER-A',
      claimId: '20260102',
      batchDir: '/synthetic/20260102',
      state: 'draft',
      seller: '合成销方',
      total: 100,
      currency: 'CNY',
      date: '2026-01-02',
      seenAt: '2026-01-05',
    },
    {
      number: 'SYNTH-LEDGER-B',
      claimId: 'external',
      batchDir: '/elsewhere/历史批次',
      state: 'submitted',
      seller: '历史销方',
      total: 20,
      currency: 'USD',
      date: '2026-01-03',
      seenAt: '2026-01-06',
    },
  ],
};
function setup() {
  const view = pageWorkspace();
  view.batches[1]!.claim.state = 'reimbursed';
  view.batches[0]!.claim.claimant = '合成经办';
  view.batches[0]!.claim.fund = 'vertical';
  view.batches[0]!.claim.waivers = [
    { findingId: 'stale-synthetic', reason: '旧问题已消失', at: '2026-01-01' },
  ];
  seedWorkspace(view);
  const api = {
    registry: vi.fn(async () => registry),
    exportLedger: vi.fn(async () => '/synthetic/_预检/台账.md'),
    revealFile: vi.fn(async () => {}),
    selectBatch: vi.fn(async () => {}),
  };
  Object.assign(window, { precheck: api });
  render(<LedgerPage />);
  return api;
}
it('报销单表按状态筛选、显示已报销合计，点击批次进入报销单', async () => {
  setup();
  const table = screen.getByRole('table', { name: '报销单台账' });
  expect(within(table).getAllByRole('row')).toHaveLength(3);
  expect(screen.getByTestId('ledger-summary').textContent).toContain('草稿 1');
  expect(screen.getByTestId('ledger-summary').textContent).toContain('已报销 1');
  expect(screen.getByTestId('ledger-summary').textContent).toContain('300.00');
  expect(within(table).getByText('合成经办')).toBeTruthy();
  expect(within(table).getByText('纵向')).toBeTruthy();
  const first = within(table)
    .getAllByRole('row')
    .find((row) => row.textContent?.includes('合成经办'))!;
  expect(within(first).getAllByRole('cell').at(-1)?.textContent).toBe('0');
  fireEvent.change(screen.getByRole('combobox', { name: '报销状态' }), {
    target: { value: 'reimbursed' },
  });
  expect(within(table).getAllByRole('row')).toHaveLength(2);
  fireEvent.click(within(table).getByRole('button', { name: '20260103' }));
  expect(useRouteStore.getState().route.page).toBe('claim');
});
it('发票登记簿搜索发票号、销方和批次，外部记录标记其他目录', async () => {
  setup();
  await userEvent.setup().click(screen.getByRole('tab', { name: '发票登记簿' }));
  const table = await screen.findByRole('table', { name: '发票登记簿' });
  await within(table).findByText('SYNTH-LEDGER-B');
  expect(within(table).getByText('历史批次（其他目录）')).toBeTruthy();
  const search = screen.getByRole('searchbox', { name: '搜索登记簿' });
  for (const value of ['SYNTH-LEDGER-B', '历史销方', '历史批次']) {
    fireEvent.change(search, { target: { value } });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).queryByText('SYNTH-LEDGER-A')).toBeNull();
  }
  fireEvent.change(search, { target: { value: '没有匹配' } });
  expect(screen.getByText('没有符合条件的登记记录。')).toBeTruthy();
});
it('导出后提供文件夹显示入口', async () => {
  const api = setup();
  fireEvent.click(screen.getByRole('button', { name: '导出台账 Markdown' }));
  await screen.findByText('/synthetic/_预检/台账.md');
  expect(api.exportLedger).toHaveBeenCalledTimes(1);
  expect(useStatusStore.getState().notice).toContain('/synthetic/_预检/台账.md');
  fireEvent.click(screen.getByRole('button', { name: '在文件夹中显示' }));
  await waitFor(() => expect(api.revealFile).toHaveBeenCalledWith('/synthetic/_预检/台账.md'));
});
it('登记簿读取失败显示错误，重试后恢复数据', async () => {
  const api = setup();
  api.registry.mockRejectedValueOnce(new Error('合成读取失败'));
  const { act } = await import('@testing-library/react');
  act(() => useWorkspaceStore.getState().setView({ ...useWorkspaceStore.getState().view! }));
  await userEvent.setup().click(screen.getByRole('tab', { name: '发票登记簿' }));
  expect((await screen.findByRole('alert')).textContent).toContain('合成读取失败');
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  await screen.findByText('SYNTH-LEDGER-B');
  expect(screen.queryByRole('alert')).toBeNull();
});
it('切换工作区不显示过期登记记录或导出路径', async () => {
  const api = setup();
  let resolve!: (value: Registry) => void;
  api.registry.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const next = { ...pageWorkspace(), dir: '/next' };
  const { act } = await import('@testing-library/react');
  act(() => useWorkspaceStore.getState().setView(next));
  act(() => useWorkspaceStore.getState().setView({ ...next, dir: '/latest' }));
  await act(async () => resolve({ version: 1, entries: [] }));
  await userEvent.setup().click(screen.getByRole('tab', { name: '发票登记簿' }));
  await screen.findByText('SYNTH-LEDGER-B');
});
