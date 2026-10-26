// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { seedBatch } from './store-helpers.js';
import { reconcileDisclosures } from '../src/renderer/src/disclosures.js';
import { Results } from '../src/renderer/src/Results.js';
import type { WorkspaceView } from '../src/shared/api.js';
import { view } from './disclosure-fixtures.js';
afterEach(cleanup);
it('分组全部默认收起，概述统计三态，全部展开收起可用', async () => {
  const b = view();
  const original = b.report.groups[0]!;
  b.report.findings = [];
  b.report.groups = ['missing', 'unconfirmed', 'found', 'empty'].map((status) => ({
    ...original,
    group: { ...original.group, id: status, name: status },
    requirements:
      status === 'empty'
        ? []
        : [
            {
              id: 'payment:' + status,
              type: 'payment',
              ruleIds: ['R2'],
              reason: '合成材料',
              invoiceNumbers: [],
              foundFiles: [],
              candidateFiles: [],
              status: status as 'missing' | 'unconfirmed' | 'found',
            },
          ],
  }));
  const user = userEvent.setup();
  render(<Results view={seedBatch(b)} />);
  const header = (name: string) =>
    within(screen.getByTestId('group-' + name)).getByRole('button', { name: new RegExp(name) });
  expect(header('missing').getAttribute('aria-expanded')).toBe('false');
  expect(header('unconfirmed').getAttribute('aria-expanded')).toBe('false');
  expect(header('found').getAttribute('aria-expanded')).toBe('false');
  expect(header('empty').getAttribute('aria-expanded')).toBe('false');
  expect(header('missing').textContent).toContain('✗ 1');
  const groups = screen.getByRole('region', { name: '分组与材料' });
  await user.click(within(groups).getByRole('button', { name: '全部收起' }));
  expect(within(groups).queryByTestId('requirement-payment')).toBeNull();
  await user.click(within(groups).getByRole('button', { name: '全部展开' }));
  expect(within(groups).getAllByTestId('requirement-payment')).toHaveLength(3);
});

it('材料组默认收起，手动展开后刷新仍保留，手动收起不被新状态覆盖', () => {
  const b = view();
  b.report.groups[0]!.requirements = [
    {
      id: 'payment',
      type: 'payment',
      ruleIds: ['R2'],
      reason: '合成',
      status: 'missing',
      foundFiles: [],
      candidateFiles: [],
      invoiceNumbers: [],
    },
  ];
  const workspace: WorkspaceView = {
    kind: 'batch',
    dir: b.batch.dir,
    openedDir: b.batch.dir,
    selectedBatchDir: b.batch.dir,
    batches: [b],
    rejected: null,
  };
  const initial = reconcileDisclosures({}, workspace);
  expect(initial[b.batch.dir]?.groups?.['根目录']).toBe(false);
  const opened = {
    ...initial,
    [b.batch.dir]: { ...initial[b.batch.dir], groups: { 根目录: true } },
  };
  b.report.groups[0]!.requirements[0]!.status = 'found';
  const refreshed = reconcileDisclosures(opened, workspace);
  expect(refreshed[b.batch.dir]?.groups?.['根目录']).toBe(true);
  const closed = {
    ...refreshed,
    [b.batch.dir]: { ...refreshed[b.batch.dir], groups: { 根目录: false } },
  };
  b.report.groups[0]!.requirements[0]!.status = 'missing';
  expect(reconcileDisclosures(closed, workspace)[b.batch.dir]?.groups?.['根目录']).toBe(false);
});
