import { expect, type ElectronApplication, type Page } from 'playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function checkArchitecturePages(app: ElectronApplication, page: Page, root: string) {
  await page.locator('[class*="_workspaceName_"]').click();
  const overview = page.getByRole('table', { name: '报销批次', exact: true });
  await expect(overview.locator('tbody')).toHaveCount(2);
  await page.getByRole('checkbox', { name: '全选批次', exact: true }).check();
  await expect(page.getByText('已选 2 个批次', { exact: true })).toBeVisible();
  await expect(page.getByText('将跳过 1 个不允许的批次', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '批量导出汇总', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '已导出 2 个批次' })).toBeVisible();
  for (const id of ['20260102', '20260103'])
    expect(await readFile(join(root, id, '_预检/汇总.md'), 'utf8')).toContain('报销预检');
  await page.getByRole('button', { name: '标记为待提交', exact: true }).click();
  await expect(overview).toContainText('待提交');
  await page.getByRole('button', { name: '展开支出合计 20260103', exact: true }).click();
  await expect(page.getByText('各支出内容合计', { exact: true })).toBeVisible();
  await overview.getByRole('button', { name: '20260102', exact: true }).click();
  await page.getByRole('textbox', { name: '经办人', exact: true }).fill('合成经办人');
  await page.getByRole('textbox', { name: '项目 / 经费卡', exact: true }).fill('合成项目');
  await page.getByRole('combobox', { name: '经费类型', exact: true }).selectOption('horizontal');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: '经费类型', exact: true }).selectOption('');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  expect(
    JSON.parse(await readFile(join(root, '20260102/_预检/claim.json'), 'utf8')).fund,
  ).toBeUndefined();
  await page.getByRole('textbox', { name: '经办人', exact: true }).fill('直接导出经办人');
  await page.getByRole('button', { name: '导出到批次文件夹', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '导出完成' })).toBeVisible();
  expect(await readFile(join(root, '20260102/_预检/汇总.md'), 'utf8')).toContain(
    '经办人：直接导出经办人',
  );
  const nav = page.getByRole('navigation', { name: '工作区页面' });
  await nav.getByRole('button', { name: '台账', exact: true }).click();
  const claims = page.getByRole('table', { name: '报销单台账', exact: true });
  await expect(claims.locator('tbody tr')).toHaveCount(2);
  await expect(claims).toContainText('直接导出经办人');
  await page.getByRole('button', { name: '导出台账 Markdown', exact: true }).click();
  await expect(page.getByRole('button', { name: '在文件夹中显示', exact: true })).toBeVisible();
  expect(await readFile(join(root, '_预检/台账.md'), 'utf8')).toContain('合成项目');
  await page.getByRole('combobox', { name: '报销状态', exact: true }).selectOption('submitted');
  await expect(claims.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('tab', { name: '发票登记簿', exact: true }).click();
  await expect(page.getByRole('table', { name: '发票登记簿', exact: true })).toContainText(
    'SYNTH-EXAMPLE-A',
  );
  const win = await app.browserWindow(page);
  await win.evaluate((window) => window.setContentSize(900, 760));
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(
      await page
        .getByTestId('result-pane')
        .evaluate((pane) => pane.scrollWidth <= pane.clientWidth + 1),
    ).toBe(true);
    await page.locator('[class*="_workspaceName_"]').click();
    await expect(overview).toBeVisible();
    expect(
      await page
        .getByTestId('result-pane')
        .evaluate((pane) => pane.scrollWidth <= pane.clientWidth + 1),
    ).toBe(true);
  }
  await page.emulateMedia({ colorScheme: 'light' });
}
