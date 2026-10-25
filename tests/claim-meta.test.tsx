// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ClaimHeader } from '../src/renderer/src/claim/ClaimHeader.js';
import { useWorkspaceStore } from '../src/renderer/src/store/workspace.js';
import { useStatusStore } from '../src/renderer/src/store/status.js';
import { seedWorkspace } from './store-helpers.js';
import { pageWorkspace } from './page-fixtures.js';
import type { ClaimMeta } from '../src/shared/api.js';

afterEach(cleanup);
it('失焦保存不锁住全局操作，避免吞掉随后点击的导航或导出', async () => {
  const update = setup();
  fireEvent.change(screen.getByRole('textbox', { name: '经办人' }), {
    target: { value: '直接导出' },
  });
  fireEvent.blur(screen.getByRole('textbox', { name: '经办人' }));
  expect(useStatusStore.getState().busy).toBe(false);
  await screen.findByText('已保存');
  expect(update).toHaveBeenCalledTimes(1);
});
function setup(readOnly = false) {
  const view = pageWorkspace();
  const current = view.batches[0]!;
  current.claim.transitions = [
    { from: 'submitted', to: 'returned', at: '2026-01-04T08:00:00Z', note: '补充合成材料' },
  ];
  const updateClaim = vi.fn(async (_dir: string, meta: ClaimMeta) => ({
    ...view,
    batches: [{ ...current, claim: { ...current.claim, ...meta } }, view.batches[1]!],
  }));
  Object.assign(window, { precheck: { updateClaim } });
  seedWorkspace(view);
  function Harness() {
    const claim = useWorkspaceStore((state) => state.view!.batches[0]!.claim);
    return <ClaimHeader id="20260102" dir={current.batch.dir} claim={claim} readOnly={readOnly} />;
  }
  render(<Harness />);
  return updateClaim;
}
it('失焦保存元数据，保存按钮不重复写入，清空经费类型可以持久化', async () => {
  const update = setup();
  fireEvent.change(screen.getByRole('textbox', { name: '经办人' }), {
    target: { value: '合成经办人' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: '项目 / 经费卡' }), {
    target: { value: '合成项目' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: '经费类型' }), {
    target: { value: 'horizontal' },
  });
  fireEvent.blur(screen.getByRole('combobox', { name: '经费类型' }));
  await screen.findByText('已保存');
  expect(update).toHaveBeenLastCalledWith('/synthetic/20260102', {
    claimant: '合成经办人',
    project: '合成项目',
    fund: 'horizontal',
  });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  expect(update).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByRole('combobox', { name: '经费类型' }), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
  expect(update.mock.calls[1]![1].fund).toBeUndefined();
});
it('保存失败保留编辑值，展示错误并可重试', async () => {
  const update = setup();
  update.mockRejectedValueOnce(new Error('合成保存失败'));
  const input = screen.getByRole('textbox', { name: '经办人' }) as HTMLInputElement;
  fireEvent.change(input, { target: { value: '待重试' } });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() => expect(useStatusStore.getState().error).toBe('合成保存失败'));
  expect(input.value).toBe('待重试');
  expect(screen.queryByText('已保存')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await screen.findByText('已保存');
});
it('折叠流转记录展示中文状态、时间和备注，只读目录不显示编辑字段', () => {
  setup(true);
  expect(screen.queryByRole('textbox', { name: '经办人' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '流转记录（1）' }));
  expect(screen.getByText('已提交 → 已退回')).toBeTruthy();
  expect(screen.getByText('补充合成材料')).toBeTruthy();
  expect(screen.getByText(/2026-01-04/)).toBeTruthy();
});
