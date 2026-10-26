import { expect, type ElectronApplication, type Page } from 'playwright/test';
import { join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { openSection } from './e2e-controls.js';
import type { E2eWorkspace } from './e2e-workspace.js';

export async function checkLaborReview(
  application: ElectronApplication,
  page: Page,
  workspace: E2eWorkspace,
  prefix: string,
) {
  const { root, resultDir } = workspace;
  const tree = page.getByRole('tree', { name: '工作区文件夹' });
  const correctionCard = page.getByTestId('labor-entry');
  const laborNode = tree.locator('[data-batch-id="劳务费"]');
  await expect(laborNode).toBeVisible();
  await laborNode.click();
  await expect(page.getByTestId('labor-summary')).toContainText('1 笔（2 份说明）');
  await expect(tree.getByRole('treeitem', { name: /林示例/ })).toHaveCount(2);
  const correct = page.locator('[data-labor-file="正确发放说明.docx"]');
  const incorrect = page.locator('[data-labor-file="错误发放说明.docx"]');
  await expect(incorrect.locator('.finding.error')).toHaveCount(2);
  await openSection(correct, '附件与发放表金额');
  await openSection(correct, '抽取字段与手动补充');
  await openSection(correct, '生成规范情况说明');
  await correct.getByLabel('发放表金额', { exact: true }).fill('2000');
  await correct.getByRole('button', { name: '保存本笔并重新检查', exact: true }).click();
  await expect(correct.locator('.finding.error').filter({ hasText: 'L2' })).toContainText(
    '发放表金额',
  );
  await correct.getByLabel('发放表金额', { exact: true }).fill('2200');
  await correct.getByRole('button', { name: '导出 Word', exact: true }).click();
  await expect.poll(() => readdir(join(root, '劳务费', '_预检'))).toContain('情况说明-林示例.docx');
  const laborManual = JSON.parse(
    await readFile(join(root, '劳务费', '_预检', 'manual.json'), 'utf8'),
  );
  expect(laborManual.labor['正确发放说明.docx'].tableAmount).toBe(2200);
  await laborNode.click();
  await page.screenshot({ path: join(resultDir, prefix + '-labor.png') });
  // File correction stays inside synthetic folders, including the archived originals.
  const correctionBatchNode = tree.locator('[data-batch-id="20260103"]');
  await correctionBatchNode.click();
  await expect(correctionBatchNode).toHaveAttribute('aria-expanded', 'true');
  const correctionBranch = correctionBatchNode.locator('..').getByRole('group').first();
  await correctionBranch.getByRole('treeitem', { name: /劳务费/, exact: false }).click();
  await expect(correctionCard.locator('.finding.error')).toHaveCount(2);
  await application
    .browserWindow(page)
    .then((win) => win.evaluate((window) => window.setSize(900, 760)));
  const summaries = correctionCard.locator('.finding.error [class*="_findingSummary_"]');
  await expect(summaries).toHaveCount(2);
  await expect(summaries.nth(0)).toHaveAttribute('aria-expanded', 'false');
  await expect(summaries.nth(1)).toHaveAttribute('aria-expanded', 'false');
  await expect(correctionCard.getByText('怎么处理：', { exact: true })).toHaveCount(0);
  // The summary is a single line at 900px; identifiers and chevrons stay visible.
  for (const summary of await summaries.all()) {
    expect(
      await summary.evaluate((element) => {
        const message = element.querySelector<HTMLElement>('[class*="_findingTitle_"]')!;
        const css = getComputedStyle(message);
        return (
          css.whiteSpace === 'nowrap' &&
          css.textOverflow === 'ellipsis' &&
          element.scrollWidth <= element.clientWidth + 1 &&
          element.querySelector('[class*="_disclosureChevron_"]')!.getBoundingClientRect().width > 0
        );
      }),
    ).toBe(true);
  }
  await page.screenshot({ path: join(resultDir, prefix + '-issues-collapsed.png') });
  await summaries.nth(0).click();
  await summaries.nth(1).click();
  await expect(correctionCard.locator('.finding.error [class*="_findingDetails_"]')).toHaveCount(2);
  await expect(correctionCard.getByText('怎么处理：', { exact: true })).toHaveCount(2);
  await page.screenshot({ path: join(resultDir, prefix + '-issues-two-open.png') });
  const errorLevel = correctionCard.getByRole('region', { name: '劳务问题', exact: true });
  await errorLevel.getByRole('button', { name: '只看规则 L1', exact: true }).click();
  await expect(correctionCard.locator('.finding')).toHaveCount(2);
  await expect(correctionCard.locator('.finding.warning')).toHaveCount(0);
  await errorLevel.getByRole('button', { name: '只看规则 L1', exact: true }).click();
  await errorLevel.getByRole('button', { name: '全部收起', exact: true }).click();
}
