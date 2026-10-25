import { seedBatch } from './store-helpers.js';
import { onTestFinished } from 'vitest';
import { seedWorkspace } from './store-helpers.js';
import { routeForDir, useRouteStore } from '../src/renderer/src/store/route.js';
import { act } from '@testing-library/react';
// @vitest-environment jsdom
import { useEffect, useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { Finding } from '../src/core/types.js';
import type { BatchView, WorkspaceView } from '../src/shared/api.js';
import { buildReport, checkBatch } from '../src/core/index.js';
import { FindingList } from '../src/renderer/src/FindingItem.js';
import {
  DisclosureProvider,
  reconcileDisclosures,
  type DisclosureState,
} from '../src/renderer/src/disclosures.js';
import { Sidebar } from '../src/renderer/src/Sidebar.js';
import { checkLabor } from '../src/core/labor/engine.js';
import { laborScan } from './labor-fixtures.js';
import { Results } from '../src/renderer/src/Results.js';
import { batch, config, finding as makeFinding } from './helpers.js';
import { defaultClaim } from '../src/core/domain/claim.js';

afterEach(cleanup);
const finding = (ruleId: string, code: string): Finding =>
  makeFinding({
    ruleId,
    code,
    severity: 'warning',
    message: '问题-' + code,
    action: '处理-' + code,
    invoiceNumbers: ['SYNTH-1'],
    files: ['/synthetic/a.pdf'],
    groupId: '根目录',
  });
const view = (): BatchView => {
  const b = batch();
  return {
    batch: b,
    report: buildReport(checkBatch(b, config())),
    claim: defaultClaim(b.id, '2026-10-25T00:00:00.000Z'),
    waived: 0,
    markedAt: null,
    manualTasks: [],
    outputs: [],
  };
};
function Harness({ findings, dir = '/synthetic' }: { findings: Finding[]; dir?: string }) {
  const [state, setState] = useState<DisclosureState>({});
  useEffect(() => {
    const b = view();
    b.batch.dir = dir;
    b.report.findings = findings;
    const workspace: WorkspaceView = {
      kind: 'batch',
      dir,
      openedDir: dir,
      selectedBatchDir: dir,
      batches: [b],
      rejected: null,
    };
    setState((old) => reconcileDisclosures(old, workspace));
  }, [findings, dir]);
  return (
    <DisclosureProvider state={state} setState={setState}>
      <FindingList scope={dir} findings={findings.map((f) => ({ finding: f }))} />
    </DisclosureProvider>
  );
}
const rows = [finding('F2', 'one'), finding('F2', 'two'), finding('R2', 'three')];
const item = (code: string) => screen.getByRole('button', { name: new RegExp('问题-' + code) });
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
  const warning = screen.getByRole('region', { name: '警告' });
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

it('提示默认隐藏，展开提示段后仍以收起条目显示', async () => {
  const user = userEvent.setup();
  render(<Harness findings={[{ ...finding('F1', 'stamp'), severity: 'info' }]} />);
  expect(screen.queryByRole('button', { name: /问题-stamp/ })).toBeNull();
  await user.click(screen.getByRole('button', { name: '显示 1 条提示' }));
  expect(item('stamp').getAttribute('aria-expanded')).toBe('false');
  await user.click(item('stamp'));
  expect(screen.getByText('处理-stamp')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: '收起提示' }));
  await user.click(screen.getByRole('button', { name: '显示 1 条提示' }));
  expect(item('stamp').getAttribute('aria-expanded')).toBe('true');
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
it('侧栏所有展开入口互斥，折叠不改变选择，恢复深层劳务时只展开祖先', async () => {
  const a = view();
  a.batch = { ...a.batch, id: 'A', dir: '/root/A' };
  const b = view();
  b.batch = { ...b.batch, id: 'B', dir: '/root/B' };
  const scan = laborScan();
  scan.dir = '/root/A/劳务费';
  const workspace: WorkspaceView = {
    kind: 'root',
    dir: '/root',
    openedDir: '/root',
    selectedBatchDir: null,
    batches: [a, b],
    rejected: null,
    labor: [{ report: checkLabor(scan, config()), outputs: [] }],
  };
  let selected = '';
  const unsubscribe = useRouteStore.subscribe((state) => {
    selected = state.route.dir ?? '';
  });
  onTestFinished(unsubscribe);
  Object.assign(window, { precheck: { selectBatch: async () => {} } });
  seedWorkspace(workspace);
  const sidebar = (selection: string | null) => {
    act(() =>
      useRouteStore.setState(({ revision }) => ({
        route: routeForDir(workspace, selection),
        revision: revision + 1,
      })),
    );
    return <Sidebar />;
  };
  const result = render(sidebar(scan.dir));
  selected = '';
  const user = userEvent.setup();
  const aNode = screen.getByRole('treeitem', { name: /^A，/ });
  const bNode = screen.getByRole('treeitem', { name: /^B，/ });
  expect(aNode.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByRole('treeitem', { name: /劳务费/ }).getAttribute('aria-expanded')).toBe(
    'true',
  );
  bNode.focus();
  await user.keyboard('{ArrowRight}');
  expect(aNode.getAttribute('aria-expanded')).toBe('false');
  expect(bNode.getAttribute('aria-expanded')).toBe('true');
  expect(screen.queryByRole('treeitem', { name: /林示例/ })).toBeNull();
  await user.keyboard('{ArrowLeft}');
  expect(selected).toBe('');
  await user.keyboard('{Enter}');
  expect(selected).toBe('/root/B');
  await user.click(within(aNode).getByLabelText('展开批次'));
  expect(bNode.getAttribute('aria-expanded')).toBe('false');
  expect(screen.getByRole('treeitem', { name: /劳务费/ }).getAttribute('aria-expanded')).toBe(
    'false',
  );
  result.rerender(sidebar(scan.dir));
  // A new selection event also handles selecting the same directory again.
  result.rerender(sidebar('/root/B'));
  result.rerender(sidebar(scan.dir));
  expect(aNode.getAttribute('aria-expanded')).toBe('true');
  expect(bNode.getAttribute('aria-expanded')).toBe('false');
  expect(screen.getByRole('treeitem', { name: /劳务费/ }).getAttribute('aria-expanded')).toBe(
    'true',
  );
});

it('从树外切换批次并收起原分支后，键盘仍可通过 Tab 进入可见节点', async () => {
  const a = view();
  a.batch = { ...a.batch, id: 'A', dir: '/root/A' };
  const b = view();
  b.batch = { ...b.batch, id: 'B', dir: '/root/B' };
  const workspace: WorkspaceView = {
    kind: 'root',
    dir: '/root',
    openedDir: '/root',
    selectedBatchDir: '/root/A',
    batches: [a, b],
    rejected: null,
  };
  seedWorkspace(workspace);
  Object.assign(window, { precheck: { selectBatch: async () => {} } });
  const sidebar = (selected: string | null) => {
    act(() =>
      useRouteStore.setState(({ revision }) => ({
        route: routeForDir(workspace, selected),
        revision: revision + 1,
      })),
    );
    return <Sidebar />;
  };
  const result = render(sidebar('/root/A'));
  await userEvent.setup().click(screen.getByRole('treeitem', { name: /齐全根目录/ }));
  result.rerender(sidebar('/root/B'));
  const tabStops = screen.getAllByRole('treeitem').filter((node) => node.tabIndex === 0);
  expect(tabStops).toHaveLength(1);
  expect(tabStops[0]?.getAttribute('data-batch-id')).toBe('B');
});

it('同票多条查重提示可分别展开，删除或重排后保留对应来源的展开状态', async () => {
  const current = batch();
  const otherA = { ...batch(), id: '合成批次A' };
  const otherB = { ...batch(), id: '合成批次B' };
  const duplicates = checkBatch(current, config(), {
    otherBatches: [otherA, otherB],
    submittedHistory: new Set(['SYNTH-001']),
  }).findings.filter((f) => f.ruleId === 'dup');
  const result = render(<Harness findings={duplicates} />);
  const user = userEvent.setup();
  const a = screen.getByRole('button', { name: /与其他批次 合成批次A 重复/ });
  await user.click(a);
  expect(document.querySelectorAll('[class*="_findingDetails_"]')).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: /已提交历史/ }));
  expect(document.querySelectorAll('[class*="_findingDetails_"]')).toHaveLength(2);
  result.rerender(
    <Harness
      findings={[
        duplicates[2]!,
        {
          ...duplicates[0]!,
          message: '与合成批次A重复：已在 合成批次A 报销（该批次已有学校报销单）',
        },
      ]}
    />,
  );
  expect(document.querySelectorAll('[class*="_findingDetails_"]')).toHaveLength(2);
  expect(
    screen.getByRole('button', { name: /与合成批次A重复/ }).getAttribute('aria-expanded'),
  ).toBe('true');
});
it('收起提示时清除仅在提示中可见的筛选，避免错误警告被无形筛选隐藏', async () => {
  const user = userEvent.setup();
  render(
    <Harness
      findings={[finding('F2', 'warning'), { ...finding('F1', 'info'), severity: 'info' }]}
    />,
  );
  await user.click(screen.getByRole('button', { name: '显示 1 条提示' }));
  await user.click(screen.getByRole('button', { name: '只看规则 F1' }));
  expect(screen.queryByRole('button', { name: /问题-warning/ })).toBeNull();
  await user.click(screen.getByRole('button', { name: '收起提示' }));
  expect(item('warning')).toBeTruthy();
});

it('筛选规则在重查后变成折叠的提示时，自动恢复可见的问题列表', async () => {
  const user = userEvent.setup();
  const result = render(<Harness findings={rows} />);
  await user.click(screen.getByRole('button', { name: '只看规则 F2' }));
  result.rerender(<Harness findings={[{ ...rows[0]!, severity: 'info' }, rows[2]!]} />);
  expect(item('three')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /问题-one/ })).toBeNull();
});
