// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { FindingList } from '../src/renderer/src/FindingList.js';
import { finding } from './helpers.js';
afterEach(cleanup);
it('级别 chips 默认选错误和警告，按严重级合并排序，规则筛选和展开只作用于可见条目', async () => {
  const user = userEvent.setup();
  render(
    <FindingList
      scope="/synthetic"
      findings={[
        { finding: finding({ id: 'info', ruleId: 'F1', severity: 'info', message: '合成提示' }) },
        {
          finding: finding({
            id: 'waived',
            ruleId: 'R1',
            severity: 'error',
            resolution: 'waived',
            message: '合成豁免',
          }),
        },
        {
          finding: finding({
            id: 'warning',
            ruleId: 'R2',
            severity: 'warning',
            message: '合成警告',
          }),
        },
        { finding: finding({ id: 'error', ruleId: 'R1', severity: 'error', message: '合成错误' }) },
      ]}
    />,
  );
  expect(screen.getByRole('button', { name: '错误 1' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: '警告 1' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: '提示 1' }).getAttribute('aria-pressed')).toBe('false');
  expect(screen.getAllByRole('button', { name: '全部展开' })).toHaveLength(1);
  expect(screen.queryByRole('button', { name: /显示.*提示/ })).toBeNull();
  await user.click(screen.getByRole('button', { name: '提示 1' }));
  await user.click(screen.getByRole('button', { name: '已豁免 1' }));
  const rows = within(screen.getByRole('list', { name: '问题列表' })).getAllByRole('listitem');
  expect(rows.map((row) => row.textContent)).toEqual([
    expect.stringContaining('合成错误'),
    expect.stringContaining('合成警告'),
    expect.stringContaining('合成提示'),
    expect.stringContaining('合成豁免'),
  ]);
  await user.click(screen.getByRole('button', { name: '只看规则 R1' }));
  expect(screen.queryByRole('button', { name: /合成警告/ })).toBeNull();
  await user.click(screen.getByRole('button', { name: '全部展开' }));
  expect(screen.getAllByText(/怎么处理/)).toHaveLength(2);
  await user.click(screen.getByRole('button', { name: '全部收起' }));
  expect(screen.queryByText(/怎么处理/)).toBeNull();
});
it('空列表保留零计数 chips，全部展开收起不可用', () => {
  render(<FindingList scope="/synthetic" findings={[]} />);
  for (const name of ['错误 0', '警告 0', '提示 0', '已豁免 0'])
    expect(screen.getByRole('button', { name })).toBeTruthy();
  expect(screen.getByRole('button', { name: '全部展开' }).hasAttribute('disabled')).toBe(true);
});
