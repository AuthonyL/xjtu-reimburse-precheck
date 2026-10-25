// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CorrectionAction, CorrectionProvider } from '../src/renderer/src/SingleFileCheck.js';
import { CorrectionNoticeProvider } from '../src/renderer/src/CorrectionNotice.js';
import type { CorrectionPreview } from '../src/core/correction/types.js';
import type { Finding } from '../src/core/types.js';
import type { WorkspaceView } from '../src/shared/api.js';
import { batch, config, finding as makeFinding } from './helpers.js';
import { checkBatch, buildReport } from '../src/core/index.js';
const run = async (action: () => Promise<unknown>) => {
  await action();
};
const finding = (message: string, severity: Finding['severity'] = 'warning'): Finding =>
  makeFinding({
    ruleId: 'R2',
    severity,
    message,
    action: '补材料',
    files: [],
    invoiceNumbers: [],
  });
const target = { id: 'target', label: '合成缺失材料', kind: 'attachment' as const, folder: 'AI' };
const preview = (
  overrides: Partial<Extract<CorrectionPreview, { status: 'checked' }>> = {},
): CorrectionPreview => ({
  status: 'checked',
  token: 'token',
  passed: true,
  resolved: true,
  target: target.label,
  destination: '/batch/new.pdf',
  operations: [],
  added: [],
  remaining: [],
  blockers: [],
  ...overrides,
});
const view = (): WorkspaceView => {
  const b = batch();
  b.dir = '/batch';
  return {
    kind: 'batch',
    dir: '/batch',
    openedDir: '/batch',
    selectedBatchDir: '/batch',
    batches: [
      {
        batch: b,
        report: buildReport(checkBatch(b, config())),
        manualTasks: [],
        outputs: [],
        markedAt: null,
        replacements: {
          version: 1,
          records: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              kind: 'apply',
              at: '2026-01-02',
              target: '合成目标',
              targetKey: 'key',
              source: '/outside/new.pdf',
              destination: 'new.pdf',
              archived: [],
              inserted: [],
            },
          ],
        },
      },
    ],
    rejected: null,
  };
};
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function setup(result: CorrectionPreview) {
  const choose = vi.fn(async () => '/outside/new.pdf');
  const commit = vi.fn(async () => view());
  const undo = vi.fn(async () => view());
  Object.assign(window, {
    precheck: {
      correctionTargets: async () => [target],
      chooseCorrectionFile: choose,
      previewCorrection: async () => result,
      confirmCorrection: commit,
      cancelCorrection: async () => {},
      undoCorrection: undo,
    },
  });
  const update = vi.fn();
  render(
    <CorrectionProvider dir="/batch" run={run} update={update}>
      <CorrectionAction global />
    </CorrectionProvider>,
  );
  return { choose, commit, undo, update };
}
async function select() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '检查单个文件' }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '或从文件夹选择…' }));
  });
}
it('通过自动提交，无确认框；警告计数排除 info，详情不列旧问题，toast可撤销本次记录', async () => {
  const api = setup(
    preview({
      added: [finding('新的警告'), finding('不要展示的已找到提示', 'info')],
      remaining: [finding('无关旧问题', 'error')],
    }),
  );
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '检查单个文件' }));
  });
  expect(api.choose).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '或从文件夹选择…' }));
  });
  expect(api.commit).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog')).toBeNull();
  const toast = screen.getByTestId('correction-toast');
  expect(toast.textContent).toContain('新增 1 条警告');
  expect(toast.textContent).not.toContain('已找到');
  await act(async () => {
    fireEvent.click(within(toast).getByRole('button', { name: '查看详情' }));
  });
  const detail = screen.getByRole('dialog');
  expect(detail.textContent).toContain('新的警告');
  expect(detail.textContent).not.toContain('不要展示');
  expect(detail.textContent).not.toContain('无关旧问题');
  await act(async () => {
    fireEvent.click(within(detail).getByRole('button', { name: '关闭' }));
    fireEvent.click(within(toast).getByRole('button', { name: '撤销' }));
  });
  expect(api.undo).toHaveBeenCalledWith('/batch', '11111111-1111-4111-8111-111111111111');
  expect(screen.queryByTestId('correction-toast')).toBeNull();
});
it('失败只列目标和新文件问题，不列 info 或无关旧问题，也不提交', async () => {
  const api = setup(
    preview({
      passed: false,
      resolved: false,
      targetRemaining: [finding('目标日期仍缺失', 'error')],
      added: [finding('新增格式警告'), finding('隐藏 info', 'info')],
      remaining: [finding('无关的其他发票问题', 'error')],
    }),
  );
  await select();
  expect(api.commit).not.toHaveBeenCalled();
  const dialog = screen.getByRole('dialog');
  expect(dialog.textContent).toContain('目标日期仍缺失');
  expect(dialog.textContent).toContain('新增格式警告');
  expect(dialog.textContent).not.toContain('隐藏 info');
  expect(dialog.textContent).not.toContain('无关的其他发票问题');
  expect(
    within(dialog)
      .getAllByRole('button')
      .map((b) => b.textContent),
  ).toEqual(['关闭']);
});
it('toast 在8秒后消失，也能手动关闭', async () => {
  vi.useFakeTimers();
  setup(preview());
  await select();
  expect(screen.getByTestId('correction-toast')).toBeTruthy();
  await act(() => vi.advanceTimersByTimeAsync(7999));
  expect(screen.getByTestId('correction-toast')).toBeTruthy();
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(screen.queryByTestId('correction-toast')).toBeNull();
  await select();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '关闭放入提示' }));
  });
  expect(screen.queryByTestId('correction-toast')).toBeNull();
});
