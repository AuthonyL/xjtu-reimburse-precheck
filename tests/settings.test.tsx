import { seedBatch } from './store-helpers.js';
import { onTestFinished } from 'vitest';
import { useRouteStore } from '../src/renderer/src/store/route.js';
import { defaultClaim } from '../src/core/domain/claim.js';
// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { render, screen, within, cleanup, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Settings } from '../src/renderer/src/Settings.js';
import { Results } from '../src/renderer/src/Results.js';
import { RejectedPage } from '../src/renderer/src/RejectedPage.js';
import { batch, config, finding } from './helpers.js';
import { buildReport, checkBatch } from '../src/core/index.js';
import { DEFAULT_BOC_URL, validateSettings } from '../src/main/store.js';
import type { AppSettings, BatchView } from '../src/shared/api.js';

it('规则目录生成标签和 F2 编辑器，关键字添加删除、恢复单项与校验保存', async () => {
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
  try {
    render(
      <Settings initial={{ rules: config(), bocUrl: DEFAULT_BOC_URL }} userData="/synthetic" />,
    );
    for (const label of ['规则', '附件识别', '分组', '支出内容', '通用', '高级（JSON）'])
      expect(screen.getByRole('tab', { name: label })).toBeTruthy();
    const card = within(screen.getByTestId('rule-F2'));
    await user.click(card.getByRole('button', { name: /^F2 ·/ }));
    await user.type(card.getByLabelText('横向限制关键字'), '合成限制词{Enter}');
    await user.click(screen.getByRole('button', { name: '保存设置' }));
    expect(saved!.rules.horizontalOnlyKeywords).toContain('合成限制词');
    await user.click(card.getByRole('button', { name: '删除 合成限制词' }));
    await user.click(card.getByRole('button', { name: '恢复此项默认' }));
    await user.click(screen.getByRole('button', { name: '保存设置' }));
    expect(saved!.rules.horizontalOnlyKeywords).not.toContain('合成限制词');
    await user.click(screen.getByRole('tab', { name: '附件识别' }));
    await user.click(screen.getByRole('button', { name: /^用途说明关键字/ }));
    expect(screen.getByRole('textbox', { name: '用途说明关键字' })).toBeTruthy();
  } finally {
    cleanup();
  }
});

it('报销单头部之后首个内容区为待处理问题，显示 action 并可定位分组', async () => {
  const b = batch();
  const report = buildReport(checkBatch(b, config()));
  report.findings = [
    finding({
      ruleId: 'F2',
      severity: 'warning',
      message: '合成问题',
      action: '合成处理办法',
      invoiceNumbers: [b.invoices[0]!.number],
      files: [],
      groupId: '根目录',
    }),
  ];
  let located = '';
  useRouteStore.setState({ route: { page: 'claim', dir: b.dir } });
  Object.assign(window, { precheck: { selectBatch: async () => {} } });
  const unsubscribe = useRouteStore.subscribe((state) => {
    located = state.route.group ?? '';
  });
  onTestFinished(unsubscribe);
  try {
    const result = render(
      <Results
        view={seedBatch({
          batch: b,
          report,
          manualTasks: [],
          claim: defaultClaim('synthetic-view', '2026-01-01'),
          waived: 0,
          markedAt: null,
          outputs: [],
        })}
      />,
    );
    expect(
      result.container
        .querySelector('section:not([aria-label^="流转记录"])')
        ?.getAttribute('aria-label'),
    ).toBe('待处理问题');
    expect(screen.queryByText('合成处理办法')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: /合成处理办法|合成问题/ }));
    expect(screen.getByText('合成处理办法')).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: '定位到分组 →' }));
    expect(located).toBe('根目录');
  } finally {
    cleanup();
  }
});

it('拒票页显示推断样式、允许编辑已记录原因并通过受限 API 保存', async () => {
  const b = batch();
  const view: BatchView = {
    batch: b,
    report: buildReport(checkBatch(b, config())),
    claim: defaultClaim('synthetic-view', '2026-01-01'),
    waived: 0,
    markedAt: null,
    outputs: [],
    manualTasks: [],
    readOnly: true,
    rejectedInfo: [
      { number: b.invoices[0]!.number, inferred: [{ ruleId: 'F2', name: '只能走横向经费' }] },
    ],
  };
  let reason = '';
  Object.assign(window, {
    precheck: {
      saveRejectedReason: async (_number: string, text: string) => {
        reason = text;
        return { batches: [] };
      },
    },
  });
  try {
    render(<RejectedPage view={view} />);
    expect(screen.getByText(/可能：F2/).className).toContain('inferred');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '记录原因' }));
    await user.type(screen.getByLabelText('拒票原因'), '合成拒票原因');
    await user.click(screen.getByRole('button', { name: '保存原因' }));
    await waitFor(() => expect(reason).toBe('合成拒票原因'));
  } finally {
    cleanup();
  }
});
