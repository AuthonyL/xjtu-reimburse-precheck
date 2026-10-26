import { changeClaimState } from './e2e-controls.js';
import { expect, type ElectronApplication, type Page } from 'playwright/test';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createExampleWorkspace } from './example-workspace.js';
import { examplePng } from './example-documents.js';
import { checkArchitecturePages } from './e2e-architecture.js';

/** 独立合成工作区，避免改变后续纠错、导出和重启恢复场景的数据。 */
export async function checkWorkspacePages(
  app: ElectronApplication,
  page: Page,
  temp: string,
  nextRoot: string,
) {
  const sample = await createExampleWorkspace(join(temp, 'pages'));
  await rm(join(sample.batch, 'PCB/abcdef0123456789.jpg'));
  await writeFile(join(sample.batch, 'PCB/未命名.png'), examplePng);
  await page.getByLabel('文件夹路径').fill(sample.root);
  await page.getByRole('button', { name: '打开路径', exact: true }).click();
  const nav = page.getByRole('navigation', { name: '工作区页面' });
  await expect(nav.getByRole('button', { name: '收件箱 1', exact: true })).toBeVisible();
  await nav.getByRole('button', { name: '收件箱 1', exact: true }).click();
  await expect(page.getByRole('heading', { name: '收件箱', exact: true })).toBeVisible();
  const win = await app.browserWindow(page);
  await win.evaluate((window) => window.setContentSize(900, 760));
  const fits = async () => {
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(
      await page
        .getByTestId('result-pane')
        .evaluate((pane) => pane.scrollWidth <= pane.clientWidth + 1),
    ).toBe(true);
  };
  await fits();
  await page
    .getByRole('article', { name: '未命名.png' })
    .getByRole('button', { name: '是支付记录', exact: true })
    .click();
  await expect(page.getByText('收件箱是空的：所有文件都已识别。')).toBeVisible();
  await expect(nav.getByRole('button', { name: '收件箱', exact: true })).toBeVisible();
  const tree = page.getByRole('tree', { name: '工作区文件夹' });
  await tree.locator('[data-batch-id="20260103"]').click();
  await tree.getByRole('treeitem', { name: /PCB/ }).click();
  await expect(page.getByTestId('group-PCB').getByTestId('requirement-payment')).toContainText(
    '已找到',
  );
  await changeClaimState(page, '待提交');
  await changeClaimState(page, '已提交');
  await nav.getByRole('button', { name: '发票列表 4 张', exact: true }).click();
  const table = page.getByRole('table', { name: '工作区发票', exact: true });
  await page.getByRole('searchbox', { name: '搜索发票' }).fill('合成');
  await expect(table.locator('tbody tr')).toHaveCount(4);
  await page.getByRole('checkbox', { name: '已提交', exact: true }).check();
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await page.getByRole('checkbox', { name: '草稿', exact: true }).check();
  await expect(table.locator('tbody tr')).toHaveCount(4);
  await page.getByRole('checkbox', { name: '草稿', exact: true }).uncheck();
  await fits();
  // Playwright 会仿真页面的 prefers-color-scheme，改 nativeTheme 不影响页面，直接仿真媒体查询。
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect
    .poll(() => page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches))
    .toBe(true);
  await fits();
  await table.getByRole('button', { name: '20260103', exact: true }).first().click();
  await expect(page.getByTestId('batch-summary').locator('[data-metric="张数"] strong')).toHaveText(
    '3',
  );
  await expect(page.getByTestId('group-PCB')).toHaveClass(/group-highlight/);
  await page.emulateMedia({ colorScheme: 'light' });
  await checkArchitecturePages(app, page, sample.root);
  await win.evaluate((window) => window.setContentSize(1280, 900));
  // 只替换一次系统选择器，仍走真实 chooseFolder IPC 打开主场景。
  await app.evaluate(({ dialog }, dir) => {
    const previous = dialog.showOpenDialog;
    dialog.showOpenDialog = (async () => {
      dialog.showOpenDialog = previous;
      return { canceled: false, filePaths: [dir] };
    }) as typeof dialog.showOpenDialog;
  }, nextRoot);
  await page.getByRole('button', { name: '打开其他文件夹', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '在文件夹中显示当前工作区', exact: true }),
  ).toContainText('合成工作区');
}
