// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ClaimStatus } from '../src/renderer/src/claim/ClaimStatus.js';
import { ClaimHeader } from '../src/renderer/src/claim/ClaimHeader.js';
import { CorrectionContext } from '../src/renderer/src/correction/context.js';
import { defaultClaim, type ClaimState } from '../src/core/domain/claim.js';
import { seedWorkspace } from './store-helpers.js';
import { pageWorkspace } from './page-fixtures.js';

afterEach(cleanup);
it('元数据表单位于动作页头之后，未修改直接导出仍执行一次', async () => {
  const view = pageWorkspace();
  const current = view.batches[0]!;
  const exportBatch = vi.fn(async () => view);
  Object.assign(window, { precheck: { exportBatch } });
  seedWorkspace(view);
  render(<ClaimHeader id={current.batch.id} dir={current.batch.dir} claim={current.claim} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '编辑' }));
  expect(screen.getByRole('form', { name: '报销单信息' }).closest('header')).toBeNull();
  await user.click(screen.getByRole('textbox', { name: '经办人' }));
  await user.click(screen.getByRole('button', { name: '导出到批次文件夹' }));
  expect(exportBatch).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('form', { name: '报销单信息' })).toBeNull();
});
it.each<[ClaimState, string[]]>([
  ['draft', ['标记为待提交', '标记为已拒绝', '标记为已取消']],
  ['ready', ['标记为已提交', '标记为已拒绝', '标记为草稿', '标记为已取消']],
  ['submitted', ['标记为已报销', '标记为已退回', '标记为已拒绝', '标记为草稿', '标记为已取消']],
  ['returned', ['标记为草稿', '标记为已取消']],
])('%s 状态菜单只列出可迁移目标', async (state, targets) => {
  render(<ClaimStatus claim={{ ...defaultClaim('合成', '2026-01-01'), state }} dir="/synthetic" />);
  await userEvent.setup().click(screen.getByRole('button', { name: /状态：/ }));
  expect(
    within(screen.getByRole('menu'))
      .getAllByRole('menuitem')
      .map((item) => item.textContent),
  ).toEqual(targets);
});

it('状态菜单支持键盘打开、移动、关闭和选择目标', async () => {
  const view = pageWorkspace();
  const transitionClaim = vi.fn(async () => view);
  Object.assign(window, { precheck: { transitionClaim } });
  seedWorkspace(view);
  render(<ClaimStatus claim={view.batches[0]!.claim} dir="/synthetic/20260102" />);
  const trigger = screen.getByRole('button', { name: /状态：草稿/ });
  const user = userEvent.setup();
  trigger.focus();
  await user.keyboard('{ArrowDown}');
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '标记为待提交' }));
  await user.keyboard('{ArrowDown}');
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '标记为已拒绝' }));
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('menu')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await user.keyboard('{ArrowDown}{Enter}');
  expect(transitionClaim).toHaveBeenCalledWith('/synthetic/20260102', 'ready', undefined);
});

it.each<ClaimState>(['reimbursed', 'rejected', 'cancelled'])('%s 没有可用状态迁移', (state) => {
  render(<ClaimStatus claim={{ ...defaultClaim('合成', '2026-01-01'), state }} dir="/synthetic" />);
  expect(screen.getByRole('button', { name: /状态：/ }).hasAttribute('disabled')).toBe(true);
  expect(screen.queryByRole('menuitem')).toBeNull();
});

it('批次标题保留唯一导出主按钮，其余动作通过更多菜单执行', async () => {
  const view = pageWorkspace();
  const current = view.batches[0]!;
  const open = vi.fn();
  const exportBatch = vi.fn(async () => view);
  const recheck = vi.fn(async () => view);
  const openOutput = vi.fn(async () => {});
  Object.assign(window, { precheck: { exportBatch, recheck, openOutput } });
  seedWorkspace(view);
  render(
    <CorrectionContext.Provider value={open}>
      <ClaimHeader id={current.batch.id} dir={current.batch.dir} claim={current.claim} />
    </CorrectionContext.Provider>,
  );
  const user = userEvent.setup();
  expect(screen.getByRole('heading', { level: 1, name: '20260102' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '检查单个文件' })).toBeNull();
  await user.click(screen.getByRole('button', { name: '导出到批次文件夹' }));
  expect(exportBatch).toHaveBeenCalledWith('/synthetic/20260102');
  for (const [label, action] of [
    ['检查单个文件', open],
    ['重新检查', recheck],
    ['打开输出文件夹', openOutput],
  ] as const) {
    await user.click(screen.getByRole('button', { name: /更多/ }));
    await user.click(screen.getByRole('menuitem', { name: label }));
    expect(action).toHaveBeenCalledTimes(1);
  }
  expect(open).toHaveBeenCalledWith({});
  expect(recheck).toHaveBeenCalledWith('/synthetic/20260102');
  expect(openOutput).toHaveBeenCalledWith('/synthetic/20260102');
});
