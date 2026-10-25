// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { App } from '../src/renderer/src/App.js';
import { defaultClaim } from '../src/core/domain/claim.js';
import { buildReport, checkBatch } from '../src/core/index.js';
import { batch, config, finding } from './helpers.js';
import { DEFAULT_BOC_URL } from '../src/main/store.js';
afterEach(cleanup);

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
