import { _electron as electron, expect } from 'playwright/test';
import { writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createE2eWorkspace } from './lib/e2e-workspace.js';
import { checkWorkspacePages } from './lib/e2e-pages.js';
import { checkClaimReview } from './lib/e2e-claim-review.js';
import { checkBatchActions } from './lib/e2e-batch-actions.js';
import { checkLaborReview } from './lib/e2e-labor-review.js';
import { checkFileCorrections } from './lib/e2e-file-corrections.js';
import { checkMaterialCorrections } from './lib/e2e-material-corrections.js';

process.env.electron_config_cache ??= resolve('.electron-cache');
const explicitIndex = process.argv.indexOf('--executable');
const executable =
  process.env.PRECHECK_EXECUTABLE ??
  (explicitIndex >= 0 ? process.argv[explicitIndex + 1] : undefined);
const packaged = process.argv.includes('--packaged') || !!executable;
if (packaged && !executable)
  throw new Error('请设置 PRECHECK_EXECUTABLE 或传入 --executable 指定打包后的可执行文件');

const workspace = await createE2eWorkspace();
const { temp, root, batch, userData, resultDir, env } = workspace;
let application: Awaited<ReturnType<typeof electron.launch>> | undefined;
const electronLog = [
  JSON.stringify({
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    packaged,
  }),
];
const launch = async () => {
  const app = await electron.launch({
    ...(packaged ? { executablePath: resolve(executable!), args: [] } : { args: [resolve('.')] }),
    env,
    timeout: 30000,
    chromiumSandbox: true,
  });
  for (const stream of [app.process().stdout, app.process().stderr])
    stream?.on('data', (chunk: Buffer) => {
      if (electronLog.length < 2000) electronLog.push(chunk.toString());
    });
  return app;
};
try {
  application = await launch();
  const page = await application.firstWindow();
  const prefix = packaged ? 'packaged' : 'desktop';
  page.on('pageerror', (error) => console.error('renderer:', error.message));
  await checkWorkspacePages(application, page, temp, root);
  const tree = page.getByRole('tree', { name: '工作区文件夹' });
  await checkClaimReview(page, workspace, prefix);
  await checkBatchActions(page, workspace, prefix);
  await checkLaborReview(application, page, workspace, prefix);
  await checkFileCorrections(application, page, workspace, prefix);
  await checkMaterialCorrections(application, page, workspace, prefix);

  await tree.locator('[data-batch-id="20260102"]').click();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('textbox', { name: '经办人', exact: true }).fill('重启合成经办人');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await expect
    .poll(
      async () =>
        JSON.parse(await readFile(join(userData, 'workspace.json'), 'utf8')).selectedBatchDir,
    )
    .toBe(batch);
  const screenshot = packaged ? 'packaged-smoke.png' : 'desktop-smoke.png';
  await page.screenshot({ path: join(resultDir, screenshot), fullPage: true });
  await application.close();
  application = undefined;
  application = await launch();
  const restored = await application.firstWindow();
  await expect(restored.getByRole('tree', { name: '工作区文件夹' })).toBeVisible();
  await expect(restored.locator('[data-batch-id="20260102"]')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(restored.getByTestId('batch-summary')).toContainText('1,453.00');
  await expect(restored.getByText(/经办人：重启合成经办人/)).toBeVisible();
  await restored.getByRole('button', { name: '编辑', exact: true }).click();
  await expect(restored.getByRole('textbox', { name: '经办人', exact: true })).toHaveValue(
    '重启合成经办人',
  );
  await restored.getByRole('button', { name: '保存', exact: true }).click();
  await expect(
    restored.getByRole('button', { name: '在文件夹中显示当前工作区', exact: true }),
  ).toContainText('合成工作区');
  const restoredScreenshot = packaged ? 'packaged-restored.png' : 'desktop-restored.png';
  await restored.screenshot({ path: join(resultDir, restoredScreenshot), fullPage: true });
  // The minimum window width must retain a usable, independently scrolling result pane.
  await application
    .browserWindow(restored)
    .then((win) => win.evaluate((window) => window.setSize(900, 760)));
  await expect(restored.getByTestId('result-pane')).toBeVisible();
  expect(
    await restored.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  expect(
    await restored
      .getByTestId('result-pane')
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true);
  await restored.screenshot({
    path: join(resultDir, packaged ? 'packaged-900px.png' : 'desktop-900px.png'),
  });
  console.log(
    `PASS Electron${packaged ? ' 打包产物' : ''}：总览全选/顺序批量导出/跳过非法迁移/支出展开、经办人保存/重启恢复、台账双标签/筛选/导出文件、收件箱徽标/PNG分类/材料已找到、发票搜索/多状态筛选/分组跳转/900px明暗主题、反馈表单/已反馈/导出预览/默认无原文件、默认收起/连续序号/规则说明/设置定位/无侧栏规则按钮、双批次倒序/手风琴侧栏、问题收起/多展开/规则筛选/收起拖入、分组定位自动展开、XML/PDF解析、确认附件、外币手填、导出、报销状态/退回备注持久化、F2关键字增删、拒票原因、劳务树/L1/L2/L6/Word导出、单文件直接放入/toast/失败过滤/补交/归档/撤销/目录内确认不复制/反馈隔离、结果顺序、重启恢复、900px布局`,
  );
  console.log('截图：' + join(resultDir, screenshot) + '、' + join(resultDir, restoredScreenshot));
} catch (error) {
  await writeFile(
    join(resultDir, packaged ? 'packaged-e2e-error.txt' : 'e2e-error.txt'),
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  throw error;
} finally {
  try {
    await application?.close();
  } finally {
    await writeFile(
      join(resultDir, packaged ? 'packaged-electron.log' : 'electron.log'),
      electronLog.join('\n'),
    );
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
