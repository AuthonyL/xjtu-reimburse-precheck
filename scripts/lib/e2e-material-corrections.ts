import { expect, type ElectronApplication, type Page } from 'playwright/test';
import { join } from 'node:path';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { openSection, correctionControls } from './e2e-controls.js';
import type { E2eWorkspace } from './e2e-workspace.js';

export async function checkMaterialCorrections(
  application: ElectronApplication,
  page: Page,
  workspace: E2eWorkspace,
  prefix: string,
) {
  const { batch, newer, purposeSource, internalImage, userData, resultDir } = workspace;
  const tree = page.getByRole('tree', { name: '工作区文件夹' });
  const { chooseSource, pickerCalls, dropSource } = correctionControls(application, page);
  const correctionToast = page.getByTestId('correction-toast');
  await tree.locator('[data-batch-id="20260103"]').click();
  await page.getByTestId('group-根目录').locator('[class*="_groupSummary_"]').click();
  const purpose = page.getByTestId('requirement-purposeNote');
  await expect(purpose).toContainText('缺失');
  await chooseSource(purposeSource);
  await purpose.getByRole('button', { name: '放入改好的文件', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '或从文件夹选择…', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(correctionToast).toContainText('用途说明-one.pdf');
  await expect(purpose).toContainText('已找到');
  expect(await readdir(newer)).toContain('用途说明-one.pdf');
  await openSection(page.locator('[class*="_results_"]'), '输出文件');
  await page
    .getByTestId('replacement-history')
    .getByRole('button', { name: '撤销最近一次', exact: true })
    .click();
  await expect(purpose).toContainText('缺失');
  expect(await readdir(newer)).not.toContain('用途说明-one.pdf');
  // Existing unnamed file in the same AI folder is confirmed, not duplicated.
  // The original AI screenshot is already bound to the manual receipt above, so add a fresh one.
  const freshImage = join(batch, 'AI/fedcba9876543210.png');
  await writeFile(freshImage, await readFile(internalImage));
  await tree.locator('[data-batch-id="20260102"]').click();
  await page.getByRole('button', { name: '重新检查', exact: true }).click();
  const aiGroup = page.getByTestId('group-AI');
  if (
    (await aiGroup.locator('[class*="_groupSummary_"]').getAttribute('aria-expanded')) === 'false'
  )
    await aiGroup.locator('[class*="_groupSummary_"]').click();
  const rate = aiGroup.getByTestId('requirement-exchangeRate');
  await expect(rate).toContainText('待确认');
  const aiFiles = await readdir(join(batch, 'AI'));
  const manualBefore = JSON.parse(await readFile(join(batch, '_预检/manual.json'), 'utf8'));
  const feedbackBefore = await readFile(join(userData, 'feedback.json'));
  const callsBeforeInternal = await pickerCalls();
  await dropSource(rate.getByRole('button', { name: '放入改好的文件', exact: true }), freshImage);
  await expect(correctionToast).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(rate).toContainText('已找到');
  expect(await readdir(join(batch, 'AI'))).toEqual(aiFiles);
  expect(
    JSON.parse(await readFile(join(batch, '_预检/manual.json'), 'utf8')).attachments[
      'AI/fedcba9876543210.png'
    ],
  ).toBe('exchangeRate');
  expect(await pickerCalls()).toBe(callsBeforeInternal);
  await page.screenshot({
    path: join(resultDir, prefix + '-correction-confirm-attachment-toast.png'),
  });
  await correctionToast.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(rate).toContainText('待确认');
  expect(await readdir(join(batch, 'AI'))).toEqual(aiFiles);
  expect(JSON.parse(await readFile(join(batch, '_预检/manual.json'), 'utf8'))).toEqual(
    manualBefore,
  );
  expect(await readFile(join(userData, 'feedback.json'))).toEqual(feedbackBefore);
}
