// @vitest-environment jsdom
import { useWorkspaceStore } from '../src/renderer/src/store/workspace.js';
import { seedWorkspace } from './store-helpers.js';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { defaultClaim, type ClaimState } from '../src/core/domain/claim.js';
import { applyTransition } from '../src/core/domain/transitions.js';
import { buildReport, checkBatch } from '../src/core/index.js';
import type { BatchView, WorkspaceView } from '../src/shared/api.js';
import { Results } from '../src/renderer/src/Results.js';
import { Overview } from '../src/renderer/src/Overview.js';
import { ClaimSummary } from '../src/renderer/src/claim/ClaimSummary.js';
import { batch, config, finding } from './helpers.js';

afterEach(cleanup);
const at = '2026-10-25T00:00:00.000Z';
const view = (state: ClaimState = 'draft'): BatchView => {
  const b = batch();
  const report = buildReport(checkBatch(b, config()));
  report.findings = [finding({ message: '合成待补材料', severity: 'error' })];
  return {
    batch: b,
    report,
    claim: { ...defaultClaim(b.id, at), state },
    waived: 0,
    markedAt: null,
    manualTasks: [],
    outputs: [],
  };
};
const workspace = (b: BatchView): WorkspaceView => ({
  kind: 'batch',
  dir: b.batch.dir,
  openedDir: b.batch.dir,
  selectedBatchDir: b.batch.dir,
  batches: [b],
  rejected: null,
});
function Harness() {
  const current = useWorkspaceStore((state) => state.view!.batches[0]!);
  Object.assign(window, {
    precheck: {
      transitionClaim: async (dir: string, to: ClaimState, note?: string) => {
        expect(dir).toBe('/synthetic');
        return workspace({ ...current, claim: applyTransition(current.claim, to, at, note) });
      },
      waiveFinding: async (dir: string, findingId: string, reason: string) => {
        expect(dir).toBe('/synthetic');
        expect(findingId).toBe(current.report.findings[0]!.id);
        return workspace({
          ...current,
          waived: 1,
          claim: { ...current.claim, waivers: [{ findingId, reason, at }] },
          report: {
            ...current.report,
            findings: current.report.findings.map((f) => ({ ...f, resolution: 'waived' })),
          },
        });
      },
      unwaiveFinding: async (dir: string, findingId: string) => {
        expect(dir).toBe('/synthetic');
        expect(findingId).toBe(current.report.findings[0]!.id);
        return workspace({
          ...current,
          waived: 0,
          claim: { ...current.claim, waivers: [] },
          report: {
            ...current.report,
            findings: current.report.findings.map((f) => ({ ...f, resolution: 'open' })),
          },
        });
      },
    },
  });
  return <Results view={current} />;
}

it('草稿只显示合法状态动作，学校报销单提示在草稿和待提交时可见', async () => {
  const initial = view();
  initial.batch.submitted = true;
  seedWorkspace(workspace(initial));
  render(<Harness />);
  const user = userEvent.setup();
  expect(screen.getByText('草稿').classList.contains('pill')).toBe(true);
  expect(screen.getByText('已找到学校报销单，可标记为已提交')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: /状态：草稿/ }));
  expect(screen.queryByRole('menuitem', { name: '标记为已提交' })).toBeNull();
  expect(screen.queryByRole('menuitem', { name: '标记为已退回' })).toBeNull();
  await user.click(screen.getByRole('menuitem', { name: '标记为待提交' }));
  expect(await screen.findByText('待提交')).toBeTruthy();
  expect(screen.getByText('已找到学校报销单，可标记为已提交')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: /状态：待提交/ }));
  await user.click(screen.getByRole('menuitem', { name: '标记为已提交' }));
  expect(await screen.findByText('已提交')).toBeTruthy();
  expect(screen.queryByText('已找到学校报销单，可标记为已提交')).toBeNull();
  expect(screen.queryByRole('button', { name: '撤销提交标记' })).toBeNull();
});

it.each(['已退回', '已拒绝'])('%s 状态必须填写非空备注，提交后显示新状态', async (label) => {
  seedWorkspace(workspace(view('submitted')));
  render(<Harness />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /状态：已提交/ }));
  await user.click(screen.getByRole('menuitem', { name: '标记为' + label }));
  const note = screen.getByRole('textbox', { name: '状态备注' });
  expect(document.activeElement).toBe(note);
  const save = screen.getByRole('button', { name: '保存状态' });
  expect(note.hasAttribute('required')).toBe(true);
  expect(save.hasAttribute('disabled')).toBe(true);
  await user.type(note, '   ');
  expect(save.hasAttribute('disabled')).toBe(true);
  await user.type(note, '需补充合成材料');
  await user.click(save);
  expect(await screen.findByText(label)).toBeTruthy();
  expect(screen.queryByRole('textbox', { name: '状态备注' })).toBeNull();
});

it('豁免理由必填，已豁免问题折叠为提示样式并可撤销', async () => {
  seedWorkspace(workspace(view()));
  render(<Harness />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /合成待补材料/ }));
  await user.click(screen.getByRole('button', { name: '豁免…' }));
  const reason = screen.getByRole('textbox', { name: '豁免理由' });
  const save = screen.getByRole('button', { name: '保存豁免' });
  expect(reason.hasAttribute('required')).toBe(true);
  expect(save.hasAttribute('disabled')).toBe(true);
  await user.type(reason, '   ');
  expect(save.hasAttribute('disabled')).toBe(true);
  await user.type(reason, '已核实合成材料无需补交');
  await user.click(save);
  expect(await screen.findByRole('button', { name: '已豁免 1' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /合成待补材料/ })).toBeNull();
  await user.click(screen.getByRole('button', { name: '已豁免 1' }));
  const summary = screen.getByRole('button', { name: /合成待补材料/ });
  expect(summary.closest('.finding')?.classList.contains('info')).toBe(true);
  if (summary.getAttribute('aria-expanded') !== 'true') await user.click(summary);
  expect(screen.getByText('已核实合成材料无需补交')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: '撤销豁免' }));
  expect(await screen.findByRole('button', { name: /合成待补材料/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: '已豁免 0' })).toBeTruthy();
  expect(screen.getByRole('button', { name: /合成待补材料/ }).closest('.finding')?.className).toBe(
    'finding error',
  );
});

it('只读批次显示状态，但不提供状态和豁免动作', async () => {
  const initial = view('submitted');
  initial.readOnly = true;
  seedWorkspace(workspace(initial));
  render(<Harness />);
  expect(screen.getByText('已提交')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /状态：/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /^标记为/ })).toBeNull();
  await userEvent.setup().click(screen.getByRole('button', { name: /合成待补材料/ }));
  expect(screen.queryByRole('button', { name: '豁免…' })).toBeNull();
});

it('总览批次表格显示中文状态徽标', () => {
  render(<Overview view={workspace(view('reimbursed'))} />);
  const card = screen.getByRole('button', { name: '20260102' }).closest('tr')!;
  expect(within(card).getByText('已报销').classList.contains('pill')).toBe(true);
});

it('批次汇总分列显示金额与数量，错误和警告数量排除已豁免问题', () => {
  const current = view();
  current.report.findings = [
    finding({ id: 'open-error', severity: 'error' }),
    finding({ id: 'waived-error', severity: 'error', resolution: 'waived' }),
    finding({ id: 'waived-warning', severity: 'warning', resolution: 'waived' }),
  ];
  render(
    <ClaimSummary
      report={current.report}
      pending={2}
      submitted={false}
      state="draft"
      dir="/synthetic"
    />,
  );
  const summary = within(screen.getByTestId('batch-summary'));
  for (const [label, value] of [
    ['CNY 合计', '100.00'],
    ['张数', '1'],
    ['待手填', '2'],
    ['错误', '1'],
    ['警告', '0'],
    ['已豁免', '2'],
  ]) {
    expect(summary.getByText(label!).parentElement?.textContent).toContain(value);
  }
});
