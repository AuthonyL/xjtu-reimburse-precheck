import { _electron as electron, expect, type Locator } from 'playwright/test';
import JSZip from 'jszip';
import { ruleDefinition } from '../src/core/rules/catalog.js';
import { mkdtemp, mkdir, writeFile, readdir, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadConfig } from '../src/core/rules/config.js';
import { DEFAULT_BOC_URL } from '../src/main/store.js';
import { syntheticPdf } from '../tests/pdf-fixture.js';
import {
  exampleDocx as doc,
  exampleXml as xml,
  exampleJpg as jpg,
  examplePng,
} from './lib/example-documents.js';
import { laborText } from '../tests/labor-fixtures.js';
import { directoryFingerprint } from '../src/main/correction/files.js';

process.env.electron_config_cache ??= resolve('.electron-cache');
const explicitIndex = process.argv.indexOf('--executable');
const executable =
  process.env.PRECHECK_EXECUTABLE ??
  (explicitIndex >= 0 ? process.argv[explicitIndex + 1] : undefined);
const packaged = process.argv.includes('--packaged') || !!executable;
if (packaged && !executable)
  throw new Error('请设置 PRECHECK_EXECUTABLE 或传入 --executable 指定打包后的可执行文件');

const temp = await realpath(await mkdtemp(join(tmpdir(), 'precheck-electron-e2e-')));
const root = join(temp, '合成工作区');
const batch = join(root, '20260102');
const newer = join(root, '20260103');
const rejected = join(root, '无法报销费用');
const userData = join(temp, 'user-data');
const resultDir = resolve('test-results');
await mkdir(join(batch, 'PCB'), { recursive: true });
await mkdir(join(batch, 'AI'));
await mkdir(newer);
const correctionLabor = join(newer, '劳务费');
await mkdir(correctionLabor);
const incorrectText = laborText
  .replace('2026年8月1日、9月5日', '2026年8月、9月')
  .replace('线上', '');
const correctSource = join(temp, '改好发放说明.docx');
const incorrectSource = join(temp, '仍缺日期发放说明.docx');
await writeFile(correctSource, await doc(laborText));
await writeFile(
  incorrectSource,
  await doc(laborText.replace('2026年8月1日、9月5日', '2026年8月、9月')),
);
await writeFile(join(correctionLabor, '待改说明.docx'), await doc(incorrectText));
const purposeSource = join(temp, '补充材料.pdf');
await writeFile(purposeSource, syntheticPdf(false));
await mkdir(rejected);
await mkdir(join(root, '劳务费'));
await writeFile(join(root, '劳务费/不应扫描.xml'), 'synthetic ignored document');
for (const [file, text] of [
  ['正确发放说明.docx', laborText],
  [
    '错误发放说明.docx',
    laborText.replace('2026年8月1日、9月5日', '2026年8月、9月').replace('线上', ''),
  ],
])
  await writeFile(join(root, '劳务费', file!), await doc(text!));
await writeFile(join(root, '劳务费', '发放表.pdf'), syntheticPdf(false));
await mkdir(userData);
await mkdir(resultDir, { recursive: true });
await writeFile(join(newer, 'one.xml'), xml('SYNTH-DESKTOP-NEWER', '合成文具'));
await writeFile(join(batch, 'PCB/one.xml'), xml('SYNTH-DESKTOP-ONE', '合成规则测试器件'));
await writeFile(join(batch, 'PCB/two.xml'), xml('SYNTH-DESKTOP-TWO'));
await writeFile(join(batch, '文字版合成发票.pdf'), syntheticPdf());
await writeFile(join(rejected, '合成拒票.xml'), xml('SYNTH-DESKTOP-ONE', '合成规则测试器件'));
await writeFile(join(batch, 'PCB/abcdef0123456789.jpg'), jpg);
await writeFile(join(batch, 'AI/订阅说明.jpg'), jpg);
const internalImage = join(batch, 'AI/0123456789abcdef.png');
await writeFile(internalImage, examplePng);
await writeFile(
  join(userData, 'settings.json'),
  JSON.stringify({
    bocUrl: DEFAULT_BOC_URL,
    rules: loadConfig({ buyer: { name: '合成大学', taxId: 'SYNTHBUYER00000001' } }),
  }),
);
const env: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
env.PRECHECK_USER_DATA = userData;
env.PRECHECK_FEEDBACK_EXPORT = join(temp, 'feedback.zip');
delete env.ELECTRON_RUN_AS_NODE;
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
const openSection = async (container: Locator, title: string) => {
  const button = container.getByRole('button', { name: new RegExp('^' + title) });
  if ((await button.getAttribute('aria-expanded')) === 'false') await button.click();
};
const openRule = async (page: Locator, id: string) => {
  const button = page
    .getByTestId('rule-' + id)
    .getByRole('button', { name: new RegExp('^' + id + ' ·') });
  if ((await button.getAttribute('aria-expanded')) === 'false') await button.click();
};
try {
  application = await launch();
  const page = await application.firstWindow();
  const prefix = packaged ? 'packaged' : 'desktop';
  page.on('pageerror', (error) => console.error('renderer:', error.message));
  await page.getByLabel('文件夹路径').fill(root);
  await page.getByRole('button', { name: '打开路径', exact: true }).click();
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
  await expect(page.getByTestId('batch-summary')).toContainText('1 张');
  await expect(page.locator('.results .group-summary[aria-expanded="true"]')).toHaveCount(0);
  for (const title of ['发票明细', '手填与汇率', '输出文件'])
    await expect(
      page.locator('.results').getByRole('button', { name: new RegExp('^' + title) }),
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
  await expect(page.getByTestId('batch-summary')).toContainText('3 张');
  await openSection(page.locator('.results'), '发票明细');
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
  await pcb.locator('.group-summary').click();
  await expect(pcb.locator('.group-summary')).toHaveAttribute('aria-expanded', 'false');
  const pcbIssue = page
    .getByTestId('actionable-findings')
    .locator('.finding')
    .filter({ has: page.locator('.finding-location[title="PCB"]') })
    .first();
  await pcbIssue.locator('.finding-summary').click();
  const help = pcbIssue.getByRole('region', { name: '规则说明' });
  await expect(help).toBeVisible();
  const helpId = (await pcbIssue.locator('.finding-rule > span:first-child').innerText()).split(
    '/',
  )[0]!;
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
  await expect(pcbIssue.locator('.finding-summary')).toContainText('已反馈');

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
  await expect(page.locator('.feedback-panel')).toContainText('合成反馈：请核对这条材料要求');
  await page.getByRole('button', { name: '导出反馈包', exact: true }).click();
  const feedbackPreview = page.getByRole('dialog', { name: '导出反馈包预览', exact: true });
  await expect(feedbackPreview.getByRole('checkbox')).not.toBeChecked();
  await expect(feedbackPreview).toContainText('meta.json');
  await page.screenshot({ path: join(resultDir, prefix + '-feedback-preview.png') });
  await feedbackPreview.getByRole('button', { name: '确认导出', exact: true }).click();
  await expect(feedbackPreview).not.toBeVisible();
  await expect(page.locator('.feedback-panel')).toContainText('请把这个文件发给维护者');
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
  await expect(pcb.locator('.group-summary')).toHaveAttribute('aria-expanded', 'true');
  await expect(pcb).toBeInViewport({ ratio: 0.3 });
  await expect(pcb).toContainText('实验材料费');
  const batchIssues = page.getByTestId('actionable-findings');
  const warningIssues = batchIssues.getByRole('region', { name: '警告', exact: true });
  const r2Badge = warningIssues.getByRole('button', { name: '只看规则 R2', exact: true });
  const unfiltered = await warningIssues.locator('.finding').count();
  expect(unfiltered).toBeGreaterThan(1);
  await r2Badge.click();
  // The rule filter applies to its own severity section only.
  const ruleIds = warningIssues.locator('.finding .finding-rule > span:first-child');
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
  await openSection(page.locator('.results'), '手填与汇率');
  const form = page.getByTestId('manual-form').first();
  await form.getByLabel('金额', { exact: true }).fill('20');
  await form.getByLabel('币种', { exact: true }).fill('USD');
  await form.getByLabel('支付日期').fill('2026-01-02');
  await form.getByLabel('汇率（每1外币兑人民币）').fill('7');
  await form.getByRole('button', { name: '保存手填', exact: true }).click();
  await expect(page.getByTestId('batch-summary')).toContainText('1,453.00');
  await page.getByRole('button', { name: '导出到批次文件夹', exact: true }).click();
  await openSection(page.locator('.results'), '输出文件');
  await expect(page.getByTestId('export-list')).toContainText('入库登记清单.xlsx');
  const outputs = await readdir(join(batch, '_预检'));
  for (const file of ['manual.json', '入库登记清单.xlsx', '高值材料明细.xlsx', '汇总.md'])
    expect(outputs).toContain(file);
  const keyword = '合成规则测试器件';
  await page.getByRole('button', { name: '⚙ 设置', exact: true }).click();
  await openRule(page.locator('.settings'), 'F2');
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
  await expect(page.locator('.results section').first()).toHaveAttribute(
    'aria-label',
    '待处理问题',
  );
  await page.getByRole('button', { name: '⚙ 设置', exact: true }).click();
  await openRule(page.locator('.settings'), 'F2');
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
  await tree.locator('[data-batch-id="20260103"]').click();
  await tree.locator(`[data-node-id="${correctionLabor}"]`).click();
  const correctionCard = page.getByTestId('labor-entry');
  await expect(correctionCard.locator('.finding.error')).toHaveCount(2);
  await application
    .browserWindow(page)
    .then((win) => win.evaluate((window) => window.setSize(900, 760)));
  const summaries = correctionCard.locator('.finding.error .finding-summary');
  await expect(summaries).toHaveCount(2);
  await expect(summaries.nth(0)).toHaveAttribute('aria-expanded', 'false');
  await expect(summaries.nth(1)).toHaveAttribute('aria-expanded', 'false');
  await expect(correctionCard.getByText('怎么处理：', { exact: true })).toHaveCount(0);
  // The summary is a single line at 900px; identifiers and chevrons stay visible.
  for (const summary of await summaries.all()) {
    expect(
      await summary.evaluate((element) => {
        const message = element.querySelector<HTMLElement>('.finding-title')!;
        const css = getComputedStyle(message);
        return (
          css.whiteSpace === 'nowrap' &&
          css.textOverflow === 'ellipsis' &&
          element.scrollWidth <= element.clientWidth + 1 &&
          element.querySelector('.disclosure-chevron')!.getBoundingClientRect().width > 0
        );
      }),
    ).toBe(true);
  }
  await page.screenshot({ path: join(resultDir, prefix + '-issues-collapsed.png') });
  await summaries.nth(0).click();
  await summaries.nth(1).click();
  await expect(correctionCard.locator('.finding.error .finding-details')).toHaveCount(2);
  await expect(correctionCard.getByText('怎么处理：', { exact: true })).toHaveCount(2);
  await page.screenshot({ path: join(resultDir, prefix + '-issues-two-open.png') });
  const errorLevel = correctionCard.getByRole('region', { name: '错误', exact: true });
  await errorLevel.getByRole('button', { name: '只看规则 L1', exact: true }).click();
  await expect(correctionCard.locator('.finding')).toHaveCount(2);
  await expect(correctionCard.locator('.finding.warning')).toHaveCount(0);
  await errorLevel.getByRole('button', { name: '只看规则 L1', exact: true }).click();
  await errorLevel.getByRole('button', { name: '全部收起', exact: true }).click();
  const chooseSource = async (file: string) =>
    application!.evaluate(({ ipcMain }, selected) => {
      const state = globalThis as typeof globalThis & {
        correctionPicker?: { file: string; calls: number };
      };
      state.correctionPicker ??= { file: selected, calls: 0 };
      state.correctionPicker.file = selected;
      ipcMain.removeHandler('app:choose-correction-file');
      ipcMain.handle('app:choose-correction-file', () => {
        state.correctionPicker!.calls++;
        return state.correctionPicker!.file;
      });
    }, file);
  const pickerCalls = () =>
    application!.evaluate(
      () =>
        (globalThis as typeof globalThis & { correctionPicker?: { calls: number } })
          .correctionPicker?.calls ?? 0,
    );
  const dropSource = async (target: Locator, file: string) => {
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'file';
      input.dataset.e2eSource = 'true';
      input.hidden = true;
      document.body.append(input);
    });
    await page.locator('input[data-e2e-source]').setInputFiles(file);
    await target.evaluate((element) => {
      const input = document.querySelector<HTMLInputElement>('input[data-e2e-source]')!;
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(input.files![0]!);
      element.dispatchEvent(
        new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }),
      );
      element.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }),
      );
      input.remove();
    });
  };
  const oldStatement = await readFile(join(correctionLabor, '待改说明.docx'));
  await chooseSource(correctSource);
  const collapsedIssue = correctionCard
    .locator('.finding.error')
    .filter({ hasText: '没写线上还是线下' });
  await expect(collapsedIssue.locator('.finding-summary')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  const beforePicker = await pickerCalls();
  await page.getByRole('button', { name: '检查单个文件', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.locator('.file-drop-zone')).toBeVisible();
  expect(await pickerCalls()).toBe(beforePicker);
  await page.screenshot({ path: join(resultDir, prefix + '-correction-drop-zone.png') });
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await dropSource(collapsedIssue.locator('.finding-summary'), correctSource);
  const correctionToast = page.getByTestId('correction-toast');
  await expect(correctionToast).toBeVisible();
  await expect(correctionToast).toContainText('问题已解决');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await pickerCalls()).toBe(beforePicker);
  await page.screenshot({ path: join(resultDir, prefix + '-correction-toast.png') });
  await correctionToast.getByRole('button', { name: '查看详情', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('_预检/旧版/');
  await expect(dialog.locator('.pill.info')).toHaveCount(0);
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(correctionCard.locator('.finding.error')).toHaveCount(0);
  await expect(correctionCard.getByRole('heading', { level: 2 })).toContainText('✓');
  await openSection(page.locator('.labor-page'), '输出文件');
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
    .locator('.finding-summary')
    .click();
  await correctionCard
    .locator('.finding.error')
    .filter({ hasText: '日期没写到具体哪一天' })
    .getByRole('button', { name: '放入改好的文件', exact: true })
    .click();
  dialog = page.getByRole('dialog');
  await expect(dialog.locator('.file-drop-zone')).toBeVisible();
  expect(await pickerCalls()).toBe(beforePicker);
  await dialog.getByRole('button', { name: '或从文件夹选择…', exact: true }).click();
  expect(await pickerCalls()).toBe(beforePicker + 1);
  await expect(dialog.getByRole('heading', { name: '未通过', exact: true })).toBeVisible();
  await expect(dialog).not.toContainText('没写线上还是线下');
  await expect(dialog.locator('.pill.info')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '确认放入', exact: true })).toHaveCount(0);
  await page.screenshot({ path: join(resultDir, prefix + '-correction-failed.png') });
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  expect(await readdir(correctionLabor, { recursive: true })).toEqual(beforeFiles);
  expect(await directoryFingerprint([correctionLabor])).toBe(beforeFailed);
  await tree.locator('[data-batch-id="20260103"]').click();
  await page.getByTestId('group-根目录').locator('.group-summary').click();
  const purpose = page.getByTestId('requirement-purposeNote');
  await expect(purpose).toContainText('缺失');
  await chooseSource(purposeSource);
  await purpose.getByRole('button', { name: '放入改好的文件', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '或从文件夹选择…', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(correctionToast).toContainText('用途说明-one.pdf');
  await expect(purpose).toContainText('已找到');
  expect(await readdir(newer)).toContain('用途说明-one.pdf');
  await openSection(page.locator('.results'), '输出文件');
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
  if ((await aiGroup.locator('.group-summary').getAttribute('aria-expanded')) === 'false')
    await aiGroup.locator('.group-summary').click();
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

  await tree.locator('[data-batch-id="20260102"]').click();
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
  await expect(restored.locator('.workspace-name')).toHaveText('合成工作区');
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
    `PASS Electron${packaged ? ' 打包产物' : ''}：反馈表单/已反馈/导出预览/默认无原文件、默认收起/连续序号/规则说明/设置定位/无侧栏规则按钮、双批次倒序/手风琴侧栏、问题收起/多展开/规则筛选/收起拖入、分组定位自动展开、XML/PDF解析、确认附件、外币手填、导出、F2关键字增删、拒票原因、劳务树/L1/L2/L6/Word导出、单文件直接放入/toast/失败过滤/补交/归档/撤销/目录内确认不复制/反馈隔离、结果顺序、重启恢复、900px布局`,
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
