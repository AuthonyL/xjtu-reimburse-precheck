import { expect, it } from 'vitest';
import { checkBatch } from '../src/core/rules/engine.js';
import { findingId, requirementId } from '../src/core/domain/finding-id.js';
import { problemKey } from '../src/core/correction/problems.js';
import { checkLabor } from '../src/core/labor/engine.js';
import { laborScan } from './labor-fixtures.js';
import { batch, config, finding, invoice } from './helpers.js';

it('同一批次重复检查及整体迁移后 Finding 和 Requirement 标识不变', () => {
  const original = batch([invoice({ total: 2000 })], '器件', ['payment']);
  original.unidentified.push({
    path: '/synthetic/器件/截图.png',
    relativePath: '器件/截图.png',
    isPdf: false,
    parseFailed: false,
  });
  const moved = structuredClone(original);
  const move = (path: string) => '/relocated' + path;
  moved.dir = move(moved.dir);
  moved.groups.forEach((g) => {
    g.dir = move(g.dir);
  });
  moved.invoices.forEach((i) =>
    i.sources.forEach((s) => {
      s.path = move(s.path);
    }),
  );
  moved.attachments.forEach((a) => {
    a.path = move(a.path);
    a.directory = move(a.directory);
  });
  moved.unidentified.forEach((f) => {
    f.path = move(f.path);
  });
  const results = [original, original, moved].map((b) => checkBatch(b, config()));
  const ids = results.map((r) => r.findings.map((f) => f.id).sort());
  expect(ids[0]!.length).toBeGreaterThan(0);
  expect(ids[0]!.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
  expect(ids[1]).toEqual(ids[0]);
  expect(ids[2]).toEqual(ids[0]);
  const requirements = results.map((r) =>
    r.groups.flatMap((g) => g.requirements.map((q) => q.id)).sort(),
  );
  expect(requirements[0]!.length).toBeGreaterThan(0);
  expect(requirements[0]!.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
  expect(requirements[1]).toEqual(requirements[0]);
  expect(requirements[2]).toEqual(requirements[0]);
  for (const result of results)
    for (const finding of result.findings) {
      expect(finding.ruleIds).toEqual([...new Set(finding.ruleId.split('/'))].sort());
      expect(finding.id).toBe(findingId(finding, result.batch.dir));
    }
  for (const group of results[0]!.groups)
    for (const requirement of group.requirements)
      expect(requirement.id).toBe(requirementId(requirement, group.group.id));
});

it('材料需求标识区分类型、合并规则、发票及分组，忽略数组顺序与重复', () => {
  const requirement = {
    type: 'inventory' as const,
    ruleIds: ['R1', 'R11'],
    invoiceNumbers: ['SYNTH-A', 'SYNTH-B'],
  };
  const id = requirementId(requirement, '器件');
  expect(
    requirementId(
      {
        ...requirement,
        ruleIds: ['R11', 'R1', 'R1'],
        invoiceNumbers: ['SYNTH-B', 'SYNTH-A', 'SYNTH-A'],
      },
      '器件',
    ),
  ).toBe(id);
  expect(
    new Set([
      id,
      requirementId({ ...requirement, type: 'payment' }, '器件'),
      requirementId({ ...requirement, ruleIds: ['R1'] }, '器件'),
      requirementId({ ...requirement, invoiceNumbers: ['SYNTH-C'] }, '器件'),
      requirementId(requirement, '另一组'),
    ]).size,
  ).toBe(5);
});

it('劳务缺项及版本 Finding 同样具备稳定标识', () => {
  const scan = laborScan({ mode: null });
  scan.statements.push({
    ...scan.statements[0]!,
    path: scan.dir + '/旧说明.docx',
    relativePath: '旧说明.docx',
  });
  const moved = structuredClone(scan);
  moved.dir = '/copy' + moved.dir;
  moved.statements.forEach((s) => {
    s.path = '/copy' + s.path;
  });
  const reports = [scan, moved].map((s) => checkLabor(s, config()));
  const findings = reports.map((r) => r.entries.flatMap((e) => e.findings));
  expect(findings[0]!.some((f) => f.ruleId === 'L1')).toBe(true);
  expect(findings[0]!.some((f) => f.ruleId === 'L6')).toBe(true);
  expect(findings[0]!.map((f) => f.id)).toEqual(findings[1]!.map((f) => f.id));
  for (const [n, items] of findings.entries())
    for (const finding of items) {
      expect(finding.id).toBe(findingId(finding, reports[n]!.dir));
      expect(finding.ruleIds).toEqual([finding.ruleId]);
    }
});

it('不同规则、附件类型和发票号有不同标识，保留问题键和别名语义', () => {
  const base = {
    severity: 'warning' as const,
    ruleId: 'R1',
    message: '合成问题',
    action: '补交',
    invoiceNumbers: ['SYNTH-001'],
    files: ['/batch/组/票.pdf'],
    groupId: '组',
  };
  const variants = [
    base,
    { ...base, ruleId: 'R11' },
    { ...base, requirementType: 'payment' as const },
    { ...base, requirementType: 'inventory' as const },
    { ...base, invoiceNumbers: ['SYNTH-002'] },
  ];
  expect(new Set(variants.map((f) => findingId(f, '/batch'))).size).toBe(variants.length);
  expect(findingId({ ...base, ruleId: 'R11/R1/R1' }, '/batch')).toBe(
    findingId({ ...base, ruleId: 'R1/R11' }, '/batch'),
  );
  const identified = { ...base, id: '', ruleIds: ['R1'] };
  expect(findingId(base, '/batch')).toBe(problemKey(identified, '/batch'));
  expect(
    findingId({ ...base, invoiceNumbers: ['SYNTH-NEW'] }, '/batch', {
      invoiceNumbers: { 'SYNTH-NEW': 'SYNTH-001' },
    }),
  ).toBe(findingId(base, '/batch'));
  const fileOnly = { ...base, invoiceNumbers: [] };
  expect(findingId(fileOnly, '/batch')).toBe(
    findingId(
      { ...fileOnly, files: ['/copy/组/新票.xml'], severity: 'error', message: '另一文案' },
      '/copy',
      { files: { '组/新票.xml': '组/票.pdf' } },
    ),
  );
});

it('Claim 状态及豁免不参与本阶段判定', () => {
  const b = batch();
  const before = checkBatch(b, config());
  b.claim = {
    version: 1,
    id: 'claim-synthetic',
    state: 'reimbursed',
    transitions: [],
    waivers: before.findings.map((f) => ({
      findingId: f.id,
      reason: '合成说明',
      at: '2026-01-02',
    })),
  };
  expect(checkBatch(b, config()).findings).toEqual(before.findings);
});

it.each(['损坏.xml', 'sub/synthetic/损坏.xml', 'test$&.xml', 'test$$.xml'])(
  '解析错误路径 %s 迁移后标识不变且消息保留原文',
  (file) => {
    const original = batch([]);
    const message = `文件解析失败：ENOENT: no such file or directory, open '/synthetic/${file}'`;
    original.diagnostics = [finding({ ruleId: 'parse', message, files: ['/synthetic/' + file] })];
    const moved = structuredClone(original);
    moved.dir = '/copy/synthetic';
    moved.diagnostics[0]!.files = ['/copy/synthetic/' + file];
    moved.diagnostics[0]!.message = message.replace('/synthetic/', '/copy/synthetic/');
    const before = checkBatch(original, config()).findings[0]!;
    const after = checkBatch(moved, config()).findings[0]!;
    expect(before.message).toBe(message);
    expect(after.message).toBe(moved.diagnostics[0]!.message);
    expect(before.id).toBe(after.id);
  },
);
