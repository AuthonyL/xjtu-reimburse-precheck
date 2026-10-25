import { onTestFinished } from 'vitest';
import { useRouteStore } from '../src/renderer/src/store/route.js';
import { act } from '@testing-library/react';
import { defaultClaim } from '../src/core/domain/claim.js';
// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { App } from '../src/renderer/src/App.js';
import { buildReport, checkBatch } from '../src/core/index.js';
import { batch, finding } from './helpers.js';
import { Settings } from '../src/renderer/src/Settings.js';
import { FindingList } from '../src/renderer/src/FindingItem.js';
import { RuleHelpProvider } from '../src/renderer/src/RuleHelp.js';
import { RULE_CATALOG } from '../src/core/rules/catalog.js';
import { config } from './helpers.js';
import { DEFAULT_BOC_URL, validateSettings } from '../src/main/store.js';
import type { AppSettings } from '../src/shared/api.js';
afterEach(cleanup);
it('规则组默认展开、规则收起且所有编号可见，收起时可切换启用，R14只读', async () => {
  let saved: AppSettings | null = null;
  Object.assign(window, {
    precheck: {
      saveSettings: async (value: AppSettings) => {
        saved = validateSettings(value);
        return saved;
      },
    },
  });
  render(<Settings initial={{ rules: config(), bocUrl: DEFAULT_BOC_URL }} userData="/synthetic" />);
  for (const rule of RULE_CATALOG)
    expect(
      within(screen.getByTestId('rule-' + rule.id))
        .getByRole('button', {
          name: new RegExp('^' + rule.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' ·'),
        })
        .getAttribute('aria-expanded'),
    ).toBe('false');
  expect(screen.queryByRole('textbox', { name: '横向限制关键字' })).toBeNull();
  const user = userEvent.setup();
  const card = within(screen.getByTestId('rule-F2'));
  await user.click(card.getByRole('checkbox', { name: '启用 F2' }));
  await user.click(screen.getByRole('button', { name: '保存设置' }));
  expect(saved!.rules.ruleOptions.F2.enabled).toBe(false);
  const retired = screen.getByTestId('retired-R14');
  expect(retired.textContent).toContain('已由 F2 代替');
  expect(within(retired).queryByRole('checkbox')).toBeNull();
  expect(within(retired).queryByRole('button')).toBeNull();
  await user.type(screen.getByRole('searchbox', { name: '搜索规则' }), '单日单公司');
  expect(screen.getByTestId('rule-R2')).toBeTruthy();
  expect(screen.queryByTestId('rule-F2')).toBeNull();
  await user.clear(screen.getByRole('searchbox', { name: '搜索规则' }));
  const freshCard = within(screen.getByTestId('rule-F2'));
  await user.click(freshCard.getByRole('button', { name: /^F2 ·/ }));
  await user.type(freshCard.getByLabelText('横向限制关键字'), '合成新词{Enter}');
  expect(freshCard.getByTestId('criteria-F2').textContent).toContain('等');
  expect(freshCard.getByTestId('criteria-F2').title).toContain('合成新词');
  await user.click(screen.getByRole('button', { name: '保存设置' }));
  expect(saved!.rules.horizontalOnlyKeywords).toContain('合成新词');
}, 15000);
it('从问题查看规则时显示原文、动态口径和编号含义，并可请求定位设置', async () => {
  let requested = '';
  const unsubscribe = useRouteStore.subscribe((state) => {
    requested = state.route.ruleId ?? '';
  });
  onTestFinished(unsubscribe);
  const c = config();
  c.thresholds.inventory = { value: 700, operator: '>' };
  render(
    <RuleHelpProvider rules={c}>
      <FindingList
        scope="/synthetic"
        findings={[
          {
            finding: finding({
              ruleId: 'R1/R11',
              severity: 'warning',
              message: '合成入库问题',
              action: '补入库',
              invoiceNumbers: [],
              files: [],
            }),
          },
        ]}
      />
    </RuleHelpProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /合成入库问题/ }));
  const explanation = screen.getByRole('region', { name: '规则说明' });
  expect(explanation.textContent).toContain('R1 = README 第 1 条');
  expect(explanation.textContent).toContain('R11 = README 第 11 条');
  expect(explanation.querySelectorAll('.rule-explanation')).toHaveLength(2);
  expect(within(explanation).getAllByText('当前级别：警告')).toHaveLength(2);
  expect(explanation.textContent?.match(/判定口径：/g)).toHaveLength(2);
  expect(explanation.textContent).toContain('金额超过500要入库单');
  expect(explanation.textContent).toContain('> 700 元');
  const rules = within(explanation).getAllByRole('button', { name: '在设置中查看 / 修改 →' });
  await user.click(rules[1]!);
  expect(requested).toBe('R11');
});
it('规则定位请求展开来源和规则，清除搜索并允许编辑', async () => {
  const props = {
    initial: { rules: config(), bocUrl: DEFAULT_BOC_URL },
    userData: '/synthetic',
  };
  const result = render(<Settings {...props} />);
  const user = userEvent.setup();
  await user.type(screen.getByRole('searchbox', { name: '搜索规则' }), 'R1');
  act(() => useRouteStore.getState().navigate({ page: 'rules', ruleId: 'F2' }));
  await waitFor(() =>
    expect((screen.getByRole('searchbox', { name: '搜索规则' }) as HTMLInputElement).value).toBe(
      '',
    ),
  );
  expect(
    within(screen.getByTestId('rule-F2'))
      .getByRole('button', { name: /^F2 ·/ })
      .getAttribute('aria-expanded'),
  ).toBe('true');
  expect(screen.getByRole('textbox', { name: '横向限制关键字' })).toBeTruthy();
});

it('规则按搜索结果全部展开收起，附件和分组编辑器默认收起', async () => {
  const user = userEvent.setup();
  render(<Settings initial={{ rules: config(), bocUrl: DEFAULT_BOC_URL }} userData="/synthetic" />);
  await user.type(screen.getByRole('searchbox', { name: '搜索规则' }), 'F2');
  await user.click(screen.getByRole('button', { name: '全部展开' }));
  expect(screen.getByRole('textbox', { name: '横向限制关键字' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: '全部收起' }));
  expect(screen.queryByRole('textbox', { name: '横向限制关键字' })).toBeNull();
  await user.click(screen.getByRole('tab', { name: '附件识别' }));
  const payment = screen.getByRole('button', { name: /^支付记录 \/ 付款凭证关键字/ });
  expect(payment.getAttribute('aria-expanded')).toBe('false');
  expect(payment.textContent).toContain('关键字');
  await user.click(payment);
  expect(screen.getByRole('textbox', { name: '支付记录 / 付款凭证关键字' })).toBeTruthy();
  await user.click(screen.getByRole('tab', { name: '分组' }));
  expect(screen.getByRole('button', { name: /^劳务目录名称/ }).getAttribute('aria-expanded')).toBe(
    'false',
  );
  await user.click(screen.getByRole('tab', { name: '劳务标准' }));
  expect(screen.queryByRole('table')).toBeNull();
  await user.click(screen.getByRole('button', { name: /^其他劳务费 ·/ }));
  expect(screen.getByRole('table', { name: '其他劳务费上限' })).toBeTruthy();
});

it('App 的问题规则入口切到设置、展开并滚动目标；侧栏不再有规则按钮，规则标签可返回总览', async () => {
  const rules = config();
  rules.thresholds.inventory = { value: 800, operator: '>' };
  const b = batch();
  const report = buildReport(checkBatch(b, rules));
  report.findings = [
    finding({
      ruleId: 'R11',
      severity: 'warning',
      message: '合成同日入库',
      action: '补入库',
      files: [],
      invoiceNumbers: [],
      groupId: '根目录',
    }),
  ];
  Object.assign(window, {
    precheck: {
      bootstrap: async () => ({
        settings: { rules, bocUrl: DEFAULT_BOC_URL },
        userData: '/synthetic-user',
        recent: [],
        restored: {
          workspace: {
            kind: 'batch',
            dir: b.dir,
            openedDir: b.dir,
            selectedBatchDir: b.dir,
            batches: [
              {
                batch: b,
                report,
                claim: defaultClaim('synthetic-view', '2026-01-01'),
                waived: 0,
                markedAt: null,
                outputs: [],
                manualTasks: [],
              },
            ],
            rejected: null,
          },
          message: null,
        },
      }),
      onEvent: () => () => {},
    },
  });
  const original = HTMLElement.prototype.scrollIntoView;
  let scrolled = '';
  HTMLElement.prototype.scrollIntoView = function () {
    scrolled = this.id;
  };
  try {
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /合成同日入库/ }));
    expect(screen.getByRole('region', { name: '规则说明' }).textContent).toContain('> 800 元');
    await user.click(screen.getByRole('button', { name: '在设置中查看 / 修改 →' }));
    const card = screen.getByTestId('rule-R11');
    await waitFor(() =>
      expect(
        within(card)
          .getByRole('button', { name: /^R11 ·/ })
          .getAttribute('aria-expanded'),
      ).toBe('true'),
    );
    await waitFor(() => expect(scrolled).toBe('settings-rule-R11'));
    await user.click(screen.getByRole('tab', { name: '通用' }));
    expect(screen.queryByRole('button', { name: '规则' })).toBeNull();
    await user.click(screen.getByRole('tab', { name: '规则' }));
    expect(screen.getByRole('tab', { name: '规则' }).getAttribute('aria-selected')).toBe('true');
  } finally {
    HTMLElement.prototype.scrollIntoView = original;
  }
});
