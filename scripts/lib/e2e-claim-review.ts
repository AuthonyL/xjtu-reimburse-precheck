import { expect, type Page } from 'playwright/test';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { openSection } from './e2e-controls.js';
import type { E2eWorkspace } from './e2e-workspace.js';
import JSZip from 'jszip';
import { ruleDefinition } from '../../src/core/rules/catalog.js';

export async function checkClaimReview(page: Page, workspace: E2eWorkspace, prefix: string) {
  const { resultDir, env } = workspace;
  const tree = page.getByRole('tree', { name: '工作区文件夹' });
  const dates = tree.locator('[role="treeitem"][aria-level="1"][data-batch-id^="2026"]');
  await expect(dates).toHaveCount(2);
  expect(
    await dates.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-batch-id'))),
  ).toEqual(['20260103', '20260102']);
  expect(
    await tree.locator('[role="treeitem"][aria-level="1"]').last().getAttribute('data-batch-id'),
  ).toBe('无法报销费用');
  await tree.locator('[data-batch-id="20260102"]').getByLabel('展开批次').click();
  await tree.locator('[data-batch-id="20260103"]').click();
  await expect(page.getByTestId('batch-summary').locator('[data-metric="张数"] strong')).toHaveText(
    '1',
  );
  await expect(
    page.locator('[class*="_results_"] [class*="_groupSummary_"][aria-expanded="true"]'),
  ).toHaveCount(0);
  for (const title of ['发票明细', '手填与汇率', '输出文件'])
    await expect(
      page.locator('[class*="_results_"]').getByRole('button', { name: new RegExp('^' + title) }),
    ).toHaveAttribute('aria-expanded', 'false');
  await page.screenshot({ path: join(resultDir, prefix + '-default-collapsed.png') });
  await expect(tree.locator('[data-batch-id="20260102"]')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(tree.getByRole('treeitem', { name: /PCB/ })).toHaveCount(0);
  await tree.locator('[data-batch-id="20260102"]').getByLabel('展开批次').click();
  await expect(tree.locator('[data-batch-id="20260103"]')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await tree.getByRole('treeitem', { name: /PCB/ }).click();
  await expect(page.getByTestId('group-PCB')).toBeInViewport({ ratio: 0.3 });
  await expect(page.getByTestId('group-PCB')).toHaveClass(/group-highlight/);
  await expect(page.getByTestId('batch-summary').locator('[data-metric="张数"] strong')).toHaveText(
    '3',
  );
  await openSection(page.locator('[class*="_results_"]'), '发票明细');
  const invoiceTable = page.getByRole('table', { name: '发票明细', exact: true });
  expect(await invoiceTable.locator('tbody tr td:first-child').allTextContents()).toEqual([
    '1',
    '2',
    '3',
  ]);
  await expect(page.locator('tbody tr').filter({ hasText: 'SYNTH-INTEGRATION' })).toContainText(
    '113.00',
  );
  const pcb = page.getByTestId('group-PCB');
  await pcb.locator('[class*="_groupSummary_"]').click();
  await expect(pcb.locator('[class*="_groupSummary_"]')).toHaveAttribute('aria-expanded', 'false');
  const pcbIssue = page
    .getByTestId('actionable-findings')
    .locator('.finding')
    .filter({ has: page.locator('[class*="_findingLocation_"][data-tooltip="PCB"]') })
    .first();
  await pcbIssue.locator('[class*="_findingSummary_"]').click();
  const help = pcbIssue.getByRole('region', { name: '规则说明' });
  await expect(help).toBeVisible();
  const helpId = (
    await pcbIssue.locator('[class*="_findingRule_"] > span:first-child').innerText()
  ).split('/')[0]!;
  await expect(help).toContainText(ruleDefinition(helpId)!.sourceText);
  await page.screenshot({ path: join(resultDir, prefix + '-rule-explanation.png') });
  await pcbIssue.getByRole('button', { name: '这条不对', exact: true }).click();
  const feedbackForm = page.getByRole('dialog', { name: '这条不对', exact: true });
  await feedbackForm
    .getByRole('textbox', { name: '反馈备注' })
    .fill('合成反馈：请核对这条材料要求');
  await page.screenshot({ path: join(resultDir, prefix + '-feedback-form.png') });
  await feedbackForm.getByRole('button', { name: '保存反馈', exact: true }).click();
  await expect(feedbackForm).not.toBeVisible();
  await expect(pcbIssue.locator('[class*="_findingSummary_"]')).toContainText('已反馈');

  await help.getByRole('button', { name: '在设置中查看 / 修改 →', exact: true }).first().click();
  await expect(page.getByRole('tab', { name: '规则', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    page
      .getByTestId('rule-' + helpId)
      .getByRole('button', { name: new RegExp('^' + helpId + ' ·') }),
  ).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('rule-' + helpId)).toBeInViewport({ ratio: 0.3 });
  await page.getByRole('tab', { name: '反馈', exact: true }).click();
  await expect(page.locator('[class*="_feedbackPanel_"]')).toContainText(
    '合成反馈：请核对这条材料要求',
  );
  await page.getByRole('button', { name: '导出反馈包', exact: true }).click();
  const feedbackPreview = page.getByRole('dialog', { name: '导出反馈包预览', exact: true });
  await expect(feedbackPreview.getByRole('checkbox')).not.toBeChecked();
  await expect(feedbackPreview).toContainText('meta.json');
  await page.screenshot({ path: join(resultDir, prefix + '-feedback-preview.png') });
  await feedbackPreview.getByRole('button', { name: '确认导出', exact: true }).click();
  await expect(feedbackPreview).not.toBeVisible();
  await expect(page.locator('[class*="_feedbackPanel_"]')).toContainText('请把这个文件发给维护者');
  const feedbackZip = await JSZip.loadAsync(await readFile(env.PRECHECK_FEEDBACK_EXPORT!));
  for (const name of ['meta.json', 'feedback.json', 'settings-diff.json', 'rejected-reasons.json'])
    expect(feedbackZip.file(name)).not.toBeNull();
  expect(Object.keys(feedbackZip.files).some((name) => name.startsWith('files/'))).toBe(false);

  await page.getByRole('tab', { name: '分组', exact: true }).click();
  await expect(page.getByRole('button', { name: '规则', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: '规则', exact: true }).click();
  await expect(page.getByRole('tab', { name: '规则', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: '全部收起', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜索规则' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(resultDir, prefix + '-rules-overview.png') });
  await tree.locator('[data-batch-id="20260102"]').click();
  await pcbIssue.getByRole('button', { name: '定位到分组 →', exact: true }).click();
  await expect(pcb.locator('[class*="_groupSummary_"]')).toHaveAttribute('aria-expanded', 'true');
  await expect(pcb).toBeInViewport({ ratio: 0.3 });
  await expect(pcb).toContainText('实验材料费');
  const batchIssues = page.getByTestId('actionable-findings');
  const warningIssues = batchIssues;
  const severity = batchIssues.getByRole('group', { name: '问题级别' });
  await expect(severity.getByRole('button', { name: /^错误 / })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(severity.getByRole('button', { name: /^警告 / })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const info = severity.getByRole('button', { name: /^提示 / });
  await expect(info).toHaveAttribute('aria-pressed', 'false');
  await info.click();
  await expect(info).toHaveAttribute('aria-pressed', 'true');
  await info.click();
  await expect(batchIssues.getByRole('button', { name: '全部展开', exact: true })).toHaveCount(1);
  const r2Badge = warningIssues.getByRole('button', { name: '只看规则 R2', exact: true });
  const unfiltered = await warningIssues.locator('.finding').count();
  expect(unfiltered).toBeGreaterThan(1);
  await r2Badge.click();
  // Rule filters apply to the single list across all selected severity chips.
  const ruleIds = warningIssues.locator('.finding [class*="_findingRule_"] > span:first-child');
  await expect
    .poll(async () => {
      const ids = await ruleIds.allTextContents();
      return ids.length > 0 && ids.length < unfiltered && ids.every((id) => id === 'R2');
    })
    .toBe(true);
  await batchIssues.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(resultDir, prefix + '-issues-filtered.png') });
  await r2Badge.click();
  await expect(pcb.getByTestId('requirement-payment')).toContainText('待确认');
  await pcb.getByRole('button', { name: '是支付记录', exact: true }).click();
  await expect(pcb.getByTestId('requirement-payment')).toContainText('已找到');
}
