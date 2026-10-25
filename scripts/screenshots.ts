import { _electron as electron, expect } from 'playwright/test';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createExampleWorkspace } from './lib/example-workspace.js';

const temp = await realpath(await mkdtemp(join(tmpdir(), 'precheck-screenshots-')));
const sample = await createExampleWorkspace(temp);
const output = resolve('docs/images');
await mkdir(output, { recursive: true });
const env = Object.fromEntries(
  Object.entries(process.env).filter((v): v is [string, string] => v[1] !== undefined),
);
delete env.ELECTRON_RUN_AS_NODE;
env.PRECHECK_USER_DATA = sample.userData;
let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
try {
  app = await electron.launch({ args: [resolve('.')], env, timeout: 30000, chromiumSandbox: true });
  const page = await app.firstWindow();
  page.on('pageerror', (error) => console.error('renderer:', error.message));
  await app.evaluate(({ nativeTheme }) => {
    nativeTheme.themeSource = 'light';
  });
  await (await app.browserWindow(page)).evaluate((win) => win.setContentSize(1440, 900));
  await page.getByLabel('文件夹路径').fill(sample.root);
  await page.getByRole('button', { name: '打开路径', exact: true }).click();
  const tree = page.getByRole('tree', { name: '工作区文件夹' });
  await tree.locator('[data-batch-id="20260103"]').click();
  await expect(page.getByTestId('batch-summary')).toContainText('3 张');
  // 隐藏绝对路径行；保持其余 UI 和合成检查结果不变。
  await page.addStyleTag({
    content:
      '[class*="_path_"] { display: none !important; } * { animation: none !important; transition: none !important; }',
  });
  const screenshot = async (name: string) => {
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        ),
    );
    const visible = await page.locator('body').innerText();
    expect(visible).not.toContain(temp);
    expect(visible).not.toContain(sample.userData);
    await page.screenshot({ path: join(output, name), fullPage: false });
  };
  await screenshot('results.png');
  const first = page
    .getByTestId('actionable-findings')
    .locator('[class*="_findingSummary_"]')
    .first();
  await first.click();
  await expect(page.getByRole('region', { name: '规则说明' }).first()).toBeVisible();
  await page.getByRole('region', { name: '规则说明' }).first().scrollIntoViewIfNeeded();
  await screenshot('rule-explanation.png');
  await tree.locator('[data-batch-id="劳务费"]').click();
  await expect(page.getByTestId('labor-summary')).toBeVisible();
  await screenshot('labor.png');
  await page.getByRole('button', { name: '⚙ 设置', exact: true }).click();
  await page.getByRole('tab', { name: '规则', exact: true }).click();
  await expect(page.getByTestId('rule-F2')).toBeVisible();
  await page.getByRole('searchbox', { name: '搜索规则' }).scrollIntoViewIfNeeded();
  await screenshot('settings-rules.png');
  console.log('已生成 4 张合成数据截图：' + output);
} finally {
  try {
    await app?.close();
  } finally {
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
