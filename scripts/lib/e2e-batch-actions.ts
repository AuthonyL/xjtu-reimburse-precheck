import { expect, type Page } from 'playwright/test';
import { join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { openSection, openRule } from './e2e-controls.js';
import type { E2eWorkspace } from './e2e-workspace.js';

export async function checkBatchActions(page: Page, workspace: E2eWorkspace, prefix: string) {
  const { batch, resultDir } = workspace;
  const tree = page.getByRole('tree', { name: '工作区文件夹' });
  await openSection(page.locator('[class*="_results_"]'), '手填与汇率');
  const form = page.getByTestId('manual-form').first();
  await form.getByLabel('金额', { exact: true }).fill('20');
  await form.getByLabel('币种', { exact: true }).fill('USD');
  await form.getByLabel('支付日期').fill('2026-01-02');
  await form.getByLabel('汇率（每1外币兑人民币）').fill('7');
  await form.getByRole('button', { name: '保存手填', exact: true }).click();
  await expect(page.getByTestId('batch-summary')).toContainText('1,453.00');
  await page.getByRole('button', { name: '导出到批次文件夹', exact: true }).click();
  await openSection(page.locator('[class*="_results_"]'), '输出文件');
  await expect(page.getByTestId('export-list')).toContainText('入库登记清单.xlsx');
  const outputs = await readdir(join(batch, '_预检'));
  for (const file of ['manual.json', '入库登记清单.xlsx', '高值材料明细.xlsx', '汇总.md'])
    expect(outputs).toContain(file);
  await page.getByRole('button', { name: '标记为待提交', exact: true }).click();
  await page.getByRole('button', { name: '标记为已提交', exact: true }).click();
  const claimState = async () =>
    JSON.parse(await readFile(join(batch, '_预检/claim.json'), 'utf8'));
  await expect.poll(async () => (await claimState()).state).toBe('submitted');
  await expect(page.locator('[class*="_resultsToolbar_"] .pill')).toHaveText('已提交');
  await page.getByRole('button', { name: '标记为已退回', exact: true }).click();
  await page.getByRole('textbox', { name: '状态备注', exact: true }).fill('合成退回备注：需补材料');
  await page.getByRole('button', { name: '保存状态', exact: true }).click();
  await expect.poll(async () => (await claimState()).state).toBe('returned');
  expect((await claimState()).transitions.at(-1).note).toBe('合成退回备注：需补材料');
  await page.getByRole('button', { name: '标记为草稿', exact: true }).click();
  await expect.poll(async () => (await claimState()).state).toBe('draft');
  const keyword = '合成规则测试器件';
  await page.getByRole('button', { name: '⚙ 设置', exact: true }).click();
  await openRule(page.locator('[class*="_settings_"]'), 'F2');
  await page.getByTestId('rule-F2').getByLabel('横向限制关键字', { exact: true }).fill(keyword);
  await page.getByTestId('rule-F2').getByLabel('横向限制关键字', { exact: true }).press('Enter');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: '设置已保存，工作区已重新检查' }),
  ).toBeVisible();
  await page.getByTestId('rule-F2').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(resultDir, prefix + '-finance-rules.png') });
  await tree.locator('[data-batch-id="20260102"]').click();
  await expect(
    page.getByTestId('actionable-findings').locator('.finding').filter({ hasText: 'F2 ·' }),
  ).toHaveCount(1);
  // 头部的流转记录折叠区也是 section；只断言待处理问题排在分组与材料之前。
  const sectionLabels = await page
    .locator('[class*="_results_"] section[aria-label]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')));
  expect(sectionLabels.indexOf('待处理问题')).toBeGreaterThanOrEqual(0);
  expect(sectionLabels.indexOf('待处理问题')).toBeLessThan(sectionLabels.indexOf('分组与材料'));
  await page.getByRole('button', { name: '⚙ 设置', exact: true }).click();
  await openRule(page.locator('[class*="_settings_"]'), 'F2');
  await page
    .getByTestId('rule-F2')
    .getByRole('button', { name: '删除 ' + keyword, exact: true })
    .click();
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: '设置已保存，工作区已重新检查' }),
  ).toBeVisible();
  await tree.locator('[data-batch-id="20260102"]').click();
  await expect(
    page.getByTestId('actionable-findings').locator('.finding').filter({ hasText: 'F2 ·' }),
  ).toHaveCount(0);
  await tree.locator('[data-batch-id="无法报销费用"]').click();
  await page.getByRole('button', { name: '记录原因', exact: true }).click();
  await page.getByLabel('拒票原因', { exact: true }).fill('合成拒票原因：用途需进一步核实');
  await page.getByRole('button', { name: '保存原因', exact: true }).click();
  await expect(page.getByTestId('rejected-row')).toContainText('合成拒票原因：用途需进一步核实');
  await page.screenshot({ path: join(resultDir, prefix + '-finance-rejected.png') });
  await tree.locator('[data-batch-id="20260102"]').click();
  await expect(page.getByTestId('actionable-findings')).toContainText(
    '原因：合成拒票原因：用途需进一步核实',
  );
  await page.screenshot({ path: join(resultDir, prefix + '-finance-results.png') });
}
