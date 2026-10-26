// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PageHeader } from '../src/renderer/src/ui.js';

afterEach(cleanup);
it('基础页头只有一个一级标题，可省略所有可选内容', () => {
  render(<PageHeader title="批次总览" />);
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('批次总览');
  expect(screen.queryByRole('button')).toBeNull();
});
it('统一呈现面包屑、标题徽标、副标题、操作和扩展内容', () => {
  const { container } = render(
    <PageHeader
      title="20260102"
      subtitle={<span>2 张 · 合计 ¥ 100.00</span>}
      leading={<nav aria-label="面包屑">批次总览 / 20260102</nav>}
      badge={<span>草稿</span>}
      actions={<button>导出汇总</button>}
      className="custom-header"
    >
      <p>经办人：合成经办</p>
    </PageHeader>,
  );
  expect(container.querySelector('.custom-header')).toBeTruthy();
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(screen.getByRole('navigation', { name: '面包屑' }).textContent).toContain('批次总览');
  expect(screen.getByText('草稿')).toBeTruthy();
  expect(screen.getByText('2 张 · 合计 ¥ 100.00')).toBeTruthy();
  expect(screen.getByRole('button', { name: '导出汇总' })).toBeTruthy();
  expect(screen.getByText('经办人：合成经办')).toBeTruthy();
});
