// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { InvoicesPage } from '../src/renderer/src/invoices/InvoicesPage.js';
import { useRouteStore } from '../src/renderer/src/store/route.js';
import { seedWorkspace } from './store-helpers.js';
import { pageWorkspace } from './page-fixtures.js';

afterEach(cleanup);
function setup() {
  seedWorkspace(pageWorkspace());
  Object.assign(window, { precheck: { selectBatch: vi.fn(async () => {}) } });
  render(<InvoicesPage />);
  return screen.getByRole('table', { name: '工作区发票' });
}
const rows = (table: HTMLElement) => within(table).getAllByRole('row').slice(1);
it('扁平化正式票与单列参考票，展示报告支出内容及原币，合计排除参考票与外币', () => {
  const table = setup();
  expect(screen.getByRole('heading', { level: 1, name: '发票列表' })).toBeTruthy();
  expect(rows(table)).toHaveLength(3);
  expect(rows(table)[0]!.textContent).toContain('办公费');
  expect(within(table).getByText('USD 20.00')).toBeTruthy();
  expect(screen.getByTestId('invoices-summary').textContent).toContain('3 张');
  expect(screen.getByTestId('invoices-summary').textContent).toContain('400.00');
  expect(screen.getByTestId('invoices-summary').textContent).toContain('外币 1 张未折算');
  expect(rows(screen.getByRole('table', { name: '无法报销费用（参考）' }))).toHaveLength(1);
});
it('重复号按不同正式批次数标记，多组不增加次数，参考票不增加次数', () => {
  const view = pageWorkspace();
  const first = view.batches[0]!;
  first.batch.groups.push({ ...first.batch.groups[0]!, id: '其他组', name: '其他组' });
  view.rejected!.batch.invoices[0]!.number = 'SYNTH-DUP';
  seedWorkspace(view);
  render(<InvoicesPage />);
  const table = screen.getByRole('table', { name: '工作区发票' });
  expect(
    within(table)
      .getAllByText('重复号')
      .every((node) => node.classList.contains('pill')),
  ).toBe(true);
  expect(within(table).getAllByLabelText('在 2 个批次出现').length).toBeGreaterThan(1);
});
it('关键字匹配号码、销方和品名，状态支持多选并更新合计', () => {
  const table = setup();
  const search = screen.getByRole('searchbox', { name: '搜索发票' });
  for (const [keyword, count] of [
    ['SYNTH-USD', 1],
    ['Zeta', 1],
    ['芯片', 1],
    ['合成', 3],
  ] as const) {
    fireEvent.change(search, { target: { value: keyword } });
    expect(rows(table)).toHaveLength(count);
  }
  fireEvent.click(screen.getByRole('checkbox', { name: '已提交' }));
  expect(rows(table)).toHaveLength(1);
  expect(screen.getByTestId('invoices-summary').textContent).toContain('300.00');
  fireEvent.click(screen.getByRole('checkbox', { name: '草稿' }));
  expect(rows(table)).toHaveLength(3);
});
it('支出内容与日期范围联合筛选，无日期不落入范围，空结果可读', () => {
  const table = setup();
  fireEvent.change(screen.getByRole('combobox', { name: '支出内容' }), {
    target: { value: '实验材料费' },
  });
  expect(rows(table)).toHaveLength(2);
  fireEvent.change(screen.getByLabelText('开始日期'), { target: { value: '2026-01-02' } });
  fireEvent.change(screen.getByLabelText('结束日期'), { target: { value: '2026-01-02' } });
  expect(rows(table)).toHaveLength(1);
  fireEvent.change(screen.getByLabelText('开始日期'), { target: { value: '2026-01-04' } });
  expect(screen.getByText('没有符合筛选条件的发票。')).toBeTruthy();
  expect(screen.getByTestId('invoices-summary').textContent).toContain('0 张');
});
it('日期默认倒序，日期、金额、销方列头切换排序', () => {
  const table = setup();
  expect(rows(table)[0]!.textContent).toContain('2026-01-03');
  fireEvent.click(within(table).getByRole('button', { name: '开票日期' }));
  expect(rows(table)[0]!.textContent).toContain('2026-01-02');
  fireEvent.click(within(table).getByRole('button', { name: '金额' }));
  expect(rows(table)[0]!.textContent).toContain('SYNTH-USD');
  fireEvent.click(within(table).getByRole('button', { name: '金额' }));
  expect(rows(table)[0]!.textContent).toContain('300.00');
  fireEvent.click(within(table).getByRole('button', { name: '销方' }));
  const ascending = rows(table).map((row) => row.textContent);
  fireEvent.click(within(table).getByRole('button', { name: '销方' }));
  expect(rows(table).map((row) => row.textContent)).not.toEqual(ascending);
});
it('点击所属批次跳到报销单并定位组，参考票跳到只读目录', () => {
  const table = setup();
  fireEvent.click(within(table).getByRole('button', { name: '20260103' }));
  expect(useRouteStore.getState().route).toEqual({
    page: 'claim',
    dir: '/synthetic/20260103',
    group: 'PCB',
  });
  const reference = screen.getByRole('table', { name: '无法报销费用（参考）' });
  fireEvent.click(within(reference).getByRole('button', { name: '无法报销费用' }));
  expect(useRouteStore.getState().route.page).toBe('rejected');
});
