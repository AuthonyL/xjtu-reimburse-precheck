import { seedBatch } from './store-helpers.js';
// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { App } from '../src/renderer/src/App.js';
import { WorkspaceService } from '../src/main/workspace.js';
import { DesktopStore } from '../src/main/store.js';
import { Results } from '../src/renderer/src/Results.js';
import { batch, config, finding } from './helpers.js';
import { buildReport, checkBatch } from '../src/core/index.js';
import { defaultClaim } from '../src/core/domain/claim.js';

it('问题列表默认显示错误和警告，提示按数量折叠并可展开', async () => {
  const b = batch();
  const report = buildReport(checkBatch(b, config()));
  report.findings = ['error', 'warning', 'info'].map((severity) =>
    finding({
      severity: severity as 'error' | 'warning' | 'info',
      ruleId: 'synthetic',
      message: '合成问题-' + severity,
      action: '合成处理办法',
      invoiceNumbers: [],
      files: [],
    }),
  );
  try {
    render(
      <Results
        view={seedBatch({
          batch: b,
          report,
          claim: defaultClaim(b.id, '2026-10-25T00:00:00.000Z'),
          waived: 0,
          markedAt: null,
          outputs: [],
          manualTasks: [],
        })}
      />,
    );
    expect(screen.getByText('合成问题-error')).toBeTruthy();
    expect(screen.getByText('合成问题-warning')).toBeTruthy();
    expect(screen.queryByText('合成问题-info')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: '提示 1' }));
    expect(screen.getByText('合成问题-info')).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: '提示 1' }));
    expect(screen.queryByText('合成问题-info')).toBeNull();
  } finally {
    cleanup();
  }
});

it('中文界面真实服务串联：打开、确认候选、手填外币、导出和报销状态持久化', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'precheck-renderer-')));
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
        transitionClaim: service.transitionClaim.bind(service),
        waiveFinding: service.waiveFinding.bind(service),
        unwaiveFinding: service.unwaiveFinding.bind(service),
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
    await user.click(screen.getByRole('button', { name: /^状态：/ }));
    await user.click(screen.getByRole('menuitem', { name: '标记为待提交' }));
    await screen.findByText('待提交');
    await user.click(screen.getByRole('button', { name: /^状态：/ }));
    await user.click(screen.getByRole('menuitem', { name: '标记为已提交' }));
    await screen.findByText('已提交');
    expect(JSON.parse(await readFile(join(dir, '_预检/claim.json'), 'utf8')).state).toBe(
      'submitted',
    );
    expect(await store.history()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /^状态：/ }));
    await user.click(screen.getByRole('menuitem', { name: '标记为草稿' }));
    await screen.findByText('草稿');
    expect(await store.history()).toHaveLength(0);
    expect(JSON.parse(await readFile(join(dir, '_预检/claim.json'), 'utf8')).state).toBe('draft');
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
