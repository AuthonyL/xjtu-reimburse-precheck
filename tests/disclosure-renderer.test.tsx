// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { finding, Harness, rows, item } from './disclosure-fixtures.js';
afterEach(cleanup);
it('问题默认收起、可同时展开两条，摘要按钮关联详情区域', async () => {
  const user = userEvent.setup();
  render(<Harness findings={rows} />);
  expect(screen.queryByText(/怎么处理/)).toBeNull();
  expect(item('one').getAttribute('aria-expanded')).toBe('false');
  await user.click(item('one'));
  await user.click(item('two'));
  expect(screen.getAllByText(/怎么处理/)).toHaveLength(2);
  const id = item('one').getAttribute('aria-controls')!;
  expect(document.getElementById(id)?.textContent).toContain('处理-one');
  expect(item('one').textContent).toContain('1 张票');
});

it('规则计数按数量排列，筛选可取消，全部展开收起只作用于当前筛选', async () => {
  const user = userEvent.setup();
  render(<Harness findings={rows} />);
  const badges = screen.getAllByRole('button', { name: /只看规则/ });
  expect(badges.map((b) => b.textContent)).toEqual(['F2 ×2', 'R2 ×1']);
  await user.click(item('three'));
  await user.click(badges[0]!);
  expect(screen.queryByRole('button', { name: /问题-three/ })).toBeNull();
  const warning = screen.getByRole('group', { name: '问题级别' }).parentElement!;
  await user.click(within(warning).getByRole('button', { name: '全部展开' }));
  expect(screen.getAllByText(/怎么处理/)).toHaveLength(2);
  await user.click(within(warning).getByRole('button', { name: '全部收起' }));
  expect(screen.queryByText(/怎么处理/)).toBeNull();
  await user.click(badges[0]!);
  expect(item('three').getAttribute('aria-expanded')).toBe('true');
  await user.click(badges[1]!);
  expect(screen.queryByRole('button', { name: /问题-one/ })).toBeNull();
});

it('重新检查以问题键保留展开，删除已解决键，新问题默认收起；目录互不影响', async () => {
  const user = userEvent.setup();
  const result = render(<Harness findings={rows} />);
  await user.click(item('one'));
  result.rerender(
    <Harness findings={[{ ...rows[0]!, message: '问题-one（重新检查）' }, rows[2]!]} />,
  );
  expect(item('one').getAttribute('aria-expanded')).toBe('true');
  result.rerender(<Harness findings={[rows[2]!]} />);
  expect(screen.queryByRole('button', { name: /问题-one/ })).toBeNull();
  result.rerender(<Harness findings={rows} />);
  expect(item('one').getAttribute('aria-expanded')).toBe('false');
  await user.click(item('one'));
  result.rerender(<Harness findings={rows} dir="/other" />);
  expect(item('one').getAttribute('aria-expanded')).toBe('false');
  result.rerender(<Harness findings={rows} />);
  expect(item('one').getAttribute('aria-expanded')).toBe('true');
});

it('提示默认隐藏，展开提示段后仍以收起条目显示', async () => {
  const user = userEvent.setup();
  render(<Harness findings={[{ ...finding('F1', 'stamp'), severity: 'info' }]} />);
  expect(screen.queryByRole('button', { name: /问题-stamp/ })).toBeNull();
  await user.click(screen.getByRole('button', { name: '提示 1' }));
  expect(item('stamp').getAttribute('aria-expanded')).toBe('false');
  await user.click(item('stamp'));
  expect(screen.getByText('处理-stamp')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: '提示 1' }));
  await user.click(screen.getByRole('button', { name: '提示 1' }));
  expect(item('stamp').getAttribute('aria-expanded')).toBe('true');
});
