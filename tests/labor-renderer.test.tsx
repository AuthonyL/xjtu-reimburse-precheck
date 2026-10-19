// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { checkLabor } from '../src/core/labor/engine.js';
import { loadConfig } from '../src/core/rules/config.js';
import { LaborPage } from '../src/renderer/src/LaborPage.js';
import { Settings } from '../src/renderer/src/Settings.js';
import { Sidebar } from '../src/renderer/src/Sidebar.js';
import { laborScan } from './labor-fixtures.js';
import { DEFAULT_BOC_URL, validateSettings } from '../src/main/store.js';
import type { AppSettings } from '../src/shared/api.js';
import type { LaborManualEntry } from '../src/core/labor/types.js';

afterEach(cleanup);
it('原件日期改变后重查，解析输入框与规范预览同步更新', async () => {
  const config = loadConfig();
  const scan = laborScan();
  const renderPage = () => (
    <LaborPage
      view={{ report: checkLabor(scan, config), outputs: [] }}
      config={config}
      run={async (action) => {
        await action();
      }}
      update={() => {}}
    />
  );
  const view = render(renderPage());
  await userEvent.setup().click(screen.getByRole('button', { name: /^抽取字段与手动补充/ }));
  await userEvent.setup().click(screen.getByRole('button', { name: /^生成规范情况说明/ }));
  scan.statements[0]!.parsed.dates = [{ date: '2026-12-01', precision: 'day' }];
  view.rerender(renderPage());
  expect((screen.getByLabelText('具体日期') as HTMLTextAreaElement).value).toBe('2026-12-01');
  expect((screen.getByLabelText('规范情况说明预览') as HTMLTextAreaElement).value).toContain(
    '2026 年 12 月 1 日',
  );
});
it('劳务树按情况说明路径定位，同姓名不混淆，显示状态和错误数', async () => {
  const scan = laborScan();
  scan.statements.push({
    ...scan.statements[0]!,
    relativePath: '错误说明.docx',
    path: scan.dir + '/错误说明.docx',
    parsed: { ...scan.statements[0]!.parsed, dates: [], mode: null },
  });
  let target = '';
  const report = checkLabor(scan, loadConfig());
  render(
    <Sidebar
      workspace={{
        kind: 'root',
        dir: '/synthetic',
        openedDir: '/synthetic',
        selectedBatchDir: null,
        batches: [],
        rejected: null,
        labor: [{ report, outputs: [] }],
      }}
      selected={null}
      settingsOpen={false}
      busy={false}
      width={280}
      select={(_dir, group) => {
        target = group ?? '';
      }}
      open={() => {}}
      refresh={() => {}}
      settings={() => {}}
      resize={() => {}}
      resized={() => {}}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('treeitem', { name: /劳务费/ }));
  const items = screen.getAllByRole('treeitem', { name: /林示例/ });
  expect(items).toHaveLength(2);
  await user.click(items[1]!);
  expect(target).toBe('错误说明.docx');
  expect(items[1]!.textContent).toContain('✗ 2');
});
it('问题在字段之前，手填与实时预览同步，保存及导出使用同一 labor 字段', async () => {
  const config = loadConfig();
  const scan = laborScan();
  let saved: LaborManualEntry = {};
  let copied = '';
  Object.assign(window, {
    precheck: {
      saveLabor: async (_dir: string, _file: string, entry: LaborManualEntry) => {
        saved = entry;
        return {};
      },
      exportLabor: async (_dir: string, _file: string, entry: LaborManualEntry) => {
        saved = entry;
        return {};
      },
      copyText: async (text: string) => {
        copied = text;
      },
    },
  });
  const user = userEvent.setup();
  const result = render(
    <LaborPage
      view={{ report: checkLabor(scan, config), outputs: [] }}
      config={config}
      run={async (action) => {
        await action();
      }}
      update={() => {}}
    />,
  );
  expect(
    result.container
      .querySelector('[data-testid="labor-entry"] section')
      ?.getAttribute('aria-label'),
  ).toBe('劳务问题');
  expect(
    Array.from(result.container.querySelectorAll('[data-testid="labor-entry"] > section')).map(
      (s) => s.getAttribute('aria-label'),
    ),
  ).toEqual(['劳务问题', '抽取字段与手动补充', '适用标准', '附件与发放表金额', '生成规范情况说明']);
  for (const title of ['抽取字段与手动补充', '附件与发放表金额', '生成规范情况说明'])
    await user.click(screen.getByRole('button', { name: new RegExp('^' + title) }));
  await user.clear(screen.getByLabelText('发放表金额'));
  await user.type(screen.getByLabelText('发放表金额'), '2000');
  await user.clear(screen.getByLabelText('具体日期'));
  await user.type(screen.getByLabelText('具体日期'), '2026-08-02{Enter}2026-09-06');
  await user.click(screen.getByRole('button', { name: '保存本笔并重新检查' }));
  expect(saved.tableAmount).toBe(2000);
  expect(saved.dates).toEqual([
    { date: '2026-08-02', precision: 'day' },
    { date: '2026-09-06', precision: 'day' },
  ]);
  await user.clear(screen.getByLabelText('姓名'));
  await user.type(screen.getByLabelText('姓名'), '陈示例');
  await user.clear(screen.getByLabelText('单位'));
  await user.type(screen.getByLabelText('单位'), '西安交通大学合成学院');
  expect((screen.getByLabelText('校内 / 校外') as HTMLSelectElement).value).toBe('internal');
  expect((screen.getByLabelText('规范情况说明预览') as HTMLTextAreaElement).value).toContain(
    '陈示例副教授',
  );
  await user.click(screen.getByRole('button', { name: '复制文本' }));
  expect(copied).toContain('陈示例副教授');
  await user.click(screen.getByRole('button', { name: '导出 Word' }));
  expect(saved.name).toBe('陈示例');
});
it('劳务标准标签可编辑数值和模板并通过真实配置校验', async () => {
  let saved: AppSettings | null = null;
  Object.assign(window, {
    precheck: {
      saveSettings: async (value: AppSettings) => {
        saved = validateSettings(value);
        return saved;
      },
    },
  });
  const user = userEvent.setup();
  render(
    <Settings
      initial={{ rules: loadConfig(), bocUrl: DEFAULT_BOC_URL }}
      userData="/synthetic"
      run={async (action) => {
        await action();
      }}
      changed={async () => {}}
    />,
  );
  await user.click(screen.getByRole('tab', { name: '劳务标准' }));
  await user.click(screen.getByRole('button', { name: /^咨询费 ·/ }));
  const table = within(screen.getByRole('table', { name: '咨询费标准（同时比较两套经费）' }));
  await user.clear(table.getByLabelText('上限 1'));
  await user.type(table.getByLabelText('上限 1'), '4600');
  const template = screen.getByLabelText('咨询情况说明模板');
  await user.type(template, '合成尾注');
  await user.click(screen.getByRole('button', { name: '保存设置' }));
  expect(saved!.rules.laborStandards.consultation[0]!.max).toBe(4600);
  expect(saved!.rules.labor.templates.consultation).toContain('合成尾注');
});

it('劳务卡片仅问题列表默认可见，其他四段收起，列表序号连续', () => {
  const scan = laborScan();
  scan.statements.push({
    ...scan.statements[0]!,
    relativePath: '另一说明.docx',
    path: scan.dir + '/另一说明.docx',
  });
  render(
    <LaborPage
      view={{ report: checkLabor(scan, loadConfig()), outputs: [] }}
      config={loadConfig()}
      run={async (action) => {
        await action();
      }}
      update={() => {}}
    />,
  );
  expect(screen.getAllByTestId('labor-ordinal').map((n) => n.textContent)).toEqual(['1.', '2.']);
  for (const card of screen.getAllByTestId('labor-entry')) {
    for (const title of ['抽取字段与手动补充', '适用标准', '附件与发放表金额', '生成规范情况说明'])
      expect(
        within(card)
          .getByRole('button', { name: new RegExp('^' + title) })
          .getAttribute('aria-expanded'),
      ).toBe('false');
  }
  expect(screen.queryByRole('textbox', { name: '姓名' })).toBeNull();
  expect(screen.queryByRole('button', { name: '导出 Word' })).toBeNull();
});
