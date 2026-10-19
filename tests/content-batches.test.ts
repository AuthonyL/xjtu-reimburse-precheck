import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, realpath, rm, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import JSZip from 'jszip';
import { checkRoot, loadConfig, scanBatch } from '../src/core/index.js';
import { scanLaborDirectory } from '../src/core/labor/scan.js';
import { checkLabor } from '../src/core/labor/engine.js';
import { WorkspaceService } from '../src/main/workspace.js';
import { DesktopStore } from '../src/main/store.js';
import { buildWorkspaceTree } from '../src/shared/navigation.js';
import { xml } from './parse-fixtures.js';
import { syntheticPdf } from './pdf-fixture.js';
const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});
async function fixture() {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'content-batch-')));
  dirs.push(temp);
  return temp;
}
it('非日期批次/附件批次纳入，排除空目录和特殊目录，统一日期排序并保留所有查重上下文', async () => {
  const temp = await fixture();
  const root = join(temp, 'root');
  for (const folder of [
    '横向合成',
    '普通批次',
    '20260101',
    '附件批次',
    '空目录',
    'tmp',
    '_预检',
    '.hidden',
    '劳务费',
    '无法报销费用',
  ])
    await mkdir(join(root, folder), { recursive: true });
  for (const [folder, date] of [
    ['横向合成', '2026-07-02'],
    ['普通批次', '2026-07-03'],
    ['20260101', '2030-01-01'],
    ['tmp', '2031-01-01'],
    ['_预检', '2031-01-01'],
    ['.hidden', '2031-01-01'],
    ['无法报销费用', '2026-01-01'],
  ])
    await writeFile(join(root, folder!, '合成票.xml'), xml.replace('2026-01-02', date!));
  await writeFile(join(root, '普通批次/03209999999999报销单.pdf'), '');
  await writeFile(join(root, '附件批次/支付记录.jpg'), 'synthetic');
  await utimes(
    join(root, '附件批次'),
    new Date('2026-09-01T12:00:00'),
    new Date('2026-09-01T12:00:00'),
  );
  const core = await checkRoot(root, loadConfig(), { submittedHistory: new Set(['SYNTH-001']) });
  expect(core.batches.map((b) => b.id)).toEqual(['附件批次', '普通批次', '横向合成', '20260101']);
  expect(core.batches.map((b) => b.batchDate)).toEqual([
    '2026-09-01',
    '2026-07-03',
    '2026-07-02',
    '2026-01-01',
  ]);
  const findings = core.results.find((r) => r.batch.id === '横向合成')!.findings;
  expect(findings.some((f) => f.ruleId === 'dup' && f.message.includes('已在 普通批次 报销'))).toBe(
    true,
  );
  expect(findings.some((f) => f.ruleId === 'dup' && f.message.includes('已提交历史'))).toBe(true);
  expect(findings.some((f) => f.ruleId === 'rejected')).toBe(true);
  const service = new WorkspaceService(new DesktopStore(join(temp, 'userdata')));
  const view = await service.open(join(root, '横向合成'));
  expect(view.dir).toBe(root);
  expect(view.selectedBatchDir).toBe(join(root, '横向合成'));
  expect(view.batches.map((b) => b.batch.id)).toEqual(core.batches.map((b) => b.id));
  expect(buildWorkspaceTree(view).map((n) => n.label)).toEqual([
    ...core.batches.map((b) => b.id),
    '劳务费',
    '无法报销费用',
  ]);
});
it('同一天按名称升序，非日期批次从全部子组取最晚开票日', async () => {
  const root = await fixture();
  for (const folder of ['B组/子组', 'A组']) await mkdir(join(root, folder), { recursive: true });
  await writeFile(join(root, 'B组/子组/a.xml'), xml.replace('2026-01-02', '2026-07-01'));
  await writeFile(
    join(root, 'B组/b.xml'),
    xml.replace('SYNTH-001', 'SYNTH-002').replace('2026-01-02', '2026-06-01'),
  );
  await writeFile(join(root, 'A组/a.xml'), xml.replace('2026-01-02', '2026-07-01'));
  expect((await checkRoot(root)).batches.map((b) => b.id)).toEqual(['A组', 'B组']);
  expect((await scanBatch(join(root, 'B组'))).batchDate).toBe('2026-07-01');
  const view = await new WorkspaceService(new DesktopStore(join(root, '_预检/userdata'))).open(
    root,
  );
  expect(view.batches.map((b) => b.batch.id)).toEqual(['A组', 'B组']);
});
it('劳务目录及其子目录中 PDF/XML/OFD 发票只警告，不计劳务，合并同号多格式', async () => {
  const dir = await fixture();
  await mkdir(join(dir, '子目录'));
  await writeFile(join(dir, '子目录/发票.xml'), xml);
  await writeFile(join(dir, '一张票.pdf'), syntheticPdf());
  const zip = new JSZip();
  zip.file('invoice.xml', xml);
  await writeFile(join(dir, '同号.ofd'), await zip.generateAsync({ type: 'nodebuffer' }));
  const report = checkLabor(await scanLaborDirectory(dir, loadConfig()), loadConfig());
  expect(report.entries).toHaveLength(0);
  expect(report.total).toBe(0);
  const finding = report.diagnostics.find((f) => f.code === 'invoices-in-labor')!;
  expect(finding?.severity).toBe('warning');
  expect(finding.message).toContain('劳务费目录里有 2 张发票，未按发票检查');
  expect(finding.files).toHaveLength(3);
});
it('行程单正文提取合计金额，手动覆盖附件类型也保留金额匹配能力', async () => {
  const dir = await fixture();
  await mkdir(join(dir, '_预检'));
  const { syntheticTextPdf } = await import('./pdf-fixture.js');
  await writeFile(join(dir, 'abc123.pdf'), syntheticTextPdf([['行程合计 226.00 元', 20, 30]]));
  await writeFile(
    join(dir, '票.xml'),
    xml.replace('电子元件', '交通运输服务').replace('连接头', '客运服务费'),
  );
  await writeFile(
    join(dir, '_预检/manual.json'),
    JSON.stringify({ version: 1, entries: [], attachments: { 'abc123.pdf': 'itinerary' } }),
  );
  const b = await scanBatch(dir);
  expect(b.attachments.find((a) => a.type === 'itinerary')?.amounts).toEqual([226]);
  const result = (await import('../src/core/rules/engine.js')).checkBatch(b);
  expect(result.groups[0]!.requirements.find((r) => r.type === 'itinerary')?.status).toBe('found');
});
it('非日期根目录的所有发票均在批次子组时，仍显示一级批次而非合并整根', async () => {
  const temp = await fixture();
  const root = join(temp, 'root');
  for (const name of ['甲批/PCB', '乙批/器件']) {
    await mkdir(join(root, name), { recursive: true });
    await writeFile(join(root, name, '票.xml'), xml);
  }
  const service = new WorkspaceService(new DesktopStore(join(temp, 'userdata')));
  let view = await service.open(root);
  expect(view.dir).toBe(root);
  expect(view.batches.map((b) => b.batch.id).sort()).toEqual(['乙批', '甲批'].sort());
  view = await service.open(join(root, '甲批'));
  expect(view.dir).toBe(root);
  expect(view.selectedBatchDir).toBe(join(root, '甲批'));
});
it('非日期批次仅有按名称识别的 Excel/文本附件时，桌面与core一致', async () => {
  const temp = await fixture();
  const root = join(temp, 'root');
  await mkdir(join(root, '附件批次'), { recursive: true });
  await writeFile(join(root, '附件批次/记账单.xlsx'), 'synthetic');
  const view = await new WorkspaceService(new DesktopStore(join(temp, 'userdata'))).open(root);
  expect(view.batches.map((b) => b.batch.id)).toEqual(['附件批次']);
});
