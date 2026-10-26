import { expect, type ElectronApplication, type Page } from 'playwright/test';
import { join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { openSection, correctionControls, moreAction } from './e2e-controls.js';
import type { E2eWorkspace } from './e2e-workspace.js';
import { directoryFingerprint } from '../../src/main/correction/files.js';

export async function checkFileCorrections(
  application: ElectronApplication,
  page: Page,
  workspace: E2eWorkspace,
  prefix: string,
) {
  const { correctionLabor, correctSource, incorrectSource, resultDir } = workspace;
  const tree = page.getByRole('tree', { name: '工作区文件夹' });
  const correctionCard = page.getByTestId('labor-entry');
  const { chooseSource, pickerCalls, dropSource } = correctionControls(application, page);
  const oldStatement = await readFile(join(correctionLabor, '待改说明.docx'));
  await chooseSource(correctSource);
  const collapsedIssue = correctionCard
    .locator('.finding.error')
    .filter({ hasText: '没写线上还是线下' });
  await expect(collapsedIssue.locator('[class*="_findingSummary_"]')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  const beforePicker = await pickerCalls();
  await moreAction(page, '检查单个文件');
  let dialog = page.getByRole('dialog');
  await expect(dialog.locator('[class*="_fileDropZone_"]')).toBeVisible();
  expect(await pickerCalls()).toBe(beforePicker);
  await page.screenshot({ path: join(resultDir, prefix + '-correction-drop-zone.png') });
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await dropSource(collapsedIssue.locator('[class*="_findingSummary_"]'), correctSource);
  const correctionToast = page.getByTestId('correction-toast');
  await expect(correctionToast).toBeVisible();
  await expect(correctionToast).toContainText('问题已解决');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await pickerCalls()).toBe(beforePicker);
  await page.screenshot({ path: join(resultDir, prefix + '-correction-toast.png') });
  await correctionToast.getByRole('button', { name: '查看详情', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('_预检/旧版/');
  await expect(dialog.locator('.pill[data-tone="info"]')).toHaveCount(0);
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(correctionCard.locator('.finding.error')).toHaveCount(0);
  await expect(correctionCard.getByRole('heading', { level: 2 })).toContainText('✓');
  await openSection(page.locator('[class*="_laborPage_"]'), '输出文件');
  const replacementHistory = page.getByTestId('replacement-history');
  await expect(replacementHistory).toContainText('待改说明.docx');
  const log = JSON.parse(await readFile(join(correctionLabor, '_预检/旧版/log.json'), 'utf8'));
  expect(
    log.records[0].archived.some((f: { original: string }) => f.original === '待改说明.docx'),
  ).toBe(true);
  expect(await readFile(join(correctionLabor, log.records[0].archived[0].path))).toEqual(
    oldStatement,
  );
  await replacementHistory.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(resultDir, prefix + '-correction-records.png') });
  await replacementHistory.getByRole('button', { name: '撤销最近一次', exact: true }).click();
  await expect(correctionCard.locator('.finding.error')).toHaveCount(2);
  await chooseSource(incorrectSource);
  const beforeFailed = await directoryFingerprint([correctionLabor]);
  const beforeFiles = await readdir(correctionLabor, { recursive: true });
  await correctionCard
    .locator('.finding.error')
    .filter({ hasText: '日期没写到具体哪一天' })
    .locator('[class*="_findingSummary_"]')
    .click();
  await correctionCard
    .locator('.finding.error')
    .filter({ hasText: '日期没写到具体哪一天' })
    .getByRole('button', { name: '放入改好的文件', exact: true })
    .click();
  dialog = page.getByRole('dialog');
  await expect(dialog.locator('[class*="_fileDropZone_"]')).toBeVisible();
  expect(await pickerCalls()).toBe(beforePicker);
  await dialog.getByRole('button', { name: '或从文件夹选择…', exact: true }).click();
  expect(await pickerCalls()).toBe(beforePicker + 1);
  await expect(dialog.getByRole('heading', { name: '未通过', exact: true })).toBeVisible();
  await expect(dialog).not.toContainText('没写线上还是线下');
  await expect(dialog.locator('.pill[data-tone="info"]')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '确认放入', exact: true })).toHaveCount(0);
  await page.screenshot({ path: join(resultDir, prefix + '-correction-failed.png') });
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  expect(await readdir(correctionLabor, { recursive: true })).toEqual(beforeFiles);
  expect(await directoryFingerprint([correctionLabor])).toBe(beforeFailed);
}
