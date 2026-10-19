// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { App } from '../src/renderer/src/App.js';
import { WorkspaceService } from '../src/main/workspace.js';
import { DesktopStore } from '../src/main/store.js';
import { Results } from '../src/renderer/src/Results.js';
import { batch, config } from './helpers.js';
import { buildReport, checkBatch } from '../src/core/index.js';

it('问题列表默认显示错误和警告，提示按数量折叠并可展开', async () => {
  const b = batch();
  const report = buildReport(checkBatch(b, config()));
  report.findings = ['error', 'warning', 'info'].map((severity) => ({
    severity: severity as 'error' | 'warning' | 'info',
    ruleId: 'synthetic',
    message: '合成问题-' + severity,
    action: '合成处理办法',
    invoiceNumbers: [],
    files: [],
  }));
  try {
    render(
      <Results
        view={{ batch: b, report, markedAt: null, outputs: [], manualTasks: [] }}
        run={async (action) => {
          await action();
        }}
        update={() => {}}
        back={() => {}}
      />,
    );
    expect(screen.getByText('合成问题-error')).toBeTruthy();
    expect(screen.getByText('合成问题-warning')).toBeTruthy();
    expect(screen.queryByText('合成问题-info')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: '显示 1 条提示' }));
    expect(screen.getByText('合成问题-info')).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: '收起提示' }));
    expect(screen.queryByText('合成问题-info')).toBeNull();
  } finally {
    cleanup();
  }
});

it('中文界面真实服务串联：打开、确认候选、手填外币、导出、提交和撤销', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'precheck-renderer-'));
  const dir = join(temp, '20260102');
  try {
    await mkdir(join(dir, 'AI'), { recursive: true });
    await writeFile(join(dir, 'AI/abcdef.jpg'), 'synthetic image');
    const store = new DesktopStore(join(temp, 'user-data'));
    const service = new WorkspaceService(store);
    Object.assign(window, {
      precheck: {
        bootstrap: async () => ({
          settings: await store.settings(),
          recent: [],
          userData: store.dir,
        }),
        onEvent: () => () => {},
        openFolder: (path: string) => service.open(path),
        confirmAttachment: service.confirm.bind(service),
        saveManual: service.manual.bind(service),
        exportBatch: service.export.bind(service),
        markSubmitted: service.mark.bind(service),
        recheck: () => service.refresh(),
        selectBatch: service.select.bind(service),
        saveLayout: store.saveLayout.bind(store),
      },
    });
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('文件夹路径'), dir);
    await user.click(screen.getByRole('button', { name: '打开路径' }));
    await screen.findByTestId('batch-summary');
    const group = within(screen.getByTestId('group-AI'));
    await user.click(group.getByRole('button', { name: /AI/ }));
    expect(group.getByTestId('requirement-payment').textContent).toContain('待确认');
    await user.click(group.getByRole('button', { name: '是支付记录' }));
    await waitFor(() =>
      expect(
        within(screen.getByTestId('group-AI')).getByTestId('requirement-payment').textContent,
      ).toContain('已找到'),
    );
    await user.click(screen.getByRole('button', { name: /^手填与汇率/ }));
    const form = within(screen.getByTestId('manual-form'));
    await user.type(form.getByLabelText('金额', { exact: true }), '20');
    await user.type(form.getByLabelText('支付日期'), '2026-01-02');
    await user.type(form.getByLabelText('汇率（每1外币兑人民币）'), '7');
    await user.click(form.getByRole('button', { name: '保存手填' }));
    await waitFor(() =>
      expect(screen.getByTestId('batch-summary').textContent).toContain('140.00'),
    );
    await user.click(screen.getByRole('button', { name: '导出到批次文件夹' }));
    await user.click(screen.getByRole('button', { name: /^输出文件/ }));
    await waitFor(() =>
      expect(screen.getByTestId('export-list').textContent).toContain('入库登记清单.xlsx'),
    );
    expect(await readdir(join(dir, '_预检'))).toEqual(
      expect.arrayContaining(['manual.json', '入库登记清单.xlsx', '高值材料明细.xlsx', '汇总.md']),
    );
    await user.click(screen.getByRole('button', { name: '标记本批已提交' }));
    await screen.findByRole('button', { name: '撤销提交标记' });
    expect(await store.history()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: '撤销提交标记' }));
    await screen.findByRole('button', { name: '标记本批已提交' });
    expect(await store.history()).toHaveLength(0);
  } finally {
    cleanup();
    await rm(temp, { recursive: true, force: true });
  }
});

it('启动恢复树与批次；分组定位高亮、键盘折叠、侧栏快捷键和右侧设置可用', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'precheck-layout-'));
  try {
    const root = join(temp, 'synthetic-root');
    for (const date of ['20260102', '20260103']) {
      await mkdir(join(root, date, 'AI'), { recursive: true });
      await writeFile(join(root, date, 'AI/abcdef.jpg'), 'synthetic');
    }
    const store = new DesktopStore(join(temp, 'user-data'));
    const service = new WorkspaceService(store);
    await service.open(root);
    await service.select(
      service.batch((await service.restore()).workspace!.batches[1]!.batch.dir).batch.dir,
    );
    Object.assign(window, {
      precheck: {
        bootstrap: async () => ({
          settings: await store.settings(),
          recent: [],
          userData: store.dir,
          restored: await service.restore(),
          session: await store.session(),
        }),
        onEvent: () => () => {},
        selectBatch: service.select.bind(service),
        saveLayout: store.saveLayout.bind(store),
      },
    });
    const user = userEvent.setup();
    render(<App />);
    const tree = await screen.findByRole('tree', { name: '工作区文件夹' });
    const dates = within(tree)
      .getAllByRole('treeitem')
      .filter((n) => n.getAttribute('aria-level') === '1');
    expect(dates.map((n) => n.getAttribute('data-batch-id'))).toEqual(['20260103', '20260102']);
    expect(dates[1]!.getAttribute('aria-selected')).toBe('true');
    dates[0]!.focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(dates[1]);
    await user.click(within(tree).getByRole('treeitem', { name: /AI/ }));
    expect(screen.getByTestId('group-AI').classList.contains('group-highlight')).toBe(true);
    const card = screen.getByTestId('group-AI');
    await user.click(within(card).getByRole('button', { name: /AI/ }));
    expect(within(card).queryByTestId('requirement-payment')).toBeNull();
    await user.click(dates[0]!);
    expect(within(screen.getByTestId('group-AI')).queryByTestId('requirement-payment')).toBeNull();
    await user.click(dates[1]!);
    expect(within(screen.getByTestId('group-AI')).queryByTestId('requirement-payment')).toBeNull();
    await user.click(within(tree).getByRole('treeitem', { name: /AI/ }));
    expect(within(screen.getByTestId('group-AI')).getByTestId('requirement-payment')).toBeTruthy();
    dates[1]!.focus();
    await user.keyboard('{ArrowLeft}');
    expect(dates[1]!.getAttribute('aria-expanded')).toBe('false');
    await user.keyboard('{ArrowRight}');
    expect(dates[1]!.getAttribute('aria-expanded')).toBe('true');
    await user.keyboard('{ArrowRight}{ArrowDown}{Enter}');
    expect(document.activeElement?.textContent).toContain('AI');
    expect(screen.getByTestId('group-AI').classList.contains('group-highlight')).toBe(true);
    const separator = screen.getByRole('separator', { name: '调整侧栏宽度' });
    separator.focus();
    await user.keyboard('{End}');
    await waitFor(async () => expect((await store.session()).sidebarWidth).toBe(480));
    await user.keyboard('{Home}');
    await waitFor(async () => expect((await store.session()).sidebarWidth).toBe(220));
    await user.keyboard('{Control>}b{/Control}');
    expect(screen.queryByRole('tree')).toBeNull();
    await user.click(screen.getByRole('button', { name: /展开侧栏/ }));
    await user.click(screen.getByRole('button', { name: '⚙ 设置' }));
    expect(screen.getByRole('heading', { name: '设置' })).toBeTruthy();
    expect(screen.getByRole('tree')).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: '分组' }));
    expect(screen.queryByRole('button', { name: '规则' })).toBeNull();
    await user.click(screen.getByRole('tab', { name: '规则' }));
    expect(screen.getByRole('tab', { name: '规则' }).getAttribute('aria-selected')).toBe('true');
    await waitFor(async () => expect((await store.session()).sidebarCollapsed).toBe(false));
  } finally {
    cleanup();
    await rm(temp, { recursive: true, force: true });
  }
});

it('上次目录失效时首页显示恢复提示，仍可粘贴路径', async () => {
  Object.assign(window, {
    precheck: {
      bootstrap: async () => ({
        settings: { rules: config() },
        recent: [],
        userData: '/synthetic',
        restored: { workspace: null, message: '上次的文件夹已不存在：/synthetic/missing' },
      }),
      onEvent: () => () => {},
    },
  });
  try {
    render(<App />);
    expect(await screen.findByText('上次的文件夹已不存在：/synthetic/missing')).toBeTruthy();
    expect(screen.getByLabelText('文件夹路径')).toBeTruthy();
  } finally {
    cleanup();
  }
});
