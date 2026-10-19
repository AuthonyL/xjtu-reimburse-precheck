import { it, expect } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { buildFeedbackBundle, workspaceIdentity } from '../src/core/feedback/bundle.js';
import { batch, invoice, config } from './helpers.js';
import { xml } from './parse-fixtures.js';
import { checkBatch, buildReport } from '../src/core/index.js';
import type { FeedbackRecord } from '../src/shared/feedback.js';
it('反馈 ZIP 有版本/差异/诊断，默认无原文件，显式勾选后才含原文件', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'feedback-bundle-'));
  const file = join(dir, '合成.xml');
  await writeFile(file, xml);
  const b = batch([invoice()]);
  b.dir = dir;
  b.invoices[0]!.sources = [{ path: file, relativePath: '合成.xml', format: 'xml' }];
  const report = buildReport(checkBatch(b, config()));
  const records = [
    {
      id: 'synthetic',
      recordedAt: '2026-01-02',
      workspaceKey: workspaceIdentity(dir),
      workspaceName: '合成',
      directory: '.',
      files: ['合成.xml'],
      invoices: [],
      ruleId: 'buyer',
      problemKey: 'synthetic',
      message: '合成',
      action: '核对',
      note: '问题',
      type: 'falsePositive',
      configHash: 'test',
    },
  ] as FeedbackRecord[];
  const input = {
    workspace: { rootDir: dir, batches: [{ batch: b, report }], labor: [] },
    config: config(),
    records,
    appVersion: '0.1.0',
    createdAt: '2026-01-02T03:04:05.000Z',
  };
  const plain = await buildFeedbackBundle(input);
  const zip = await JSZip.loadAsync(plain.buffer);
  expect(Object.keys(zip.files)).toEqual(
    expect.arrayContaining([
      'meta.json',
      'settings-diff.json',
      'feedback.json',
      'rejected-reasons.json',
      'parse-issues/001.json',
    ]),
  );
  expect(Object.keys(zip.files).some((p) => p.startsWith('files/'))).toBe(false);
  expect(JSON.parse(await zip.file('meta.json')!.async('string'))).toMatchObject({
    schemaVersion: 1,
    rulesVersion: {
      defaults: expect.stringMatching(/^[a-f0-9]{12}$/),
      effective: expect.stringMatching(/^[a-f0-9]{12}$/),
    },
    exportedAt: input.createdAt,
  });
  expect(plain.entries.map((e) => e.data.toString()).join('')).not.toContain(dir);
  const included = await JSZip.loadAsync(
    (await buildFeedbackBundle({ ...input, includeOriginals: true })).buffer,
  );
  expect(await included.file('files/合成.xml')!.async('string')).toBe(xml);
});
it('已移走的历史源文件保留诊断，存储的劳务姓名仍脱敏，不阻断整包导出', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'feedback-missing-'));
  const records = [
    {
      id: 'old',
      recordedAt: '2026-01-02',
      workspaceKey: workspaceIdentity(dir),
      workspaceName: '合成',
      directory: '.',
      people: ['林示例'],
      files: ['林示例说明.docx'],
      invoices: [],
      ruleId: 'L1',
      problemKey: 'old',
      message: '林示例说明缺日期',
      action: '补日期',
      note: '林示例的旧说明已移走',
      type: 'unclear',
      configHash: 'test',
    },
  ] as FeedbackRecord[];
  const bundle = await buildFeedbackBundle({
    workspace: { rootDir: dir, batches: [], labor: [] },
    config: config(),
    records,
    appVersion: 'synthetic',
    includeOriginals: true,
  });
  const text = bundle.entries.map((e) => e.data.toString()).join('');
  expect(text).not.toContain('林示例');
  expect(text).toContain('来源文件已不存在');
  expect(text).toContain('人员A');
  expect(bundle.entries.some((e) => e.path.startsWith('files/'))).toBe(false);
});
it('诊断保留原扫描合并告警和报告提示，海外收据使用同一扫描解析流程', async () => {
  const { syntheticTextPdf } = await import('./pdf-fixture.js');
  const { parseForeignText } = await import('../src/core/parse/foreign.js');
  const dir = await mkdtemp(join(tmpdir(), 'feedback-foreign-'));
  const file = join(dir, '收据.pdf');
  const text =
    'Example Software, Inc.\nReceipt\nInvoice number SYNTH-INV\nDate paid December 14, 2025\nAmount paid $20.00\nReceipt number SYNTH-R1';
  await writeFile(
    file,
    syntheticTextPdf(text.split('\n').map((line, i) => [line, 20, 20 + i * 20])),
  );
  const inv = parseForeignText(text, file)!;
  inv.warnings.push('合成多格式合计冲突');
  const b = batch([inv]);
  b.dir = dir;
  const report = buildReport(checkBatch(b, config()));
  report.findings.push({
    ruleId: 'parse',
    severity: 'warning',
    message: '合成报告独有解析提示',
    action: '核对',
    invoiceNumbers: [inv.number],
    files: [file],
  });
  const bundle = await buildFeedbackBundle({
    workspace: { rootDir: dir, batches: [{ batch: b, report }], labor: [] },
    config: config(),
    records: [],
    appVersion: 'synthetic',
  });
  const issue = JSON.parse(
    bundle.entries.find((e) => e.path === 'parse-issues/001.json')!.data.toString(),
  );
  expect(issue.result.invoice).toMatchObject({ kind: 'foreign', currency: 'USD', total: 20 });
  expect(issue.warnings).toEqual(
    expect.arrayContaining(['合成多格式合计冲突', '合成报告独有解析提示']),
  );
  expect(issue.result.error).toBeUndefined();
});
it('Windows 反馈路径使用 /，拒绝跨盘符和目录外路径', async () => {
  const path = await import('node:path');
  const { relativeFile } = await import('../src/core/feedback/bundle.js');
  expect(relativeFile('C:\\根', 'c:\\根\\批次\\票.pdf', path.win32)).toBe('批次/票.pdf');
  expect(() => relativeFile('D:\\根', 'C:\\票.pdf', path.win32)).toThrow(/工作区/);
  expect(() => relativeFile('C:\\根', 'C:\\外部\\票.pdf', path.win32)).toThrow(/工作区/);
});
